export type RegressionFindingInput = {
  id?: string;
  fingerprint?: string;
  severity?: string;
  category?: string;
  title?: string;
  evidence?: string;
  explanation?: string;
  codeSnippet?: string;
  fixSuggestion?: string;
  recommendation?: string;
  filePath?: string;
  affectedFiles?: string[];
  affectedRoutes?: string[];
};

export type RegressionFindingSummary = {
  fingerprint: string;
  title: string;
  severity: string;
  category: string;
  filePath?: string;
  affectedRoutes: string[];
  evidence?: string;
  fixSuggestion?: string;
};

export type RegressionScanSnapshot = {
  id?: string;
  scanSource: string;
  scanRefId?: string | null;
  readinessScore: number;
  findingsCount: number;
  criticalFindingsCount: number;
  riskLevel?: string | null;
  framework?: string | null;
  scannedAt?: string;
  findings?: RegressionFindingInput[];
};

export type RegressionReport = {
  engine: "ventureos-regression-detection";
  version: "1.0.0";
  generatedAt: string;
  currentScan: RegressionScanSummary;
  previousScan: RegressionScanSummary | null;
  scoreChange: {
    readinessDelta: number;
    findingsDelta: number;
    criticalFindingsDelta: number;
    direction: "improved" | "regressed" | "stable" | "insufficient_history";
  };
  newFailures: RegressionFindingSummary[];
  fixedFailures: RegressionFindingSummary[];
  returningFailures: RegressionFindingSummary[];
  persistentFailures: RegressionFindingSummary[];
  whatGotWorse: string[];
  whatImproved: string[];
  trend: {
    status: "improving" | "regressing" | "stable" | "insufficient_history";
    historicalReadiness: Array<{
      label: string;
      score: number;
      scannedAt?: string;
      scanRefId?: string | null;
    }>;
  };
  summary: string;
};

export type RegressionScanSummary = {
  scanSource: string;
  scanRefId?: string | null;
  readinessScore: number;
  findingsCount: number;
  criticalFindingsCount: number;
  riskLevel?: string | null;
  scannedAt?: string;
};

export type RegressionDetectionInput = {
  current: RegressionScanSnapshot;
  previousScans?: RegressionScanSnapshot[];
};

export function detectScanRegression(input: RegressionDetectionInput): RegressionReport {
  const previousScans = normalizePreviousScans(input.previousScans || [], input.current);
  const previous = previousScans[0] || null;
  const older = previousScans.slice(1);
  const currentFindings = summarizeFindingsForRegression(input.current.findings || []);
  const previousFindings = previous ? summarizeFindingsForRegression(previous.findings || []) : [];
  const olderFindings = older.flatMap((scan) => summarizeFindingsForRegression(scan.findings || []));

  const currentByKey = byFingerprint(currentFindings);
  const previousByKey = byFingerprint(previousFindings);
  const olderByKey = byFingerprint(olderFindings);

  const newFailures = currentFindings.filter((finding) => !previousByKey.has(finding.fingerprint) && !olderByKey.has(finding.fingerprint));
  const returningFailures = currentFindings.filter((finding) => !previousByKey.has(finding.fingerprint) && olderByKey.has(finding.fingerprint));
  const fixedFailures = previousFindings.filter((finding) => !currentByKey.has(finding.fingerprint));
  const persistentFailures = currentFindings.filter((finding) => previousByKey.has(finding.fingerprint));

  const readinessDelta = previous ? boundedScore(input.current.readinessScore) - boundedScore(previous.readinessScore) : 0;
  const findingsDelta = previous ? boundedCount(input.current.findingsCount) - boundedCount(previous.findingsCount) : 0;
  const criticalFindingsDelta = previous ? boundedCount(input.current.criticalFindingsCount) - boundedCount(previous.criticalFindingsCount) : 0;
  const whatGotWorse = gotWorse({
    readinessDelta,
    findingsDelta,
    criticalFindingsDelta,
    newFailures,
    returningFailures,
  });
  const whatImproved = improved({
    readinessDelta,
    findingsDelta,
    criticalFindingsDelta,
    fixedFailures,
  });
  const trend = trendFor(input.current, previousScans);
  const direction = directionFor(previous, readinessDelta, findingsDelta, criticalFindingsDelta, newFailures, returningFailures);

  return {
    engine: "ventureos-regression-detection",
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    currentScan: scanSummary(input.current),
    previousScan: previous ? scanSummary(previous) : null,
    scoreChange: {
      readinessDelta,
      findingsDelta,
      criticalFindingsDelta,
      direction,
    },
    newFailures: newFailures.slice(0, 20),
    fixedFailures: fixedFailures.slice(0, 20),
    returningFailures: returningFailures.slice(0, 20),
    persistentFailures: persistentFailures.slice(0, 20),
    whatGotWorse,
    whatImproved,
    trend,
    summary: summaryFor(direction, whatGotWorse, whatImproved),
  };
}

export function summarizeFindingsForRegression(findings: RegressionFindingInput[]): RegressionFindingSummary[] {
  const output = new Map<string, RegressionFindingSummary>();
  for (const finding of findings) {
    const title = cleanText(finding.title || finding.id || "Untitled failure");
    if (!title) continue;

    const summary: RegressionFindingSummary = {
      fingerprint: finding.fingerprint || fingerprintFor(finding),
      title,
      severity: cleanText(finding.severity || "unknown").toLowerCase(),
      category: cleanText(finding.category || "scan").toLowerCase(),
      filePath: cleanText(finding.filePath || finding.affectedFiles?.[0] || "") || undefined,
      affectedRoutes: unique((finding.affectedRoutes || []).map(cleanText).filter(Boolean)),
      evidence: cleanText(finding.evidence || finding.explanation || finding.codeSnippet || "").slice(0, 260) || undefined,
      fixSuggestion: cleanText(finding.fixSuggestion || finding.recommendation || "").slice(0, 260) || undefined,
    };

    const existing = output.get(summary.fingerprint);
    if (!existing || severityRank(summary.severity) > severityRank(existing.severity)) output.set(summary.fingerprint, summary);
  }
  return [...output.values()].sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.title.localeCompare(b.title));
}

function normalizePreviousScans(scans: RegressionScanSnapshot[], current: RegressionScanSnapshot) {
  return scans
    .filter((scan) => scan.scanRefId !== current.scanRefId || scan.scanSource !== current.scanSource)
    .sort((a, b) => String(b.scannedAt || "").localeCompare(String(a.scannedAt || "")))
    .slice(0, 12);
}

function scanSummary(scan: RegressionScanSnapshot): RegressionScanSummary {
  return {
    scanSource: scan.scanSource,
    scanRefId: scan.scanRefId,
    readinessScore: boundedScore(scan.readinessScore),
    findingsCount: boundedCount(scan.findingsCount),
    criticalFindingsCount: boundedCount(scan.criticalFindingsCount),
    riskLevel: scan.riskLevel || null,
    scannedAt: scan.scannedAt,
  };
}

function gotWorse(input: {
  readinessDelta: number;
  findingsDelta: number;
  criticalFindingsDelta: number;
  newFailures: RegressionFindingSummary[];
  returningFailures: RegressionFindingSummary[];
}) {
  const items: string[] = [];
  if (input.readinessDelta < 0) items.push(`Readiness score dropped ${Math.abs(input.readinessDelta)} points.`);
  if (input.findingsDelta > 0) items.push(`${input.findingsDelta} more finding${input.findingsDelta === 1 ? "" : "s"} than the previous scan.`);
  if (input.criticalFindingsDelta > 0) items.push(`${input.criticalFindingsDelta} more critical finding${input.criticalFindingsDelta === 1 ? "" : "s"}.`);
  if (input.newFailures.length) items.push(`${input.newFailures.length} new failure${input.newFailures.length === 1 ? "" : "s"} appeared: ${input.newFailures.slice(0, 3).map((finding) => finding.title).join("; ")}.`);
  if (input.returningFailures.length) items.push(`${input.returningFailures.length} returning failure${input.returningFailures.length === 1 ? "" : "s"} reappeared: ${input.returningFailures.slice(0, 3).map((finding) => finding.title).join("; ")}.`);
  return items;
}

function improved(input: {
  readinessDelta: number;
  findingsDelta: number;
  criticalFindingsDelta: number;
  fixedFailures: RegressionFindingSummary[];
}) {
  const items: string[] = [];
  if (input.readinessDelta > 0) items.push(`Readiness score improved ${input.readinessDelta} points.`);
  if (input.findingsDelta < 0) items.push(`${Math.abs(input.findingsDelta)} fewer finding${Math.abs(input.findingsDelta) === 1 ? "" : "s"} than the previous scan.`);
  if (input.criticalFindingsDelta < 0) items.push(`${Math.abs(input.criticalFindingsDelta)} critical finding${Math.abs(input.criticalFindingsDelta) === 1 ? "" : "s"} cleared.`);
  if (input.fixedFailures.length) items.push(`${input.fixedFailures.length} failure${input.fixedFailures.length === 1 ? "" : "s"} fixed: ${input.fixedFailures.slice(0, 3).map((finding) => finding.title).join("; ")}.`);
  return items;
}

function trendFor(current: RegressionScanSnapshot, previousScans: RegressionScanSnapshot[]): RegressionReport["trend"] {
  const scans = [...previousScans, current]
    .sort((a, b) => String(a.scannedAt || "").localeCompare(String(b.scannedAt || "")))
    .slice(-12);
  const historicalReadiness = scans.map((scan, index) => ({
    label: `Scan ${index + 1}`,
    score: boundedScore(scan.readinessScore),
    scannedAt: scan.scannedAt,
    scanRefId: scan.scanRefId,
  }));
  if (historicalReadiness.length < 2) return { status: "insufficient_history", historicalReadiness };

  const first = historicalReadiness[0]?.score ?? current.readinessScore;
  const last = historicalReadiness[historicalReadiness.length - 1]?.score ?? current.readinessScore;
  const delta = last - first;
  const status = delta >= 8 ? "improving" : delta <= -8 ? "regressing" : "stable";
  return { status, historicalReadiness };
}

function directionFor(
  previous: RegressionScanSnapshot | null,
  readinessDelta: number,
  findingsDelta: number,
  criticalFindingsDelta: number,
  newFailures: RegressionFindingSummary[],
  returningFailures: RegressionFindingSummary[],
): RegressionReport["scoreChange"]["direction"] {
  if (!previous) return "insufficient_history";
  if (criticalFindingsDelta > 0 || readinessDelta <= -5 || returningFailures.length > 0) return "regressed";
  if (readinessDelta >= 5 && findingsDelta <= 0 && newFailures.length === 0) return "improved";
  return "stable";
}

function summaryFor(direction: RegressionReport["scoreChange"]["direction"], worse: string[], better: string[]) {
  if (direction === "insufficient_history") return "Regression detection needs at least two stored scans for a full comparison.";
  if (direction === "regressed") return worse[0] || "Current scan regressed against the previous scan.";
  if (direction === "improved") return better[0] || "Current scan improved against the previous scan.";
  return "Current scan is broadly stable against the previous scan.";
}

function byFingerprint(findings: RegressionFindingSummary[]) {
  return new Map(findings.map((finding) => [finding.fingerprint, finding]));
}

function fingerprintFor(finding: RegressionFindingInput) {
  const parts = [
    finding.category,
    finding.title || finding.id,
    finding.filePath || finding.affectedFiles?.[0],
    finding.affectedRoutes?.[0],
    finding.evidence || finding.explanation || finding.codeSnippet,
  ].map((part) => normalizeFingerprintPart(part));
  return `reg_${stableHash(parts.join("|"))}`;
}

function normalizeFingerprintPart(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function stableHash(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function severityRank(severity: string) {
  const clean = severity.toLowerCase();
  if (clean === "critical") return 4;
  if (clean === "high") return 3;
  if (clean === "medium") return 2;
  if (clean === "low") return 1;
  return 0;
}

function cleanText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function boundedScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

function boundedCount(value: number) {
  return Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}
