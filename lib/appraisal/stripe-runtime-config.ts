export type StripeRuntimeConfig = {
  instantPriceId: string | null;
  buyerReadyPriceId: string | null;
  webhookSecret: string | null;
  source: "env" | "kv" | "mixed" | "missing";
  updatedAt: string | null;
};

const CONFIG_KEY = "ventureos:stripe:runtime-config";

export async function loadStripeRuntimeConfig(): Promise<StripeRuntimeConfig> {
  const envConfig = stripeConfigFromEnv();
  const kvConfig = await loadStripeConfigFromKv();
  const merged = {
    instantPriceId: envConfig.instantPriceId || kvConfig.instantPriceId,
    buyerReadyPriceId: envConfig.buyerReadyPriceId || kvConfig.buyerReadyPriceId,
    webhookSecret: envConfig.webhookSecret || kvConfig.webhookSecret,
    updatedAt: envConfig.updatedAt || kvConfig.updatedAt,
  };

  const envComplete = Boolean(envConfig.instantPriceId && envConfig.buyerReadyPriceId && envConfig.webhookSecret);
  const kvComplete = Boolean(kvConfig.instantPriceId && kvConfig.buyerReadyPriceId && kvConfig.webhookSecret);
  const source = envComplete ? "env" : kvComplete ? "kv" : hasAnyConfig(envConfig) && hasAnyConfig(kvConfig) ? "mixed" : hasAnyConfig(merged) ? "mixed" : "missing";

  return { ...merged, source };
}

export async function saveStripeRuntimeConfig(config: Partial<Omit<StripeRuntimeConfig, "source">>) {
  const current = await loadStripeConfigFromKv();
  const next = {
    instantPriceId: cleanStripeId(config.instantPriceId) || current.instantPriceId,
    buyerReadyPriceId: cleanStripeId(config.buyerReadyPriceId) || current.buyerReadyPriceId,
    webhookSecret: cleanWebhookSecret(config.webhookSecret) || current.webhookSecret,
    updatedAt: new Date().toISOString(),
  };
  const kv = kvConfig(false);
  if (!kv) throw new Error("KV_REST_API_TOKEN is required to save Stripe runtime config.");

  const response = await fetch(`${kv.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${kv.token}`, "Content-Type": "application/json" },
    body: JSON.stringify([["SET", CONFIG_KEY, JSON.stringify(next)]]),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`STRIPE_CONFIG_SAVE_FAILED_${response.status}`);
  return loadStripeRuntimeConfig();
}

export function stripeConfigHealth(config: StripeRuntimeConfig) {
  return {
    checkoutEnabled: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
    webhookEnabled: Boolean(config.webhookSecret),
    appraisalPriceIdsConfigured: {
      instant: Boolean(config.instantPriceId),
      buyerReady: Boolean(config.buyerReadyPriceId),
    },
    configSource: config.source,
    updatedAt: config.updatedAt,
  };
}

async function loadStripeConfigFromKv() {
  const kv = kvConfig(true);
  if (!kv) return emptyRuntimeConfig();

  const response = await fetch(`${kv.url}/get/${encodeURIComponent(CONFIG_KEY)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${kv.token}` },
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return emptyRuntimeConfig();

  const payload = await response.json().catch(() => null) as { result?: unknown } | null;
  const raw = typeof payload?.result === "string" ? payload.result : "";
  if (!raw) return emptyRuntimeConfig();

  try {
    const parsed = JSON.parse(raw) as Partial<StripeRuntimeConfig>;
    return {
      instantPriceId: cleanStripeId(parsed.instantPriceId),
      buyerReadyPriceId: cleanStripeId(parsed.buyerReadyPriceId),
      webhookSecret: cleanWebhookSecret(parsed.webhookSecret),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    };
  } catch {
    return emptyRuntimeConfig();
  }
}

function stripeConfigFromEnv() {
  return {
    instantPriceId: cleanStripeId(process.env.STRIPE_PRICE_APPRAISAL_INSTANT || process.env.STRIPE_APPRAISAL_INSTANT_PRICE_ID),
    buyerReadyPriceId: cleanStripeId(process.env.STRIPE_PRICE_APPRAISAL_BUYER || process.env.STRIPE_APPRAISAL_BUYER_PRICE_ID),
    webhookSecret: cleanWebhookSecret(process.env.STRIPE_WEBHOOK_SECRET),
    updatedAt: null,
  };
}

function emptyRuntimeConfig() {
  return {
    instantPriceId: null,
    buyerReadyPriceId: null,
    webhookSecret: null,
    updatedAt: null,
  };
}

function kvConfig(readOnly: boolean) {
  const url = process.env.KV_REST_API_URL?.trim() || process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = readOnly
    ? process.env.KV_REST_API_READ_ONLY_TOKEN?.trim() || process.env.KV_REST_API_TOKEN?.trim() || process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
    : process.env.KV_REST_API_TOKEN?.trim() || process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

function hasAnyConfig(config: Partial<StripeRuntimeConfig>) {
  return Boolean(config.instantPriceId || config.buyerReadyPriceId || config.webhookSecret);
}

function cleanStripeId(value: unknown) {
  const clean = String(value || "").trim();
  return /^(price|prc)_[a-zA-Z0-9_]+$/.test(clean) ? clean.slice(0, 180) : null;
}

function cleanWebhookSecret(value: unknown) {
  const clean = String(value || "").trim();
  return /^whsec_[a-zA-Z0-9_]+$/.test(clean) ? clean.slice(0, 240) : null;
}
