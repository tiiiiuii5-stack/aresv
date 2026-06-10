CREATE TABLE "integration_modules" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "codeTemplate" JSONB NOT NULL,
  "testCases" JSONB NOT NULL,
  "validationScore" INTEGER NOT NULL DEFAULT 95,
  "usageCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "integration_modules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_modules_name_key" ON "integration_modules"("name");
CREATE INDEX "integration_modules_category_idx" ON "integration_modules"("category");
CREATE INDEX "integration_modules_validationScore_idx" ON "integration_modules"("validationScore");
