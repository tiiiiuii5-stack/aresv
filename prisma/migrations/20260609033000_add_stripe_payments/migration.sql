CREATE TABLE IF NOT EXISTS "payments" (
  "id" TEXT NOT NULL,
  "stripeSessionId" TEXT NOT NULL,
  "stripePaymentId" TEXT,
  "stripeCustomerId" TEXT,
  "userId" TEXT NOT NULL,
  "orgId" TEXT,
  "projectId" TEXT,
  "appraisalId" TEXT,
  "certificateId" TEXT,
  "offerId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "fulfillmentStatus" TEXT NOT NULL DEFAULT 'pending',
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "customerEmail" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt" TIMESTAMP(3),
  "fulfilledAt" TIMESTAMP(3),
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payments_stripeSessionId_key" ON "payments"("stripeSessionId");
CREATE INDEX IF NOT EXISTS "payments_userId_createdAt_idx" ON "payments"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "payments_projectId_createdAt_idx" ON "payments"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "payments_status_createdAt_idx" ON "payments"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "payments_fulfillmentStatus_updatedAt_idx" ON "payments"("fulfillmentStatus", "updatedAt");
CREATE INDEX IF NOT EXISTS "payments_offerId_idx" ON "payments"("offerId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_userId_fkey') THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_projectId_fkey') THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
