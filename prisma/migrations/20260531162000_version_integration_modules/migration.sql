ALTER TABLE "integration_modules"
  ADD COLUMN "version" TEXT NOT NULL DEFAULT '1.0.0',
  ADD COLUMN "immutable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "humanReviewedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "integration_modules_immutable_idx" ON "integration_modules"("immutable");
