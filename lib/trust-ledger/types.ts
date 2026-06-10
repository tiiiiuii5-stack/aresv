import type { DecisionState } from "@/lib/decision-model";

export type TrustLedgerNodeType = "evidence" | "finding" | "score" | "claim" | "source";
export type TrustLedgerEdgeRelation =
  | "supports"
  | "derived_from"
  | "reduces_score"
  | "increases_risk"
  | "requires_fix"
  | "publishes_as"
  | "rejects";

export type TrustLedgerEvidenceType = "file" | "route" | "scan" | "history" | "repository" | "appraisal" | "config";

export type TrustLedgerEvidenceNode = {
  id: string;
  type: "evidence";
  evidenceType: TrustLedgerEvidenceType;
  source: string;
  title: string;
  summary: string;
  filePath?: string;
  route?: string;
  confidence: number;
  createdAt?: string;
  metadata: Record<string, unknown>;
};

export type TrustLedgerFindingNode = {
  id: string;
  type: "finding";
  fingerprint: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "unknown";
  category: string;
  evidenceIds: string[];
  filePath?: string;
  confidence: number;
  fixRecommendation?: string;
};

export type TrustLedgerScoreNode = {
  id: string;
  type: "score";
  title: string;
  value: number;
  evidenceIds: string[];
  confidence: number;
};

export type TrustLedgerClaimNode = {
  id: string;
  type: "claim";
  visibility: "public" | "private";
  claimType: "score" | "risk" | "verdict" | "certificate" | "recommendation" | "history";
  text: string;
  evidenceIds: string[];
  relatedScoreKeys: TrustScoreCategoryKey[];
  confidence: number;
};

export type TrustLedgerSourceNode = {
  id: string;
  type: "source";
  sourceType: "project" | "scan" | "repository" | "appraisal";
  title: string;
  referenceId: string;
};

export type TrustLedgerNode =
  | TrustLedgerEvidenceNode
  | TrustLedgerFindingNode
  | TrustLedgerScoreNode
  | TrustLedgerClaimNode
  | TrustLedgerSourceNode;

export type TrustLedgerEdge = {
  from: string;
  to: string;
  relation: TrustLedgerEdgeRelation;
  reason: string;
};

export type TrustLedgerGraph = {
  nodes: TrustLedgerNode[];
  edges: TrustLedgerEdge[];
  counts: {
    evidence: number;
    findings: number;
    scores: number;
    claims: number;
    sources: number;
  };
};

export type TrustScoreCategoryKey =
  | "identityStructure"
  | "functionalCompleteness"
  | "securityTrust"
  | "dataPersistence"
  | "reliabilityOperations"
  | "maintainability"
  | "commercialReadiness"
  | "historicalTrajectory";

export type TrustScoreDeduction = {
  evidenceId: string;
  findingId?: string;
  findingFingerprint?: string;
  severity: string;
  deduction: number;
  reason: string;
  confidence: number;
};

export type TrustScoreCategory = {
  key: TrustScoreCategoryKey;
  name: string;
  weight: number;
  maxScore: number;
  score: number;
  confidence: number;
  evidenceCoverage: number;
  evaluatedSignals: number;
  requiredSignals: number;
  deductions: TrustScoreDeduction[];
  supportingEvidenceIds: string[];
};

export type TrustScoreCap = {
  rule: string;
  cappedAt: number;
  evidenceId: string;
  reason: string;
};

export type SoftwareTrustScore = {
  score: number;
  rawScore: number;
  rating: "A" | "B" | "C" | "D" | "F";
  verdict: "READY" | "RISKY" | "BLOCKED" | "DO_NOT_DEPLOY";
  confidence: number;
  categories: TrustScoreCategory[];
  capsApplied: TrustScoreCap[];
  evidenceSummary: {
    evidenceCount: number;
    findingCount: number;
    tracedExecutionPaths: number;
    evaluatedSignals: number;
    requiredSignals: number;
    unsupportedSignalsDiscarded: number;
  };
};

export type TrustLedgerClaim = {
  id: string;
  visibility: "public" | "private";
  claimType: TrustLedgerClaimNode["claimType"];
  text: string;
  evidenceIds: string[];
  relatedScoreKeys: TrustScoreCategoryKey[];
  confidence: number;
  generatedBy: "trust-ledger";
};

export type TrustLedgerRejectedClaim = {
  id: string;
  text: string;
  reason: "MISSING_EVIDENCE" | "UNKNOWN_EVIDENCE" | "UNSUPPORTED_SCORE" | "LOW_CONFIDENCE";
};

export type TrustLedgerClaimGateResult = {
  acceptedClaims: TrustLedgerClaim[];
  rejectedClaims: TrustLedgerRejectedClaim[];
  stats: {
    accepted: number;
    rejected: number;
    publicClaims: number;
    privateClaims: number;
  };
};

export type SoftwareTrustLedgerReport = {
  engine: "ventureos-software-trust-ledger";
  version: "1.0.0";
  generatedAt: string;
  projectId: string;
  projectName: string;
  state: DecisionState;
  snapshotHash: string;
  graph: TrustLedgerGraph;
  score: SoftwareTrustScore;
  claimGate: TrustLedgerClaimGateResult;
  publicClaims: TrustLedgerClaim[];
  privateClaims: TrustLedgerClaim[];
  explanation: {
    nodes: TrustLedgerNode[];
    edges: TrustLedgerEdge[];
  };
  source: {
    latestScanId?: string | null;
    latestScanRefId?: string | null;
    latestScanSource?: string | null;
    scanCount: number;
    findingCount: number;
    repositoryCount: number;
  };
  storage?: {
    persisted: boolean;
    snapshotId?: string;
  };
};
