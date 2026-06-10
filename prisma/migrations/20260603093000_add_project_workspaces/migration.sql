CREATE TABLE IF NOT EXISTS "app_analyses" (
  "id" TEXT NOT NULL,
  "framework" TEXT NOT NULL,
  "modules" JSONB NOT NULL DEFAULT '[]',
  "appCodeHash" TEXT NOT NULL,
  "securityScore" INTEGER NOT NULL,
  "failureScore" INTEGER NOT NULL,
  "readinessScore" INTEGER NOT NULL,
  "riskLevel" TEXT NOT NULL,
  "issues" JSONB NOT NULL DEFAULT '[]',
  "recommendations" JSONB NOT NULL DEFAULT '[]',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "app_analyses_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "app_analyses" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "app_snapshots" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "analysis_results" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "app_telemetry_events" ADD COLUMN IF NOT EXISTS "projectId" TEXT;

CREATE TABLE IF NOT EXISTS "project_repository_links" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'github',
  "repository" TEXT NOT NULL,
  "url" TEXT,
  "branch" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "project_repository_links_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "app_analyses_riskLevel_idx" ON "app_analyses"("riskLevel");
CREATE INDEX IF NOT EXISTS "app_analyses_createdAt_idx" ON "app_analyses"("createdAt");
CREATE INDEX IF NOT EXISTS "app_analyses_framework_idx" ON "app_analyses"("framework");
CREATE INDEX IF NOT EXISTS "app_analyses_projectId_createdAt_idx" ON "app_analyses"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "app_snapshots_projectId_createdAt_idx" ON "app_snapshots"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "analysis_results_projectId_createdAt_idx" ON "analysis_results"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "app_telemetry_events_projectId_createdAt_idx" ON "app_telemetry_events"("projectId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "project_repository_links_projectId_repository_key" ON "project_repository_links"("projectId", "repository");
CREATE INDEX IF NOT EXISTS "project_repository_links_projectId_updatedAt_idx" ON "project_repository_links"("projectId", "updatedAt");
CREATE INDEX IF NOT EXISTS "project_repository_links_repository_idx" ON "project_repository_links"("repository");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_analyses_projectId_fkey') THEN
    ALTER TABLE "app_analyses" ADD CONSTRAINT "app_analyses_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_snapshots_projectId_fkey') THEN
    ALTER TABLE "app_snapshots" ADD CONSTRAINT "app_snapshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'analysis_results_projectId_fkey') THEN
    ALTER TABLE "analysis_results" ADD CONSTRAINT "analysis_results_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_telemetry_events_projectId_fkey') THEN
    ALTER TABLE "app_telemetry_events" ADD CONSTRAINT "app_telemetry_events_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_repository_links_projectId_fkey') THEN
    ALTER TABLE "project_repository_links" ADD CONSTRAINT "project_repository_links_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
