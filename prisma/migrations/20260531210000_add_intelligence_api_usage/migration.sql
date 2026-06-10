CREATE TABLE "api_usage_events" (
  "id" TEXT NOT NULL,
  "apiKeyId" TEXT,
  "userId" TEXT NOT NULL,
  "teamId" TEXT,
  "endpoint" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "statusCode" INTEGER NOT NULL,
  "tier" TEXT NOT NULL,
  "costCents" INTEGER NOT NULL DEFAULT 0,
  "requestUnits" INTEGER NOT NULL DEFAULT 1,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "api_usage_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "api_usage_events_apiKeyId_createdAt_idx" ON "api_usage_events"("apiKeyId", "createdAt");
CREATE INDEX "api_usage_events_userId_createdAt_idx" ON "api_usage_events"("userId", "createdAt");
CREATE INDEX "api_usage_events_endpoint_createdAt_idx" ON "api_usage_events"("endpoint", "createdAt");
CREATE INDEX "api_usage_events_tier_createdAt_idx" ON "api_usage_events"("tier", "createdAt");

ALTER TABLE "api_usage_events" ADD CONSTRAINT "api_usage_events_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;
