import { NextResponse } from "next/server";

import { redactSensitiveText, traceError } from "@/lib/diagnostics";
import { SecurityError } from "@/lib/security/errors";

export function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: mergeHeaders(securityHeaders(), init.headers),
  });
}

export function secureErrorResponse(action: string, traceId: string, error: unknown, init: { fallbackStatus?: number; headers?: HeadersInit } = {}) {
  traceError(action, "request failed", error, { traceId });
  const securityError = error instanceof SecurityError ? error : null;
  const status = securityError?.status ?? init.fallbackStatus ?? 500;
  const message = securityError ? securityError.message : status >= 500 ? "Unexpected server error." : "Request failed.";

  return jsonResponse(
    {
      ok: false,
      traceId,
      error: redactSensitiveText(message),
      code: securityError?.code,
      details: securityError?.details,
    },
    { status, headers: mergeHeaders(init.headers, securityError?.headers) },
  );
}

export function mergeHeaders(...sources: Array<HeadersInit | undefined | null>) {
  const headers = new Headers();
  for (const source of sources) {
    if (!source) continue;
    new Headers(source).forEach((value, key) => headers.set(key, value));
  }
  return headers;
}

export function securityHeaders() {
  return new Headers({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Cache-Control": "no-store",
  });
}
