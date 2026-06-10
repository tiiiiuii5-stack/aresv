CREATE TABLE "project_scan_history" (
  "id" TEXT NOT NULL,
  "projectId" TEXT,
  "scanSource" TEXT NOT NULL,
  "scanRefId" TEXT,
  "readinessScore" INTEGER NOT NULL,
  "findingsCount" INTEGER NOT NULL,
  "criticalFindingsCount" INTEGER NOT NULL,
  "riskLevel" TEXT,
  "framework" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "project_scan_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_scan_history_scanSource_scanRefId_key" ON "project_scan_history"("scanSource", "scanRefId");
CREATE INDEX "project_scan_history_projectId_scannedAt_idx" ON "project_scan_history"("projectId", "scannedAt");
CREATE INDEX "project_scan_history_scannedAt_idx" ON "project_scan_history"("scannedAt");
CREATE INDEX "project_scan_history_scanRefId_idx" ON "project_scan_history"("scanRefId");

ALTER TABLE "project_scan_history" ADD CONSTRAINT "project_scan_history_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
