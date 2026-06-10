CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "agent_memories" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT,
  "memoryType" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "embedding" vector(1536),
  "metadata" JSONB,
  "usageCount" INTEGER NOT NULL DEFAULT 0,
  "lastAccessedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_memories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_memories_userId_idx" ON "agent_memories"("userId");
CREATE INDEX "agent_memories_projectId_idx" ON "agent_memories"("projectId");
CREATE INDEX "agent_memories_memoryType_idx" ON "agent_memories"("memoryType");
CREATE INDEX "agent_memories_userId_lastAccessedAt_idx" ON "agent_memories"("userId", "lastAccessedAt");
CREATE INDEX "agent_memories_embedding_idx" ON "agent_memories" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
