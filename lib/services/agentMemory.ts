import { createCipheriv, createDecipheriv, createHash, createSecretKey, randomBytes, randomUUID } from "node:crypto";

import { GoogleGenAI } from "@google/genai";
import type { PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/persistence/database";
import { trace, traceError } from "@/lib/diagnostics";

const EMBEDDING_MODEL = process.env.AGENT_MEMORY_EMBEDDING_MODEL?.trim() || "text-embedding-004";
const GEMINI_EMBEDDING_FALLBACK_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 1536;
const ENCRYPTION_PREFIX = "enc:v1";
const MEMORY_TYPES = new Set(["pattern", "decision", "failure", "success", "preference"]);

type JsonObject = Record<string, unknown>;

export type MemoryInput = {
  userId: string;
  projectId?: string | null;
  memoryType: "pattern" | "decision" | "failure" | "success" | "preference";
  content: string;
  metadata?: JsonObject | null;
};

export type MemoryContext = {
  projectId?: string | null;
  limit?: number;
  memoryTypes?: string[];
  threshold?: number;
};

export type Memory = MemoryInput & {
  id: string;
  usageCount: number;
  lastAccessedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  similarity?: number;
};

export type Pattern = Memory;
export type Decision = Memory;

type RawMemory = {
  id: string;
  userId: string;
  projectId: string | null;
  memoryType: MemoryInput["memoryType"];
  content: string;
  metadata: JsonObject | null;
  usageCount: number;
  lastAccessedAt: Date | string | null;
  archivedAt: Date | string | null;
  createdAt: Date | string;
  similarity?: number | string | null;
};

export class AgentMemoryService {
  async store(memory: MemoryInput, traceId?: string): Promise<Memory> {
    const input = validateMemoryInput(memory);
    const db = getPrisma();
    if (!db) throw new Error("Database is not configured for agent memory.");

    await this.pruneOldMemories(input.userId, configNumber("AGENT_MEMORY_PRUNE_DAYS", 90), traceId);
    await this.enforceUserLimit(input.userId, traceId);

    const embedding = await generateEmbedding(input.content, traceId);
    const encryptedContent = encryptContent(input.content);
    const metadata = sanitizeMetadata({
      ...(input.metadata || {}),
      embeddingModel: EMBEDDING_MODEL,
      embeddingFallbackModel: GEMINI_EMBEDDING_FALLBACK_MODEL,
    });
    const id = randomUUID();
    const vector = vectorLiteral(embedding);

    try {
      const rows = await db.$queryRawUnsafe<RawMemory[]>(
        `INSERT INTO "agent_memories" ("id", "userId", "projectId", "memoryType", "content", "embedding", "metadata")
         VALUES ($1, $2, $3, $4, $5, '${vector}'::vector, $6::jsonb)
         RETURNING "id", "userId", "projectId", "memoryType", "content", "metadata", "usageCount", "lastAccessedAt", "archivedAt", "createdAt"`,
        id,
        input.userId,
        input.projectId || null,
        input.memoryType,
        encryptedContent,
        JSON.stringify(metadata),
      );
      trace("agent-memory.store", "memory stored", { traceId, memoryId: id, userId: input.userId, projectId: input.projectId, memoryType: input.memoryType });
      return toMemory(rows[0]);
    } catch (error) {
      traceError("agent-memory.store", "memory insert failed", error, { traceId, userId: input.userId, memoryType: input.memoryType });
      throw error;
    }
  }

  async recall(userId: string, query: string, context: MemoryContext = {}, traceId?: string): Promise<Memory[]> {
    const cleanUserId = nonEmpty(userId, "userId");
    const cleanQuery = nonEmpty(query, "query");
    const db = getPrisma();
    if (!db) throw new Error("Database is not configured for agent memory.");

    const limit = clampNumber(context.limit ?? 5, 1, 25);
    const threshold = clampNumber(context.threshold ?? configNumber("AGENT_MEMORY_SIMILARITY_THRESHOLD", 0.75), 0, 1);
    const embedding = await generateEmbedding(cleanQuery, traceId);
    const vector = vectorLiteral(embedding);

    try {
      const rows = await db.$queryRawUnsafe<RawMemory[]>(
        `SELECT "id", "userId", "projectId", "memoryType", "content", "metadata", "usageCount", "lastAccessedAt", "archivedAt", "createdAt",
          1 - ("embedding" <=> '${vector}'::vector) AS "similarity"
         FROM "agent_memories"
         WHERE "userId" = $1
           AND "archivedAt" IS NULL
           AND "embedding" IS NOT NULL
           AND ($2::text IS NULL OR "projectId" = $2 OR "projectId" IS NULL)
           AND (1 - ("embedding" <=> '${vector}'::vector)) >= $3
         ORDER BY "embedding" <=> '${vector}'::vector ASC
         LIMIT $4`,
        cleanUserId,
        context.projectId || null,
        threshold,
        limit,
      );
      await markAccessed(db, rows.map((row) => row.id));
      trace("agent-memory.recall", "semantic recall complete", { traceId, userId: cleanUserId, projectId: context.projectId, count: rows.length });
      return rows.map(toMemory);
    } catch (error) {
      traceError("agent-memory.recall", "vector recall failed, using encrypted-content fallback", error, { traceId, userId: cleanUserId });
      return this.keywordFallbackRecall(db, cleanUserId, cleanQuery, context, limit, traceId);
    }
  }

  async getPatterns(userId: string, traceId?: string): Promise<Pattern[]> {
    return this.listByType(userId, "pattern", traceId);
  }

  async getDecisions(userId: string, traceId?: string): Promise<Decision[]> {
    return this.listByType(userId, "decision", traceId);
  }

  async pruneOldMemories(userId: string, maxAgeDays: number, traceId?: string): Promise<number> {
    const cleanUserId = nonEmpty(userId, "userId");
    const db = getPrisma();
    if (!db) return 0;
    const days = clampNumber(maxAgeDays, 1, 3650);
    try {
      const count = await db.$executeRawUnsafe(
        `UPDATE "agent_memories"
         SET "archivedAt" = NOW()
         WHERE "userId" = $1
           AND "archivedAt" IS NULL
           AND "createdAt" < NOW() - ($2::int * INTERVAL '1 day')`,
        cleanUserId,
        days,
      );
      if (count > 0) trace("agent-memory.prune", "old memories archived", { traceId, userId: cleanUserId, count, maxAgeDays: days });
      return count;
    } catch (error) {
      traceError("agent-memory.prune", "prune failed", error, { traceId, userId: cleanUserId });
      return 0;
    }
  }

  async softDelete(id: string, userId: string, traceId?: string): Promise<boolean> {
    const cleanId = nonEmpty(id, "id");
    const cleanUserId = nonEmpty(userId, "userId");
    const db = getPrisma();
    if (!db) throw new Error("Database is not configured for agent memory.");
    const count = await db.$executeRawUnsafe(
      `UPDATE "agent_memories" SET "archivedAt" = NOW() WHERE "id" = $1 AND "userId" = $2 AND "archivedAt" IS NULL`,
      cleanId,
      cleanUserId,
    );
    trace("agent-memory.delete", "memory archived", { traceId, memoryId: cleanId, userId: cleanUserId, archived: count > 0 });
    return count > 0;
  }

  private async listByType(userId: string, memoryType: MemoryInput["memoryType"], traceId?: string): Promise<Memory[]> {
    const cleanUserId = nonEmpty(userId, "userId");
    const db = getPrisma();
    if (!db) throw new Error("Database is not configured for agent memory.");
    const rows = await db.$queryRawUnsafe<RawMemory[]>(
      `SELECT "id", "userId", "projectId", "memoryType", "content", "metadata", "usageCount", "lastAccessedAt", "archivedAt", "createdAt"
       FROM "agent_memories"
       WHERE "userId" = $1 AND "memoryType" = $2 AND "archivedAt" IS NULL
       ORDER BY "usageCount" DESC, "createdAt" DESC
       LIMIT 50`,
      cleanUserId,
      memoryType,
    );
    trace("agent-memory.list", "memories listed", { traceId, userId: cleanUserId, memoryType, count: rows.length });
    return rows.map(toMemory);
  }

  private async keywordFallbackRecall(db: PrismaClient, userId: string, query: string, context: MemoryContext, limit: number, traceId?: string): Promise<Memory[]> {
    const rows = await db.$queryRawUnsafe<RawMemory[]>(
      `SELECT "id", "userId", "projectId", "memoryType", "content", "metadata", "usageCount", "lastAccessedAt", "archivedAt", "createdAt"
       FROM "agent_memories"
       WHERE "userId" = $1
         AND "archivedAt" IS NULL
         AND ($2::text IS NULL OR "projectId" = $2 OR "projectId" IS NULL)
       ORDER BY COALESCE("lastAccessedAt", "createdAt") DESC
       LIMIT 100`,
      userId,
      context.projectId || null,
    );
    const scored = rows
      .map((row) => ({ row, score: keywordScore(decryptContent(row.content), query) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    await markAccessed(db, scored.map((item) => item.row.id));
    trace("agent-memory.recall", "keyword recall complete", { traceId, userId, count: scored.length });
    return scored.map((item) => toMemory({ ...item.row, similarity: item.score }));
  }

  private async enforceUserLimit(userId: string, traceId?: string) {
    const db = getPrisma();
    if (!db) return;
    const max = configNumber("AGENT_MEMORY_MAX_PER_USER", 1000);
    try {
      const rows = await db.$queryRawUnsafe<Array<{ count: bigint | number | string }>>(
        `SELECT COUNT(*)::bigint AS "count" FROM "agent_memories" WHERE "userId" = $1 AND "archivedAt" IS NULL`,
        userId,
      );
      const current = Number(rows[0]?.count || 0);
      const overage = current - max + 1;
      if (overage <= 0) return;
      const archived = await db.$executeRawUnsafe(
        `UPDATE "agent_memories"
         SET "archivedAt" = NOW()
         WHERE "id" IN (
           SELECT "id" FROM "agent_memories"
           WHERE "userId" = $1 AND "archivedAt" IS NULL
           ORDER BY COALESCE("lastAccessedAt", "createdAt") ASC
           LIMIT $2
         )`,
        userId,
        overage,
      );
      trace("agent-memory.lru", "memory cap enforced", { traceId, userId, archived, max });
    } catch (error) {
      traceError("agent-memory.lru", "memory cap enforcement failed", error, { traceId, userId });
    }
  }
}

export const agentMemoryService = new AgentMemoryService();

async function generateEmbedding(content: string, traceId?: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) return fallbackEmbedding(content);
  const ai = new GoogleGenAI({ apiKey });
  const models = Array.from(new Set([EMBEDDING_MODEL, GEMINI_EMBEDDING_FALLBACK_MODEL]));
  let lastError: unknown = null;
  for (const [index, model] of models.entries()) {
    try {
      const response = await ai.models.embedContent({
        model,
        contents: content,
        config: { outputDimensionality: EMBEDDING_DIMENSIONS },
      } as Parameters<typeof ai.models.embedContent>[0]);
      const values = extractEmbeddingValues(response);
      if (values.length > 0) return normalizeDimensions(values);
      lastError = new Error(`Embedding response from ${model} did not include values.`);
    } catch (error) {
      lastError = error;
      const nextModel = models[index + 1];
      if (nextModel) {
        trace("agent-memory.embedding", "Gemini embedding model unavailable; trying fallback model", { traceId, model, nextModel });
      }
    }
  }
  traceError("agent-memory.embedding", "Gemini embedding failed, using deterministic fallback", lastError, { traceId, model: EMBEDDING_MODEL });
  return fallbackEmbedding(content);
}

function extractEmbeddingValues(response: unknown): number[] {
  const body = response as {
    embeddings?: Array<{ values?: number[]; embedding?: { values?: number[] } }>;
    embedding?: { values?: number[]; embedding?: { values?: number[] } };
  };
  return (
    body.embeddings?.[0]?.values ||
    body.embeddings?.[0]?.embedding?.values ||
    body.embedding?.values ||
    body.embedding?.embedding?.values ||
    []
  );
}

function fallbackEmbedding(content: string) {
  const output = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  for (let i = 0; i < 96; i += 1) {
    const hash = createHash("sha256").update(`${i}:${content}`).digest();
    for (let j = 0; j < hash.length; j += 1) {
      output[(i * hash.length + j) % EMBEDDING_DIMENSIONS] = (hash[j] - 128) / 128;
    }
  }
  return normalizeVector(output);
}

function normalizeDimensions(values: number[]) {
  const output = values.slice(0, EMBEDDING_DIMENSIONS);
  while (output.length < EMBEDDING_DIMENSIONS) output.push(0);
  return normalizeVector(output);
}

function normalizeVector(values: number[]) {
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
  return values.map((value) => Number((value / magnitude).toFixed(8)));
}

function vectorLiteral(values: number[]) {
  return `[${values.map((value) => (Number.isFinite(value) ? value : 0)).join(",")}]`;
}

function encryptContent(content: string) {
  const iv = toUint8Array(randomBytes(12));
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = concatBytes([toUint8Array(cipher.update(content, "utf8")), toUint8Array(cipher.final())]);
  const tag = base64Url(toUint8Array(cipher.getAuthTag()));
  return `${ENCRYPTION_PREFIX}:${base64Url(iv)}:${tag}:${base64Url(encrypted)}`;
}

function decryptContent(content: string) {
  if (!content.startsWith(`${ENCRYPTION_PREFIX}:`)) return content;
  const [, , ivRaw, tagRaw, encryptedRaw] = content.split(":");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), toUint8Array(Buffer.from(ivRaw, "base64url")));
  decipher.setAuthTag(toUint8Array(Buffer.from(tagRaw, "base64url")));
  const decrypted = concatBytes([
    toUint8Array(decipher.update(toUint8Array(Buffer.from(encryptedRaw, "base64url")))),
    toUint8Array(decipher.final()),
  ]);
  return Buffer.from(decrypted).toString("utf8");
}

function encryptionKey() {
  const material = process.env.ENCRYPTION_KEY || process.env.AGENT_MEMORY_ENCRYPTION_KEY;
  if (!material) throw new Error("ENCRYPTION_KEY or AGENT_MEMORY_ENCRYPTION_KEY is required for agent memory encryption.");
  return createSecretKey(toUint8Array(createHash("sha256").update(material).digest()));
}

function toUint8Array(buffer: Buffer) {
  return new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
}

function concatBytes(parts: Uint8Array[]) {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function base64Url(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

function sanitizeMetadata(value: JsonObject): JsonObject {
  const output: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (/secret|password|token|key|database_url|postgres|pgpassword/i.test(key)) {
      output[key] = "[redacted]";
    } else if (Array.isArray(item)) {
      output[key] = item.map((entry) => (typeof entry === "object" && entry ? sanitizeMetadata(entry as JsonObject) : entry));
    } else if (typeof item === "object" && item) {
      output[key] = sanitizeMetadata(item as JsonObject);
    } else {
      output[key] = item;
    }
  }
  return output;
}

function validateMemoryInput(memory: MemoryInput): MemoryInput {
  const userId = nonEmpty(memory.userId, "userId");
  const content = nonEmpty(memory.content, "content");
  if (!MEMORY_TYPES.has(memory.memoryType)) throw new Error("Invalid memoryType.");
  return {
    userId,
    projectId: memory.projectId ? String(memory.projectId) : null,
    memoryType: memory.memoryType,
    content,
    metadata: memory.metadata && typeof memory.metadata === "object" ? memory.metadata : null,
  };
}

function nonEmpty(value: unknown, field: string) {
  const clean = String(value || "").trim();
  if (!clean) throw new Error(`${field} is required.`);
  return clean;
}

function clampNumber(value: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(Math.max(parsed, min), max);
}

function configNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function toMemory(row: RawMemory): Memory {
  return {
    id: row.id,
    userId: row.userId,
    projectId: row.projectId,
    memoryType: row.memoryType,
    content: decryptContent(row.content),
    metadata: row.metadata || null,
    usageCount: Number(row.usageCount || 0),
    lastAccessedAt: row.lastAccessedAt ? new Date(row.lastAccessedAt).toISOString() : null,
    archivedAt: row.archivedAt ? new Date(row.archivedAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
    similarity: row.similarity === undefined || row.similarity === null ? undefined : Number(row.similarity),
  };
}

async function markAccessed(db: PrismaClient, ids: string[]) {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(
    `UPDATE "agent_memories"
     SET "usageCount" = "usageCount" + 1, "lastAccessedAt" = NOW()
     WHERE "id" = ANY($1::text[])`,
    ids,
  );
}

function keywordScore(content: string, query: string) {
  const words = new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2));
  if (words.size === 0) return 0;
  const haystack = content.toLowerCase();
  let hits = 0;
  for (const word of words) {
    if (haystack.includes(word)) hits += 1;
  }
  return hits / words.size;
}
