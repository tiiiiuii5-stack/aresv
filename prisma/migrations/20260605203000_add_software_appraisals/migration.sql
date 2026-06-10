CREATE TABLE IF NOT EXISTS "software_appraisals" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "projectId" TEXT,
  "userId" TEXT NOT NULL,
  "appName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "grade" TEXT NOT NULL,
  "launchVerdict" TEXT NOT NULL,
  "readinessScore" INTEGER NOT NULL,
  "technicalRiskScore" INTEGER NOT NULL,
  "transferReadinessScore" INTEGER NOT NULL,
  "repairCostLow" INTEGER NOT NULL,
  "repairCostHigh" INTEGER NOT NULL,
  "valueLow" INTEGER NOT NULL,
  "valueHigh" INTEGER NOT NULL,
  "badgeState" TEXT NOT NULL,
  "publicSummary" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "privateReport" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "evidenceRef" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "sourceScanId" TEXT,
  "sourceScanRefId" TEXT,
  "monitoredUntil" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "software_appraisals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "software_appraisals_publicId_key" ON "software_appraisals"("publicId");
CREATE INDEX IF NOT EXISTS "software_appraisals_projectId_createdAt_idx" ON "software_appraisals"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "software_appraisals_userId_createdAt_idx" ON "software_appraisals"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "software_appraisals_publicId_idx" ON "software_appraisals"("publicId");
CREATE INDEX IF NOT EXISTS "software_appraisals_launchVerdict_idx" ON "software_appraisals"("launchVerdict");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'software_appraisals_projectId_fkey') THEN
    ALTER TABLE "software_appraisals" ADD CONSTRAINT "software_appraisals_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'software_appraisals_userId_fkey') THEN
    ALTER TABLE "software_appraisals" ADD CONSTRAINT "software_appraisals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

