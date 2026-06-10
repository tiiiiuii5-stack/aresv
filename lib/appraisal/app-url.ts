export function canonicalAppUrl() {
  const raw =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    localDevelopmentAppUrl();

  if (!raw) throw new Error("APP_URL or NEXT_PUBLIC_APP_URL is required for appraisal checkout redirects.");

  const origin = normalizeOrigin(raw);
  const allowed = allowedAppOrigins();
  if (allowed.size > 0 && !allowed.has(origin)) {
    throw new Error("Configured appraisal APP_URL is not allowlisted.");
  }
  return origin;
}

function allowedAppOrigins() {
  const explicitAllowlist = (process.env.APP_URL_ALLOWLIST || "").split(",").map((value) => value.trim()).filter(Boolean);
  const values = explicitAllowlist.length > 0 ? explicitAllowlist : [
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
    localDevelopmentAppUrl(),
  ];
  return new Set(values.map((value) => normalizeOriginOrNull(value)).filter((value): value is string => Boolean(value)));
}

function localDevelopmentAppUrl() {
  if (process.env.NODE_ENV === "production") return "";
  return `http://${localDevelopmentHost()}:3002`;
}

function normalizeOrigin(value: string) {
  const clean = value.trim();
  const withProtocol = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
  const url = new URL(withProtocol);
  if (url.username || url.password) throw new Error("APP_URL must not include credentials.");
  if (url.protocol !== "https:" && !isLocalhost(url.hostname)) {
    throw new Error("APP_URL must use https outside localhost.");
  }
  return url.origin.replace(/\/+$/, "");
}

function normalizeOriginOrNull(value: unknown) {
  const clean = String(value || "").trim();
  if (!clean) return null;
  try {
    return normalizeOrigin(clean);
  } catch {
    return null;
  }
}

function isLocalhost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function localDevelopmentHost() {
  return "localhost";
}
