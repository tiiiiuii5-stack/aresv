CREATE TABLE IF NOT EXISTS "github_installations" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "installationId" TEXT NOT NULL,
  "accountLogin" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "accountType" TEXT NOT NULL,
  "repositorySelection" TEXT,
  "permissions" JSONB NOT NULL DEFAULT '{}',
  "userAccessToken" TEXT,
  "userRefreshToken" TEXT,
  "userTokenExpiresAt" TIMESTAMP(3),
  "refreshTokenExpiresAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'active',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "github_installations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "github_repositories" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT,
  "installationDbId" TEXT NOT NULL,
  "installationId" TEXT NOT NULL,
  "githubRepositoryId" TEXT NOT NULL,
  "owner" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "defaultBranch" TEXT NOT NULL,
  "private" BOOLEAN NOT NULL DEFAULT false,
  "permissions" JSONB NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'connected',
  "scanStatus" TEXT NOT NULL DEFAULT 'idle',
  "lastScanAt" TIMESTAMP(3),
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disconnectedAt" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "github_repositories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "github_scan_jobs" (
  "id" TEXT NOT NULL,
  "repositoryId" TEXT NOT NULL,
  "projectId" TEXT,
  "userId" TEXT NOT NULL,
  "jobType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "githubDeliveryId" TEXT,
  "githubEvent" TEXT,
  "pullRequestNumber" INTEGER,
  "headSha" TEXT,
  "baseSha" TEXT,
  "readinessScore" INTEGER,
  "findingsCount" INTEGER,
  "criticalFindingsCount" INTEGER,
  "errorMessage" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "github_scan_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "github_pull_request_analyses" (
  "id" TEXT NOT NULL,
  "repositoryId" TEXT NOT NULL,
  "scanJobId" TEXT,
  "pullRequestNumber" INTEGER NOT NULL,
  "headSha" TEXT NOT NULL,
  "baseSha" TEXT,
  "readinessScore" INTEGER NOT NULL,
  "readinessDelta" INTEGER,
  "status" TEXT NOT NULL,
  "findings" JSONB NOT NULL DEFAULT '[]',
  "recommendations" JSONB NOT NULL DEFAULT '[]',
  "commentId" TEXT,
  "statusContext" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "github_pull_request_analyses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "github_webhook_deliveries" (
  "deliveryId" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "action" TEXT,
  "installationId" TEXT,
  "repositoryFullName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'received',
  "processedAt" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "github_webhook_deliveries_pkey" PRIMARY KEY ("deliveryId")
);

CREATE UNIQUE INDEX IF NOT EXISTS "github_installations_installationId_key" ON "github_installations"("installationId");
CREATE INDEX IF NOT EXISTS "github_installations_userId_idx" ON "github_installations"("userId");
CREATE INDEX IF NOT EXISTS "github_installations_accountLogin_idx" ON "github_installations"("accountLogin");
CREATE INDEX IF NOT EXISTS "github_installations_status_idx" ON "github_installations"("status");

CREATE UNIQUE INDEX IF NOT EXISTS "github_repositories_installationId_githubRepositoryId_key" ON "github_repositories"("installationId", "githubRepositoryId");
CREATE UNIQUE INDEX IF NOT EXISTS "github_repositories_userId_fullName_key" ON "github_repositories"("userId", "fullName");
CREATE INDEX IF NOT EXISTS "github_repositories_projectId_updatedAt_idx" ON "github_repositories"("projectId", "updatedAt");
CREATE INDEX IF NOT EXISTS "github_repositories_installationId_idx" ON "github_repositories"("installationId");
CREATE INDEX IF NOT EXISTS "github_repositories_fullName_idx" ON "github_repositories"("fullName");
CREATE INDEX IF NOT EXISTS "github_repositories_status_idx" ON "github_repositories"("status");
CREATE INDEX IF NOT EXISTS "github_repositories_scanStatus_idx" ON "github_repositories"("scanStatus");

CREATE INDEX IF NOT EXISTS "github_scan_jobs_repositoryId_queuedAt_idx" ON "github_scan_jobs"("repositoryId", "queuedAt");
CREATE INDEX IF NOT EXISTS "github_scan_jobs_projectId_queuedAt_idx" ON "github_scan_jobs"("projectId", "queuedAt");
CREATE INDEX IF NOT EXISTS "github_scan_jobs_userId_queuedAt_idx" ON "github_scan_jobs"("userId", "queuedAt");
CREATE INDEX IF NOT EXISTS "github_scan_jobs_status_queuedAt_idx" ON "github_scan_jobs"("status", "queuedAt");
CREATE INDEX IF NOT EXISTS "github_scan_jobs_githubDeliveryId_idx" ON "github_scan_jobs"("githubDeliveryId");

CREATE UNIQUE INDEX IF NOT EXISTS "github_pull_request_analyses_repositoryId_pullRequestNumber_headSha_key" ON "github_pull_request_analyses"("repositoryId", "pullRequestNumber", "headSha");
CREATE INDEX IF NOT EXISTS "github_pull_request_analyses_repositoryId_createdAt_idx" ON "github_pull_request_analyses"("repositoryId", "createdAt");
CREATE INDEX IF NOT EXISTS "github_pull_request_analyses_scanJobId_idx" ON "github_pull_request_analyses"("scanJobId");
CREATE INDEX IF NOT EXISTS "github_pull_request_analyses_status_idx" ON "github_pull_request_analyses"("status");

CREATE INDEX IF NOT EXISTS "github_webhook_deliveries_event_createdAt_idx" ON "github_webhook_deliveries"("event", "createdAt");
CREATE INDEX IF NOT EXISTS "github_webhook_deliveries_installationId_idx" ON "github_webhook_deliveries"("installationId");
CREATE INDEX IF NOT EXISTS "github_webhook_deliveries_repositoryFullName_idx" ON "github_webhook_deliveries"("repositoryFullName");
CREATE INDEX IF NOT EXISTS "github_webhook_deliveries_status_idx" ON "github_webhook_deliveries"("status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'github_installations_userId_fkey') THEN
    ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'github_repositories_projectId_fkey') THEN
    ALTER TABLE "github_repositories" ADD CONSTRAINT "github_repositories_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'github_repositories_installationDbId_fkey') THEN
    ALTER TABLE "github_repositories" ADD CONSTRAINT "github_repositories_installationDbId_fkey" FOREIGN KEY ("installationDbId") REFERENCES "github_installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'github_scan_jobs_projectId_fkey') THEN
    ALTER TABLE "github_scan_jobs" ADD CONSTRAINT "github_scan_jobs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'github_scan_jobs_repositoryId_fkey') THEN
    ALTER TABLE "github_scan_jobs" ADD CONSTRAINT "github_scan_jobs_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "github_repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'github_pull_request_analyses_repositoryId_fkey') THEN
    ALTER TABLE "github_pull_request_analyses" ADD CONSTRAINT "github_pull_request_analyses_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "github_repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'github_pull_request_analyses_scanJobId_fkey') THEN
    ALTER TABLE "github_pull_request_analyses" ADD CONSTRAINT "github_pull_request_analyses_scanJobId_fkey" FOREIGN KEY ("scanJobId") REFERENCES "github_scan_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
