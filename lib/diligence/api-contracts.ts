import type {
  DueDiligenceWorkspace,
  EvidenceRecord,
  MonitoringAlert,
  PassportDimension,
  SoftwarePassportV2,
  DiligenceRisk,
  VendorComparisonRow,
} from "@/lib/diligence/due-diligence-engine";
import { buildDueDiligenceWorkspace } from "@/lib/diligence/due-diligence-engine";

export type PassportApiContract = {
  apiVersion: "trust-v1";
  passport: SoftwarePassportV2;
  confidence: number;
  evidenceCount: number;
  riskCount: number;
  dimensions: Record<string, PassportDimension>;
  scoreExplanations: ScoreExplanation[];
  snapshot: DueDiligenceWorkspace["snapshot"];
};

export type ScoreExplanation = {
  dimension: string;
  score: number;
  confidence: number;
  formula: string;
  evidenceCount: number;
  positiveImpact: number;
  negativeImpact: number;
  evidence: Array<{
    id: string;
    source: string;
    sourceKind: string;
    confidence: number;
    hash: string;
    anchors: EvidenceRecord["anchors"];
    provenance: EvidenceRecord["provenance"];
  }>;
};

export type RiskApiContract = {
  apiVersion: "risk-v1";
  vendor: Pick<SoftwarePassportV2, "id" | "name" | "trustScore" | "confidence" | "status">;
  risks: DiligenceRisk[];
  scoreExplanations: ScoreExplanation[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    informational: number;
  };
  snapshot: DueDiligenceWorkspace["snapshot"];
};

export type MonitorApiContract = {
  apiVersion: "monitor-v1";
  vendor: Pick<SoftwarePassportV2, "id" | "name" | "monitoringStatus" | "trustScore" | "confidence">;
  alerts: MonitoringAlert[];
  evidenceSnapshot: {
    count: number;
    rootHash: string;
    latestTimestamp: string | null;
  };
  drift: {
    status: "stable" | "watch" | "attention";
    reason: string;
    changedEvidenceIds: string[];
  };
  snapshot: DueDiligenceWorkspace["snapshot"];
};

export type CompareApiContract = {
  apiVersion: "compare-v1";
  vendors: VendorComparisonRow[];
  rankedTrustMatrix: VendorComparisonRow[];
  categoryBreakdown: Array<{
    vendorId: string;
    vendorName: string;
    dimensions: Array<{
      key: string;
      score: number;
      confidence: number;
      verdict: string;
    }>;
  }>;
  riskDeltas: Array<{
    leftVendorId: string;
    rightVendorId: string;
    trustDelta: number;
    confidenceDelta: number;
    criticalRiskDelta: number;
  }>;
  snapshot: DueDiligenceWorkspace["snapshot"];
};

export function findPassport(workspace: DueDiligenceWorkspace, vendor: string): SoftwarePassportV2 | null {
  const clean = normalizeVendor(vendor);
  if (!clean) return null;
  return workspace.passports.find((passport) => passportMatches(passport, clean)) || null;
}

export async function buildWorkspaceForVendor(vendor: string, limit = 50): Promise<DueDiligenceWorkspace> {
  const clean = normalizeVendor(vendor);
  const queried = await buildDueDiligenceWorkspace({ query: clean, limit, deterministic: true });
  if (findPassport(queried, clean)) return queried;
  return buildDueDiligenceWorkspace({ limit, deterministic: true });
}

export function evidenceForVendor(workspace: DueDiligenceWorkspace, vendor: string) {
  const passport = findPassport(workspace, vendor);
  if (!passport) return { passport: null, evidence: [] as EvidenceRecord[] };
  return {
    passport,
    evidence: workspace.evidence.filter((record) => record.subjectId === passport.id),
  };
}

export function risksForVendor(workspace: DueDiligenceWorkspace, vendor: string) {
  const passport = findPassport(workspace, vendor);
  if (!passport) return { passport: null, risks: [] as DiligenceRisk[] };
  return {
    passport,
    risks: workspace.risks.filter((risk) => risk.subjectId === passport.id),
  };
}

export function monitoringForVendor(workspace: DueDiligenceWorkspace, vendor: string) {
  const passport = findPassport(workspace, vendor);
  if (!passport) return { passport: null, alerts: [] as MonitoringAlert[], evidence: [] as EvidenceRecord[] };
  return {
    passport,
    alerts: workspace.monitoring.filter((alert) => alert.subjectId === passport.id),
    evidence: workspace.evidence.filter((record) => record.subjectId === passport.id),
  };
}

export function passportContract(workspace: DueDiligenceWorkspace, vendor: string): PassportApiContract | null {
  const { passport, evidence } = evidenceForVendor(workspace, vendor);
  if (!passport) return null;
  return {
    apiVersion: "trust-v1",
    passport,
    confidence: passport.confidence,
    evidenceCount: passport.evidenceCount,
    riskCount: passport.riskCount,
    dimensions: Object.fromEntries(passport.dimensions.map((dimension) => [dimension.key, dimension])),
    scoreExplanations: explainScores(passport, evidence),
    snapshot: workspace.snapshot,
  };
}

export function riskContract(workspace: DueDiligenceWorkspace, vendor: string): RiskApiContract | null {
  const { passport, risks } = risksForVendor(workspace, vendor);
  if (!passport) return null;
  const { evidence } = evidenceForVendor(workspace, vendor);
  return {
    apiVersion: "risk-v1",
    vendor: {
      id: passport.id,
      name: passport.name,
      trustScore: passport.trustScore,
      confidence: passport.confidence,
      status: passport.status,
    },
    risks,
    scoreExplanations: explainScores(passport, evidence),
    summary: {
      total: risks.length,
      critical: risks.filter((risk) => risk.severity === "critical").length,
      high: risks.filter((risk) => risk.severity === "high").length,
      medium: risks.filter((risk) => risk.severity === "medium").length,
      low: risks.filter((risk) => risk.severity === "low").length,
      informational: risks.filter((risk) => risk.severity === "informational").length,
    },
    snapshot: workspace.snapshot,
  };
}

export function monitorContract(workspace: DueDiligenceWorkspace, vendor: string): MonitorApiContract | null {
  const { passport, alerts, evidence } = monitoringForVendor(workspace, vendor);
  if (!passport) return null;
  const attention = alerts.some((alert) => alert.status === "attention");
  const watch = alerts.some((alert) => alert.status === "watch");
  return {
    apiVersion: "monitor-v1",
    vendor: {
      id: passport.id,
      name: passport.name,
      monitoringStatus: passport.monitoringStatus,
      trustScore: passport.trustScore,
      confidence: passport.confidence,
    },
    alerts,
    evidenceSnapshot: {
      count: evidence.length,
      rootHash: workspace.snapshot.evidenceRootHash,
      latestTimestamp: latestTimestamp(evidence),
    },
    drift: {
      status: attention ? "attention" : watch ? "watch" : "stable",
      reason: attention
        ? "Current evidence generated an attention-level monitoring item."
        : watch
          ? "Current evidence generated a watch item."
          : "No material evidence drift was detected in the current snapshot.",
      changedEvidenceIds: alerts.filter((alert) => alert.status !== "ok").map((alert) => alert.id),
    },
    snapshot: workspace.snapshot,
  };
}

export function compareContract(workspace: DueDiligenceWorkspace, vendors: string[]): CompareApiContract {
  const requested = vendors.map((vendor) => findPassport(workspace, vendor)).filter((passport): passport is SoftwarePassportV2 => Boolean(passport));
  const rows = requested.length
    ? workspace.comparison.filter((row) => requested.some((passport) => passport.id === row.id))
    : workspace.comparison;
  const rankedTrustMatrix = [...rows].sort((left, right) => {
    if (right.trustScore !== left.trustScore) return right.trustScore - left.trustScore;
    return right.confidence - left.confidence;
  });
  return {
    apiVersion: "compare-v1",
    vendors: rows,
    rankedTrustMatrix,
    categoryBreakdown: rows.map((row) => {
      const passport = workspace.passports.find((item) => item.id === row.id);
      return {
        vendorId: row.id,
        vendorName: row.name,
        dimensions: (passport?.dimensions || []).map((dimension) => ({
          key: dimension.key,
          score: dimension.score,
          confidence: dimension.confidence,
          verdict: dimension.verdict,
        })),
      };
    }),
    riskDeltas: pairwiseDeltas(rows),
    snapshot: workspace.snapshot,
  };
}

export function explainScores(passport: SoftwarePassportV2, evidence: EvidenceRecord[]): ScoreExplanation[] {
  return passport.dimensions.map((dimension) => {
    const relevantEvidence = evidence.filter((record) => dimension.evidenceIds.includes(record.id));
    const positiveImpact = dimension.explanation.positive.reduce((sum, impact) => sum + impact.impact, 0);
    const negativeImpact = dimension.explanation.negative.reduce((sum, impact) => sum + impact.impact, 0);
    return {
      dimension: dimension.key,
      score: dimension.score,
      confidence: dimension.confidence,
      formula: dimension.explanation.formula,
      evidenceCount: relevantEvidence.length,
      positiveImpact,
      negativeImpact,
      evidence: relevantEvidence.map((record) => ({
        id: record.id,
        source: record.source,
        sourceKind: record.sourceKind,
        confidence: record.confidence,
        hash: record.hash,
        anchors: record.anchors,
        provenance: record.provenance,
      })),
    };
  });
}

function pairwiseDeltas(rows: VendorComparisonRow[]) {
  const deltas: CompareApiContract["riskDeltas"] = [];
  for (let index = 0; index < rows.length; index += 1) {
    for (let next = index + 1; next < rows.length; next += 1) {
      const left = rows[index];
      const right = rows[next];
      deltas.push({
        leftVendorId: left.id,
        rightVendorId: right.id,
        trustDelta: right.trustScore - left.trustScore,
        confidenceDelta: right.confidence - left.confidence,
        criticalRiskDelta: right.criticalRisks - left.criticalRisks,
      });
    }
  }
  return deltas;
}

function passportMatches(passport: SoftwarePassportV2, clean: string) {
  return [passport.id, passport.name, passport.company, passport.repository, passport.domain]
    .some((value) => String(value || "").toLowerCase().includes(clean));
}

function normalizeVendor(value: string) {
  return String(value || "").trim().toLowerCase().slice(0, 180);
}

function latestTimestamp(evidence: EvidenceRecord[]) {
  const timestamps = evidence.map((record) => new Date(record.timestamp).getTime()).filter(Number.isFinite);
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}
