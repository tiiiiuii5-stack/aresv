import { randomUUID } from "node:crypto";

import { loadPrivateSoftwareAppraisal, loadPublicSoftwareAppraisal } from "@/lib/appraisal/appraisalEngine";
import type { AppraisalPrivateReport, SoftwareAppraisal } from "@/lib/appraisal/types";
import { tryDatabase } from "@/lib/prisma";
import { sanitizeMetadata } from "@/lib/services/platformSupport";
import { stableHash } from "@/lib/trust-ledger/hash";
import { certificateUrls } from "@/lib/certificates/badge";
import {
  certificatePayloadHash,
  certificateSigningAvailable,
  getConfiguredPublicSigningKey,
  signCertificatePayload,
  verifyCertificateSignature,
} from "@/lib/certificates/signing";
import type {
  CertificateHistoryItem,
  CertificateStatus,
  CertificateVerificationResult,
  PublicSigningKey,
  SignedCertificate,
  VentureOSCertificatePayload,
} from "@/lib/certificates/types";

type CertificateRow = {
  id: string;
  certificateId: string;
  appraisalId: string;
  projectId: string | null;
  userId: string;
  schemaVersion: string;
  status: CertificateStatus;
  badgeState: string;
  payload: unknown;
  payloadHash: string;
  signature: string;
  signingKeyId: string;
  publicSummaryHash: string;
  privateEvidenceHash: string;
  sourceSnapshotHash: string | null;
  issuedAt: Date | string;
  expiresAt: Date | string | null;
  revokedAt: Date | string | null;
  supersededById: string | null;
  publicKey?: string | null;
};

type SnapshotRow = {
  version: number | bigint;
  status: CertificateStatus;
  payloadHash: string;
  signingKeyId: string;
  changeReason: string | null;
  createdAt: Date | string;
};

type SigningKeyRow = {
  id: string;
  algorithm: "Ed25519";
  publicKey: string;
  status: "ACTIVE" | "RETIRED" | "REVOKED";
};

export async function issueCertificateForAppraisal(input: { appraisalIdOrPublicId: string; userId: string }) {
  if (!certificateSigningAvailable()) throw new Error("CERTIFICATE_SIGNING_KEY_REQUIRED");
  const appraisal = await loadPrivateSoftwareAppraisal(input.appraisalIdOrPublicId, input.userId);
  if (!appraisal?.privateReport) throw new Error("APPRAISAL_NOT_FOUND");

  const existing = await loadLatestCertificateForAppraisal(appraisal.id, input.userId);
  const payload = buildCertificatePayload(appraisal);
  if (existing && sameCertificateBasis(existing.payload, payload)) {
    return existing;
  }

  const signed = signCertificatePayload(payload);
  const key = { id: signed.signingKeyId, algorithm: signed.algorithm, publicKey: signed.publicKey, status: "ACTIVE" as const };
  await upsertSigningKey(key);

  const certificate = await persistCertificate({
    appraisal,
    payload,
    payloadHash: signed.payloadHash,
    signature: signed.signature,
    signingKeyId: signed.signingKeyId,
  });
  return certificate;
}

export async function loadPublicCertificate(certificateId: string): Promise<SignedCertificate | null> {
  const row = await loadCertificateRow(certificateId);
  return row ? signedCertificateFromRow(row) : null;
}

export async function loadLatestPublicCertificateForAppraisal(appraisalIdOrPublicId: string): Promise<SignedCertificate | null> {
  const publicAppraisal = await loadPublicSoftwareAppraisal(appraisalIdOrPublicId);
  const appraisalId = publicAppraisal?.id || appraisalIdOrPublicId;
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<CertificateRow[]>(
      `SELECT c."id", c."certificateId", c."appraisalId", c."projectId", c."userId", c."schemaVersion", c."status", c."badgeState",
          c."payload", c."payloadHash", c."signature", c."signingKeyId", c."publicSummaryHash", c."privateEvidenceHash",
          c."sourceSnapshotHash", c."issuedAt", c."expiresAt", c."revokedAt", c."supersededById", k."publicKey"
       FROM "software_certificates" c
       LEFT JOIN "certificate_signing_keys" k ON k."id" = c."signingKeyId"
       WHERE c."appraisalId" = $1 OR c."appraisalPublicId" = $1
       ORDER BY c."issuedAt" DESC
       LIMIT 1`,
      appraisalId,
    ),
  );
  const row = rows?.[0];
  return row ? signedCertificateFromRow(row) : null;
}

export async function verifyStoredCertificate(certificateId: string): Promise<CertificateVerificationResult> {
  const row = await loadCertificateRow(certificateId);
  if (!row) {
    return {
      valid: false,
      status: "UNKNOWN",
      certificateId,
      payloadHash: "",
      recomputedPayloadHash: "",
      signatureValid: false,
      registryMatch: false,
      signingKeyId: "",
      reason: "Certificate was not found in the VentureOS registry.",
    };
  }

  const payload = normalizePayload(row.payload);
  const publicKeyPem = row.publicKey || getConfiguredPublicSigningKey()?.publicKey || "";
  if (!publicKeyPem) {
    return resultForRow(row, payload, false, certificatePayloadHash(payload), "Public signing key is unavailable.");
  }

  const verified = verifyCertificateSignature({ payload, payloadHash: row.payloadHash, signature: row.signature, publicKeyPem });
  const registryMatch = verified.recomputedPayloadHash === row.payloadHash && payload.certificateId === row.certificateId;
  const current = statusIsCurrent(row);
  const valid = verified.signatureValid && registryMatch && current;
  const reason = valid
    ? "Certificate signature and registry record are valid."
    : !verified.signatureValid
      ? "Certificate signature is invalid."
      : !registryMatch
        ? "Certificate payload does not match the registry."
        : `Certificate status is ${row.status}.`;

  return resultForRow(row, payload, verified.signatureValid, verified.recomputedPayloadHash, reason, registryMatch, valid);
}

export async function verifySubmittedCertificate(input: {
  payload: VentureOSCertificatePayload;
  signature: string;
  signingKeyId: string;
}): Promise<CertificateVerificationResult> {
  const key = await loadSigningKey(input.signingKeyId);
  const payloadHash = certificatePayloadHash(input.payload);
  if (!key) {
    return {
      valid: false,
      status: "UNKNOWN",
      certificateId: input.payload.certificateId,
      payloadHash,
      recomputedPayloadHash: payloadHash,
      signatureValid: false,
      registryMatch: false,
      signingKeyId: input.signingKeyId,
      reason: "Signing key was not found.",
    };
  }

  const verified = verifyCertificateSignature({ payload: input.payload, payloadHash, signature: input.signature, publicKeyPem: key.publicKey });
  const registry = await loadCertificateRow(input.payload.certificateId);
  const registryMatch = Boolean(registry && registry.payloadHash === payloadHash && registry.signature === input.signature);
  return {
    valid: verified.signatureValid && registryMatch && Boolean(registry && statusIsCurrent(registry)),
    status: registry?.status || "UNKNOWN",
    certificateId: input.payload.certificateId,
    payloadHash,
    recomputedPayloadHash: verified.recomputedPayloadHash,
    signatureValid: verified.signatureValid,
    registryMatch,
    signingKeyId: input.signingKeyId,
    issuedAt: registry ? isoDate(registry.issuedAt) : input.payload.issuedAt,
    expiresAt: registry ? isoDateOrNull(registry.expiresAt) : input.payload.expiresAt || null,
    revokedAt: registry ? isoDateOrNull(registry.revokedAt) : null,
    supersededBy: registry?.supersededById || null,
    reason: verified.signatureValid && registryMatch ? "Submitted certificate is valid against the registry." : "Submitted certificate could not be verified against the registry.",
  };
}

export async function loadCertificateHistory(certificateId: string): Promise<CertificateHistoryItem[]> {
  const certificate = await loadCertificateRow(certificateId);
  if (!certificate) return [];
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<SnapshotRow[]>(
      `SELECT "version", "status", "payloadHash", "signingKeyId", "changeReason", "createdAt"
       FROM "software_certificate_snapshots"
       WHERE "certificateDbId" = $1
       ORDER BY "version" ASC`,
      certificate.id,
    ),
  );
  return (rows || []).map((row) => ({
    version: typeof row.version === "bigint" ? Number(row.version) : Number(row.version),
    status: row.status,
    payloadHash: row.payloadHash,
    signingKeyId: row.signingKeyId,
    changeReason: row.changeReason,
    createdAt: isoDate(row.createdAt),
  }));
}

export async function listPublicSigningKeys(): Promise<PublicSigningKey[]> {
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<SigningKeyRow[]>(
      `SELECT "id", "algorithm", "publicKey", "status"
       FROM "certificate_signing_keys"
       WHERE "status" IN ('ACTIVE', 'RETIRED')
       ORDER BY "createdAt" DESC`,
    ),
  );
  const dbKeys = (rows || []).map((row) => ({ id: row.id, algorithm: "Ed25519" as const, publicKey: row.publicKey, status: row.status }));
  const configured = getConfiguredPublicSigningKey();
  if (configured && !dbKeys.some((key) => key.id === configured.id)) dbKeys.unshift(configured);
  return dbKeys;
}

function buildCertificatePayload(appraisal: SoftwareAppraisal): VentureOSCertificatePayload {
  const privateReport = appraisal.privateReport as AppraisalPrivateReport | undefined;
  const sourceSnapshotHash = stableHash({
    sourceScanId: appraisal.sourceScanId || privateReport?.source.latestScanId || null,
    sourceScanRefId: appraisal.sourceScanRefId || privateReport?.source.latestScanRefId || null,
    score: appraisal.readinessScore,
    generatedAt: appraisal.publicSummary.generatedAt,
  });
  return {
    certificateId: createCertificateId(),
    issuer: "VentureOS",
    schemaVersion: "1.0",
    issuedAt: new Date().toISOString(),
    expiresAt: appraisal.expiresAt || null,
    softwareAsset: {
      publicAssetId: appraisal.publicId,
      name: appraisal.appName,
      category: privateReport?.source.latestScanSource || null,
      softwareDnaHash: null,
      sourceSnapshotHash,
    },
    appraisal: {
      publicId: appraisal.publicId,
      grade: appraisal.grade,
      verdict: appraisal.launchVerdict,
      readinessScore: appraisal.readinessScore,
      technicalRiskScore: appraisal.technicalRiskScore,
      transferReadinessScore: appraisal.transferReadinessScore,
      badgeState: appraisal.badgeState,
    },
    publicClaims: {
      strengths: publicStrengthsFor(appraisal),
      topRisks: appraisal.publicSummary.topRisks.map((risk) => risk.title).slice(0, 3),
      conditions: appraisal.publicSummary.conditions.slice(0, 3),
    },
    evidenceCommitment: {
      publicSummaryHash: stableHash(appraisal.publicSummary),
      privateEvidenceHash: stableHash(privateReport || { unavailable: true }),
      sourceSnapshotHash,
      externalDataSources: privateReport?.source.externalDataSources || appraisal.publicSummary.evidenceSources || [],
      evidenceCoverage: appraisal.publicSummary.evidenceCoverage,
    },
  };
}

async function persistCertificate(input: {
  appraisal: SoftwareAppraisal;
  payload: VentureOSCertificatePayload;
  payloadHash: string;
  signature: string;
  signingKeyId: string;
}) {
  const certificateDbId = randomUUID();
  const snapshotId = randomUUID();
  const certificate = await tryDatabase(async (db) => {
    const rows = await db.$queryRawUnsafe<CertificateRow[]>(
      `INSERT INTO "software_certificates" (
          "id", "certificateId", "appraisalId", "appraisalPublicId", "projectId", "userId", "schemaVersion", "status", "badgeState",
          "payload", "payloadHash", "signature", "signingKeyId", "publicSummaryHash", "privateEvidenceHash", "sourceSnapshotHash",
          "issuedAt", "expiresAt"
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING "id", "certificateId", "appraisalId", "projectId", "userId", "schemaVersion", "status", "badgeState", "payload",
          "payloadHash", "signature", "signingKeyId", "publicSummaryHash", "privateEvidenceHash", "sourceSnapshotHash",
          "issuedAt", "expiresAt", "revokedAt", "supersededById", NULL::text AS "publicKey"`,
      certificateDbId,
      input.payload.certificateId,
      input.appraisal.id,
      input.appraisal.publicId,
      input.appraisal.projectId,
      input.appraisal.userId,
      input.payload.schemaVersion,
      input.appraisal.badgeState,
      JSON.stringify(sanitizeMetadata(input.payload as unknown as Record<string, unknown>)),
      input.payloadHash,
      input.signature,
      input.signingKeyId,
      input.payload.evidenceCommitment.publicSummaryHash,
      input.payload.evidenceCommitment.privateEvidenceHash,
      input.payload.evidenceCommitment.sourceSnapshotHash || null,
      new Date(input.payload.issuedAt),
      input.payload.expiresAt ? new Date(input.payload.expiresAt) : null,
    );
    const row = rows[0];
    if (!row) return null;
    await db.$executeRawUnsafe(
      `INSERT INTO "software_certificate_snapshots" ("id", "certificateDbId", "certificateId", "version", "status", "payload", "payloadHash", "signature", "signingKeyId", "changeReason")
       VALUES ($1, $2, $3, 1, $4, $5::jsonb, $6, $7, $8, $9)`,
      snapshotId,
      row.id,
      row.certificateId,
      row.status,
      JSON.stringify(sanitizeMetadata(input.payload as unknown as Record<string, unknown>)),
      input.payloadHash,
      input.signature,
      input.signingKeyId,
      "ISSUED",
    );
    return row;
  });

  if (!certificate) throw new Error("DATABASE_UNAVAILABLE");
  return signedCertificateFromRow(certificate);
}

async function loadLatestCertificateForAppraisal(appraisalId: string, userId: string) {
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<CertificateRow[]>(
      `SELECT c."id", c."certificateId", c."appraisalId", c."projectId", c."userId", c."schemaVersion", c."status", c."badgeState",
          c."payload", c."payloadHash", c."signature", c."signingKeyId", c."publicSummaryHash", c."privateEvidenceHash",
          c."sourceSnapshotHash", c."issuedAt", c."expiresAt", c."revokedAt", c."supersededById", k."publicKey"
       FROM "software_certificates" c
       LEFT JOIN "certificate_signing_keys" k ON k."id" = c."signingKeyId"
       WHERE c."appraisalId" = $1 AND c."userId" = $2
       ORDER BY c."issuedAt" DESC
       LIMIT 1`,
      appraisalId,
      userId,
    ),
  );
  const row = rows?.[0];
  return row ? signedCertificateFromRow(row) : null;
}

async function loadCertificateRow(certificateId: string) {
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<CertificateRow[]>(
      `SELECT c."id", c."certificateId", c."appraisalId", c."projectId", c."userId", c."schemaVersion", c."status", c."badgeState",
          c."payload", c."payloadHash", c."signature", c."signingKeyId", c."publicSummaryHash", c."privateEvidenceHash",
          c."sourceSnapshotHash", c."issuedAt", c."expiresAt", c."revokedAt", c."supersededById", k."publicKey"
       FROM "software_certificates" c
       LEFT JOIN "certificate_signing_keys" k ON k."id" = c."signingKeyId"
       WHERE c."certificateId" = $1
       LIMIT 1`,
      certificateId.trim(),
    ),
  );
  return rows?.[0] || null;
}

async function upsertSigningKey(key: PublicSigningKey) {
  await tryDatabase((db) =>
    db.$executeRawUnsafe(
      `INSERT INTO "certificate_signing_keys" ("id", "algorithm", "publicKey", "status")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("id") DO UPDATE SET "publicKey" = EXCLUDED."publicKey", "status" = EXCLUDED."status"`,
      key.id,
      key.algorithm,
      key.publicKey,
      key.status,
    ),
  );
}

async function loadSigningKey(id: string) {
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<SigningKeyRow[]>(
      `SELECT "id", "algorithm", "publicKey", "status"
       FROM "certificate_signing_keys"
       WHERE "id" = $1
       LIMIT 1`,
      id,
    ),
  );
  const configured = getConfiguredPublicSigningKey();
  return rows?.[0] || (configured?.id === id ? configured : null);
}

function signedCertificateFromRow(row: CertificateRow): SignedCertificate {
  const urls = certificateUrls(row.certificateId);
  return {
    certificateId: row.certificateId,
    status: row.status,
    payload: normalizePayload(row.payload),
    payloadHash: row.payloadHash,
    signature: row.signature,
    signingKeyId: row.signingKeyId,
    verificationUrl: urls.verificationUrl,
    badgeUrl: urls.badgeUrl,
    issuedAt: isoDate(row.issuedAt),
    expiresAt: isoDateOrNull(row.expiresAt),
  };
}

function resultForRow(
  row: CertificateRow,
  payload: VentureOSCertificatePayload,
  signatureValid: boolean,
  recomputedPayloadHash: string,
  reason: string,
  registryMatch = recomputedPayloadHash === row.payloadHash,
  valid = signatureValid && registryMatch && statusIsCurrent(row),
): CertificateVerificationResult {
  return {
    valid,
    status: row.status,
    certificateId: row.certificateId,
    payloadHash: row.payloadHash,
    recomputedPayloadHash,
    signatureValid,
    registryMatch,
    signingKeyId: row.signingKeyId,
    issuedAt: payload.issuedAt || isoDate(row.issuedAt),
    expiresAt: payload.expiresAt || isoDateOrNull(row.expiresAt),
    revokedAt: isoDateOrNull(row.revokedAt),
    supersededBy: row.supersededById,
    reason,
  };
}

function normalizePayload(value: unknown): VentureOSCertificatePayload {
  if (typeof value === "string") {
    try {
      return normalizePayload(JSON.parse(value) as unknown);
    } catch {
      throw new Error("CERTIFICATE_PAYLOAD_INVALID");
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("CERTIFICATE_PAYLOAD_INVALID");
  return value as VentureOSCertificatePayload;
}

function statusIsCurrent(row: CertificateRow) {
  if (row.status !== "ACTIVE") return false;
  if (!row.expiresAt) return true;
  return new Date(row.expiresAt).getTime() > Date.now();
}

function publicStrengthsFor(appraisal: SoftwareAppraisal) {
  const strengths: string[] = [];
  const coverage = appraisal.publicSummary.evidenceCoverage;
  if (appraisal.readinessScore >= 85 && coverage?.level === "strong") strengths.push("Current scan supports high readiness with strong evidence coverage.");
  if (appraisal.readinessScore >= 85 && coverage && coverage.level !== "strong") strengths.push(`Current scan is favorable, but evidence coverage is ${coverage.level}.`);
  if (appraisal.transferReadinessScore >= 80) strengths.push("Transfer readiness is strong.");
  if ((appraisal.privateReport?.source.scanCount || 0) >= 2) strengths.push("Historical scan evidence is available.");
  if (!strengths.length) strengths.push("Appraisal is backed by stored VentureOS scan evidence.");
  return strengths.slice(0, 3);
}

function sameCertificateBasis(left: VentureOSCertificatePayload, right: VentureOSCertificatePayload) {
  return stableHash({
    softwareAsset: left.softwareAsset,
    appraisal: left.appraisal,
    publicClaims: left.publicClaims,
    evidenceCommitment: left.evidenceCommitment,
    expiresAt: left.expiresAt || null,
  }) === stableHash({
    softwareAsset: right.softwareAsset,
    appraisal: right.appraisal,
    publicClaims: right.publicClaims,
    evidenceCommitment: right.evidenceCommitment,
    expiresAt: right.expiresAt || null,
  });
}

function createCertificateId() {
  return `vos-cert-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function isoDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function isoDateOrNull(value: Date | string | null) {
  return value ? isoDate(value) : null;
}
