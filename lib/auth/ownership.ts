import type { AuthSession } from "@/lib/auth/session";

export function assertOwnership(resource: { userId?: string | null; user?: { email?: string | null } | null }, session: AuthSession) {
  const ownerMatches = resource.userId === session.userId || Boolean(resource.user?.email && resource.user.email === session.userId);
  if (!ownerMatches) {
    throw new Error("FORBIDDEN - NOT OWNER");
  }
}

export function assertOrgAccess(resource: { orgId?: string | null; teamId?: string | null }, session: AuthSession) {
  const resourceOrgId = resource.orgId || resource.teamId || null;
  if (resourceOrgId && resourceOrgId !== session.orgId) {
    throw new Error("FORBIDDEN - WRONG ORG");
  }
}
