CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "plan" TEXT NOT NULL DEFAULT 'free',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "projects" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'custom',
  "problem" TEXT NOT NULL DEFAULT '',
  "audience" TEXT NOT NULL DEFAULT '',
  "uiDirection" TEXT NOT NULL DEFAULT '',
  "monetization" TEXT NOT NULL DEFAULT '',
  "features" JSONB NOT NULL DEFAULT '[]',
  "onboarding" JSONB NOT NULL DEFAULT '[]',
  "record" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "generated_apps" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "files" JSONB NOT NULL DEFAULT '[]',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "generated_apps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "generation_runs" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "logs" JSONB NOT NULL DEFAULT '[]',
  "model" TEXT,
  "duration" INTEGER,
  "tokens" INTEGER,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "generation_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "qa_reports" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "results" JSONB NOT NULL DEFAULT '{}',
  "score" INTEGER NOT NULL,
  "issues" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "qa_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "artifacts" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "zipUrl" TEXT,
  "previewUrl" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "content" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "deployments" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "url" TEXT,
  "logs" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "deployments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "jobs" (
  "id" TEXT NOT NULL,
  "projectId" TEXT,
  "type" TEXT NOT NULL,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "usage_events" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "projectId" TEXT,
  "event" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_memory" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "context" JSONB NOT NULL DEFAULT '{}',
  "decisions" JSONB NOT NULL DEFAULT '[]',
  "changelog" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_memory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");
CREATE INDEX "projects_userId_updatedAt_idx" ON "projects"("userId", "updatedAt");
CREATE INDEX "generated_apps_projectId_idx" ON "generated_apps"("projectId");
CREATE INDEX "generation_runs_projectId_createdAt_idx" ON "generation_runs"("projectId", "createdAt");
CREATE INDEX "qa_reports_projectId_createdAt_idx" ON "qa_reports"("projectId", "createdAt");
CREATE INDEX "artifacts_projectId_updatedAt_idx" ON "artifacts"("projectId", "updatedAt");
CREATE INDEX "deployments_projectId_createdAt_idx" ON "deployments"("projectId", "createdAt");
CREATE INDEX "jobs_projectId_createdAt_idx" ON "jobs"("projectId", "createdAt");
CREATE INDEX "jobs_status_updatedAt_idx" ON "jobs"("status", "updatedAt");
CREATE INDEX "usage_events_event_createdAt_idx" ON "usage_events"("event", "createdAt");
CREATE INDEX "usage_events_projectId_createdAt_idx" ON "usage_events"("projectId", "createdAt");
CREATE UNIQUE INDEX "project_memory_projectId_key" ON "project_memory"("projectId");

ALTER TABLE "projects" ADD CONSTRAINT "projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generated_apps" ADD CONSTRAINT "generated_apps_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "qa_reports" ADD CONSTRAINT "qa_reports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_memory" ADD CONSTRAINT "project_memory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
