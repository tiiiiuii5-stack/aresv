-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'GENERATING', 'BUILDING', 'DEPLOYING', 'COMPLETED', 'FAILED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable: add explicit lifecycle tracking without losing existing payload data.
ALTER TABLE "jobs"
  ADD COLUMN "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "currentStep" TEXT NOT NULL DEFAULT 'queued',
  ADD COLUMN "errorMessage" TEXT,
  ADD COLUMN "resultUrl" TEXT;

UPDATE "jobs"
SET
  "queuedAt" = COALESCE("createdAt", "queuedAt"),
  "startedAt" = CASE
    WHEN "payload" ->> 'startedAt' IS NOT NULL THEN ("payload" ->> 'startedAt')::TIMESTAMP(3)
    ELSE NULL
  END,
  "completedAt" = CASE
    WHEN "payload" ->> 'finishedAt' IS NOT NULL THEN ("payload" ->> 'finishedAt')::TIMESTAMP(3)
    ELSE NULL
  END,
  "currentStep" = COALESCE(NULLIF("payload" ->> 'stage', ''), "status", 'queued'),
  "errorMessage" = NULLIF(COALESCE("payload" ->> 'error', ''), ''),
  "resultUrl" = NULLIF(COALESCE("payload" #>> '{artifact,runtimeUrl}', ''), '');

ALTER TABLE "jobs"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "JobStatus" USING (
    CASE
      WHEN "status" = 'queued' THEN 'QUEUED'::"JobStatus"
      WHEN "status" = 'running' THEN 'RUNNING'::"JobStatus"
      WHEN "status" = 'succeeded' THEN 'COMPLETED'::"JobStatus"
      WHEN "status" = 'failed' THEN 'FAILED'::"JobStatus"
      WHEN "status" = 'cancelled' THEN 'CANCELLED'::"JobStatus"
      WHEN "status" = 'generating' THEN 'GENERATING'::"JobStatus"
      WHEN "status" = 'building' THEN 'BUILDING'::"JobStatus"
      WHEN "status" = 'deploying' THEN 'DEPLOYING'::"JobStatus"
      WHEN "status" = 'completed' THEN 'COMPLETED'::"JobStatus"
      ELSE 'QUEUED'::"JobStatus"
    END
  ),
  ALTER COLUMN "status" SET DEFAULT 'QUEUED';
