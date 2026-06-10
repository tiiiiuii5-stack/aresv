import {
  buildExecutionGraph,
  type CodeFile,
  type ExecutionGraph,
  type ExecutionPath,
} from "@/lib/intelligence/execution-path-mapper";
import {
  buildEvidenceReport,
  type EvidenceEngineInput,
  type EvidenceEngineResult,
  type TraceableFinding,
} from "@/lib/intelligence/evidence-engine";

export type ReadinessStatus = "Production Ready" | "Needs Review" | "High Risk" | "Not Launch Ready";
export type LaunchRecommendation = "SAFE" | "RISKY" | "DO NOT LAUNCH";

export type ReadinessSubscoreName =
  | "Authentication"
  | "Authorization"
  | "Data Integrity"
  | "Deployment Safety"
  | "Billing Reliability"
  | "Operational Stability"
  | "Failure Recovery";

export type ReadinessSubscores = Record<ReadinessSubscoreName, number>;

export type ReadinessReason = {
  dimension: ReadinessSubscoreName;
  findingId?: string;
  title: string;
  severity?: TraceableFinding["severity"];
  confidence?: number;
  affectedFiles: string[];
  affectedRoutes: string[];
  evidenceCount: number;
  impact: string;
  fixRecommendation?: string;
};

export type ProductionReadinessInput = {
  files?: CodeFile[];
  source?: string;
  graph?: ExecutionGraph;
  executionPaths?: ExecutionPath[];
  evidenceReport?: EvidenceEngineResult;
  findings?: TraceableFinding[];
  rawFindings?: EvidenceEngineInput["findings"];
  weights?: Partial<ReadinessSubscores>;
};

export type ProductionReadinessReport = {
  score: number;
  status: ReadinessStatus;
  subscores: ReadinessSubscores;
  blockers: ReadinessReason[];
  warnings: ReadinessReason[];
  strengths: ReadinessReason[];
  evidenceSummary: {
    supportedFindings: number;
    discardedFindings: number;
    affectedFiles: string[];
    affectedRoutes: string[];
    executionPathCount: number;
  };
  scoringModel: {
    engine: "ventureos-production-readiness-score";
    version: "1.0.0";
    basis: "traceable-evidence" | "provided-traceable-findings" | "insufficient-input";
    note: string;
  };
};

export type ProductionReadinessScoreReport = {
  engine: "ventureos-production-readiness-score-v2";
  version: "1.0.0";
  generatedAt: string;
  scores: {
    securityScore: number;
    scalabilityScore: number;
    deploymentSafetyScore: number;
    paymentReliabilityScore: number;
  };
  finalReadinessScore: number;
  launchRecommendation: LaunchRecommendation;
  rationale: string;
  blockers: string[];
  warnings: string[];
};

export type ProductionReadinessScoreInput = {
  securityScore: number;
  scalabilityScore: number;
  deploymentSafetyScore: number;
  paymentReliabilityScore: number;
  blockers?: string[];
  warnings?: string[];
  generatedAt?: string;
};

type DimensionAssessment = {
  score: number;
  reasons: ReadinessReason[];
};

const dimensions: ReadinessSubscoreName[] = [
  "Authentication",
  "Authorization",
  "Data Integrity",
  "Deployment Safety",
  "Billing Reliability",
  "Operational Stability",
  "Failure Recovery",
];

const defaultWeights: ReadinessSubscores = {
  Authentication: 0.16,
  Authorization: 0.18,
  "Data Integrity": 0.17,
  "Deployment Safety": 0.16,
  "Billing Reliability": 0.11,
  "Operational Stability": 0.12,
  "Failure Recovery": 0.1,
};

const severityPenalty: Record<TraceableFinding["severity"], number> = {
  critical: 36,
  high: 25,
  medium: 14,
  low: 6,
};

export function scoreProductionReadiness(input: ProductionReadinessInput = {}): ProductionReadinessReport {
  if (!hasUsableInput(input)) return insufficientInputReport();

  const evidenceReport = resolveEvidenceReport(input);
  const findings = input.findings ? supportedFindings(input.findings) : evidenceReport.findings;
  const assessments = initialAssessments();

  for (const finding of findings) {
    const findingDimensions = dimensionsForFinding(finding);
    const penalty = penaltyForFinding(finding);

    for (const dimension of findingDimensions) {
      const assessment = assessments[dimension];
      assessment.score = clampScore(assessment.score - penalty);
      assessment.reasons.push(reasonFromFinding(finding, dimension));
    }
  }

  const subscores = toSubscores(assessments);
  const blockers = blockerReasons(assessments);
  const warnings = warningReasons(assessments, blockers);
  const strengths = strengthReasons(subscores);
  const score = applyReleaseBlockerCaps(weightedScore(subscores, normalizeWeights(input.weights)), blockers);
  const status = statusFor(score, blockers, warnings);

  return {
    score,
    status,
    subscores,
    blockers,
    warnings,
    strengths,
    evidenceSummary: {
      supportedFindings: findings.length,
      discardedFindings: evidenceReport.discarded.length + discardedProvidedFindings(input.findings),
      affectedFiles: unique([...evidenceReport.summary.affectedFiles, ...findings.flatMap((finding) => finding.affectedFiles)]).sort(),
      affectedRoutes: unique([...evidenceReport.summary.affectedRoutes, ...findings.flatMap((finding) => finding.affectedRoutes)]).sort(),
      executionPathCount: executionPathCount(input, findings),
    },
    scoringModel: {
      engine: "ventureos-production-readiness-score",
      version: "1.0.0",
      basis: input.findings ? "provided-traceable-findings" : "traceable-evidence",
      note: "Readiness is reduced only by traceable Evidence Engine findings. Unsupported claims are not scored.",
    },
  };
}

export function scoreProductionReadinessFromSource(source: string): ProductionReadinessReport {
  return scoreProductionReadiness({ source });
}

export const calculateProductionReadiness = scoreProductionReadiness;

export function buildProductionReadinessScoreFromReadiness(readiness: ProductionReadinessReport): ProductionReadinessScoreReport {
  return buildProductionReadinessScore({
    securityScore: Math.round(readiness.subscores.Authentication * 0.45 + readiness.subscores.Authorization * 0.45 + readiness.subscores["Data Integrity"] * 0.1),
    scalabilityScore: Math.round(readiness.subscores["Operational Stability"] * 0.65 + readiness.subscores["Failure Recovery"] * 0.35),
    deploymentSafetyScore: readiness.subscores["Deployment Safety"],
    paymentReliabilityScore: readiness.subscores["Billing Reliability"],
    blockers: readiness.blockers.map((reason) => reason.title),
    warnings: readiness.warnings.map((reason) => reason.title),
  });
}

export function buildProductionReadinessScore(input: ProductionReadinessScoreInput): ProductionReadinessScoreReport {
  const scores = {
    securityScore: clampScore(input.securityScore),
    scalabilityScore: clampScore(input.scalabilityScore),
    deploymentSafetyScore: clampScore(input.deploymentSafetyScore),
    paymentReliabilityScore: clampScore(input.paymentReliabilityScore),
  };
  const blockers = unique((input.blockers || []).map(cleanReason).filter(Boolean)).slice(0, 12);
  const warnings = unique((input.warnings || []).map(cleanReason).filter(Boolean)).slice(0, 12);
  const finalReadinessScore = clampScore(Math.round(
    scores.securityScore * 0.34 +
      scores.scalabilityScore * 0.2 +
      scores.deploymentSafetyScore * 0.26 +
      scores.paymentReliabilityScore * 0.2,
  ));
  const launchRecommendation = recommendationFor(scores, finalReadinessScore, blockers);

  return {
    engine: "ventureos-production-readiness-score-v2",
    version: "1.0.0",
    generatedAt: input.generatedAt || new Date().toISOString(),
    scores,
    finalReadinessScore,
    launchRecommendation,
    rationale: rationaleFor(launchRecommendation, finalReadinessScore, scores, blockers, warnings),
    blockers,
    warnings,
  };
}

function resolveEvidenceReport(input: ProductionReadinessInput): EvidenceEngineResult {
  if (input.evidenceReport) return input.evidenceReport;
  if (input.findings) return evidenceReportFromFindings(input.findings);
  return buildEvidenceReport({
    files: input.files,
    source: input.source,
    graph: input.graph,
    executionPaths: input.executionPaths,
    findings: input.rawFindings,
  });
}

function hasUsableInput(input: ProductionReadinessInput) {
  return Boolean(
    input.evidenceReport ||
      input.findings ||
      input.rawFindings?.length ||
      input.files?.length ||
      input.source?.trim() ||
      input.graph ||
      input.executionPaths?.length,
  );
}

function insufficientInputReport(): ProductionReadinessReport {
  const subscores = Object.fromEntries(dimensions.map((dimension) => [dimension, 70])) as ReadinessSubscores;
  const warnings: ReadinessReason[] = dimensions.map((dimension) => ({
    dimension,
    title: "No code or traceable evidence was supplied for readiness scoring",
    affectedFiles: [],
    affectedRoutes: [],
    evidenceCount: 0,
    impact: "The engine cannot prove this readiness dimension is production safe without source, execution paths, or Evidence Engine output.",
  }));

  return {
    score: 70,
    status: "Needs Review",
    subscores,
    blockers: [],
    warnings,
    strengths: [],
    evidenceSummary: {
      supportedFindings: 0,
      discardedFindings: 0,
      affectedFiles: [],
      affectedRoutes: [],
      executionPathCount: 0,
    },
    scoringModel: {
      engine: "ventureos-production-readiness-score",
      version: "1.0.0",
      basis: "insufficient-input",
      note: "No unsupported production claims were scored because no traceable input was supplied.",
    },
  };
}

function evidenceReportFromFindings(findings: TraceableFinding[]): EvidenceEngineResult {
  const supported = supportedFindings(findings);
  const discarded = findings
    .filter((finding) => !isSupportedFinding(finding))
    .map((finding) => ({ id: finding.id, title: finding.title, reason: "finding is missing traceable evidence" }));

  return {
    findings: supported,
    discarded,
    summary: {
      supportedFindings: supported.length,
      discardedFindings: discarded.length,
      affectedFiles: unique(supported.flatMap((finding) => finding.affectedFiles)).sort(),
      affectedRoutes: unique(supported.flatMap((finding) => finding.affectedRoutes)).sort(),
    },
  };
}

function initialAssessments(): Record<ReadinessSubscoreName, DimensionAssessment> {
  const assessments = {} as Record<ReadinessSubscoreName, DimensionAssessment>;
  for (const dimension of dimensions) assessments[dimension] = { score: 100, reasons: [] };
  return assessments;
}

function supportedFindings(findings: TraceableFinding[]) {
  return findings.filter(isSupportedFinding);
}

function isSupportedFinding(finding: TraceableFinding) {
  return Boolean(
    finding?.traceability?.supported &&
      finding.title?.trim() &&
      finding.businessImpact?.trim() &&
      finding.fixRecommendation?.trim() &&
      finding.evidence?.length &&
      (finding.affectedFiles.length || finding.affectedRoutes.length || finding.executionPath),
  );
}

function discardedProvidedFindings(findings: TraceableFinding[] | undefined) {
  if (!findings) return 0;
  return findings.filter((finding) => !isSupportedFinding(finding)).length;
}

function penaltyForFinding(finding: TraceableFinding) {
  const base = severityPenalty[finding.severity] || severityPenalty.low;
  const confidenceMultiplier = clamp(finding.confidence, 75, 100) / 100;
  const evidenceMultiplier = finding.evidence.length >= 3 ? 1.08 : 1;
  const categoryMultiplier = finding.category === "TRUST FAILURE" ? 1.12 : finding.category === "DEPLOYMENT FAILURE" ? 1.05 : 1;
  return Math.round(base * confidenceMultiplier * evidenceMultiplier * categoryMultiplier);
}

function dimensionsForFinding(finding: TraceableFinding): ReadinessSubscoreName[] {
  const text = findingText(finding);
  const matches = new Set<ReadinessSubscoreName>();

  if (finding.category === "TRUST FAILURE") {
    matches.add("Authentication");
    matches.add("Authorization");
  }
  if (finding.category === "STATE FAILURE") {
    matches.add("Data Integrity");
    matches.add("Failure Recovery");
  }
  if (finding.category === "BROKEN USER FLOW") matches.add("Operational Stability");
  if (finding.category === "AI GENERATED CODE FAILURE") matches.add("Operational Stability");
  if (finding.category === "DEPLOYMENT FAILURE") {
    matches.add("Deployment Safety");
    matches.add("Operational Stability");
  }

  if (/\b(auth|session|login|logout|anonymous|unauthenticated|credential|token|cookie)\b/.test(text)) matches.add("Authentication");
  if (/\b(authorization|owner|ownership|tenant|org|role|permission|admin|userId|actorId|cross-user|forbidden)\b/.test(text)) {
    matches.add("Authorization");
  }
  if (/\b(database|db|prisma|sql|persist|persistence|save|write|migration|schema|data loss|stale)\b/.test(text)) {
    matches.add("Data Integrity");
  }
  if (/\b(deploy|deployment|env|environment|worker|queue|bullmq|redis|vercel|build|localhost|lockfile|serverless)\b/.test(text)) {
    matches.add("Deployment Safety");
    matches.add("Operational Stability");
  }
  if (/\b(billing|stripe|checkout|payment|subscription|customer portal|webhook|invoice|entitlement)\b/.test(text)) {
    matches.add("Billing Reliability");
  }
  if (/\b(runtime|api|route|endpoint|provider|integration|service|job|processor|availability|rate limit|timeout)\b/.test(text)) {
    matches.add("Operational Stability");
  }
  if (/\b(error|failure|catch|retry|rollback|loading|success|response\.ok|recovery|fallback|failed)\b/.test(text)) {
    matches.add("Failure Recovery");
  }

  if (!matches.size) matches.add("Operational Stability");
  return [...matches];
}

function findingText(finding: TraceableFinding) {
  return [
    finding.title,
    finding.category,
    finding.businessImpact,
    finding.fixRecommendation,
    finding.affectedFiles.join(" "),
    finding.affectedRoutes.join(" "),
    finding.evidence.map((item) => `${item.detail} ${item.codeSnippet || ""}`).join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

function reasonFromFinding(finding: TraceableFinding, dimension: ReadinessSubscoreName): ReadinessReason {
  return {
    dimension,
    findingId: finding.id,
    title: finding.title,
    severity: finding.severity,
    confidence: finding.confidence,
    affectedFiles: finding.affectedFiles,
    affectedRoutes: finding.affectedRoutes,
    evidenceCount: finding.evidence.length,
    impact: finding.businessImpact,
    fixRecommendation: finding.fixRecommendation,
  };
}

function toSubscores(assessments: Record<ReadinessSubscoreName, DimensionAssessment>): ReadinessSubscores {
  return Object.fromEntries(dimensions.map((dimension) => [dimension, assessments[dimension].score])) as ReadinessSubscores;
}

function blockerReasons(assessments: Record<ReadinessSubscoreName, DimensionAssessment>) {
  const blockers = dimensions.flatMap((dimension) =>
    assessments[dimension].reasons.filter((reason) => {
      if (reason.severity === "critical") return true;
      if (reason.severity !== "high") return false;
      return dimension !== "Operational Stability" && dimension !== "Failure Recovery";
    }),
  );
  return dedupeReasons(blockers);
}

function warningReasons(assessments: Record<ReadinessSubscoreName, DimensionAssessment>, blockers: ReadinessReason[]) {
  const blockerKeys = new Set(blockers.map(reasonKey));
  const warnings = dimensions.flatMap((dimension) =>
    assessments[dimension].reasons.filter((reason) => {
      if (blockerKeys.has(reasonKey(reason))) return false;
      return reason.severity === "high" || reason.severity === "medium";
    }),
  );
  return dedupeReasons(warnings);
}

function strengthReasons(subscores: ReadinessSubscores) {
  return dimensions
    .filter((dimension) => subscores[dimension] >= 90)
    .map((dimension) => ({
      dimension,
      title: "No supported findings lowered this readiness dimension below 90",
      affectedFiles: [],
      affectedRoutes: [],
      evidenceCount: 0,
      impact: "The current Evidence Engine output did not prove a high-impact failure in this dimension.",
    }));
}

function statusFor(score: number, blockers: ReadinessReason[], warnings: ReadinessReason[]): ReadinessStatus {
  const hasCriticalBlocker = blockers.some((reason) => reason.severity === "critical");
  const highBlockerCount = blockers.filter((reason) => reason.severity === "high").length;

  if (hasCriticalBlocker || score < 40) return "Not Launch Ready";
  if (highBlockerCount > 0 || score < 65) return "High Risk";
  if (warnings.length > 0 || score < 85) return "Needs Review";
  return "Production Ready";
}

function weightedScore(subscores: ReadinessSubscores, weights: ReadinessSubscores) {
  const totalWeight = dimensions.reduce((sum, dimension) => sum + weights[dimension], 0) || 1;
  const score = dimensions.reduce((sum, dimension) => sum + subscores[dimension] * weights[dimension], 0) / totalWeight;
  return clampScore(Math.round(score));
}

function applyReleaseBlockerCaps(score: number, blockers: ReadinessReason[]) {
  if (blockers.some((reason) => reason.severity === "critical")) return Math.min(score, 39);
  const highBlockerCount = blockers.filter((reason) => reason.severity === "high").length;
  if (highBlockerCount >= 2) return Math.min(score, 64);
  if (highBlockerCount === 1) return Math.min(score, 74);
  return score;
}

function normalizeWeights(overrides: Partial<ReadinessSubscores> | undefined): ReadinessSubscores {
  if (!overrides) return defaultWeights;
  return Object.fromEntries(dimensions.map((dimension) => [dimension, overrides[dimension] ?? defaultWeights[dimension]])) as ReadinessSubscores;
}

function executionPathCount(input: ProductionReadinessInput, findings: TraceableFinding[]) {
  if (input.executionPaths) return input.executionPaths.length;
  if (input.graph) return input.graph.paths.length;
  if (input.files?.length) return buildExecutionGraph({ files: input.files }).paths.length;
  if (input.source?.trim()) return buildExecutionGraph({ source: input.source }).paths.length;
  return unique(findings.map((finding) => finding.executionPath?.id).filter(Boolean)).length;
}

function dedupeReasons(reasons: ReadinessReason[]) {
  const seen = new Set<string>();
  const deduped: ReadinessReason[] = [];
  for (const reason of reasons) {
    const key = reasonKey(reason);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(reason);
  }
  return deduped;
}

function reasonKey(reason: ReadinessReason) {
  return reason.findingId || `${reason.title}:${reason.affectedFiles.join(",")}:${reason.affectedRoutes.join(",")}`;
}

function recommendationFor(
  scores: ProductionReadinessScoreReport["scores"],
  finalReadinessScore: number,
  blockers: string[],
): LaunchRecommendation {
  if (
    blockers.length >= 3 ||
    finalReadinessScore < 50 ||
    scores.securityScore < 50 ||
    scores.deploymentSafetyScore < 45 ||
    scores.paymentReliabilityScore < 50
  ) {
    return "DO NOT LAUNCH";
  }
  if (
    blockers.length > 0 ||
    finalReadinessScore < 85 ||
    scores.securityScore < 75 ||
    scores.scalabilityScore < 70 ||
    scores.deploymentSafetyScore < 75 ||
    scores.paymentReliabilityScore < 75
  ) {
    return "RISKY";
  }
  return "SAFE";
}

function rationaleFor(
  recommendation: LaunchRecommendation,
  finalReadinessScore: number,
  scores: ProductionReadinessScoreReport["scores"],
  blockers: string[],
  warnings: string[],
) {
  const weakest = weakestScore(scores);
  if (recommendation === "SAFE") {
    return `SAFE: final readiness is ${finalReadinessScore}/100 and all required launch dimensions are at or above production thresholds.`;
  }
  if (recommendation === "DO NOT LAUNCH") {
    return `DO NOT LAUNCH: final readiness is ${finalReadinessScore}/100, weakest dimension is ${weakest.label} at ${weakest.score}/100, and ${blockers.length} blocker${blockers.length === 1 ? "" : "s"} remain.`;
  }
  return `RISKY: final readiness is ${finalReadinessScore}/100, weakest dimension is ${weakest.label} at ${weakest.score}/100, with ${blockers.length} blocker${blockers.length === 1 ? "" : "s"} and ${warnings.length} warning${warnings.length === 1 ? "" : "s"}.`;
}

function weakestScore(scores: ProductionReadinessScoreReport["scores"]) {
  return [
    { label: "security", score: scores.securityScore },
    { label: "scalability", score: scores.scalabilityScore },
    { label: "deployment safety", score: scores.deploymentSafetyScore },
    { label: "payment reliability", score: scores.paymentReliabilityScore },
  ].sort((a, b) => a.score - b.score)[0] || { label: "unknown", score: 0 };
}

function cleanReason(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 220);
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function clampScore(score: number) {
  return clamp(score, 0, 100);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
