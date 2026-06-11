import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

import { trace, traceError } from "@/lib/diagnostics";
import { SecurityError } from "@/lib/security/errors";

type RedisClient = {
  incr(key: string): Promise<number>;
  pexpire(key: string, milliseconds: number): Promise<number>;
  pttl(key: string): Promise<number>;
};

export type RateLimitPolicy = {
  name: string;
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  key: string;
  limit: number;
  remaining: number;
  resetAt: Date;
  headers: Headers;
};

type MemoryBucket = {
  count: number;
  resetAt: number;
};

const memoryBuckets = new Map<string, MemoryBucket>();
let redisClient: RedisClient | null | undefined;
let redisFailureLogged = false;

export const RATE_LIMITS = {
  analyzeApp: { name: "analyze-app", limit: 60, windowMs: 60_000 },
  screenshotAnalysis: { name: "screenshot-analysis", limit: 20, windowMs: 60_000 },
  scanRepo: { name: "scan-repo", limit: 20, windowMs: 60_000 },
  githubInstall: { name: "github-install", limit: 30, windowMs: 60_000 },
  githubWebhook: { name: "github-webhook", limit: 120, windowMs: 60_000 },
  backendChat: { name: "backend-chat", limit: 30, windowMs: 60_000 },
  auditPackets: { name: "audit-packets", limit: 20, windowMs: 60_000 },
  publicDemoScan: { name: "public-demo-scan", limit: 300, windowMs: 60 * 60_000 },
  waitlist: { name: "waitlist", limit: 4, windowMs: 60 * 60_000 },
} satisfies Record<string, RateLimitPolicy>;

export async function enforceRateLimit(request: NextRequest, policy: RateLimitPolicy): Promise<RateLimitResult> {
  const fingerprint = clientFingerprint(request);
  const key = `vos:rl:${policy.name}:${fingerprint}`;
  const redis = await getRedisClient();
  const result = redis ? await rateLimitWithRedis(redis, key, policy) : rateLimitWithMemory(key, policy);

  trace("security.rate-limit", "rate limit checked", {
    policy: policy.name,
    limit: policy.limit,
    remaining: result.remaining,
    resetAt: result.resetAt.toISOString(),
  });

  if (result.remaining < 0) {
    throw new SecurityError("Too many requests. Try again after the rate limit resets.", 429, "rate_limited", undefined, result.headers);
  }

  return result;
}

async function rateLimitWithRedis(redis: RedisClient, key: string, policy: RateLimitPolicy): Promise<RateLimitResult> {
  const count = await redis.incr(key);
  if (count === 1) await redis.pexpire(key, policy.windowMs);
  const ttl = Math.max(await redis.pttl(key), 0);
  return rateLimitResult(key, policy, count, Date.now() + (ttl || policy.windowMs));
}

function rateLimitWithMemory(key: string, policy: RateLimitPolicy): RateLimitResult {
  const now = Date.now();
  const current = memoryBuckets.get(key);
  if (!current || current.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + policy.windowMs });
    maybeSweepMemoryBuckets(now);
    return rateLimitResult(key, policy, 1, now + policy.windowMs);
  }

  current.count += 1;
  return rateLimitResult(key, policy, current.count, current.resetAt);
}

function rateLimitResult(key: string, policy: RateLimitPolicy, count: number, resetAtMs: number): RateLimitResult {
  const remaining = policy.limit - count;
  const resetAt = new Date(resetAtMs);
  const headers = new Headers({
    "X-RateLimit-Limit": String(policy.limit),
    "X-RateLimit-Remaining": String(Math.max(0, remaining)),
    "X-RateLimit-Reset": String(Math.ceil(resetAtMs / 1000)),
  });

  return { key, limit: policy.limit, remaining, resetAt, headers };
}

async function getRedisClient(): Promise<RedisClient | null> {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    redisClient = null;
    return null;
  }

  try {
    const { default: Redis } = await import("ioredis");
    const client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    await client.connect();
    redisClient = client;
    return redisClient;
  } catch (error) {
    if (!redisFailureLogged) {
      redisFailureLogged = true;
      traceError("security.rate-limit", "redis unavailable, using memory fallback", error);
    }
    redisClient = null;
    return null;
  }
}

function clientFingerprint(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const realIp = request.headers.get("x-real-ip") || "";
  const userAgent = request.headers.get("user-agent") || "";
  const auth = request.headers.get("authorization") || "";
  return createHash("sha256").update(`${forwardedFor}|${realIp}|${userAgent}|${auth.slice(0, 32)}`).digest("hex").slice(0, 32);
}

function maybeSweepMemoryBuckets(now: number) {
  if (memoryBuckets.size < 1_000) return;
  for (const [key, bucket] of memoryBuckets.entries()) {
    if (bucket.resetAt <= now) memoryBuckets.delete(key);
  }
}
