export type ProductFunnelEventInput = {
  eventType: string;
  source: string;
  framework?: string | null;
  riskLevel?: string | null;
  hasRepositoryUrl?: boolean;
  metadata?: Record<string, unknown>;
};

export type ProductFunnelMetrics = {
  available: boolean;
  totalEvents: number;
  events: Record<string, number>;
  realEvents: Record<string, number>;
  syntheticEvents: Record<string, number>;
  realTotalEvents: number;
  syntheticTotalEvents: number;
  recent: Array<{
    eventType: string;
    source: string;
    framework?: string | null;
    riskLevel?: string | null;
    hasRepositoryUrl?: boolean;
    synthetic?: boolean;
    createdAt: string;
  }>;
};

const funnelEvents = [
  "preview_started",
  "preview_completed",
  "checkout_started",
  "report_generated",
  "report_opened",
  "free_review.view",
  "free_review.scan_started",
  "free_review.scan_completed",
  "free_review.scan_failed",
  "free_review.upgrade_shown",
  "free_review.paid_cta_clicked",
  "appraisal_intake.view",
  "appraisal_intake.checkout_started",
  "appraisal_intake.checkout_clicked",
  "appraisal_intake.checkout_failed",
  "appraisal_intake.certificate_completed",
] as const;

export async function recordProductFunnelEvent(input: ProductFunnelEventInput) {
  const config = kvConfig();
  if (!config) return false;

  const event = {
    eventType: input.eventType,
    source: input.source,
    framework: input.framework || null,
    riskLevel: input.riskLevel || null,
    hasRepositoryUrl: Boolean(input.hasRepositoryUrl),
    synthetic: isSyntheticEvent(input),
    createdAt: new Date().toISOString(),
  };
  const proofNamespace = event.synthetic ? "synthetic" : "real";

  const commands = [
    ["INCR", "ventureos:funnel:events:total"],
    ["INCR", `ventureos:funnel:event:${input.eventType}`],
    ["INCR", `ventureos:funnel:${proofNamespace}:events:total`],
    ["INCR", `ventureos:funnel:${proofNamespace}:event:${input.eventType}`],
    ["LPUSH", "ventureos:funnel:recent", JSON.stringify(event)],
    ["LTRIM", "ventureos:funnel:recent", "0", "499"],
  ];

  const response = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    cache: "no-store",
  });

  return response.ok;
}

export async function loadProductFunnelMetrics(): Promise<ProductFunnelMetrics> {
  const config = kvConfig(true);
  if (!config) return emptyMetrics();

  const commands: string[][] = [
    ["GET", "ventureos:funnel:events:total"],
    ...funnelEvents.map((event) => ["GET", `ventureos:funnel:event:${event}`]),
    ["GET", "ventureos:funnel:real:events:total"],
    ...funnelEvents.map((event) => ["GET", `ventureos:funnel:real:event:${event}`]),
    ["GET", "ventureos:funnel:synthetic:events:total"],
    ...funnelEvents.map((event) => ["GET", `ventureos:funnel:synthetic:event:${event}`]),
    ["LRANGE", "ventureos:funnel:recent", "0", "49"],
  ];
  const response = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    cache: "no-store",
  });
  if (!response.ok) return emptyMetrics();

  const payload = await response.json().catch(() => []) as Array<{ result?: unknown }>;
  const totalEvents = numberValue(payload[0]?.result);
  const events: Record<string, number> = {};
  funnelEvents.forEach((event, index) => {
    events[event] = numberValue(payload[index + 1]?.result);
  });
  const realTotalOffset = funnelEvents.length + 1;
  const realTotalEvents = numberValue(payload[realTotalOffset]?.result);
  const realEvents: Record<string, number> = {};
  funnelEvents.forEach((event, index) => {
    realEvents[event] = numberValue(payload[realTotalOffset + index + 1]?.result);
  });
  const syntheticTotalOffset = realTotalOffset + funnelEvents.length + 1;
  const syntheticTotalEvents = numberValue(payload[syntheticTotalOffset]?.result);
  const syntheticEvents: Record<string, number> = {};
  funnelEvents.forEach((event, index) => {
    syntheticEvents[event] = numberValue(payload[syntheticTotalOffset + index + 1]?.result);
  });
  const recentOffset = syntheticTotalOffset + funnelEvents.length + 1;
  const recentRaw = Array.isArray(payload[recentOffset]?.result) ? payload[recentOffset].result as unknown[] : [];
  const recent = recentRaw.map(parseRecentEvent).filter(Boolean).slice(0, 50) as ProductFunnelMetrics["recent"];

  return { available: true, totalEvents, events, realEvents, syntheticEvents, realTotalEvents, syntheticTotalEvents, recent };
}

function emptyMetrics(): ProductFunnelMetrics {
  return {
    available: false,
    totalEvents: 0,
    events: {},
    realEvents: {},
    syntheticEvents: {},
    realTotalEvents: 0,
    syntheticTotalEvents: 0,
    recent: [],
  };
}

function isSyntheticEvent(input: ProductFunnelEventInput) {
  const source = String(input.source || "").toLowerCase();
  const metadata = input.metadata || {};
  const explicitSynthetic = Boolean(
    metadata.synthetic ||
    metadata.syntheticEvent ||
    metadata.contractTest ||
    metadata.testEvent,
  );
  return explicitSynthetic || /(^|[_.:-])(test|contract|synthetic|qa|smoke)([_.:-]|$)/.test(source);
}

function kvConfig(readOnly = false) {
  const url = process.env.KV_REST_API_URL?.trim() || process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = readOnly
    ? process.env.KV_REST_API_READ_ONLY_TOKEN?.trim() || process.env.KV_REST_API_TOKEN?.trim() || process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
    : process.env.KV_REST_API_TOKEN?.trim() || process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

function numberValue(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function parseRecentEvent(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as ProductFunnelMetrics["recent"][number];
    if (!parsed || typeof parsed.eventType !== "string" || typeof parsed.createdAt !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}
