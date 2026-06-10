const DEFAULT_BACKEND_URL = "http://localhost:3002";

export function backendUrl(path = "") {
  const explicitBase = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_INTERNAL_URL || process.env.BACKEND_URL;
  const cleanPath = path ? `/${path.replace(/^\/+/, "")}` : "";

  if (!explicitBase && typeof window !== "undefined") {
    return cleanPath || "/";
  }

  const base = explicitBase || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : DEFAULT_BACKEND_URL);
  assertProductionSafeUrl(base, "backend");
  const cleanBase = base.replace(/\/+$/, "");
  return `${cleanBase}${cleanPath}`;
}

export async function backendJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(backendUrl(path), {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `Backend request failed: ${response.status}`);
  return data as T;
}

function assertProductionSafeUrl(value: string, label: string) {
  if (process.env.NODE_ENV !== "production") return;
  const url = new URL(value);
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error(`Production ${label} URL cannot point to localhost.`);
  }
}
