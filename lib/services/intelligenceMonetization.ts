import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { getPrisma } from "@/lib/persistence/database";
import { safeHashEqual, sanitizeMetadata } from "@/lib/services/platformSupport";

type ApiTier = "free" | "pro" | "enterprise";

type ApiPrincipal = {
  apiKeyId: string;
  userId: string;
  teamId: string | null;
  tier: ApiTier;
  scopes: string[];
};

export type MonetizationContext = ApiPrincipal & {
  endpoint: string;
  costCents: number;
  monthlyLimit: number | null;
  monthlyUsed: number;
  monthlyRemaining: number | null;
  rateLimitPerMinute: number;
};

const TIER_CONFIG: Record<ApiTier, { monthlyRequests: number | null; rateLimitPerMinute: number; costCents: number }> = {
  free: { monthlyRequests: 50, rateLimitPerMinute: 10, costCents: 0 },
  pro: { monthlyRequests: 5_000, rateLimitPerMinute: 120, costCents: 2 },
  enterprise: { monthlyRequests: null, rateLimitPerMinute: 1_000, costCents: 1 },
};

const ENDPOINT_COST_MULTIPLIER: Record<string, number> = {
  "/api/analyze-app": 5,
  "/api/scan-repo": 10,
  "/api/evolution-loop": 10,
  "/api/evidence/events": 1,
  "/api/audit-packets": 2,
  "/api/intelligence/usage": 1,
  "/insights/failure-patterns": 1,
  "/insights/security-trends": 1,
  "/benchmarks/frameworks": 1,
  "/benchmarks/modules": 1,
};

export class IntelligenceMonetizationService {
  async requireApiAccess(request: NextRequest | Request, endpoint: string, requiredScope = "intelligence:read"): Promise<MonetizationContext> {
    const token = extractApiKey(request);
    if (!token) throw new MonetizationError("Missing API key. Send `x-api-key` or `Authorization: Bearer <key>`.", 401);

    const db = getPrisma();
    if (!db) throw new MonetizationError("Database is required for API key authentication.", 503);

    const key = await this.verifyApiKey(token);
    if (!key) throw new MonetizationError("Invalid, revoked, or expired API key.", 401);
    if (!hasScope(key.scopes, requiredScope)) throw new MonetizationError("API key does not include the required scope.", 403);

    const tier = await this.resolveTier(key.userId, key.teamId);
    const config = TIER_CONFIG[tier];
    const monthStart = currentMonthStart();
    const minuteStart = new Date(Date.now() - 60_000);
    const [monthlyRows, minuteRows] = await Promise.all([
      db.$queryRawUnsafe<Array<{ used: number }>>(
        `SELECT COALESCE(SUM("requestUnits"), 0)::int AS used FROM "api_usage_events" WHERE "apiKeyId" = $1 AND "createdAt" >= $2`,
        key.apiKeyId,
        monthStart,
      ),
      db.$queryRawUnsafe<Array<{ used: number }>>(
        `SELECT COALESCE(SUM("requestUnits"), 0)::int AS used FROM "api_usage_events" WHERE "apiKeyId" = $1 AND "createdAt" >= $2`,
        key.apiKeyId,
        minuteStart,
      ),
    ]);

    const monthlyUsed = Number(monthlyRows[0]?.used || 0);
    const minuteUsed = Number(minuteRows[0]?.used || 0);
    const units = requestUnits(endpoint);
    if (config.monthlyRequests !== null && monthlyUsed + units > config.monthlyRequests) {
      throw new MonetizationError(`${tier} API quota exceeded. Upgrade to continue scanning.`, 402, {
        tier,
        monthlyLimit: config.monthlyRequests,
        monthlyUsed,
      });
    }
    if (minuteUsed + units > config.rateLimitPerMinute) {
      throw new MonetizationError("Rate limit exceeded. Retry after 60 seconds.", 429, {
        tier,
        rateLimitPerMinute: config.rateLimitPerMinute,
      });
    }

    return {
      ...key,
      tier,
      endpoint,
      costCents: config.costCents * units,
      monthlyLimit: config.monthlyRequests,
      monthlyUsed,
      monthlyRemaining: config.monthlyRequests === null ? null : Math.max(config.monthlyRequests - monthlyUsed - units, 0),
      rateLimitPerMinute: config.rateLimitPerMinute,
    };
  }

  async recordUsage(input: {
    context: MonetizationContext;
    method: string;
    statusCode: number;
    metadata?: Record<string, unknown>;
  }) {
    const db = getPrisma();
    if (!db) return;
    await db.$executeRawUnsafe(
      `INSERT INTO "api_usage_events" ("id", "apiKeyId", "userId", "teamId", "endpoint", "method", "statusCode", "tier", "costCents", "requestUnits", "metadata")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
      randomUUID(),
      input.context.apiKeyId,
      input.context.userId,
      input.context.teamId,
      input.context.endpoint,
      input.method,
      input.statusCode,
      input.context.tier,
      input.context.costCents,
      requestUnits(input.context.endpoint),
      JSON.stringify(sanitizeMetadata(input.metadata || {})),
    );
  }

  async getUsageStats(userId: string) {
    const db = getPrisma();
    if (!db) throw new MonetizationError("Database is required for usage statistics.", 503);
    const since = currentMonthStart();
    const [totals, endpoints, keys] = await Promise.all([
      db.$queryRawUnsafe<Array<{ calls: number; costCents: number }>>(
        `SELECT COUNT(*)::int AS calls, COALESCE(SUM("costCents"), 0)::int AS "costCents"
         FROM "api_usage_events"
         WHERE "userId" = $1 AND "createdAt" >= $2`,
        userId,
        since,
      ),
      db.$queryRawUnsafe<Array<{ endpoint: string; calls: number; costCents: number }>>(
        `SELECT "endpoint", COUNT(*)::int AS calls, COALESCE(SUM("costCents"), 0)::int AS "costCents"
         FROM "api_usage_events"
         WHERE "userId" = $1 AND "createdAt" >= $2
         GROUP BY "endpoint"
         ORDER BY calls DESC`,
        userId,
        since,
      ),
      db.$queryRawUnsafe<Array<{ apiKeyId: string | null; calls: number; costCents: number }>>(
        `SELECT "apiKeyId", COUNT(*)::int AS calls, COALESCE(SUM("costCents"), 0)::int AS "costCents"
         FROM "api_usage_events"
         WHERE "userId" = $1 AND "createdAt" >= $2
         GROUP BY "apiKeyId"
         ORDER BY calls DESC`,
        userId,
        since,
      ),
    ]);

    return {
      periodStart: since.toISOString(),
      totals: {
        calls: Number(totals[0]?.calls || 0),
        costCents: Number(totals[0]?.costCents || 0),
      },
      endpoints,
      keys,
    };
  }

  private async verifyApiKey(token: string): Promise<ApiPrincipal | null> {
    const db = getPrisma();
    if (!db) return null;
    const prefix = token.split("_").slice(0, 2).join("_");
    const rows = await db.$queryRawUnsafe<
      Array<{ id: string; userId: string; teamId: string | null; keyHash: string; scopes: string[]; status: string; expiresAt: Date | null }>
    >(
      `SELECT "id", "userId", "teamId", "keyHash", "scopes", "status", "expiresAt"
       FROM "api_keys"
       WHERE "prefix" = $1
       LIMIT 1`,
      prefix,
    );
    const key = rows[0];
    if (!key) return null;
    const active = key.status === "active" && (!key.expiresAt || new Date(key.expiresAt).getTime() > Date.now());
    if (!active || !safeHashEqual(token, key.keyHash)) return null;
    await db.$executeRawUnsafe(`UPDATE "api_keys" SET "lastUsedAt" = NOW() WHERE "id" = $1`, key.id);
    return {
      apiKeyId: key.id,
      userId: key.userId,
      teamId: key.teamId,
      tier: "free",
      scopes: Array.isArray(key.scopes) ? key.scopes : [],
    };
  }

  private async resolveTier(userId: string, teamId: string | null): Promise<ApiTier> {
    const db = getPrisma();
    if (!db) return "free";
    const rows = await db.$queryRawUnsafe<Array<{ tier: string | null; plan: string | null }>>(
      `SELECT s."tier"::text AS tier, ba."plan" AS plan
       FROM "users" u
       LEFT JOIN "subscriptions" s ON s."userId" = u."id" AND s."status" IN ('ACTIVE', 'TRIALING')
       LEFT JOIN "billing_accounts" ba ON ba."userId" = u."id" AND ($2::text IS NULL OR ba."teamId" = $2)
       WHERE u."id" = $1
       LIMIT 1`,
      userId,
      teamId,
    );
    return normalizeApiTier(rows[0]?.tier || rows[0]?.plan || "free");
  }
}

export class MonetizationError extends Error {
  status: number;
  details?: Record<string, unknown>;

  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = "MonetizationError";
    this.status = status;
    this.details = details;
  }
}

export const intelligenceMonetizationService = new IntelligenceMonetizationService();

export function apiUsageHeaders(context: MonetizationContext) {
  return {
    "x-api-tier": context.tier,
    "x-api-monthly-limit": context.monthlyLimit === null ? "unlimited" : String(context.monthlyLimit),
    "x-api-monthly-remaining": context.monthlyRemaining === null ? "unlimited" : String(context.monthlyRemaining),
    "x-api-rate-limit": String(context.rateLimitPerMinute),
    "x-api-request-cost-cents": String(context.costCents),
  };
}

function extractApiKey(request: NextRequest | Request) {
  const explicit = request.headers.get("x-api-key")?.trim();
  if (explicit) return explicit;
  const auth = request.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function hasScope(scopes: string[], requiredScope: string) {
  const [domain] = requiredScope.split(":");
  return scopes.includes("*") || scopes.includes(requiredScope) || scopes.includes(`${domain}:*`);
}

function requestUnits(endpoint: string) {
  return ENDPOINT_COST_MULTIPLIER[endpoint] || 1;
}

function currentMonthStart() {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function normalizeApiTier(value: string): ApiTier {
  const clean = value.trim().toLowerCase();
  if (clean === "enterprise" || clean === "founder" || clean === "owner" || clean === "lifetime") return "enterprise";
  if (clean === "pro" || clean === "team") return "pro";
  return "free";
}
