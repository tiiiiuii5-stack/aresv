import { randomUUID } from "node:crypto";

export type DurableKvProbe = {
  provider: "upstash-kv";
  configured: boolean;
  reachable: boolean;
  verifiedRead: boolean;
  verifiedWrite: boolean;
  reason: string | null;
};

export async function probeDurableKvStore(): Promise<DurableKvProbe> {
  const config = kvConfig();
  if (!config) {
    return {
      provider: "upstash-kv",
      configured: false,
      reachable: false,
      verifiedRead: false,
      verifiedWrite: false,
      reason: "missing_kv_rest_credentials",
    };
  }

  const key = `ventureos:health:datastore:${randomUUID()}`;
  const value = JSON.stringify({ ok: true, timestamp: new Date().toISOString() });
  const response = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["SET", key, value, "EX", "120"],
      ["GET", key],
      ["DEL", key],
    ]),
    cache: "no-store",
  }).catch((error: unknown) => ({
    ok: false,
    status: 0,
    text: async () => error instanceof Error ? error.message : "kv_probe_failed",
  } as Response));

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    return {
      provider: "upstash-kv",
      configured: true,
      reachable: false,
      verifiedRead: false,
      verifiedWrite: false,
      reason: message ? `kv_probe_failed_${response.status}` : "kv_probe_failed",
    };
  }

  const payload = await response.json().catch(() => []) as Array<{ result?: unknown; error?: string }>;
  const wrote = String(payload[0]?.result || "").toUpperCase() === "OK";
  const read = payload[1]?.result === value;
  const deleted = Number(payload[2]?.result || 0) >= 0;

  return {
    provider: "upstash-kv",
    configured: true,
    reachable: wrote && read,
    verifiedRead: read,
    verifiedWrite: wrote && deleted,
    reason: wrote && read ? null : "kv_write_read_mismatch",
  };
}

function kvConfig() {
  const url = process.env.KV_REST_API_URL?.trim() || process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim() || process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}
