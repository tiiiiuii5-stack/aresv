import type { AuthSession } from "@/lib/auth/session";

export async function requireAdmin(session: AuthSession) {
  if (session.role !== "admin") throw new Error("FORBIDDEN");
}

export async function requireRole(session: AuthSession, role: string) {
  if (session.role !== role) throw new Error("FORBIDDEN");
}

export async function requireAuth(session: AuthSession | null | undefined) {
  if (!session?.userId) throw new Error("UNAUTHORIZED");
}
