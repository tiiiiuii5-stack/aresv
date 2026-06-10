import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { getAdminSession } from "@/lib/admin-auth";

export type AuthSession = {
  userId: string;
  role: string;
  orgId: string | null;
};

const SESSION_COOKIE = "ventureos_session";

export async function getSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  const session = sessionToken ? verifySessionToken(sessionToken) : null;
  if (session) return session;

  const adminSession = await getAdminSession().catch(() => null);
  if (!adminSession) return null;

  return {
    userId: process.env.ADMIN_USER_ID || adminSession.email,
    role: "admin",
    orgId: process.env.ADMIN_ORG_ID || null,
  };
}

export async function requireSession(): Promise<AuthSession> {
  const session = await getSession();
  if (!session?.userId) throw new Error("UNAUTHORIZED");
  return session;
}

function verifySessionToken(token: string): AuthSession | null {
  try {
    const [encoded, signature] = token.split(".");
    if (!encoded || !signature) return null;
    if (!safeEqual(signature, sign(encoded))) return null;

    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
      userId?: unknown;
      role?: unknown;
      orgId?: unknown;
      expires?: unknown;
      exp?: unknown;
    };

    const expires = Number(payload.expires || payload.exp || 0);
    if (expires && expires < Date.now()) return null;

    const userId = typeof payload.userId === "string" ? payload.userId.trim() : "";
    const role = typeof payload.role === "string" ? payload.role.trim() : "";
    const orgId = typeof payload.orgId === "string" && payload.orgId.trim() ? payload.orgId.trim() : null;
    if (!userId || !role) return null;

    return { userId, role, orgId };
  } catch {
    return null;
  }
}

function sign(value: string) {
  return createHmac("sha256", sessionSecret()).update(value).digest("hex");
}

function sessionSecret() {
  const secret = process.env.SESSION_SECRET || process.env.ADMIN_SESSION_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for server sessions.");
  return secret;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = new Uint8Array(Buffer.from(left));
  const rightBuffer = new Uint8Array(Buffer.from(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
