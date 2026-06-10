import { buildCertificateBadgeSvg } from "@/lib/certificates/badge";
import { certificatePayloadHash, signCertificatePayload, verifyCertificateSignature } from "@/lib/certificates/signing";
import type { VentureOSCertificatePayload } from "@/lib/certificates/types";

const payload: VentureOSCertificatePayload = {
  certificateId: "vos-cert-validation",
  issuer: "VentureOS",
  schemaVersion: "1.0",
  issuedAt: "2026-06-06T00:00:00.000Z",
  expiresAt: null,
  softwareAsset: {
    publicAssetId: "vos-validation-appraisal",
    name: "Validation App",
    category: "repository",
    softwareDnaHash: null,
    sourceSnapshotHash: "snapshot-validation",
  },
  appraisal: {
    publicId: "vos-validation-appraisal",
    grade: "A",
    verdict: "READY",
    readinessScore: 92,
    technicalRiskScore: 8,
    transferReadinessScore: 88,
    badgeState: "PRODUCTION_READY",
  },
  publicClaims: {
    strengths: ["Validation payload is deterministic."],
    topRisks: [],
    conditions: ["Validation only."],
  },
  evidenceCommitment: {
    publicSummaryHash: "public-summary-validation",
    privateEvidenceHash: "private-evidence-validation",
    sourceSnapshotHash: "snapshot-validation",
  },
};

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const signed = signCertificatePayload(payload);
assert(signed.payloadHash === certificatePayloadHash(payload), "payload hash must match signed hash");

const verified = verifyCertificateSignature({
  payload,
  payloadHash: signed.payloadHash,
  signature: signed.signature,
  publicKeyPem: signed.publicKey,
});
assert(verified.signatureValid, "signature must verify");
assert(verified.recomputedPayloadHash === signed.payloadHash, "recomputed payload hash must match");

const tampered = verifyCertificateSignature({
  payload: {
    ...payload,
    appraisal: { ...payload.appraisal, readinessScore: 93 },
  },
  payloadHash: signed.payloadHash,
  signature: signed.signature,
  publicKeyPem: signed.publicKey,
});
assert(!tampered.signatureValid, "tampered payload must fail verification");

const badge = buildCertificateBadgeSvg({ status: "ACTIVE", payload });
assert(badge.includes("VentureOS") && badge.includes("Verified"), "badge must include VentureOS verified state");

console.log(JSON.stringify({
  ok: true,
  signingKeyId: signed.signingKeyId,
  payloadHash: signed.payloadHash,
  tamperRejected: !tampered.signatureValid,
}));
