export type ProductFunnelEventInput = {
  eventType: string;
  source: string;
  framework?: string | null;
  riskLevel?: string | null;
  hasRepositoryUrl?: boolean;
  visitorHash?: string | null;
  bot?: boolean;
  metadata?: Record<string, unknown>;
};

export type ProductFunnelMetrics = {
  available: boolean;
  totalEvents: number;
  events: Record<string, number>;
  realEvents: Record<string, number>;
  syntheticEvents: Record<string, number>;
  botEvents: Record<string, number>;
  realTotalEvents: number;
  syntheticTotalEvents: number;
  botTotalEvents: number;
  uniqueReal: {
    previewStarted: number;
    previewCompleted: number;
    checkoutStarted: number;
    paidIntent: number;
    homepageIntent: number;
    reportGenerated: number;
    previewToCheckoutPath: number;
  };
  recent: Array<{
    eventType: string;
    source: string;
    framework?: string | null;
    riskLevel?: string | null;
    hasRepositoryUrl?: boolean;
    synthetic?: boolean;
    bot?: boolean;
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
  "free_review.share_clicked",
  "free_review.paid_cta_clicked",
  "homepage.view",
  "homepage.free_review_clicked",
  "homepage.sample_clicked",
  "homepage.pricing_clicked",
  "appraisal_intake.view",
  "appraisal_intake.preview_started",
  "appraisal_intake.preview_completed",
  "appraisal_intake.preview_failed",
  "appraisal_intake.checkout_started",
  "appraisal_intake.checkout_clicked",
  "appraisal_intake.checkout_failed",
  "appraisal_intake.certificate_completed",
] as const;

const realVisitorProofPrefix = "ventureos:funnel:v3:real:visitors";

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
    bot: Boolean(input.bot),
    createdAt: new Date().toISOString(),
  };
  const proofNamespace = event.bot ? "bot" : event.synthetic ? "synthetic" : "real";

  const commands: string[][] = [
    ["INCR", "ventureos:funnel:events:total"],
    ["INCR", `ventureos:funnel:event:${input.eventType}`],
    ["INCR", `ventureos:funnel:${proofNamespace}:events:total`],
    ["INCR", `ventureos:funnel:${proofNamespace}:event:${input.eventType}`],
    ["LPUSH", "ventureos:funnel:recent", JSON.stringify(event)],
    ["LTRIM", "ventureos:funnel:recent", "0", "499"],
  ];

  if (proofNamespace === "real" && input.visitorHash) {
    commands.push(["PFADD", `ventureos:funnel:real:unique:event:${input.eventType}`, input.visitorHash]);
    for (const group of proofGroupsForEvent(input.eventType)) {
      commands.push(["SADD", `${realVisitorProofPrefix}:${group}`, input.visitorHash]);
    }
  }

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
    ["GET", "ventureos:funnel:bot:events:total"],
    ...funnelEvents.map((event) => ["GET", `ventureos:funnel:bot:event:${event}`]),
    ["SCARD", `${realVisitorProofPrefix}:preview_started`],
    ["SCARD", `${realVisitorProofPrefix}:preview_completed`],
    ["SCARD", `${realVisitorProofPrefix}:checkout_started`],
    ["SCARD", `${realVisitorProofPrefix}:paid_intent`],
    ["SCARD", `${realVisitorProofPrefix}:homepage_intent`],
    ["SCARD", `${realVisitorProofPrefix}:report_generated`],
    ["SINTER", `${realVisitorProofPrefix}:preview_started`, `${realVisitorProofPrefix}:checkout_started`],
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
  let cursor = 0;
  const totalEvents = numberValue(payload[cursor++]?.result);
  const events: Record<string, number> = {};
  funnelEvents.forEach((event) => {
    events[event] = numberValue(payload[cursor++]?.result);
  });
  const realTotalEvents = numberValue(payload[cursor++]?.result);
  const realEvents: Record<string, number> = {};
  funnelEvents.forEach((event) => {
    realEvents[event] = numberValue(payload[cursor++]?.result);
  });
  const syntheticTotalEvents = numberValue(payload[cursor++]?.result);
  const syntheticEvents: Record<string, number> = {};
  funnelEvents.forEach((event) => {
    syntheticEvents[event] = numberValue(payload[cursor++]?.result);
  });
  const botTotalEvents = numberValue(payload[cursor++]?.result);
  const botEvents: Record<string, number> = {};
  funnelEvents.forEach((event) => {
    botEvents[event] = numberValue(payload[cursor++]?.result);
  });
  const uniqueReal = {
    previewStarted: numberValue(payload[cursor++]?.result),
    previewCompleted: numberValue(payload[cursor++]?.result),
    checkoutStarted: numberValue(payload[cursor++]?.result),
    paidIntent: numberValue(payload[cursor++]?.result),
    homepageIntent: numberValue(payload[cursor++]?.result),
    reportGenerated: numberValue(payload[cursor++]?.result),
    previewToCheckoutPath: arrayCount(payload[cursor++]?.result),
  };
  const recentRaw = Array.isArray(payload[cursor]?.result) ? payload[cursor].result as unknown[] : [];
  const recent = recentRaw.map(parseRecentEvent).filter(Boolean).slice(0, 50) as ProductFunnelMetrics["recent"];

  return { available: true, totalEvents, events, realEvents, syntheticEvents, botEvents, realTotalEvents, syntheticTotalEvents, botTotalEvents, uniqueReal, recent };
}

function emptyMetrics(): ProductFunnelMetrics {
  return {
    available: false,
    totalEvents: 0,
    events: {},
    realEvents: {},
    syntheticEvents: {},
    botEvents: {},
    realTotalEvents: 0,
    syntheticTotalEvents: 0,
    botTotalEvents: 0,
    uniqueReal: {
      previewStarted: 0,
      previewCompleted: 0,
      checkoutStarted: 0,
      paidIntent: 0,
      homepageIntent: 0,
      reportGenerated: 0,
      previewToCheckoutPath: 0,
    },
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

function proofGroupsForEvent(eventType: string) {
  const groups: string[] = [];
  if (eventType === "preview_started" || eventType === "free_review.scan_started" || eventType === "appraisal_intake.preview_started") groups.push("preview_started");
  if (eventType === "preview_completed" || eventType === "free_review.scan_completed" || eventType === "appraisal_intake.preview_completed") groups.push("preview_completed");
  if (eventType === "checkout_started" || eventType === "appraisal_intake.checkout_started" || eventType === "appraisal_intake.checkout_clicked") groups.push("checkout_started", "paid_intent");
  if (eventType === "free_review.paid_cta_clicked") groups.push("paid_intent");
  if (eventType === "homepage.free_review_clicked" || eventType === "homepage.pricing_clicked") groups.push("homepage_intent");
  if (eventType === "report_generated" || eventType === "appraisal_intake.certificate_completed") groups.push("report_generated");
  return groups;
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

function arrayCount(value: unknown) {
  return Array.isArray(value) ? value.length : numberValue(value);
}

function parseRecentEvent(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as ProductFunnelMetrics["recent"][number];
    if (!parsed || typeof parsed.eventType !== "string" || typeof parsed.createdAt !== "string") return null;
    return {
      ...parsed,
      synthetic: parsed.synthetic ?? isSyntheticSource(parsed.source),
      bot: Boolean(parsed.bot),
    };
  } catch {
    return null;
  }
}

function isSyntheticSource(source: unknown) {
  return /(^|[_.:-])(test|contract|synthetic|qa|smoke)([_.:-]|$)/.test(String(source || "").toLowerCase());
}
