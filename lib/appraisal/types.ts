import type { DecisionState, DecisionTrend, ShipAnswer } from "@/lib/decision-model";

export type AppraisalGrade = "A" | "B" | "C" | "D" | "F";
export type AppraisalLaunchVerdict = "READY" | "RISKY" | "BLOCKED" | "DO_NOT_DEPLOY";
export type AppraisalBadgeState =
  | "VENTUREOS_APPRAISED"
  | "PRODUCTION_READY"
  | "RISK_REVIEWED"
  | "HIGH_RISK"
  | "REVERIFIED"
  | "EXPIRED";

export type AppraisalMoneyRange = {
  low: number;
  high: number;
  currency: "USD";
  label: string;
  basis: string;
  available?: boolean;
};

export type AppraisalEvidenceItem = {
  id: string;
  title: string;
  severity: string;
  category: string;
  filePath?: string;
  evidence: string;
  fixRecommendation: string;
  confidence: number;
  fixImpact: number;
  publicSummary: string;
};

export type AppraisalEvidenceSource = {
  id: string;
  label: string;
  status: string;
  evidence: string;
  checkedAt?: string;
};

export type AppraisalEvidenceCoverage = {
  score: number;
  level: "strong" | "moderate" | "limited";
  scope: "full_repository" | "repository_linked" | "partial_submission" | "stored_scan_only";
  scoreCap: number;
  scoreCapped: boolean;
  reasons: string[];
  verifiedClaims: string[];
  unverifiedClaims: string[];
  unknowns: string[];
};

export type AppraisalAuthorityBoundary = {
  authorityLevel: "self_attested" | "system_observed" | "third_party_validated" | "not_verified";
  label: string;
  allowedVerbs: string[];
  blockedVerbs: string[];
  statement: string;
};

export type AppraisalReportClaim = {
  id: string;
  layer: "source" | "inference" | "narrative";
  authorityLevel: AppraisalAuthorityBoundary["authorityLevel"];
  text: string;
  evidenceIds: string[];
};

export type AppraisalFixPlanStep = {
  id: string;
  order: number;
  title: string;
  filePath?: string;
  codeFix?: string;
  expectedResult: string;
  estimatedScoreImpact: number;
  verificationStatus: "UNVERIFIED" | "VERIFIED" | "PARTIAL" | "FAILED";
};

export type AppraisalScoreBreakdown = {
  readiness: number;
  rawReadiness: number;
  technicalRisk: number;
  transferReadiness: number;
  evidenceConfidence: number;
  evidenceCoverage: AppraisalEvidenceCoverage;
  riskCounts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
};

export type AppraisalPublicSummary = {
  publicId: string;
  appName: string;
  grade: AppraisalGrade;
  launchVerdict: AppraisalLaunchVerdict;
  badgeState: AppraisalBadgeState;
  readinessScore: number;
  technicalRiskScore: number;
  transferReadinessScore: number;
  repairCost: AppraisalMoneyRange;
  technicalValue: AppraisalMoneyRange;
  topRisks: Array<Pick<AppraisalEvidenceItem, "id" | "title" | "severity" | "category" | "confidence" | "fixImpact" | "publicSummary">>;
  conditions: string[];
  evidenceSources: AppraisalEvidenceSource[];
  evidenceCoverage: AppraisalEvidenceCoverage;
  unknowns: string[];
  unverifiedClaims: string[];
  authorityBoundaries?: AppraisalAuthorityBoundary[];
  observedClaims?: AppraisalReportClaim[];
  inferredClaims?: AppraisalReportClaim[];
  notVerifiedClaims?: AppraisalReportClaim[];
  trend: DecisionTrend;
  generatedAt: string;
  expiresAt?: string | null;
  disclaimer: string;
};

export type AppraisalPrivateReport = {
  engine: "ventureos-software-appraisal";
  version: "1.0.0";
  generatedAt: string;
  projectId: string;
  projectName: string;
  state: DecisionState;
  shipAnswer: ShipAnswer;
  shipReason: string;
  scoreBreakdown: AppraisalScoreBreakdown;
  evidence: AppraisalEvidenceItem[];
  fixPlan: AppraisalFixPlanStep[];
  warnings: string[];
  scaleRisks: string[];
  source: {
    latestScanId?: string | null;
    latestScanRefId?: string | null;
    latestScanSource?: string | null;
    scanCount: number;
    findingCount: number;
    repositoryCount: number;
    sourceLength?: number | null;
    rawCodeStored?: boolean | null;
    inputTruncated?: boolean | null;
    externalDataSources?: AppraisalEvidenceSource[];
  };
  authorityBoundaries?: AppraisalAuthorityBoundary[];
  observedClaims?: AppraisalReportClaim[];
  inferredClaims?: AppraisalReportClaim[];
  notVerifiedClaims?: AppraisalReportClaim[];
};

export type SoftwareAppraisal = {
  id: string;
  publicId: string;
  projectId: string | null;
  userId: string;
  appName: string;
  status: string;
  grade: AppraisalGrade;
  launchVerdict: AppraisalLaunchVerdict;
  readinessScore: number;
  technicalRiskScore: number;
  transferReadinessScore: number;
  repairCost: AppraisalMoneyRange;
  technicalValue: AppraisalMoneyRange;
  badgeState: AppraisalBadgeState;
  publicSummary: AppraisalPublicSummary;
  privateReport?: AppraisalPrivateReport;
  sourceScanId?: string | null;
  sourceScanRefId?: string | null;
  monitoredUntil?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateAppraisalInput = {
  projectId: string;
  userId: string;
  generatedAt?: string;
};
