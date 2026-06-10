import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

type TraceFields = Record<string, unknown>;

export function createTrace(action: string) {
  const traceId = randomUUID();
  trace(action, "request received", { traceId });
  return traceId;
}

export function trace(action: string, message: string, fields: TraceFields = {}) {
  const safeFields = sanitize(fields);
  console.log(JSON.stringify({ level: "info", source: "ventureos", action, message, ...safeFields, timestamp: new Date().toISOString() }));
}

export function traceError(action: string, message: string, error: unknown, fields: TraceFields = {}) {
  const details =
    error instanceof Error
      ? {
          error: redactSensitiveText(error.message),
          stack: process.env.NODE_ENV === "production" ? undefined : redactSensitiveText(error.stack || ""),
        }
      : { error: redactSensitiveText(String(error)) };
  console.error(JSON.stringify({ level: "error", source: "ventureos", action, message, ...sanitize(fields), ...details, timestamp: new Date().toISOString() }));
}

export function errorResponse(action: string, traceId: string, error: unknown, status = 500) {
  traceError(action, "request failed", error, { traceId });
  return NextResponse.json(
    {
      ok: false,
      traceId,
      error: status >= 500 ? "Unexpected server error." : redactSensitiveText(error instanceof Error ? error.message : "Request failed."),
    },
    { status },
  );
}

export async function withStep<T>(action: string, traceId: string, step: string, work: () => Promise<T> | T, timeoutMs = 30_000): Promise<T> {
  trace(action, `${step} start`, { traceId });
  const timer = new Promise<never>((_, reject) => {
    const id = setTimeout(() => {
      clearTimeout(id);
      reject(new Error(`${step} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    const result = await Promise.race([Promise.resolve().then(work), timer]);
    trace(action, `${step} complete`, { traceId });
    return result;
  } catch (error) {
    traceError(action, `${step} failed`, error, { traceId });
    throw error;
  }
}

function sanitize(fields: TraceFields) {
  const output: TraceFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (/secret|password|token|key|database_url|postgres|pgpassword/i.test(key)) {
      output[key] = "[redacted]";
    } else if (typeof value === "string" && value.length > 500) {
      output[key] = `${redactSensitiveText(value).slice(0, 500)}...`;
    } else if (typeof value === "string") {
      output[key] = redactSensitiveText(value);
    } else if (value && typeof value === "object") {
      output[key] = sanitizeObject(value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function sanitizeObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitizeObject);
  if (!value || typeof value !== "object") return value;
  const output: TraceFields = {};
  for (const [key, item] of Object.entries(value as TraceFields)) {
    if (/secret|password|token|key|database_url|postgres|pgpassword/i.test(key)) {
      output[key] = "[redacted]";
    } else if (typeof item === "string") {
      output[key] = redactSensitiveText(item.length > 500 ? `${item.slice(0, 500)}...` : item);
    } else if (item && typeof item === "object") {
      output[key] = sanitizeObject(item);
    } else {
      output[key] = item;
    }
  }
  return output;
}

export function redactSensitiveText(value: string) {
  return value
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[redacted-database-url]")
    .replace(/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9_]+/g, "[redacted-stripe-key]")
    .replace(/\bwhsec_[A-Za-z0-9_]+/g, "[redacted-webhook-secret]")
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[redacted-supabase-key]")
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g, "[redacted-jwt]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, (match) => (looksLikeSecret(match) ? "[redacted-token]" : match));
}

function looksLikeSecret(value: string) {
  return /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && /[_-]/.test(value);
}
