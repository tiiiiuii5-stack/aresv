import type { AppraisalBadgeState, AppraisalEvidenceCoverage, AppraisalEvidenceSource, AppraisalGrade, AppraisalLaunchVerdict } from "@/lib/appraisal/types";

export type CertificateStatus = "ACTIVE" | "EXPIRED" | "REVOKED" | "SUPERSEDED";

export type VentureOSCertificatePayload = {
  certificateId: string;
  issuer: "VentureOS";
  schemaVersion: "1.0";
  issuedAt: string;
  expiresAt?: string | null;
  softwareAsset: {
    publicAssetId: string;
    name: string;
    category?: string | null;
    softwareDnaHash?: string | null;
    sourceSnapshotHash?: string | null;
  };
  appraisal: {
    publicId: string;
    grade: AppraisalGrade;
    verdict: AppraisalLaunchVerdict;
    readinessScore: number;
    technicalRiskScore: number;
    transferReadinessScore: number;
    badgeState: AppraisalBadgeState;
  };
  publicClaims: {
    strengths: string[];
    topRisks: string[];
    conditions: string[];
  };
  evidenceCommitment: {
    publicSummaryHash: string;
    privateEvidenceHash: string;
    sourceSnapshotHash?: string | null;
    externalDataSources?: AppraisalEvidenceSource[];
    evidenceCoverage?: AppraisalEvidenceCoverage;
  };
};

export type SignedCertificate = {
  certificateId: string;
  status: CertificateStatus;
  payload: VentureOSCertificatePayload;
  payloadHash: string;
  signature: string;
  signingKeyId: string;
  verificationUrl: string;
  badgeUrl: string;
  issuedAt: string;
  expiresAt?: string | null;
};

export type CertificateVerificationResult = {
  valid: boolean;
  status: CertificateStatus | "UNKNOWN";
  certificateId?: string;
  payloadHash: string;
  recomputedPayloadHash: string;
  signatureValid: boolean;
  registryMatch: boolean;
  signingKeyId: string;
  issuedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  supersededBy?: string | null;
  reason: string;
};

export type CertificateHistoryItem = {
  version: number;
  status: CertificateStatus;
  payloadHash: string;
  signingKeyId: string;
  changeReason?: string | null;
  createdAt: string;
};

export type PublicSigningKey = {
  id: string;
  algorithm: "Ed25519";
  publicKey: string;
  status: "ACTIVE" | "RETIRED" | "REVOKED";
};
