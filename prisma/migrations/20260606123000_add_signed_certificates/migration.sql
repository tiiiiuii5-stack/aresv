CREATE TABLE IF NOT EXISTS "certificate_signing_keys" (
  "id" TEXT NOT NULL,
  "algorithm" TEXT NOT NULL,
  "publicKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retiredAt" TIMESTAMP(3),
  CONSTRAINT "certificate_signing_keys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "software_certificates" (
  "id" TEXT NOT NULL,
  "certificateId" TEXT NOT NULL,
  "appraisalId" TEXT NOT NULL,
  "appraisalPublicId" TEXT NOT NULL,
  "projectId" TEXT,
  "userId" TEXT NOT NULL,
  "schemaVersion" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "badgeState" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "payloadHash" TEXT NOT NULL,
  "signature" TEXT NOT NULL,
  "signingKeyId" TEXT NOT NULL,
  "publicSummaryHash" TEXT NOT NULL,
  "privateEvidenceHash" TEXT NOT NULL,
  "sourceSnapshotHash" TEXT,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "supersededById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "software_certificates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "software_certificate_snapshots" (
  "id" TEXT NOT NULL,
  "certificateDbId" TEXT NOT NULL,
  "certificateId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "payloadHash" TEXT NOT NULL,
  "signature" TEXT NOT NULL,
  "signingKeyId" TEXT NOT NULL,
  "changeReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "software_certificate_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "certificate_signing_keys_status_idx" ON "certificate_signing_keys"("status");

CREATE UNIQUE INDEX IF NOT EXISTS "software_certificates_certificateId_key" ON "software_certificates"("certificateId");
CREATE INDEX IF NOT EXISTS "software_certificates_appraisalId_issuedAt_idx" ON "software_certificates"("appraisalId", "issuedAt");
CREATE INDEX IF NOT EXISTS "software_certificates_appraisalPublicId_idx" ON "software_certificates"("appraisalPublicId");
CREATE INDEX IF NOT EXISTS "software_certificates_projectId_issuedAt_idx" ON "software_certificates"("projectId", "issuedAt");
CREATE INDEX IF NOT EXISTS "software_certificates_userId_issuedAt_idx" ON "software_certificates"("userId", "issuedAt");
CREATE INDEX IF NOT EXISTS "software_certificates_certificateId_idx" ON "software_certificates"("certificateId");
CREATE INDEX IF NOT EXISTS "software_certificates_payloadHash_idx" ON "software_certificates"("payloadHash");
CREATE INDEX IF NOT EXISTS "software_certificates_status_idx" ON "software_certificates"("status");
CREATE INDEX IF NOT EXISTS "software_certificates_signingKeyId_idx" ON "software_certificates"("signingKeyId");

CREATE UNIQUE INDEX IF NOT EXISTS "software_certificate_snapshots_certificateDbId_version_key" ON "software_certificate_snapshots"("certificateDbId", "version");
CREATE INDEX IF NOT EXISTS "software_certificate_snapshots_certificateId_idx" ON "software_certificate_snapshots"("certificateId");
CREATE INDEX IF NOT EXISTS "software_certificate_snapshots_payloadHash_idx" ON "software_certificate_snapshots"("payloadHash");
CREATE INDEX IF NOT EXISTS "software_certificate_snapshots_signingKeyId_idx" ON "software_certificate_snapshots"("signingKeyId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'software_certificates_appraisalId_fkey') THEN
    ALTER TABLE "software_certificates" ADD CONSTRAINT "software_certificates_appraisalId_fkey" FOREIGN KEY ("appraisalId") REFERENCES "software_appraisals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'software_certificates_projectId_fkey') THEN
    ALTER TABLE "software_certificates" ADD CONSTRAINT "software_certificates_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'software_certificates_userId_fkey') THEN
    ALTER TABLE "software_certificates" ADD CONSTRAINT "software_certificates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'software_certificates_signingKeyId_fkey') THEN
    ALTER TABLE "software_certificates" ADD CONSTRAINT "software_certificates_signingKeyId_fkey" FOREIGN KEY ("signingKeyId") REFERENCES "certificate_signing_keys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'software_certificate_snapshots_certificateDbId_fkey') THEN
    ALTER TABLE "software_certificate_snapshots" ADD CONSTRAINT "software_certificate_snapshots_certificateDbId_fkey" FOREIGN KEY ("certificateDbId") REFERENCES "software_certificates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'software_certificate_snapshots_signingKeyId_fkey') THEN
    ALTER TABLE "software_certificate_snapshots" ADD CONSTRAINT "software_certificate_snapshots_signingKeyId_fkey" FOREIGN KEY ("signingKeyId") REFERENCES "certificate_signing_keys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
