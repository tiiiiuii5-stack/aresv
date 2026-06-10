import assert from "node:assert/strict";

import type { ProjectScanSnapshot } from "@/lib/evolution/projectHistory";
import { compareProjectAgainstStoredHistory } from "@/lib/intelligence/global-benchmark";

const generatedAt = "2026-06-05T00:00:00.000Z";
const storedHistorySnapshots = [
  scan("history-1", "project-1", 40, "2026-06-01T10:00:00.000Z", [finding("auth-1", "Missing ownership validation", "critical", "security")]),
  scan("history-2", "project-2", 50, "2026-06-01T10:01:00.000Z", [finding("deploy-1", "Missing production env validation", "high", "deployment")]),
  scan("history-3", "project-3", 55, "2026-06-01T10:02:00.000Z", [finding("stripe-1", "Stripe webhook not verified", "high", "billing")]),
  scan("history-4", "project-4", 60, "2026-06-01T10:03:00.000Z", [finding("db-1", "Form submits without database persistence", "medium", "data")]),
  scan("history-5", "project-5", 65, "2026-06-01T10:04:00.000Z", [finding("api-1", "Button calls phantom API route", "medium", "execution")]),
  scan("history-6", "project-6", 70, "2026-06-01T10:05:00.000Z", []),
  scan("history-7", "project-7", 75, "2026-06-01T10:06:00.000Z", [finding("toast-1", "Copy action has no success feedback", "low", "ux")]),
  scan("history-8", "project-8", 80, "2026-06-01T10:07:00.000Z", [
    finding("auth-2", "Admin route missing session guard", "critical", "security"),
    finding("deploy-2", "Queue worker dependency missing", "high", "deployment"),
    finding("api-2", "Form submit handler has no backend endpoint", "medium", "execution"),
  ]),
  scan("history-9", "project-9", 90, "2026-06-01T10:08:00.000Z", []),
  scan("history-10", "project-10", 95, "2026-06-01T10:09:00.000Z", []),
];

const projectSnapshots = [
  scan("project-current", "project-8", 80, "2026-06-02T10:00:00.000Z", [
    finding("auth-2", "Admin route missing session guard", "critical", "security"),
    finding("deploy-2", "Queue worker dependency missing", "high", "deployment"),
    finding("api-2", "Form submit handler has no backend endpoint", "medium", "execution"),
  ]),
  scan("project-previous", "project-8", 62, "2026-06-01T10:00:00.000Z", [finding("db-old", "Database write missing validation", "high", "data")]),
];

const report = compareProjectAgainstStoredHistory({
  projectId: "project-8",
  projectSnapshots,
  storedHistorySnapshots,
  generatedAt,
});

assert.equal(report.engine, "ventureos-stored-history-comparison");
assert.equal(report.generatedAt, generatedAt);
assert.equal(report.dataAvailable, true);
assert.equal(report.currentReadiness, 80);
assert.equal(report.storedHistoryAverageReadiness, 68);
assert.equal(report.highestDecileReadiness, 90);
assert.equal(report.positionPercentile, 75);
assert.equal(report.position, "ABOVE_AVERAGE");
assert.equal(report.dataset.sampleSize, 10);
assert.equal(report.dataset.projectSampleSize, 2);
assert.ok(report.dataset.confidence >= 0.6);
assert.ok(report.comparisonInsights.some((insight) => insight.includes("stored-history average")));
assert.ok(report.comparisonInsights.some((insight) => insight.includes("75th percentile")));

const trustPattern = report.failureRatePatterns.find((pattern) => pattern.category === "security");
assert.ok(trustPattern);
assert.equal(trustPattern.projectAffected, true);
assert.equal(trustPattern.storedHistoryAffectedRate, 20);
assert.equal(trustPattern.comparison, "PROJECT_ABOVE_STORED_HISTORY");
assert.ok(trustPattern.evidence.every((item) => item.source === "project_scan_history"));

const billingPattern = report.failureRatePatterns.find((pattern) => pattern.category === "billing");
assert.ok(billingPattern);
assert.equal(billingPattern.projectAffected, false);
assert.equal(billingPattern.comparison, "PROJECT_CLEAR");

const emptyReport = compareProjectAgainstStoredHistory({
  projectId: "project-empty",
  projectSnapshots: [],
  storedHistorySnapshots: [],
  generatedAt,
});
assert.equal(emptyReport.dataAvailable, false);
assert.equal(emptyReport.currentReadiness, null);
assert.equal(emptyReport.storedHistoryAverageReadiness, null);
assert.equal(emptyReport.highestDecileReadiness, null);
assert.equal(emptyReport.positionPercentile, null);
assert.equal(emptyReport.position, "NO_DATA");
assert.ok(emptyReport.comparisonInsights[0]?.includes("No project scan exists"));

console.log(JSON.stringify({
  passed: true,
  storedHistoryComparison: {
    currentReadiness: report.currentReadiness,
    storedHistoryAverageReadiness: report.storedHistoryAverageReadiness,
    highestDecileReadiness: report.highestDecileReadiness,
    positionPercentile: report.positionPercentile,
    position: report.position,
    sampleSize: report.dataset.sampleSize,
    confidence: report.dataset.confidence,
  },
  failurePatterns: report.failureRatePatterns.map((pattern) => ({
    category: pattern.category,
    projectAffected: pattern.projectAffected,
    storedHistoryAffectedRate: pattern.storedHistoryAffectedRate,
    comparison: pattern.comparison,
  })),
}, null, 2));

function scan(
  id: string,
  projectId: string,
  readinessScore: number,
  scannedAt: string,
  findings: ProjectScanSnapshot["findings"],
): ProjectScanSnapshot {
  return {
    id,
    projectId,
    scanSource: "repo_scan",
    scanRefId: id,
    readinessScore,
    findingsCount: findings.length,
    criticalFindingsCount: findings.filter((item) => item.severity === "critical").length,
    riskLevel: readinessScore >= 80 ? "low" : readinessScore >= 60 ? "medium" : "high",
    framework: "next",
    severityTotals: {
      critical: findings.filter((item) => item.severity === "critical").length,
      high: findings.filter((item) => item.severity === "high").length,
      medium: findings.filter((item) => item.severity === "medium").length,
      low: findings.filter((item) => item.severity === "low").length,
    },
    findings,
    codeSnapshot: null,
    scannedAt,
  };
}

function finding(fingerprint: string, title: string, severity: string, category: string): ProjectScanSnapshot["findings"][number] {
  return {
    fingerprint,
    title,
    severity,
    category,
    filePath: `app/${fingerprint}.ts`,
    affectedRoutes: [],
    evidence: `${title} evidence`,
    fixSuggestion: `Fix ${title}`,
  };
}
