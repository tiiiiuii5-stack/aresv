import { randomUUID } from "node:crypto";

import { auditLogService } from "@/lib/services/auditLog";
import { dbOrThrow, hasPermission, logPlatform, required, sanitizeMetadata, slugify, type JsonObject } from "@/lib/services/platformSupport";

export class RbacService {
  async createTeam(input: { name: string; ownerId: string; ownerEmail?: string; actorId?: string; metadata?: JsonObject; traceId?: string }) {
    const db = dbOrThrow();
    const name = required(input.name, "name");
    const ownerId = required(input.ownerId, "ownerId");
    const actorId = required(input.actorId || ownerId, "actorId");
    const baseSlug = slugify(name);
    const slug = `${baseSlug}-${Date.now().toString(36)}`;
    const rows = await db.$queryRawUnsafe<Array<{ id: string; name: string; slug: string; ownerId: string }>>(
      `INSERT INTO "teams" ("id", "name", "slug", "ownerId", "metadata", "updatedAt")
       VALUES ($5, $1, $2, $3, $4::jsonb, NOW())
       RETURNING *`,
      name,
      slug,
      ownerId,
      JSON.stringify(sanitizeMetadata(input.metadata || {})),
      randomUUID(),
    );
    await this.addMember({ teamId: rows[0].id, userId: ownerId, email: input.ownerEmail || ownerId, role: "owner", actorId, traceId: input.traceId });
    await auditLogService.record({ actorId, teamId: rows[0].id, action: "team.create", resource: "team", resourceId: rows[0].id, traceId: input.traceId });
    return rows[0];
  }

  async addMember(input: { teamId: string; userId: string; email: string; role: string; actorId?: string; metadata?: JsonObject; traceId?: string }) {
    const db = dbOrThrow();
    const role = required(input.role, "role");
    const actorId = required(input.actorId || input.userId, "actorId");
    if (!["owner", "admin", "developer", "viewer", "billing"].includes(role)) throw new Error("Invalid role.");
    const rows = await db.$queryRawUnsafe(
      `INSERT INTO "team_members" ("id", "teamId", "userId", "email", "role", "metadata", "updatedAt")
       VALUES ($6, $1, $2, $3, $4, $5::jsonb, NOW())
       ON CONFLICT ("teamId", "userId") DO UPDATE SET "email" = EXCLUDED."email", "role" = EXCLUDED."role", "status" = 'active', "updatedAt" = NOW()
       RETURNING *`,
      required(input.teamId, "teamId"),
      required(input.userId, "userId"),
      required(input.email, "email"),
      role,
      JSON.stringify(sanitizeMetadata(input.metadata || {})),
      randomUUID(),
    );
    await auditLogService.record({ actorId, teamId: input.teamId, action: "team.member.upsert", resource: "team_member", traceId: input.traceId, metadata: { role, targetUserId: input.userId } });
    logPlatform("rbac.member", "team member upserted", { traceId: input.traceId, teamId: input.teamId, role });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async listTeams(userId: string) {
    const db = dbOrThrow();
    return db.$queryRawUnsafe(
      `SELECT t.*, tm."role", tm."status" AS "membershipStatus"
       FROM "teams" t
       JOIN "team_members" tm ON tm."teamId" = t."id"
       WHERE tm."userId" = $1 AND tm."status" = 'active'
       ORDER BY t."createdAt" DESC`,
      required(userId, "userId"),
    );
  }

  async checkPermission(input: { userId: string; teamId: string; permission: string }) {
    const db = dbOrThrow();
    const rows = await db.$queryRawUnsafe<Array<{ role: string }>>(
      `SELECT "role" FROM "team_members" WHERE "userId" = $1 AND "teamId" = $2 AND "status" = 'active' LIMIT 1`,
      required(input.userId, "userId"),
      required(input.teamId, "teamId"),
    );
    const role = rows[0]?.role || "";
    return { allowed: Boolean(role && hasPermission(role, required(input.permission, "permission"))), role };
  }
}

export const rbacService = new RbacService();
