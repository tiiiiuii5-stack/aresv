CREATE TABLE IF NOT EXISTS "software_trust_ledger_snapshots" (
  "id" TEXT NOT NULL,
  "projectId" TEXT,
  "userId" TEXT NOT NULL,
  "snapshotHash" TEXT NOT NULL,
  "sourceScanId" TEXT,
  "sourceScanRefId" TEXT,
  "ledgerVersion" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "verdict" TEXT NOT NULL,
  "rating" TEXT NOT NULL,
  "evidenceCount" INTEGER NOT NULL,
  "claimCount" INTEGER NOT NULL,
  "graph" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "scoreReport" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "claimGate" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "publicClaims" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "privateClaims" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "report" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "software_trust_ledger_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "software_trust_ledger_snapshots_projectId_snapshotHash_key" ON "software_trust_ledger_snapshots"("projectId", "snapshotHash");
CREATE INDEX IF NOT EXISTS "software_trust_ledger_snapshots_projectId_createdAt_idx" ON "software_trust_ledger_snapshots"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "software_trust_ledger_snapshots_userId_createdAt_idx" ON "software_trust_ledger_snapshots"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "software_trust_ledger_snapshots_snapshotHash_idx" ON "software_trust_ledger_snapshots"("snapshotHash");
CREATE INDEX IF NOT EXISTS "software_trust_ledger_snapshots_verdict_idx" ON "software_trust_ledger_snapshots"("verdict");
CREATE INDEX IF NOT EXISTS "software_trust_ledger_snapshots_rating_idx" ON "software_trust_ledger_snapshots"("rating");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'software_trust_ledger_snapshots_projectId_fkey') THEN
    ALTER TABLE "software_trust_ledger_snapshots" ADD CONSTRAINT "software_trust_ledger_snapshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'software_trust_ledger_snapshots_userId_fkey') THEN
    ALTER TABLE "software_trust_ledger_snapshots" ADD CONSTRAINT "software_trust_ledger_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

