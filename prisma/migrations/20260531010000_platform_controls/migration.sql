CREATE TABLE "teams" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "team_members" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
  "id" TEXT NOT NULL,
  "actorId" TEXT,
  "actorEmail" TEXT,
  "teamId" TEXT,
  "projectId" TEXT,
  "action" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "resourceId" TEXT,
  "outcome" TEXT NOT NULL DEFAULT 'success',
  "traceId" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "api_keys" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "teamId" TEXT,
  "name" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "scopes" JSONB NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'active',
  "lastUsedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scheduled_jobs" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "teamId" TEXT,
  "projectId" TEXT,
  "name" TEXT NOT NULL,
  "jobType" TEXT NOT NULL,
  "schedule" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'active',
  "lastRunAt" TIMESTAMP(3),
  "nextRunAt" TIMESTAMP(3),
  "runCount" INTEGER NOT NULL DEFAULT 0,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scheduled_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_accounts" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "teamId" TEXT,
  "plan" TEXT NOT NULL DEFAULT 'free',
  "status" TEXT NOT NULL DEFAULT 'active',
  "customerRef" TEXT,
  "subscriptionRef" TEXT,
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "usage" JSONB NOT NULL DEFAULT '{}',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "teams_slug_key" ON "teams"("slug");
CREATE INDEX "teams_ownerId_idx" ON "teams"("ownerId");
CREATE UNIQUE INDEX "team_members_teamId_userId_key" ON "team_members"("teamId", "userId");
CREATE INDEX "team_members_teamId_idx" ON "team_members"("teamId");
CREATE INDEX "team_members_userId_idx" ON "team_members"("userId");
CREATE INDEX "team_members_email_idx" ON "team_members"("email");
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");
CREATE INDEX "audit_logs_teamId_createdAt_idx" ON "audit_logs"("teamId", "createdAt");
CREATE INDEX "audit_logs_projectId_createdAt_idx" ON "audit_logs"("projectId", "createdAt");
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");
CREATE INDEX "audit_logs_traceId_idx" ON "audit_logs"("traceId");
CREATE UNIQUE INDEX "api_keys_prefix_key" ON "api_keys"("prefix");
CREATE INDEX "api_keys_userId_idx" ON "api_keys"("userId");
CREATE INDEX "api_keys_teamId_idx" ON "api_keys"("teamId");
CREATE INDEX "api_keys_status_idx" ON "api_keys"("status");
CREATE INDEX "scheduled_jobs_userId_idx" ON "scheduled_jobs"("userId");
CREATE INDEX "scheduled_jobs_teamId_idx" ON "scheduled_jobs"("teamId");
CREATE INDEX "scheduled_jobs_projectId_idx" ON "scheduled_jobs"("projectId");
CREATE INDEX "scheduled_jobs_status_nextRunAt_idx" ON "scheduled_jobs"("status", "nextRunAt");
CREATE UNIQUE INDEX "billing_accounts_userId_teamId_key" ON "billing_accounts"("userId", "teamId");
CREATE INDEX "billing_accounts_status_idx" ON "billing_accounts"("status");
CREATE INDEX "billing_accounts_teamId_idx" ON "billing_accounts"("teamId");

ALTER TABLE "team_members" ADD CONSTRAINT "team_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
