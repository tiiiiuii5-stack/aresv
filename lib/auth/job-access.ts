import { assertOwnership } from "@/lib/auth/ownership";
import type { AuthSession } from "@/lib/auth/session";

type JobAccessResource = {
  projectId?: string | null;
  payload?: unknown;
  project?: {
    userId?: string | null;
    user?: { email?: string | null } | null;
  } | null;
};

export function assertJobAccess(job: JobAccessResource, session: AuthSession) {
  if (session.role === "admin") return;

  if (job.project) {
    assertOwnership(job.project, session);
    return;
  }

  const payload = job.payload && typeof job.payload === "object" && !Array.isArray(job.payload)
    ? job.payload as Record<string, unknown>
    : {};
  if (typeof payload.userId === "string" && payload.userId === session.userId) return;

  throw new Error("FORBIDDEN - NOT JOB OWNER");
}

export function canAccessJob(job: JobAccessResource, session: AuthSession) {
  try {
    assertJobAccess(job, session);
    return true;
  } catch {
    return false;
  }
}
