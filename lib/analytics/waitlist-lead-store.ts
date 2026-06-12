import { createHash, randomUUID } from "node:crypto";

import { tryDatabase } from "@/lib/prisma";

export type WaitlistLeadInput = {
  email: string;
  role: string;
  useCase: string;
  source: string;
  campaign?: string | null;
  ref?: string | null;
  utmSource?: string | null;
  userAgentHash?: string | null;
};

export type WaitlistLeadMetrics = {
  available: boolean;
  total: number;
  recent: Array<{
    id: string;
    email: string;
    role: string;
    source: string;
    campaign: string | null;
    createdAt: string;
  }>;
};

type DbLeadCountRow = { count?: number | string | bigint | null };
type DbLeadRow = {
  id?: string | null;
  email?: string | null;
  role?: string | null;
  source?: string | null;
  campaign?: string | null;
  createdAt?: Date | string | null;
};

export async function recordWaitlistLead(input: WaitlistLeadInput) {
  const config = kvConfig();
  if (!config) return { stored: false, provider: "none" as const, id: null };

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const email = input.email.trim().toLowerCase();
  const emailHash = hashValue(email);
  const key = `ventureos:waitlist:lead:${id}`;
  const payload = JSON.stringify({
    id,
    email,
    emailHash,
    role: cleanValue(input.role, 80),
    useCase: cleanValue(input.useCase, 700),
    source: cleanValue(input.source, 80),
    campaign: cleanValue(input.campaign, 80) || null,
    ref: cleanValue(input.ref, 80) || null,
    utmSource: cleanValue(input.utmSource, 80) || null,
    userAgentHash: cleanValue(input.userAgentHash, 120) || null,
    createdAt,
  });

  const commands: string[][] = [
    ["SET", key, payload],
    ["SADD", "ventureos:waitlist:email_hashes", emailHash],
    ["LPUSH", "ventureos:waitlist:recent", key],
    ["LTRIM", "ventureos:waitlist:recent", "0", "99"],
    ["INCR", "ventureos:waitlist:events:total"],
  ];

  const response = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    cache: "no-store",
  }).catch(() => null);

  return { stored: Boolean(response?.ok), provider: "upstash-kv" as const, id: response?.ok ? id : null };
}

export async function loadWaitlistLeadMetrics(): Promise<WaitlistLeadMetrics> {
  const dbMetricsPromise = loadDatabaseLeadMetrics();
  const config = kvConfig(true);
  if (!config) {
    const dbMetrics = await dbMetricsPromise;
    return dbMetrics || emptyMetrics();
  }

  const firstResponse = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["SCARD", "ventureos:waitlist:email_hashes"],
      ["LRANGE", "ventureos:waitlist:recent", "0", "9"],
    ]),
    cache: "no-store",
  }).catch(() => null);
  const dbMetrics = await dbMetricsPromise;
  if (!firstResponse?.ok) return dbMetrics || emptyMetrics();

  const firstPayload = await firstResponse.json().catch(() => []) as Array<{ result?: unknown }>;
  const total = numberValue(firstPayload[0]?.result);
  const keys = Array.isArray(firstPayload[1]?.result) ? firstPayload[1].result.filter((key): key is string => typeof key === "string") : [];
  if (!keys.length) return mergeLeadMetrics({ available: true, total, recent: [] }, dbMetrics);

  const secondResponse = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(keys.map((key) => ["GET", key])),
    cache: "no-store",
  }).catch(() => null);
  if (!secondResponse?.ok) return mergeLeadMetrics({ available: true, total, recent: [] }, dbMetrics);

  const secondPayload = await secondResponse.json().catch(() => []) as Array<{ result?: unknown }>;
  const recent = secondPayload
    .map((item) => parseLead(item.result))
    .filter((item): item is WaitlistLeadMetrics["recent"][number] => Boolean(item));

  return mergeLeadMetrics({ available: true, total, recent }, dbMetrics);
}

async function loadDatabaseLeadMetrics(): Promise<WaitlistLeadMetrics | null> {
  const countRows = await tryDatabase((db) => db.$queryRawUnsafe<DbLeadCountRow[]>(`
    SELECT COUNT(DISTINCT LOWER("metadata"->>'email'))::int AS count
    FROM "usage_events"
    WHERE "event" = 'waitlist.joined'
      AND COALESCE("metadata"->>'email', '') <> ''
  `));
  if (!countRows) return null;

  const recentRows = await tryDatabase((db) => db.$queryRawUnsafe<DbLeadRow[]>(`
    SELECT DISTINCT ON (LOWER("metadata"->>'email'))
      "id",
      "metadata"->>'email' AS email,
      COALESCE(NULLIF("metadata"->>'role', ''), 'unknown') AS role,
      COALESCE(NULLIF("metadata"->>'source', ''), 'postgres_usage_event') AS source,
      NULLIF("metadata"->>'campaign', '') AS campaign,
      "createdAt"
    FROM "usage_events"
    WHERE "event" = 'waitlist.joined'
      AND COALESCE("metadata"->>'email', '') <> ''
    ORDER BY LOWER("metadata"->>'email'), "createdAt" DESC
    LIMIT 100
  `)) || [];

  return {
    available: true,
    total: numberValue(countRows[0]?.count),
    recent: recentRows.map(parseDatabaseLead).filter((lead): lead is WaitlistLeadMetrics["recent"][number] => Boolean(lead)).slice(0, 10),
  };
}

function mergeLeadMetrics(kvMetrics: WaitlistLeadMetrics, dbMetrics: WaitlistLeadMetrics | null): WaitlistLeadMetrics {
  if (!dbMetrics) return kvMetrics;
  const recent = [...kvMetrics.recent, ...dbMetrics.recent];
  const seen = new Set<string>();
  const deduped = recent.filter((lead) => {
    const key = lead.email.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);

  return {
    available: kvMetrics.available || dbMetrics.available,
    total: Math.max(kvMetrics.total, dbMetrics.total, deduped.length),
    recent: deduped,
  };
}

function emptyMetrics(): WaitlistLeadMetrics {
  return { available: false, total: 0, recent: [] };
}

function parseLead(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const email = String(parsed.email || "");
    const id = String(parsed.id || "");
    const createdAt = String(parsed.createdAt || "");
    if (!id || !email || !createdAt) return null;
    return {
      id,
      email,
      role: String(parsed.role || "unknown"),
      source: String(parsed.source || "unknown"),
      campaign: parsed.campaign ? String(parsed.campaign) : null,
      createdAt,
    };
  } catch {
    return null;
  }
}

function parseDatabaseLead(row: DbLeadRow) {
  const email = String(row.email || "");
  const id = String(row.id || "");
  const createdAt = row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt || "");
  if (!id || !email || !createdAt) return null;
  return {
    id,
    email,
    role: String(row.role || "unknown"),
    source: String(row.source || "postgres_usage_event"),
    campaign: row.campaign ? String(row.campaign) : null,
    createdAt,
  };
}

function kvConfig(readOnly = false) {
  const url = process.env.KV_REST_API_URL?.trim() || process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = readOnly
    ? process.env.KV_REST_API_READ_ONLY_TOKEN?.trim() || process.env.KV_REST_API_TOKEN?.trim() || process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
    : process.env.KV_REST_API_TOKEN?.trim() || process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

function cleanValue(value: unknown, maxLength: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function numberValue(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}
