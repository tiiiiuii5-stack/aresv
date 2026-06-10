import type { HistoricalEvidence, ProjectScanFinding, ProjectScanSnapshot } from "@/lib/evolution/projectHistory";

export type BenchmarkPosition = "NO_DATA" | "BELOW_AVERAGE" | "NEAR_AVERAGE" | "ABOVE_AVERAGE" | "TOP_DECILE";
export type FailurePatternComparison =
  | "PROJECT_CLEAR"
  | "PROJECT_MATCHES_STORED_HISTORY"
  | "PROJECT_ABOVE_STORED_HISTORY"
  | "PROJECT_BELOW_STORED_HISTORY";

export type StoredHistoryFailureRatePattern = {
  pattern: string;
  category: string;
  projectAffected: boolean;
  projectFindingShare: number;
  storedHistoryAffectedRate: number;
  storedHistoryAffectedProjects: number;
  storedHistorySampleSize: number;
  comparison: FailurePatternComparison;
  evidence: HistoricalEvidence[];
};

export type StoredHistoryComparisonReport = {
  engine: "ventureos-stored-history-comparison";
  version: "1.0.0";
  generatedAt: string;
  projectId: string;
  dataAvailable: boolean;
  currentReadiness: number | null;
  storedHistoryAverageReadiness: number | null;
  highestDecileReadiness: number | null;
  positionPercentile: number | null;
  position: BenchmarkPosition;
  comparisonInsights: string[];
  failureRatePatterns: StoredHistoryFailureRatePattern[];
  dataset: {
    source: "project_scan_history";
    sampleSize: number;
    projectSampleSize: number;
    benchmarkWindow: "latest_scan_per_project";
    confidence: number;
  };
};

export type StoredHistoryComparisonInput = {
  projectId: string;
  projectSnapshots: ProjectScanSnapshot[];
  storedHistorySnapshots: ProjectScanSnapshot[];
  generatedAt?: string;
};

type FailurePatternDefinition = {
  pattern: string;
  category: string;
  tokens: RegExp;
};

const FAILURE_PATTERNS: FailurePatternDefinition[] = [
  {
    pattern: "Authentication and tenant trust failures",
    category: "security",
    tokens: /\b(auth|session|role|owner|ownership|tenant|org|admin|forbidden|unauthorized|permission)\b/i,
  },
  {
    pattern: "Payment and billing reliability gaps",
    category: "billing",
    tokens: /\b(stripe|billing|payment|checkout|portal|subscription|webhook|invoice|customer)\b/i,
  },
  {
    pattern: "Deployment and runtime dependency failures",
    category: "deployment",
    tokens: /\b(deploy|deployment|environment|env|worker|queue|redis|build|serverless|cron|runtime|vercel)\b/i,
  },
  {
    pattern: "Persistence and data integrity failures",
    category: "data_integrity",
    tokens: /\b(database|db|prisma|persist|save|write|migration|schema|transaction|storage|state)\b/i,
  },
  {
    pattern: "Frontend/backend execution mismatches",
    category: "execution",
    tokens: /\b(phantom|missing backend|api missing|no-op|button|form|handler|route|endpoint|action|submit)\b/i,
  },
  {
    pattern: "Recovery and user feedback gaps",
    category: "operational_stability",
    tokens: /\b(error state|success|loading|retry|catch|fallback|toast|feedback|recovery|response\.ok)\b/i,
  },
];

export function compareProjectAgainstStoredHistory(input: StoredHistoryComparisonInput): StoredHistoryComparisonReport {
  const projectSnapshots = latestFirst(input.projectSnapshots);
  const storedHistorySnapshots = latestFirst(input.storedHistorySnapshots);
  const current = projectSnapshots[0] || null;
  const scores = storedHistorySnapshots.map((scan) => scan.readinessScore).filter(isValidScore);
  const sampleSize = scores.length;
  const average = sampleSize ? round(mean(scores), 1) : null;
  const top10 = sampleSize ? percentile(scores, 0.9) : null;
  const currentScore = current?.readinessScore ?? null;
  const positionPercentile = currentScore !== null && sampleSize ? percentileRank(scores, currentScore) : null;
  const position = positionFor(currentScore, average, top10, positionPercentile);
  const failureRatePatterns = buildFailureRatePatterns(current, storedHistorySnapshots);
  const confidence = confidenceFor(current, sampleSize, failureRatePatterns);

  return {
    engine: "ventureos-stored-history-comparison",
    version: "1.0.0",
    generatedAt: input.generatedAt || new Date().toISOString(),
    projectId: input.projectId,
    dataAvailable: Boolean(current && sampleSize > 0),
    currentReadiness: currentScore,
    storedHistoryAverageReadiness: average,
    highestDecileReadiness: top10,
    positionPercentile,
    position,
    comparisonInsights: insightsFor({
      currentScore,
      average,
      top10,
      positionPercentile,
      position,
      sampleSize,
      patterns: failureRatePatterns,
    }),
    failureRatePatterns,
    dataset: {
      source: "project_scan_history",
      sampleSize,
      projectSampleSize: projectSnapshots.length,
      benchmarkWindow: "latest_scan_per_project",
      confidence,
    },
  };
}

function buildFailureRatePatterns(current: ProjectScanSnapshot | null, storedHistorySnapshots: ProjectScanSnapshot[]): StoredHistoryFailureRatePattern[] {
  const currentFindings = current?.findings || [];
  const totalProjectFindings = currentFindings.length;
  const sampleSize = storedHistorySnapshots.length;

  return FAILURE_PATTERNS.map((definition) => {
    const projectCount = currentFindings.filter((finding) => matchesPattern(finding, definition)).length;
    const affectedStoredHistory = storedHistorySnapshots.filter((scan) => scan.findings.some((finding) => matchesPattern(finding, definition))).length;
    const storedHistoryAffectedRate = rate(affectedStoredHistory, sampleSize);
    const projectFindingShare = totalProjectFindings ? rate(projectCount, totalProjectFindings) : 0;
    const projectAffected = projectCount > 0;
    return {
      pattern: definition.pattern,
      category: definition.category,
      projectAffected,
      projectFindingShare,
      storedHistoryAffectedRate,
      storedHistoryAffectedProjects: affectedStoredHistory,
      storedHistorySampleSize: sampleSize,
      comparison: patternComparison(projectAffected, projectFindingShare, storedHistoryAffectedRate),
      evidence: [
        evidence(
          "project_scan_history",
          projectAffected
            ? `${projectCount} latest project finding${projectCount === 1 ? "" : "s"} match this failure pattern.`
            : "The latest project scan has no findings matching this failure pattern.",
          current ? 0.84 : 0.45,
        ),
        evidence(
          "project_scan_history",
          `${affectedStoredHistory} of ${sampleSize} stored-history project${sampleSize === 1 ? "" : "s"} have at least one latest finding matching this pattern.`,
          confidenceFromSample(sampleSize),
        ),
      ],
    };
  }).filter((item) => item.projectAffected || item.storedHistoryAffectedProjects > 0);
}

function insightsFor(input: {
  currentScore: number | null;
  average: number | null;
  top10: number | null;
  positionPercentile: number | null;
  position: BenchmarkPosition;
  sampleSize: number;
  patterns: StoredHistoryFailureRatePattern[];
}) {
  if (input.currentScore === null) {
    return ["No project scan exists yet. Run a scan before comparing this project against stored VentureOS scan history."];
  }
  if (input.sampleSize === 0 || input.average === null || input.top10 === null || input.positionPercentile === null) {
    return ["No stored scan history is available yet. The project score is recorded, but comparison metrics need prior VentureOS scans."];
  }

  const insights: string[] = [];
  const delta = round(input.currentScore - input.average, 1);
  insights.push(
    `Readiness is ${Math.abs(delta)} point${Math.abs(delta) === 1 ? "" : "s"} ${delta >= 0 ? "above" : "below"} the stored-history average of ${input.average}.`,
  );
  insights.push(`Project position is the ${input.positionPercentile}th percentile across ${input.sampleSize} stored latest project scan${input.sampleSize === 1 ? "" : "s"}.`);

  if (input.position === "TOP_DECILE") {
    insights.push(`This project is at or above the highest-decile stored-history score of ${input.top10}.`);
  } else {
    insights.push(`Highest-decile stored-history projects are at ${input.top10}, leaving a ${round(input.top10 - input.currentScore, 1)} point gap.`);
  }

  const elevated = input.patterns.filter((pattern) => pattern.comparison === "PROJECT_ABOVE_STORED_HISTORY").slice(0, 2);
  if (elevated.length > 0) {
    insights.push(`Primary gap versus stored history: ${elevated.map((pattern) => pattern.pattern).join("; ")}.`);
  }
  const clear = input.patterns.filter((pattern) => pattern.comparison === "PROJECT_CLEAR" && pattern.storedHistoryAffectedRate >= 20).slice(0, 2);
  if (clear.length > 0) {
    insights.push(`Competitive advantage: no current evidence of ${clear.map((pattern) => pattern.pattern.toLowerCase()).join("; ")}.`);
  }

  return insights;
}

function matchesPattern(finding: ProjectScanFinding, definition: FailurePatternDefinition) {
  const text = [finding.title, finding.category, finding.filePath, finding.evidence, finding.fixSuggestion, finding.affectedRoutes.join(" ")]
    .filter(Boolean)
    .join(" ");
  return definition.tokens.test(text);
}

function latestFirst(scans: ProjectScanSnapshot[]) {
  return scans.slice().sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], rank: number) {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(rank * sorted.length) - 1));
  return round(sorted[index] ?? 0, 1);
}

function percentileRank(values: number[], score: number) {
  if (values.length === 0) return null;
  let lower = 0;
  let equal = 0;
  for (const value of values) {
    if (value < score) lower += 1;
    else if (value === score) equal += 1;
  }
  return round(((lower + equal * 0.5) / values.length) * 100, 1);
}

function positionFor(score: number | null, average: number | null, top10: number | null, percentileValue: number | null): BenchmarkPosition {
  if (score === null || average === null || top10 === null || percentileValue === null) return "NO_DATA";
  if (score >= top10 || percentileValue >= 90) return "TOP_DECILE";
  if (score >= average + 5) return "ABOVE_AVERAGE";
  if (score <= average - 5) return "BELOW_AVERAGE";
  return "NEAR_AVERAGE";
}

function patternComparison(projectAffected: boolean, projectFindingShare: number, storedHistoryAffectedRate: number): FailurePatternComparison {
  if (!projectAffected) return "PROJECT_CLEAR";
  if (projectFindingShare >= storedHistoryAffectedRate + 10) return "PROJECT_ABOVE_STORED_HISTORY";
  if (projectFindingShare <= Math.max(0, storedHistoryAffectedRate - 10)) return "PROJECT_BELOW_STORED_HISTORY";
  return "PROJECT_MATCHES_STORED_HISTORY";
}

function confidenceFor(current: ProjectScanSnapshot | null, sampleSize: number, patterns: StoredHistoryFailureRatePattern[]) {
  if (!current) return 0;
  const sampleConfidence = confidenceFromSample(sampleSize);
  const evidenceConfidence = patterns.length ? mean(patterns.flatMap((pattern) => pattern.evidence.map((item) => item.confidence))) : 0.5;
  return boundedConfidence(sampleConfidence * 0.75 + evidenceConfidence * 0.25);
}

function confidenceFromSample(sampleSize: number) {
  if (sampleSize >= 100) return 0.94;
  if (sampleSize >= 50) return 0.88;
  if (sampleSize >= 20) return 0.78;
  if (sampleSize >= 10) return 0.66;
  if (sampleSize >= 3) return 0.55;
  if (sampleSize > 0) return 0.45;
  return 0.25;
}

function evidence(source: string, reason: string, confidence: number): HistoricalEvidence {
  return {
    source,
    reason,
    confidence: boundedConfidence(confidence),
  };
}

function rate(count: number, total: number) {
  if (!total) return 0;
  return round((count / total) * 100, 1);
}

function isValidScore(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function boundedConfidence(value: number) {
  return Math.max(0, Math.min(0.99, Number(value.toFixed(2))));
}

function round(value: number, places = 1) {
  const multiplier = 10 ** places;
  return Math.round(value * multiplier) / multiplier;
}
