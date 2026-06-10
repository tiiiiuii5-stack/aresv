import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { getPrisma } from "@/lib/persistence/database";
import { trace, traceError } from "@/lib/diagnostics";

export type JsonObject = Record<string, unknown>;

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: ["*"],
  admin: ["project:*", "job:*", "memory:*", "billing:read", "audit:read", "api-key:*", "schedule:*", "team:*"],
  developer: ["project:read", "project:write", "job:*", "memory:*", "schedule:*"],
  viewer: ["project:read", "job:read", "memory:read", "audit:read"],
  billing: ["billing:*", "audit:read"],
};

export function dbOrThrow() {
  const db = getPrisma();
  if (!db) throw new Error("Database is not configured.");
  return db;
}

export function required(value: unknown, field: string) {
  const clean = String(value || "").trim();
  if (!clean) throw new Error(`${field} is required.`);
  return clean;
}

export function slugify(value: string) {
  return required(value, "name")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 72);
}

export function sanitizeMetadata(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: JsonObject = {};
  for (const [key, item] of Object.entries(value as JsonObject)) {
    if (/secret|password|token|key|database_url|postgres|pgpassword/i.test(key)) {
      output[key] = "[redacted]";
    } else if (Array.isArray(item)) {
      output[key] = item.map((entry) => (typeof entry === "object" && entry ? sanitizeMetadata(entry) : entry));
    } else if (item && typeof item === "object") {
      output[key] = sanitizeMetadata(item);
    } else {
      output[key] = item;
    }
  }
  return output;
}

export function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export function safeHashEqual(secret: string, expectedHash: string) {
  const left = Buffer.from(hashSecret(secret));
  const right = Buffer.from(expectedHash);
  return left.byteLength === right.byteLength && timingSafeEqual(new Uint8Array(left), new Uint8Array(right));
}

export function generateToken(prefix = "vos") {
  const visiblePrefix = `${prefix}_${randomBytes(4).toString("hex")}`;
  return {
    prefix: visiblePrefix,
    token: `${visiblePrefix}_${randomBytes(32).toString("base64url")}`,
  };
}

export function hasPermission(role: string, permission: string) {
  const permissions = ROLE_PERMISSIONS[role] || [];
  const [domain] = permission.split(":");
  return permissions.includes("*") || permissions.includes(permission) || permissions.includes(`${domain}:*`);
}

export function parseNextRun(schedule: string, from = new Date()) {
  const value = schedule.trim().toLowerCase();
  const match = value.match(/^every\s+(\d+)\s*(minute|minutes|hour|hours|day|days)$/);
  const next = new Date(from);
  if (match) {
    const amount = Number(match[1]);
    const unit = match[2];
    if (unit.startsWith("minute")) next.setMinutes(next.getMinutes() + amount);
    else if (unit.startsWith("hour")) next.setHours(next.getHours() + amount);
    else next.setDate(next.getDate() + amount);
    return next;
  }
  if (value === "hourly") next.setHours(next.getHours() + 1);
  else if (value === "daily") next.setDate(next.getDate() + 1);
  else if (value === "weekly") next.setDate(next.getDate() + 7);
  else throw new Error("schedule must be hourly, daily, weekly, or every N minutes/hours/days.");
  return next;
}

export function logPlatformError(action: string, message: string, error: unknown, fields: JsonObject = {}) {
  traceError(action, message, error, fields);
}

export function logPlatform(action: string, message: string, fields: JsonObject = {}) {
  trace(action, message, fields);
}
