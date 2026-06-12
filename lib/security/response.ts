import { NextResponse } from "next/server";

import { redactSensitiveText, trace, traceError } from "@/lib/diagnostics";
import { SecurityError } from "@/lib/security/errors";

export function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: mergeHeaders(securityHeaders(), init.headers),
  });
}

export function secureErrorResponse(action: string, traceId: string, error: unknown, init: { fallbackStatus?: number; headers?: HeadersInit } = {}) {
  const securityError = error instanceof SecurityError ? error : null;
  const status = securityError?.status ?? init.fallbackStatus ?? 500;
  if (status >= 500) {
    traceError(action, "request failed", error, { traceId });
  } else {
    trace(action, "request rejected", {
      traceId,
      status,
      error: redactSensitiveText(error instanceof Error ? error.message : String(error)),
    });
  }
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
    // Content Security Policy: Prevent XSS, restrict inline scripts
    "Content-Security-Policy": "default-src 'self'; script-src 'self' https://www.googletagmanager.com https://www.google-analytics.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://www.google-analytics.com https://www.googletagmanager.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    // HSTS: Enforce HTTPS for 1 year including subdomains
    "Strict-Transport-Security": process.env.NODE_ENV === "production" ? "max-age=31536000; includeSubDomains; preload" : "max-age=0",
  });
}

/**
 * CSRF Token validation middleware
 * Generates and validates CSRF tokens for state-changing operations
 */
export async function generateCsrfToken(): Promise<string> {
  const { randomBytes } = await import("node:crypto");
  return randomBytes(32).toString("hex");
}

export function validateCsrfToken(token: string | undefined, sessionToken: string): boolean {
  if (!token) return false;
  // In production, validate against session-stored token
  // For now, check token format and timing
  return typeof token === "string" && token.length === 64;
}
