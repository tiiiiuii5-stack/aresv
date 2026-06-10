import { randomUUID } from "node:crypto";

import { auditLogService } from "@/lib/services/auditLog";
import { dbOrThrow, logPlatform, parseNextRun, required, sanitizeMetadata, type JsonObject } from "@/lib/services/platformSupport";

export class ScheduledJobService {
  async create(input: { userId: string; teamId?: string | null; projectId?: string | null; name: string; jobType: string; schedule: string; payload?: JsonObject; traceId?: string }) {
    const db = dbOrThrow();
    const nextRunAt = parseNextRun(required(input.schedule, "schedule"));
    const rows = await db.$queryRawUnsafe(
      `INSERT INTO "scheduled_jobs" ("id", "userId", "teamId", "projectId", "name", "jobType", "schedule", "payload", "nextRunAt", "updatedAt")
       VALUES ($9, $1, $2, $3, $4, $5, $6, $7::jsonb, $8, NOW())
       RETURNING *`,
      required(input.userId, "userId"),
      input.teamId || null,
      input.projectId || null,
      required(input.name, "name"),
      required(input.jobType, "jobType"),
      input.schedule,
      JSON.stringify(sanitizeMetadata(input.payload || {})),
      nextRunAt,
      randomUUID(),
    );
    await auditLogService.record({ actorId: input.userId, teamId: input.teamId || null, projectId: input.projectId || null, action: "scheduled_job.create", resource: "scheduled_job", resourceId: Array.isArray(rows) ? rows[0]?.id : undefined, traceId: input.traceId });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async list(userId: string) {
    const db = dbOrThrow();
    return db.$queryRawUnsafe(`SELECT * FROM "scheduled_jobs" WHERE "userId" = $1 ORDER BY "createdAt" DESC`, required(userId, "userId"));
  }

  async runDue(limit = 10, traceId?: string) {
    const db = dbOrThrow();
    const jobs = await db.$queryRawUnsafe<Array<{ id: string; schedule: string; jobType: string; userId: string }>>(
      `SELECT * FROM "scheduled_jobs" WHERE "status" = 'active' AND "nextRunAt" IS NOT NULL AND "nextRunAt" <= NOW() ORDER BY "nextRunAt" ASC LIMIT $1`,
      Math.min(Math.max(Number(limit || 10), 1), 50),
    );
    const results = [];
    for (const job of jobs) {
      const nextRunAt = parseNextRun(job.schedule);
      await db.$executeRawUnsafe(
        `UPDATE "scheduled_jobs" SET "lastRunAt" = NOW(), "nextRunAt" = $2, "runCount" = "runCount" + 1, "updatedAt" = NOW() WHERE "id" = $1`,
        job.id,
        nextRunAt,
      );
      await auditLogService.record({ actorId: job.userId, action: "scheduled_job.run", resource: "scheduled_job", resourceId: job.id, traceId, metadata: { jobType: job.jobType } });
      results.push({ id: job.id, jobType: job.jobType, nextRunAt: nextRunAt.toISOString() });
    }
    logPlatform("scheduled-jobs.runDue", "due scheduled jobs processed", { traceId, count: results.length });
    return results;
  }

  async pause(id: string, userId: string, traceId?: string) {
    const db = dbOrThrow();
    const cleanUserId = required(userId, "userId");
    const count = await db.$executeRawUnsafe(`UPDATE "scheduled_jobs" SET "status" = 'paused', "updatedAt" = NOW() WHERE "id" = $1 AND "userId" = $2`, required(id, "id"), cleanUserId);
    await auditLogService.record({ actorId: cleanUserId, action: "scheduled_job.pause", resource: "scheduled_job", resourceId: id, traceId });
    return count > 0;
  }
}

export const scheduledJobService = new ScheduledJobService();
