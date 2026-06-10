import { compareHistoricalScans, type HistoricalDiffItem } from "@/lib/evolution/diffEngine";
import type { ProjectScanFinding, ProjectScanSnapshot } from "@/lib/evolution/projectHistory";
import { verifyRecommendedFixes, type FixVerificationResult } from "@/lib/evolution/verificationEngine";

export type ClosedLoopStage = "NEEDS_FIRST_SCAN" | "READY_FOR_FIXES" | "IMPROVING" | "STALLED" | "REGRESSED";

export type ClosedLoopScore = {
  scanId: string;
  scanRefId: string | null;
  score: number;
  findingsCount: number;
  criticalFindingsCount: number;
  scannedAt: string;
};

export type ClosedLoopBlocker = {
  issueId: string;
  title: string;
  severity: string;
  status: "NEW" | "RECURRING" | "REGRESSED" | "FAILED_FIX" | "CURRENT";
  filePath?: string;
  evidence?: string;
  recommendation?: string;
  confidence: number;
};

export type ClosedLoopReport = {
  engine: "ventureos-closed-loop";
  version: "1.0.0";
  generatedAt: string;
  projectId: string;
  workflow: ["SCAN", "FIX", "RE_SCAN", "IMPROVEMENT_TRACKING"];
  stage: ClosedLoopStage;
  before: ClosedLoopScore | null;
  after: ClosedLoopScore | null;
  beforeScore: number | null;
  afterScore: number | null;
  scoreDelta: number;
  improvementSummary: string;
  remainingBlockers: ClosedLoopBlocker[];
  improvementMetrics: {
    fixedIssues: number;
    newIssues: number;
    recurringIssues: number;
    verifiedFixes: number;
    partialFixes: number;
    failedFixes: number;
    criticalRemaining: number;
    highRemaining: number;
  };
  fixedIssues: HistoricalDiffItem[];
  newIssues: HistoricalDiffItem[];
  recurringIssues: HistoricalDiffItem[];
  verifiedFixes: FixVerificationResult[];
  partialFixes: FixVerificationResult[];
  failedFixes: FixVerificationResult[];
  nextActions: string[];
  returnLoop: {
    goal: "increase_user_return_rate";
    progressMessage: string;
    nextScanPrompt: string;
    returnTrigger: string;
  };
  confidence: number;
};

export type ClosedLoopInput = {
  projectId: string;
  snapshots: ProjectScanSnapshot[];
};

export function buildClosedLoopReport(input: ClosedLoopInput): ClosedLoopReport {
  const diff = compareHistoricalScans({ projectId: input.projectId, snapshots: input.snapshots });
  const verification = verifyRecommendedFixes({
    previousScan: diff.previousScan,
    currentScan: diff.currentScan,
  });
  const stage = stageFor(diff.currentScan, diff.previousScan, diff.delta, diff.issuesFixed.length, diff.issuesIntroduced.length, verification.failedFixes.length);
  const remainingBlockers = blockersFor(diff.currentScan, diff.issuesIntroduced, diff.recurringIssues, diff.severityChanges, verification.failedFixes);
  const criticalRemaining = remainingBlockers.filter((item) => item.severity.toLowerCase() === "critical").length;
  const highRemaining = remainingBlockers.filter((item) => item.severity.toLowerCase() === "high").length;

  return {
    engine: "ventureos-closed-loop",
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    projectId: input.projectId,
    workflow: ["SCAN", "FIX", "RE_SCAN", "IMPROVEMENT_TRACKING"],
    stage,
    before: scoreFor(diff.previousScan),
    after: scoreFor(diff.currentScan),
    beforeScore: diff.previousReadiness,
    afterScore: diff.currentReadiness,
    scoreDelta: diff.delta,
    improvementSummary: summaryFor(stage, diff.delta, diff.issuesFixed.length, diff.issuesIntroduced.length, remainingBlockers.length),
    remainingBlockers,
    improvementMetrics: {
      fixedIssues: diff.issuesFixed.length,
      newIssues: diff.issuesIntroduced.length,
      recurringIssues: diff.recurringIssues.length,
      verifiedFixes: verification.verifiedFixes.length,
      partialFixes: verification.partialFixes.length,
      failedFixes: verification.failedFixes.length,
      criticalRemaining,
      highRemaining,
    },
    fixedIssues: diff.issuesFixed,
    newIssues: diff.issuesIntroduced,
    recurringIssues: diff.recurringIssues,
    verifiedFixes: verification.verifiedFixes,
    partialFixes: verification.partialFixes,
    failedFixes: verification.failedFixes,
    nextActions: nextActionsFor(stage, remainingBlockers, verification.failedFixes.length, diff.issuesIntroduced.length),
    returnLoop: returnLoopFor(stage, diff.currentReadiness, diff.delta, remainingBlockers.length),
    confidence: confidenceFor(diff.confidence, verification.confidence, diff.currentScan, diff.previousScan),
  };
}

function scoreFor(scan: ProjectScanSnapshot | null): ClosedLoopScore | null {
  if (!scan) return null;
  return {
    scanId: scan.id,
    scanRefId: scan.scanRefId,
    score: scan.readinessScore,
    findingsCount: scan.findingsCount,
    criticalFindingsCount: scan.criticalFindingsCount,
    scannedAt: scan.scannedAt,
  };
}

function stageFor(
  current: ProjectScanSnapshot | null,
  previous: ProjectScanSnapshot | null,
  delta: number,
  fixedCount: number,
  newCount: number,
  failedFixCount: number,
): ClosedLoopStage {
  if (!current) return "NEEDS_FIRST_SCAN";
  if (!previous) return "READY_FOR_FIXES";
  if (delta > 0 || fixedCount > 0) return "IMPROVING";
  if (delta < 0 || newCount > 0 || failedFixCount > 0) return "REGRESSED";
  return "STALLED";
}

function blockersFor(
  currentScan: ProjectScanSnapshot | null,
  introduced: HistoricalDiffItem[],
  recurring: HistoricalDiffItem[],
  severityChanges: HistoricalDiffItem[],
  failedFixes: FixVerificationResult[],
): ClosedLoopBlocker[] {
  if (!currentScan) return [];
  const currentByFingerprint = new Map(currentScan.findings.map((finding) => [finding.fingerprint, finding]));
  const output = new Map<string, ClosedLoopBlocker>();

  for (const item of introduced) {
    const current = currentByFingerprint.get(item.issueId);
    if (current) output.set(item.issueId, blockerFromFinding(current, "NEW", 0.9));
  }
  for (const item of recurring) {
    const current = currentByFingerprint.get(item.issueId);
    if (current) output.set(item.issueId, blockerFromFinding(current, "RECURRING", 0.9));
  }
  for (const item of severityChanges.filter((change) => change.status === "REGRESSED")) {
    const current = currentByFingerprint.get(item.issueId);
    if (current) output.set(item.issueId, blockerFromFinding(current, "REGRESSED", 0.9));
  }
  for (const item of failedFixes) {
    const current = currentByFingerprint.get(item.issueId);
    if (current) output.set(item.issueId, blockerFromFinding(current, "FAILED_FIX", item.confidence));
  }

  if (output.size === 0) {
    for (const finding of currentScan.findings.filter((item) => severityRank(item.severity) >= 3).slice(0, 8)) {
      output.set(finding.fingerprint, blockerFromFinding(finding, "CURRENT", 0.82));
    }
  }

  return [...output.values()].sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.confidence - a.confidence || a.title.localeCompare(b.title)).slice(0, 12);
}

function blockerFromFinding(finding: ProjectScanFinding, status: ClosedLoopBlocker["status"], confidence: number): ClosedLoopBlocker {
  return {
    issueId: finding.fingerprint,
    title: finding.title,
    severity: finding.severity,
    status,
    filePath: finding.filePath,
    evidence: finding.evidence,
    recommendation: finding.fixSuggestion,
    confidence: boundedConfidence(confidence),
  };
}

function summaryFor(stage: ClosedLoopStage, delta: number, fixedCount: number, newCount: number, blockerCount: number) {
  if (stage === "NEEDS_FIRST_SCAN") return "No scan history exists yet. Run the first scan to establish a baseline score.";
  if (stage === "READY_FOR_FIXES") return "Baseline scan captured. Apply the recommended fixes, then re-scan to measure improvement.";
  if (stage === "IMPROVING") return `Readiness improved by ${Math.max(0, delta)} point${Math.abs(delta) === 1 ? "" : "s"} with ${fixedCount} fixed issue${fixedCount === 1 ? "" : "s"}. ${blockerCount} blocker${blockerCount === 1 ? "" : "s"} remain.`;
  if (stage === "REGRESSED") return `Latest scan regressed by ${Math.abs(Math.min(0, delta))} point${Math.abs(delta) === 1 ? "" : "s"} with ${newCount} new issue${newCount === 1 ? "" : "s"}.`;
  return `Latest scan is stable. ${blockerCount} blocker${blockerCount === 1 ? "" : "s"} still need action before the next re-scan.`;
}

function nextActionsFor(stage: ClosedLoopStage, blockers: ClosedLoopBlocker[], failedFixCount: number, newIssueCount: number) {
  if (stage === "NEEDS_FIRST_SCAN") return ["Run a baseline scan for this project."];
  if (stage === "READY_FOR_FIXES") return ["Apply the top recommended fixes from the baseline scan.", "Run a new scan after fixes are committed."];
  const actions: string[] = [];
  if (failedFixCount > 0) actions.push("Re-open failed fixes and compare the affected files against the recommended fix snippets.");
  if (newIssueCount > 0) actions.push("Review new issues before continuing with lower-severity work.");
  for (const blocker of blockers.slice(0, 3)) {
    actions.push(`Fix ${blocker.severity.toUpperCase()}: ${blocker.title}${blocker.filePath ? ` in ${blocker.filePath}` : ""}.`);
  }
  if (actions.length === 0) actions.push("Run another scan after the next code change to keep the improvement streak visible.");
  return actions;
}

function returnLoopFor(stage: ClosedLoopStage, currentScore: number | null, delta: number, blockerCount: number): ClosedLoopReport["returnLoop"] {
  const score = currentScore ?? 0;
  const progressMessage =
    stage === "IMPROVING"
      ? `Score moved to ${score} (${delta >= 0 ? "+" : ""}${delta}). Keep the loop going with the next blocker.`
      : stage === "READY_FOR_FIXES"
        ? `Baseline score is ${score}. Apply fixes and return for the re-scan result.`
        : stage === "REGRESSED"
          ? `Score is ${score}. ${blockerCount} blocker${blockerCount === 1 ? "" : "s"} need attention before deployment.`
          : stage === "STALLED"
            ? `Score is ${score}. Progress is stable; clear one blocker and re-scan.`
            : "Run the first scan to create a measurable progress loop.";

  return {
    goal: "increase_user_return_rate",
    progressMessage,
    nextScanPrompt: "Apply one recommended fix, commit it, and run another scan to update the before/after score.",
    returnTrigger: "Show the previous score beside the next scan button so users return to beat their last readiness score.",
  };
}

function confidenceFor(diffConfidence: number, verificationConfidence: number, current: ProjectScanSnapshot | null, previous: ProjectScanSnapshot | null) {
  if (!current) return 0;
  if (!previous) return 0.55;
  const verification = verificationConfidence > 0 ? verificationConfidence : 0.72;
  return boundedConfidence(diffConfidence * 0.65 + verification * 0.35);
}

function severityRank(value: string) {
  const clean = value.trim().toLowerCase();
  if (clean === "critical") return 4;
  if (clean === "high") return 3;
  if (clean === "medium") return 2;
  if (clean === "low") return 1;
  return 0;
}

function boundedConfidence(value: number) {
  return Math.max(0, Math.min(0.99, Number(value.toFixed(2))));
}
