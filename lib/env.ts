type EnvKey =
  | "DATABASE_URL"
  | "GEMINI_API_KEY"
  | "GOOGLE_API_KEY"
  | "GITHUB_TOKEN"
  | "NVD_API_KEY"
  | "VENTUREOS_EXTERNAL_INTELLIGENCE"
  | "VENTUREOS_BENCHMARK_DATASET_URL"
  | "VENTUREOS_REPOSITORY_CORPUS_URL"
  | "VENTUREOS_RUNTIME_TELEMETRY_URL"
  | "VENTUREOS_VALUATION_DATASET_URL"
  | "REDIS_URL"
  | "ADMIN_EMAIL"
  | "ADMIN_PASSWORD"
  | "ADMIN_SESSION_SECRET"
  | "SESSION_SECRET"
  | "NEXTAUTH_SECRET"
  | "ENCRYPTION_KEY"
  | "AGENT_MEMORY_ENCRYPTION_KEY"
  | "VENTUREOS_CERT_PRIVATE_KEY_PEM"
  | "VENTUREOS_CERT_PRIVATE_KEY_BASE64"
  | "VENTUREOS_CERT_PUBLIC_KEY_PEM"
  | "VENTUREOS_CERT_PUBLIC_KEY_BASE64"
  | "VENTUREOS_CERT_SIGNING_KEY_ID"
  | "STRIPE_SECRET_KEY"
  | "STRIPE_WEBHOOK_SECRET"
  | "STRIPE_PRICE_APPRAISAL_INSTANT"
  | "STRIPE_PRICE_APPRAISAL_BUYER"
  | "AGENT_MEMORY_MAX_PER_USER"
  | "AGENT_MEMORY_PRUNE_DAYS"
  | "AGENT_MEMORY_SIMILARITY_THRESHOLD"
  | "AGENT_MEMORY_EMBEDDING_MODEL"
  | "MUTATION_MAX_PER_JOB"
  | "MUTATION_SIMILARITY_THRESHOLD"
  | "MUTATION_TEMP_MIN"
  | "MUTATION_TEMP_MAX"
  | "NEXT_PUBLIC_API_URL"
  | "APP_URL"
  | "APP_URL_ALLOWLIST"
  | "NEXT_PUBLIC_BACKEND_URL"
  | "BACKEND_INTERNAL_URL"
  | "BACKEND_URL";

type EnvSchema = Record<EnvKey, { required?: boolean; defaultValue?: string; productionOnly?: boolean }>;

const schema: EnvSchema = {
  DATABASE_URL: { required: true },
  GEMINI_API_KEY: { required: false },
  GOOGLE_API_KEY: { required: false },
  GITHUB_TOKEN: { required: false },
  NVD_API_KEY: { required: false },
  VENTUREOS_EXTERNAL_INTELLIGENCE: { required: false },
  VENTUREOS_BENCHMARK_DATASET_URL: { required: false },
  VENTUREOS_REPOSITORY_CORPUS_URL: { required: false },
  VENTUREOS_RUNTIME_TELEMETRY_URL: { required: false },
  VENTUREOS_VALUATION_DATASET_URL: { required: false },
  REDIS_URL: { required: false },
  ADMIN_EMAIL: { defaultValue: "admin@ventureos.local" },
  ADMIN_PASSWORD: { required: true, productionOnly: true },
  ADMIN_SESSION_SECRET: { required: true, productionOnly: true },
  SESSION_SECRET: { required: false },
  NEXTAUTH_SECRET: { required: false },
  ENCRYPTION_KEY: { required: false },
  AGENT_MEMORY_ENCRYPTION_KEY: { required: false },
  VENTUREOS_CERT_PRIVATE_KEY_PEM: { required: false },
  VENTUREOS_CERT_PRIVATE_KEY_BASE64: { required: false },
  VENTUREOS_CERT_PUBLIC_KEY_PEM: { required: false },
  VENTUREOS_CERT_PUBLIC_KEY_BASE64: { required: false },
  VENTUREOS_CERT_SIGNING_KEY_ID: { required: false },
  STRIPE_SECRET_KEY: { required: false },
  STRIPE_WEBHOOK_SECRET: { required: false },
  STRIPE_PRICE_APPRAISAL_INSTANT: { required: false },
  STRIPE_PRICE_APPRAISAL_BUYER: { required: false },
  AGENT_MEMORY_MAX_PER_USER: { defaultValue: "1000" },
  AGENT_MEMORY_PRUNE_DAYS: { defaultValue: "90" },
  AGENT_MEMORY_SIMILARITY_THRESHOLD: { defaultValue: "0.75" },
  AGENT_MEMORY_EMBEDDING_MODEL: { defaultValue: "text-embedding-004" },
  MUTATION_MAX_PER_JOB: { defaultValue: "3" },
  MUTATION_SIMILARITY_THRESHOLD: { defaultValue: "0.80" },
  MUTATION_TEMP_MIN: { defaultValue: "0.7" },
  MUTATION_TEMP_MAX: { defaultValue: "1.0" },
  NEXT_PUBLIC_API_URL: { required: false },
  APP_URL: { required: false },
  APP_URL_ALLOWLIST: { required: false },
  NEXT_PUBLIC_BACKEND_URL: { required: false },
  BACKEND_INTERNAL_URL: { required: false },
  BACKEND_URL: { required: false },
};

export const env = {
  DATABASE_URL: optional("DATABASE_URL"),
  GEMINI_API_KEY: optional("GEMINI_API_KEY") || optional("GOOGLE_API_KEY"),
  GOOGLE_API_KEY: optional("GOOGLE_API_KEY"),
  GITHUB_TOKEN: optional("GITHUB_TOKEN"),
  NVD_API_KEY: optional("NVD_API_KEY"),
  VENTUREOS_EXTERNAL_INTELLIGENCE: optional("VENTUREOS_EXTERNAL_INTELLIGENCE"),
  VENTUREOS_BENCHMARK_DATASET_URL: optional("VENTUREOS_BENCHMARK_DATASET_URL"),
  VENTUREOS_REPOSITORY_CORPUS_URL: optional("VENTUREOS_REPOSITORY_CORPUS_URL"),
  VENTUREOS_RUNTIME_TELEMETRY_URL: optional("VENTUREOS_RUNTIME_TELEMETRY_URL"),
  VENTUREOS_VALUATION_DATASET_URL: optional("VENTUREOS_VALUATION_DATASET_URL"),
  REDIS_URL: optional("REDIS_URL"),
  ADMIN_EMAIL: value("ADMIN_EMAIL"),
  ADMIN_PASSWORD: optional("ADMIN_PASSWORD"),
  ADMIN_SESSION_SECRET: optional("ADMIN_SESSION_SECRET"),
  SESSION_SECRET: optional("SESSION_SECRET") || optional("ADMIN_SESSION_SECRET") || optional("NEXTAUTH_SECRET"),
  NEXTAUTH_SECRET: optional("NEXTAUTH_SECRET"),
  ENCRYPTION_KEY: optional("ENCRYPTION_KEY") || optional("AGENT_MEMORY_ENCRYPTION_KEY"),
  AGENT_MEMORY_ENCRYPTION_KEY: optional("AGENT_MEMORY_ENCRYPTION_KEY"),
  VENTUREOS_CERT_PRIVATE_KEY: optional("VENTUREOS_CERT_PRIVATE_KEY_PEM") || optional("VENTUREOS_CERT_PRIVATE_KEY_BASE64"),
  VENTUREOS_CERT_PUBLIC_KEY: optional("VENTUREOS_CERT_PUBLIC_KEY_PEM") || optional("VENTUREOS_CERT_PUBLIC_KEY_BASE64"),
  VENTUREOS_CERT_SIGNING_KEY_ID: optional("VENTUREOS_CERT_SIGNING_KEY_ID"),
  STRIPE_SECRET_KEY: optional("STRIPE_SECRET_KEY"),
  STRIPE_WEBHOOK_SECRET: optional("STRIPE_WEBHOOK_SECRET"),
  STRIPE_PRICE_APPRAISAL_INSTANT: optional("STRIPE_PRICE_APPRAISAL_INSTANT"),
  STRIPE_PRICE_APPRAISAL_BUYER: optional("STRIPE_PRICE_APPRAISAL_BUYER"),
  AGENT_MEMORY_MAX_PER_USER: value("AGENT_MEMORY_MAX_PER_USER"),
  AGENT_MEMORY_PRUNE_DAYS: value("AGENT_MEMORY_PRUNE_DAYS"),
  AGENT_MEMORY_SIMILARITY_THRESHOLD: value("AGENT_MEMORY_SIMILARITY_THRESHOLD"),
  AGENT_MEMORY_EMBEDDING_MODEL: value("AGENT_MEMORY_EMBEDDING_MODEL"),
  MUTATION_MAX_PER_JOB: value("MUTATION_MAX_PER_JOB"),
  MUTATION_SIMILARITY_THRESHOLD: value("MUTATION_SIMILARITY_THRESHOLD"),
  MUTATION_TEMP_MIN: value("MUTATION_TEMP_MIN"),
  MUTATION_TEMP_MAX: value("MUTATION_TEMP_MAX"),
  NEXT_PUBLIC_API_URL: optional("NEXT_PUBLIC_API_URL"),
  APP_URL: optional("APP_URL"),
  APP_URL_ALLOWLIST: optional("APP_URL_ALLOWLIST"),
  NEXT_PUBLIC_BACKEND_URL: optional("NEXT_PUBLIC_BACKEND_URL"),
  BACKEND_INTERNAL_URL: optional("BACKEND_INTERNAL_URL"),
  BACKEND_URL: optional("BACKEND_URL"),
};

export function required(key: EnvKey): string {
  const val = process.env[key] || schema[key]?.defaultValue;
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export function optional(key: EnvKey): string | undefined {
  return process.env[key] || schema[key]?.defaultValue;
}

export function validateEnv(options: { production?: boolean } = {}) {
  const production = options.production ?? process.env.NODE_ENV === "production";
  const missing = Object.entries(schema)
    .filter(([, config]) => config.required && (!config.productionOnly || production))
    .filter(([key, config]) => !process.env[key] && !config.defaultValue)
    .map(([key]) => key);

  if (!env.GEMINI_API_KEY) missing.push("GEMINI_API_KEY or GOOGLE_API_KEY");
  if (production && !env.ENCRYPTION_KEY) missing.push("ENCRYPTION_KEY or AGENT_MEMORY_ENCRYPTION_KEY");
  if (production && !env.SESSION_SECRET) missing.push("SESSION_SECRET or ADMIN_SESSION_SECRET or NEXTAUTH_SECRET");
  if (production && !env.VENTUREOS_CERT_PRIVATE_KEY) missing.push("VENTUREOS_CERT_PRIVATE_KEY_PEM or VENTUREOS_CERT_PRIVATE_KEY_BASE64");
  if (production && !env.VENTUREOS_CERT_PUBLIC_KEY) missing.push("VENTUREOS_CERT_PUBLIC_KEY_PEM or VENTUREOS_CERT_PUBLIC_KEY_BASE64");
  if (production && !env.VENTUREOS_CERT_SIGNING_KEY_ID) missing.push("VENTUREOS_CERT_SIGNING_KEY_ID");
  if (production && !env.STRIPE_SECRET_KEY) missing.push("STRIPE_SECRET_KEY");
  if (production && !env.STRIPE_WEBHOOK_SECRET) missing.push("STRIPE_WEBHOOK_SECRET");
  if (missing.length > 0) throw new Error(`Missing required env vars: ${Array.from(new Set(missing)).join(", ")}`);
  return true;
}

export function numberEnv(key: EnvKey, fallback: number) {
  const raw = optional(key);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function value(key: EnvKey) {
  const val = optional(key);
  if (!val) throw new Error(`Missing default env config for ${key}`);
  return val;
}
