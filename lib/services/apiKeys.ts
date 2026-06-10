import { randomUUID } from "node:crypto";

import { auditLogService } from "@/lib/services/auditLog";
import { dbOrThrow, generateToken, hashSecret, logPlatform, required, safeHashEqual, sanitizeMetadata } from "@/lib/services/platformSupport";

export class ApiKeyService {
  async create(input: { userId: string; teamId?: string | null; name: string; scopes?: string[]; expiresAt?: string | null; traceId?: string }) {
    const db = dbOrThrow();
    const issued = generateToken("vos");
    const rows = await db.$queryRawUnsafe(
      `INSERT INTO "api_keys" ("id", "userId", "teamId", "name", "prefix", "keyHash", "scopes", "expiresAt")
       VALUES ($8, $1, $2, $3, $4, $5, $6::jsonb, $7::timestamp)
       RETURNING "id", "userId", "teamId", "name", "prefix", "scopes", "status", "lastUsedAt", "expiresAt", "createdAt"`,
      required(input.userId, "userId"),
      input.teamId || null,
      required(input.name, "name"),
      issued.prefix,
      hashSecret(issued.token),
      JSON.stringify(input.scopes || []),
      input.expiresAt || null,
      randomUUID(),
    );
    await auditLogService.record({ actorId: input.userId, teamId: input.teamId || null, action: "api_key.create", resource: "api_key", resourceId: Array.isArray(rows) ? rows[0]?.id : undefined, traceId: input.traceId, metadata: sanitizeMetadata({ scopes: input.scopes || [] }) });
    logPlatform("api-key.create", "api key created", { traceId: input.traceId, userId: input.userId, prefix: issued.prefix });
    return { key: issued.token, record: Array.isArray(rows) ? rows[0] : rows };
  }

  async list(userId: string) {
    const db = dbOrThrow();
    return db.$queryRawUnsafe(
      `SELECT "id", "userId", "teamId", "name", "prefix", "scopes", "status", "lastUsedAt", "expiresAt", "createdAt"
       FROM "api_keys"
       WHERE "userId" = $1
       ORDER BY "createdAt" DESC`,
      required(userId, "userId"),
    );
  }

  async verify(token: string, requiredScope?: string, userId?: string) {
    const db = dbOrThrow();
    const clean = required(token, "token");
    const prefix = clean.split("_").slice(0, 2).join("_");
    const rows = await db.$queryRawUnsafe<Array<{ id: string; userId: string; keyHash: string; scopes: string[]; status: string; expiresAt: Date | null }>>(
      `SELECT "id", "userId", "keyHash", "scopes", "status", "expiresAt" FROM "api_keys" WHERE "prefix" = $1 LIMIT 1`,
      prefix,
    );
    const key = rows[0];
    if (key && userId && key.userId !== userId) throw new Error("FORBIDDEN - API KEY OWNER MISMATCH");
    const active = key?.status === "active" && (!key.expiresAt || new Date(key.expiresAt).getTime() > Date.now());
    const scopes = Array.isArray(key?.scopes) ? key.scopes : [];
    const scopeOk = !requiredScope || scopes.includes("*") || scopes.includes(requiredScope);
    const verified = Boolean(key && active && scopeOk && safeHashEqual(clean, key.keyHash));
    if (verified) {
      await db.$executeRawUnsafe(`UPDATE "api_keys" SET "lastUsedAt" = NOW() WHERE "id" = $1`, key.id);
    }
    return { verified, keyId: verified ? key.id : null };
  }

  async revoke(id: string, userId: string, traceId?: string) {
    const db = dbOrThrow();
    const rows = await db.$queryRawUnsafe<Array<{ id: string; userId: string; status: string }>>(
      `SELECT "id", "userId", "status" FROM "api_keys" WHERE "id" = $1 LIMIT 1`,
      required(id, "id"),
    );
    const key = rows[0];
    if (!key) throw new Error("API_KEY_NOT_FOUND");
    if (key.userId !== required(userId, "userId")) throw new Error("FORBIDDEN - API KEY OWNER MISMATCH");
    if (key.status === "revoked") return false;

    const count = await db.$executeRawUnsafe(
      `UPDATE "api_keys"
       SET "status" = 'revoked', "revokedAt" = NOW()
       WHERE "id" = $1 AND "userId" = $2 AND "status" <> 'revoked'`,
      required(id, "id"),
      required(userId, "userId"),
    );
    if (count <= 0) throw new Error("API_KEY_NOT_FOUND");
    await auditLogService.record({ actorId: userId, action: "api_key.revoke", resource: "api_key", resourceId: id, traceId });
    return count > 0;
  }
}

export const apiKeyService = new ApiKeyService();
