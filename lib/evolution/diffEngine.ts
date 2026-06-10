import type { HistoricalEvidence, ProjectHistorySnapshot, ProjectScanFinding, ProjectScanSnapshot } from "@/lib/evolution/projectHistory";
import { historySnapshotsFromScans } from "@/lib/evolution/projectHistory";

export type DiffIssueStatus = "FIXED" | "NEW" | "UNCHANGED" | "IMPROVED" | "REGRESSED";
export type TrendStatus = "STABLE" | "IMPROVING" | "DECLINING" | "VOLATILE";

export type HistoricalDiffItem = {
  issueId: string;
  title: string;
  previousSeverity: string | null;
  currentSeverity: string | null;
  status: DiffIssueStatus;
  evidence: HistoricalEvidence[];
};

export type ReadinessImpact = {
  scoreIncrease: number;
  scoreDecrease: number;
  netChange: number;
};

export type HistoricalScanDiffReport = {
  engine: "ventureos-historical-scan-diff";
  version: "1.0.0";
  generatedAt: string;
  projectId: string;
  currentScan: ProjectScanSnapshot | null;
  previousScan: ProjectScanSnapshot | null;
  currentReadiness: number | null;
  previousReadiness: number | null;
  delta: number;
  issuesFixed: HistoricalDiffItem[];
  issuesIntroduced: HistoricalDiffItem[];
  issuesUnchanged: HistoricalDiffItem[];
  recurringIssues: HistoricalDiffItem[];
  severityChanges: HistoricalDiffItem[];
  trend: TrendStatus;
  confidence: number;
  readinessImpact: ReadinessImpact;
  improvementMetrics: ReadinessImpact;
  topContributingFindings: HistoricalDiffItem[];
  historySnapshots: ProjectHistorySnapshot[];
};

export type HistoricalScanDiffInput = {
  projectId: string;
  snapshots: ProjectScanSnapshot[];
};

export function compareHistoricalScans(input: HistoricalScanDiffInput): HistoricalScanDiffReport {
  const scans = input.snapshots
    .slice()
    .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
  const currentScan = scans[0] || null;
  const previousScan = scans[1] || null;
  const historySnapshots = historySnapshotsFromScans(scans);

  if (!currentScan || !previousScan) {
    return {
      engine: "ventureos-historical-scan-diff",
      version: "1.0.0",
      generatedAt: new Date().toISOString(),
      projectId: input.projectId,
      currentScan,
      previousScan,
      currentReadiness: currentScan?.readinessScore ?? null,
      previousReadiness: previousScan?.readinessScore ?? null,
      delta: 0,
      issuesFixed: [],
      issuesIntroduced: [],
      issuesUnchanged: [],
      recurringIssues: [],
      severityChanges: [],
      trend: "STABLE",
      confidence: currentScan ? 0.5 : 0,
      readinessImpact: { scoreIncrease: 0, scoreDecrease: 0, netChange: 0 },
      improvementMetrics: { scoreIncrease: 0, scoreDecrease: 0, netChange: 0 },
      topContributingFindings: [],
      historySnapshots,
    };
  }

  const previousByFingerprint = findingsByFingerprint(previousScan.findings);
  const currentByFingerprint = findingsByFingerprint(currentScan.findings);
  const issuesFixed: HistoricalDiffItem[] = [];
  const issuesIntroduced: HistoricalDiffItem[] = [];
  const issuesUnchanged: HistoricalDiffItem[] = [];
  const severityChanges: HistoricalDiffItem[] = [];

  for (const previous of previousByFingerprint.values()) {
    const current = currentByFingerprint.get(previous.fingerprint);
    if (!current) {
      issuesFixed.push(issueItem(previous.fingerprint, previous.title, previous.severity, null, "FIXED", [
        evidence("project_scan_history", "Previous finding fingerprint is absent from the latest scan summary.", evidenceConfidence(previous, null, 0.92)),
      ]));
      continue;
    }

    const previousRank = severityRank(previous.severity);
    const currentRank = severityRank(current.severity);
    if (currentRank < previousRank) {
      severityChanges.push(issueItem(previous.fingerprint, current.title || previous.title, previous.severity, current.severity, "IMPROVED", [
        evidence("project_scan_history", "Finding fingerprint remains but latest severity is lower than the previous scan.", evidenceConfidence(previous, current, 0.88)),
      ]));
    } else if (currentRank > previousRank) {
      severityChanges.push(issueItem(previous.fingerprint, current.title || previous.title, previous.severity, current.severity, "REGRESSED", [
        evidence("project_scan_history", "Finding fingerprint remains and latest severity is higher than the previous scan.", evidenceConfidence(previous, current, 0.9)),
      ]));
    } else {
      issuesUnchanged.push(issueItem(previous.fingerprint, current.title || previous.title, previous.severity, current.severity, "UNCHANGED", [
        evidence("project_scan_history", "Finding fingerprint and severity are present in both latest and previous scan summaries.", evidenceConfidence(previous, current, 0.9)),
      ]));
    }
  }

  for (const current of currentByFingerprint.values()) {
    if (previousByFingerprint.has(current.fingerprint)) continue;
    issuesIntroduced.push(issueItem(current.fingerprint, current.title, null, current.severity, "NEW", [
      evidence("project_scan_history", "Latest finding fingerprint was not present in the previous scan summary.", evidenceConfidence(null, current, 0.9)),
    ]));
  }

  const delta = currentScan.readinessScore - previousScan.readinessScore;
  const readinessImpact = readinessImpactFor(delta);
  const sortedFixed = sortItems(issuesFixed);
  const sortedIntroduced = sortItems(issuesIntroduced);
  const sortedUnchanged = sortItems(issuesUnchanged);
  const sortedSeverityChanges = sortItems(severityChanges);
  return {
    engine: "ventureos-historical-scan-diff",
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    projectId: input.projectId,
    currentScan,
    previousScan,
    currentReadiness: currentScan.readinessScore,
    previousReadiness: previousScan.readinessScore,
    delta,
    issuesFixed: sortedFixed,
    issuesIntroduced: sortedIntroduced,
    issuesUnchanged: sortedUnchanged,
    recurringIssues: sortedUnchanged,
    severityChanges: sortedSeverityChanges,
    trend: trendFor(historySnapshots),
    confidence: confidenceFor(currentScan, previousScan, [...issuesFixed, ...issuesIntroduced, ...issuesUnchanged, ...severityChanges]),
    readinessImpact,
    improvementMetrics: readinessImpact,
    topContributingFindings: topContributors(delta, sortedFixed, sortedIntroduced, sortedSeverityChanges),
    historySnapshots,
  };
}

function findingsByFingerprint(findings: ProjectScanFinding[]) {
  return new Map(findings.filter((finding) => finding.fingerprint && finding.title).map((finding) => [finding.fingerprint, finding]));
}

function issueItem(
  issueId: string,
  title: string,
  previousSeverity: string | null,
  currentSeverity: string | null,
  status: DiffIssueStatus,
  itemEvidence: HistoricalEvidence[],
): HistoricalDiffItem {
  return {
    issueId,
    title,
    previousSeverity,
    currentSeverity,
    status,
    evidence: itemEvidence,
  };
}

function evidence(source: string, reason: string, confidence: number): HistoricalEvidence {
  return { source, reason, confidence: boundedConfidence(confidence) };
}

function evidenceConfidence(previous: ProjectScanFinding | null, current: ProjectScanFinding | null, base: number) {
  const hasEvidence = Boolean(previous?.evidence || current?.evidence);
  const hasFile = Boolean(previous?.filePath || current?.filePath);
  const hasFix = Boolean(previous?.fixSuggestion || current?.fixSuggestion);
  return base + (hasEvidence ? 0.03 : 0) + (hasFile ? 0.02 : 0) + (hasFix ? 0.01 : 0);
}

function readinessImpactFor(delta: number): ReadinessImpact {
  return {
    scoreIncrease: delta > 0 ? delta : 0,
    scoreDecrease: delta < 0 ? Math.abs(delta) : 0,
    netChange: delta,
  };
}

function trendFor(history: ProjectHistorySnapshot[]): TrendStatus {
  if (history.length < 2) return "STABLE";
  const scores = history.map((item) => item.readiness);
  const first = scores[0] ?? 0;
  const last = scores[scores.length - 1] ?? first;
  const deltas = scores.slice(1).map((score, index) => score - (scores[index] ?? score));
  const signChanges = deltas.slice(1).filter((delta, index) => Math.sign(delta) !== 0 && Math.sign(delta) !== Math.sign(deltas[index] || 0)).length;
  const spread = Math.max(...scores) - Math.min(...scores);

  if (history.length >= 4 && spread >= 15 && signChanges >= 2) return "VOLATILE";
  if (last - first >= 5) return "IMPROVING";
  if (last - first <= -5) return "DECLINING";
  return "STABLE";
}

function topContributors(delta: number, fixed: HistoricalDiffItem[], introduced: HistoricalDiffItem[], severityChanges: HistoricalDiffItem[]) {
  const improved = severityChanges.filter((item) => item.status === "IMPROVED");
  const regressed = severityChanges.filter((item) => item.status === "REGRESSED");
  const candidates = delta >= 0 ? [...fixed, ...improved] : [...introduced, ...regressed];
  return sortItems(candidates).slice(0, 5);
}

function confidenceFor(current: ProjectScanSnapshot, previous: ProjectScanSnapshot, items: HistoricalDiffItem[]) {
  if (current.findings.length === 0 && previous.findings.length === 0) return 0.65;
  const evidenceCount = items.reduce((sum, item) => sum + item.evidence.length, 0);
  const base = current.findings.length > 0 && previous.findings.length > 0 ? 0.9 : 0.72;
  return boundedConfidence(base + Math.min(0.06, evidenceCount * 0.005));
}

function sortItems(items: HistoricalDiffItem[]) {
  return items
    .slice()
    .sort((a, b) => Math.max(severityRank(b.previousSeverity || ""), severityRank(b.currentSeverity || "")) - Math.max(severityRank(a.previousSeverity || ""), severityRank(a.currentSeverity || "")) || a.title.localeCompare(b.title));
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
