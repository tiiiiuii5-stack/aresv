-- DropIndex
DROP INDEX "agent_memories_embedding_idx";

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "modelUsed" TEXT,
ADD COLUMN     "mutationCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mutationHistory" JSONB DEFAULT '[]',
ADD COLUMN     "promptHash" TEXT,
ADD COLUMN     "temperature" DOUBLE PRECISION;
