import { randomUUID } from "node:crypto";

import { dbOrThrow, logPlatform, required, sanitizeMetadata, type JsonObject } from "@/lib/services/platformSupport";

export type AuditLogInput = {
  actorId?: string | null;
  actorEmail?: string | null;
  teamId?: string | null;
  projectId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  outcome?: "success" | "failure";
  traceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: JsonObject | null;
};

export class AuditLogService {
  async record(input: AuditLogInput) {
    const db = dbOrThrow();
    const rows = await db.$queryRawUnsafe<AuditLogInput[]>(
      `INSERT INTO "audit_logs" ("id", "actorId", "actorEmail", "teamId", "projectId", "action", "resource", "resourceId", "outcome", "traceId", "ipAddress", "userAgent", "metadata")
       VALUES ($13, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
       RETURNING *`,
      input.actorId || null,
      input.actorEmail || null,
      input.teamId || null,
      input.projectId || null,
      required(input.action, "action"),
      required(input.resource, "resource"),
      input.resourceId || null,
      input.outcome || "success",
      input.traceId || null,
      input.ipAddress || null,
      input.userAgent || null,
      JSON.stringify(sanitizeMetadata(input.metadata || {})),
      randomUUID(),
    );
    logPlatform("audit.record", "audit log recorded", { traceId: input.traceId || undefined, action: input.action, resource: input.resource });
    return rows[0];
  }

  async list(filters: { actorId?: string; teamId?: string; projectId?: string; action?: string; limit?: number }) {
    const db = dbOrThrow();
    const limit = Math.min(Math.max(Number(filters.limit || 50), 1), 200);
    return db.$queryRawUnsafe(
      `SELECT * FROM "audit_logs"
       WHERE ($1::text IS NULL OR "actorId" = $1)
         AND ($2::text IS NULL OR "teamId" = $2)
         AND ($3::text IS NULL OR "projectId" = $3)
         AND ($4::text IS NULL OR "action" = $4)
       ORDER BY "createdAt" DESC
       LIMIT $5`,
      filters.actorId || null,
      filters.teamId || null,
      filters.projectId || null,
      filters.action || null,
      limit,
    );
  }
}

export const auditLogService = new AuditLogService();
