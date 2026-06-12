"use client";

import { generateTraceId } from "./logging/logger";

/**
 * Check if user has an authenticated server session
 * Returns false for anonymous/unauthenticated users
 */
export async function hasServerSession() {
  try {
    const response = await fetch("/api/session", { cache: "no-store" });
    if (!response?.ok) return false;
    const data = await response.json();
    return Boolean(data?.authenticated);
  } catch {
    return false;
  }
}

/**
 * Get or create a correlation trace ID for this session
 * Used for tracing requests across client and server
 */
export function getSessionTraceId(): string {
  if (typeof window === "undefined") return "server";

  const key = "ventureos_trace_id";
  let traceId = window.sessionStorage.getItem(key);

  if (!traceId) {
    traceId = generateTraceId();
    window.sessionStorage.setItem(key, traceId);
  }

  return traceId;
}

/**
 * Clear session state on logout
 */
export function clearSessionState() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem("ventureos_trace_id");
  // Note: Don't clear localStorage - might have user preferences
}

