import type { EvidenceEngineResult, TraceableFinding } from "@/lib/intelligence/evidence-engine";
import type { FailureSimulationReport } from "@/lib/intelligence/failure-simulator";
import type { ProductionReadinessReport, ReadinessReason } from "@/lib/intelligence/readiness-score";
import type { FailureIntelligenceReport, FailurePrediction } from "@/lib/services/failureIntelligence";
import type { SeverityBreakdown } from "@/lib/services/intelligenceAnalysis";

export type LaunchVerdictValue = "SAFE TO LAUNCH" | "HIGH RISK" | "DO NOT DEPLOY";

export type LaunchVerdictEvidence = {
  source: "production-readiness" | "evidence-engine" | "failure-intelligence" | "failure-simulation" | "scan-summary";
  title: string;
  severity?: "critical" | "high" | "medium" | "low";
  confidence?: number;
  detail: string;
  affectedFiles: string[];
  affectedRoutes: string[];
};

export type LaunchVerdict = {
  title: "LAUNCH VERDICT";
  verdict: LaunchVerdictValue;
  confidence: number;
  generatedAt: string;
  summary: string;
  reasons: string[];
  evidence: LaunchVerdictEvidence[];
  blockers: LaunchVerdictEvidence[];
  warnings: LaunchVerdictEvidence[];
  nextAction: string;
  proofGate: {
    supportedEvidenceCount: number;
    executionPathsAnalyzed: number;
    unsupportedClaimsIgnored: true;
    safeLaunchRequiresEvidence: true;
  };
};

export type LaunchVerdictInput = {
  productionReadiness: ProductionReadinessReport;
  evidenceReport: EvidenceEngineResult;
  failureIntelligence: FailureIntelligenceReport;
  predictedFailureScenarios: FailurePrediction[];
  failureSimulations: FailureSimulationReport;
  severityBreakdown: SeverityBreakdown;
};

export function buildLaunchVerdict(input: LaunchVerdictInput): LaunchVerdict {
  const evidence = dedupeEvidence([
    ...input.productionReadiness.blockers.slice(0, 8).map(evidenceFromReadiness("production-readiness")),
    ...input.productionReadiness.warnings.slice(0, 6).map(evidenceFromReadiness("production-readiness")),
    ...input.evidenceReport.findings.slice(0, 8).map(evidenceFromFinding),
    ...input.predictedFailureScenarios.slice(0, 5).map(evidenceFromPrediction),
    ...input.failureSimulations.simulations.slice(0, 5).map(evidenceFromSimulation),
    scanSummaryEvidence(input),
  ]);

  const blockers = dedupeEvidenceByTitle(evidence.filter(isLaunchBlocker));
  const warnings = dedupeEvidenceByTitle(evidence.filter((item) => !isLaunchBlocker(item) && (item.severity === "high" || item.severity === "medium")));
  const supportedEvidenceCount = evidence.length;
  const executionPathsAnalyzed = input.productionReadiness.evidenceSummary.executionPathCount || input.failureSimulations.coverage.executionPathsAnalyzed;
  const verdict = verdictFor({ input, blockers, warnings, supportedEvidenceCount, executionPathsAnalyzed });
  const confidence = confidenceFor({ input, verdict, blockers, warnings, supportedEvidenceCount, executionPathsAnalyzed });

  return {
    title: "LAUNCH VERDICT",
    verdict,
    confidence,
    generatedAt: new Date().toISOString(),
    summary: summaryFor(verdict, blockers, warnings, input.productionReadiness),
    reasons: reasonsFor(verdict, blockers, warnings, input),
    evidence: evidence.slice(0, 16),
    blockers: blockers.slice(0, 8),
    warnings: warnings.slice(0, 8),
    nextAction: nextActionFor(verdict),
    proofGate: {
      supportedEvidenceCount,
      executionPathsAnalyzed,
      unsupportedClaimsIgnored: true,
      safeLaunchRequiresEvidence: true,
    },
  };
}

function verdictFor(context: {
  input: LaunchVerdictInput;
  blockers: LaunchVerdictEvidence[];
  warnings: LaunchVerdictEvidence[];
  supportedEvidenceCount: number;
  executionPathsAnalyzed: number;
}): LaunchVerdictValue {
  const { input, blockers, warnings, supportedEvidenceCount, executionPathsAnalyzed } = context;
  if (blockers.length > 0) return "DO NOT DEPLOY";
  if (input.productionReadiness.status === "Not Launch Ready") return "DO NOT DEPLOY";
  if (input.failureIntelligence.launchDecision === "block") return "DO NOT DEPLOY";
  if (input.severityBreakdown.critical > 0) return "DO NOT DEPLOY";

  if (input.productionReadiness.status === "High Risk") return "HIGH RISK";
  if (input.failureIntelligence.launchDecision === "review") return "HIGH RISK";
  if (input.severityBreakdown.high > 0 || warnings.length > 0) return "HIGH RISK";
  if (input.productionReadiness.score < 85) return "HIGH RISK";
  if (executionPathsAnalyzed === 0) return "HIGH RISK";
  if (supportedEvidenceCount === 0 && input.productionReadiness.scoringModel.basis === "insufficient-input") return "HIGH RISK";

  return "SAFE TO LAUNCH";
}

function confidenceFor(context: {
  input: LaunchVerdictInput;
  verdict: LaunchVerdictValue;
  blockers: LaunchVerdictEvidence[];
  warnings: LaunchVerdictEvidence[];
  supportedEvidenceCount: number;
  executionPathsAnalyzed: number;
}) {
  const evidenceConfidence = [...context.blockers, ...context.warnings]
    .map((item) => item.confidence)
    .filter((value): value is number => typeof value === "number");
  if (evidenceConfidence.length) {
    return clamp(Math.round(evidenceConfidence.reduce((sum, value) => sum + value, 0) / evidenceConfidence.length));
  }

  if (context.verdict === "SAFE TO LAUNCH") {
    const coverageScore = Math.min(96, 82 + Math.min(10, context.executionPathsAnalyzed * 2));
    return clamp(Math.round((coverageScore + context.input.productionReadiness.score) / 2));
  }

  return context.supportedEvidenceCount > 0 ? 82 : 70;
}

function evidenceFromReadiness(source: LaunchVerdictEvidence["source"]) {
  return (reason: ReadinessReason): LaunchVerdictEvidence => ({
    source,
    title: reason.title,
    severity: reason.severity,
    confidence: reason.confidence,
    detail: reason.impact,
    affectedFiles: reason.affectedFiles,
    affectedRoutes: reason.affectedRoutes,
  });
}

function evidenceFromFinding(finding: TraceableFinding): LaunchVerdictEvidence {
  return {
    source: "evidence-engine",
    title: finding.title,
    severity: finding.severity,
    confidence: finding.confidence,
    detail: finding.businessImpact,
    affectedFiles: finding.affectedFiles,
    affectedRoutes: finding.affectedRoutes,
  };
}

function evidenceFromPrediction(prediction: FailurePrediction): LaunchVerdictEvidence {
  return {
    source: "failure-intelligence",
    title: prediction.title,
    severity: prediction.severity,
    confidence: prediction.confidenceScore,
    detail: prediction.businessImpact,
    affectedFiles: prediction.evidenceChain.map((item) => item.filePath).filter((item): item is string => Boolean(item)),
    affectedRoutes: [],
  };
}

function evidenceFromSimulation(simulation: FailureSimulationReport["simulations"][number]): LaunchVerdictEvidence {
  return {
    source: "failure-simulation",
    title: simulation.whatBreaks,
    severity: simulation.severity,
    confidence: simulation.confidence,
    detail: `${simulation.actor}: ${simulation.why}`,
    affectedFiles: simulation.evidence.map((item) => item.filePath).filter((item): item is string => Boolean(item)),
    affectedRoutes: [simulation.apiRoute, simulation.entryPoint].filter((item): item is string => Boolean(item)),
  };
}

function scanSummaryEvidence(input: LaunchVerdictInput): LaunchVerdictEvidence {
  return {
    source: "scan-summary",
    title: "Production readiness scan summary",
    severity: input.productionReadiness.status === "Not Launch Ready" ? "critical" : input.productionReadiness.status === "High Risk" ? "high" : input.productionReadiness.status === "Needs Review" ? "medium" : "low",
    confidence: input.productionReadiness.score,
    detail: `Readiness ${input.productionReadiness.score}/100, status ${input.productionReadiness.status}, supported findings ${input.evidenceReport.summary.supportedFindings}.`,
    affectedFiles: input.evidenceReport.summary.affectedFiles,
    affectedRoutes: input.evidenceReport.summary.affectedRoutes,
  };
}

function isLaunchBlocker(item: LaunchVerdictEvidence) {
  if (item.source === "scan-summary") return false;
  if (item.severity === "critical") return true;
  const text = `${item.title} ${item.detail}`.toLowerCase();
  return item.severity === "high" && /\b(auth|session|owner|tenant|role|admin|billing|stripe|payment|deploy|deployment|data loss|database|missing backend|phantom api)\b/.test(text);
}

function summaryFor(
  verdict: LaunchVerdictValue,
  blockers: LaunchVerdictEvidence[],
  warnings: LaunchVerdictEvidence[],
  readiness: ProductionReadinessReport,
) {
  if (verdict === "DO NOT DEPLOY") {
    const top = blockers[0];
    return top ? `DO NOT DEPLOY: ${top.title} is supported by ${top.source} evidence.` : "DO NOT DEPLOY: launch-blocking evidence was found.";
  }
  if (verdict === "HIGH RISK") {
    const top = warnings[0];
    return top ? `HIGH RISK: ${top.title} needs review before launch.` : `HIGH RISK: readiness is ${readiness.score}/100.`;
  }
  return `SAFE TO LAUNCH: readiness is ${readiness.score}/100 and no launch-blocking evidence was found.`;
}

function reasonsFor(
  verdict: LaunchVerdictValue,
  blockers: LaunchVerdictEvidence[],
  warnings: LaunchVerdictEvidence[],
  input: LaunchVerdictInput,
) {
  if (verdict === "DO NOT DEPLOY") {
    return (blockers.length ? blockers : [scanSummaryEvidence(input)]).slice(0, 5).map((item) => `${item.title}: ${item.detail}`);
  }
  if (verdict === "HIGH RISK") {
    const items = warnings.length ? warnings : [scanSummaryEvidence(input)];
    return items.slice(0, 5).map((item) => `${item.title}: ${item.detail}`);
  }
  return [
    `Production readiness is ${input.productionReadiness.score}/100.`,
    `${input.productionReadiness.evidenceSummary.executionPathCount} execution path${input.productionReadiness.evidenceSummary.executionPathCount === 1 ? "" : "s"} analyzed.`,
    "No critical or high launch-blocking evidence passed the proof gate.",
  ];
}

function nextActionFor(verdict: LaunchVerdictValue) {
  if (verdict === "DO NOT DEPLOY") return "Block deployment and fix the listed launch blockers first.";
  if (verdict === "HIGH RISK") return "Review and fix the listed risks before replacing the live app.";
  return "Proceed only after normal release checks, environment validation, and rollback readiness are complete.";
}

function dedupeEvidence(items: LaunchVerdictEvidence[]) {
  const seen = new Set<string>();
  const output: LaunchVerdictEvidence[] = [];
  for (const item of items) {
    const key = `${item.title}:${item.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({
      ...item,
      affectedFiles: unique(item.affectedFiles),
      affectedRoutes: unique(item.affectedRoutes),
    });
  }
  return output;
}

function dedupeEvidenceByTitle(items: LaunchVerdictEvidence[]) {
  const seen = new Set<string>();
  const output: LaunchVerdictEvidence[] = [];
  for (const item of items) {
    const key = item.title;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}
