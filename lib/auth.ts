"use client";

const USER_KEY = "ventureos_user_id";

export function getClientUserId() {
  if (typeof window === "undefined") return "system";
  const existing = window.localStorage.getItem(USER_KEY);
  if (existing) return existing;
  const created = `user_${crypto.randomUUID()}`;
  window.localStorage.setItem(USER_KEY, created);
  return created;
}

export function clearClientUserId() {
  if (typeof window !== "undefined") window.localStorage.removeItem(USER_KEY);
}
