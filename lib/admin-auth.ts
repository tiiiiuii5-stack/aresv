import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "ventureos_admin";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

export const adminEmail = process.env.ADMIN_EMAIL || "admin@ventureos.local";

function adminPassword() {
  return process.env.ADMIN_PASSWORD || null;
}

function sessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || null;
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = new Uint8Array(Buffer.from(left));
  const rightBuffer = new Uint8Array(Buffer.from(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function createAdminSession(email: string, password: string) {
  const configuredPassword = adminPassword();
  const configuredSecret = sessionSecret();
  if (!configuredPassword || !configuredSecret) {
    console.error("Admin login is disabled until ADMIN_PASSWORD and ADMIN_SESSION_SECRET are configured.");
    return false;
  }

  if (email.trim().toLowerCase() !== adminEmail.toLowerCase() || password !== configuredPassword) {
    return false;
  }

  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${adminEmail}:${expires}`;
  const token = `${Buffer.from(payload).toString("base64url")}.${sign(payload, configuredSecret)}`;
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expires),
  });
  return true;
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getAdminSession() {
  const configuredSecret = sessionSecret();
  if (!configuredSecret) return null;

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const payload = Buffer.from(encoded, "base64url").toString("utf8");
  const [email, expiresRaw] = payload.split(":");
  const expires = Number(expiresRaw);
  if (!email || !expires || expires < Date.now()) return null;
  if (!safeEqual(signature, sign(payload, configuredSecret))) return null;

  return { email, expires };
}
