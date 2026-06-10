CREATE TABLE "app_snapshots" (
  "id" TEXT NOT NULL,
  "appCodeHash" TEXT NOT NULL,
  "framework" TEXT NOT NULL,
  "modules" JSONB NOT NULL DEFAULT '[]',
  "structure" JSONB NOT NULL DEFAULT '{}',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "sourceLength" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "app_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "analysis_results" (
  "id" TEXT NOT NULL,
  "snapshotId" TEXT,
  "securityScore" INTEGER NOT NULL,
  "failureScore" INTEGER NOT NULL,
  "readinessScore" INTEGER NOT NULL,
  "riskLevel" TEXT NOT NULL,
  "severityBreakdown" JSONB NOT NULL DEFAULT '{}',
  "issues" JSONB NOT NULL DEFAULT '[]',
  "failureEvents" JSONB NOT NULL DEFAULT '[]',
  "validationResults" JSONB NOT NULL DEFAULT '{}',
  "recommendations" JSONB NOT NULL DEFAULT '[]',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "analysis_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_telemetry_events" (
  "id" TEXT NOT NULL,
  "snapshotId" TEXT,
  "analysisResultId" TEXT,
  "eventType" TEXT NOT NULL,
  "dataset" TEXT NOT NULL,
  "framework" TEXT,
  "riskLevel" TEXT,
  "severity" TEXT,
  "counts" JSONB NOT NULL DEFAULT '{}',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "app_telemetry_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "repair_attempts" (
  "id" TEXT NOT NULL,
  "snapshotId" TEXT,
  "analysisResultId" TEXT,
  "attemptNumber" INTEGER NOT NULL,
  "strategy" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "beforeScore" INTEGER,
  "afterScore" INTEGER,
  "issuesBefore" JSONB NOT NULL DEFAULT '[]',
  "issuesAfter" JSONB NOT NULL DEFAULT '[]',
  "changes" JSONB NOT NULL DEFAULT '[]',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "repair_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "app_snapshots_appCodeHash_idx" ON "app_snapshots"("appCodeHash");
CREATE INDEX "app_snapshots_framework_idx" ON "app_snapshots"("framework");
CREATE INDEX "app_snapshots_createdAt_idx" ON "app_snapshots"("createdAt");

CREATE INDEX "analysis_results_snapshotId_idx" ON "analysis_results"("snapshotId");
CREATE INDEX "analysis_results_riskLevel_idx" ON "analysis_results"("riskLevel");
CREATE INDEX "analysis_results_securityScore_idx" ON "analysis_results"("securityScore");
CREATE INDEX "analysis_results_createdAt_idx" ON "analysis_results"("createdAt");

CREATE INDEX "app_telemetry_events_eventType_createdAt_idx" ON "app_telemetry_events"("eventType", "createdAt");
CREATE INDEX "app_telemetry_events_dataset_createdAt_idx" ON "app_telemetry_events"("dataset", "createdAt");
CREATE INDEX "app_telemetry_events_framework_idx" ON "app_telemetry_events"("framework");
CREATE INDEX "app_telemetry_events_riskLevel_idx" ON "app_telemetry_events"("riskLevel");
CREATE INDEX "app_telemetry_events_snapshotId_idx" ON "app_telemetry_events"("snapshotId");
CREATE INDEX "app_telemetry_events_analysisResultId_idx" ON "app_telemetry_events"("analysisResultId");

CREATE INDEX "repair_attempts_snapshotId_idx" ON "repair_attempts"("snapshotId");
CREATE INDEX "repair_attempts_analysisResultId_idx" ON "repair_attempts"("analysisResultId");
CREATE INDEX "repair_attempts_status_idx" ON "repair_attempts"("status");
CREATE INDEX "repair_attempts_strategy_idx" ON "repair_attempts"("strategy");
CREATE INDEX "repair_attempts_createdAt_idx" ON "repair_attempts"("createdAt");

ALTER TABLE "analysis_results" ADD CONSTRAINT "analysis_results_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "app_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app_telemetry_events" ADD CONSTRAINT "app_telemetry_events_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "app_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app_telemetry_events" ADD CONSTRAINT "app_telemetry_events_analysisResultId_fkey" FOREIGN KEY ("analysisResultId") REFERENCES "analysis_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "repair_attempts" ADD CONSTRAINT "repair_attempts_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "app_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "repair_attempts" ADD CONSTRAINT "repair_attempts_analysisResultId_fkey" FOREIGN KEY ("analysisResultId") REFERENCES "analysis_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;
