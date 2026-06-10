"use client";

export async function hasServerSession() {
  const response = await fetch("/api/session", { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return false;
  const data = await response.json().catch(() => ({}));
  return Boolean(data?.authenticated);
}
