import assert from "node:assert/strict";

import { buildClosedLoopReport } from "@/lib/evolution/closedLoopEngine";
import type { ProjectScanSnapshot } from "@/lib/evolution/projectHistory";

const previous = scan("scan-1", 57, "2026-06-01T10:00:00.000Z", [
  finding("auth-missing", "Missing ownership check", "critical", "Add server-side ownership validation.", "app/api/projects/route.ts"),
  finding("loading-missing", "Missing loading state", "medium", "Add loading feedback.", "components/build-button.tsx"),
  finding("copy-no-toast", "Copy action has no feedback", "medium", "Show success or error toast.", "components/report.tsx"),
], {
  "app/api/projects/route.ts": "old-auth",
  "components/build-button.tsx": "old-loading",
  "components/report.tsx": "same-copy",
});

const current = scan("scan-2", 81, "2026-06-02T10:00:00.000Z", [
  finding("loading-missing", "Missing loading state", "low", "Add loading feedback.", "components/build-button.tsx"),
  finding("copy-no-toast", "Copy action has no feedback", "medium", "Show success or error toast.", "components/report.tsx"),
  finding("env-missing", "Missing production env validation", "high", "Require production env validation.", "lib/env.ts"),
], {
  "app/api/projects/route.ts": "new-auth",
  "components/build-button.tsx": "new-loading",
  "components/report.tsx": "same-copy",
  "lib/env.ts": "new-env",
});

const report = buildClosedLoopReport({ projectId: "project-1", snapshots: [current, previous] });
assert.equal(report.engine, "ventureos-closed-loop");
assert.deepEqual(report.workflow, ["SCAN", "FIX", "RE_SCAN", "IMPROVEMENT_TRACKING"]);
assert.equal(report.stage, "IMPROVING");
assert.equal(report.beforeScore, 57);
assert.equal(report.afterScore, 81);
assert.equal(report.scoreDelta, 24);
assert.equal(report.improvementMetrics.fixedIssues, 1);
assert.equal(report.improvementMetrics.newIssues, 1);
assert.equal(report.improvementMetrics.recurringIssues, 1);
assert.equal(report.improvementMetrics.verifiedFixes, 1);
assert.equal(report.improvementMetrics.failedFixes, 1);
assert.ok(report.improvementSummary.includes("24"));
assert.ok(report.remainingBlockers.some((blocker) => blocker.issueId === "env-missing" && blocker.status === "NEW"));
assert.ok(report.remainingBlockers.some((blocker) => blocker.issueId === "copy-no-toast" && blocker.status === "FAILED_FIX"));
assert.ok(report.nextActions.length > 0);
assert.equal(report.returnLoop.goal, "increase_user_return_rate");
assert.ok(report.returnLoop.nextScanPrompt.includes("run another scan"));
assert.ok(report.confidence > 0.8);

const baseline = buildClosedLoopReport({ projectId: "project-1", snapshots: [current] });
assert.equal(baseline.stage, "READY_FOR_FIXES");
assert.equal(baseline.beforeScore, null);
assert.equal(baseline.afterScore, 81);
assert.equal(baseline.scoreDelta, 0);
assert.ok(baseline.improvementSummary.includes("Baseline"));

const empty = buildClosedLoopReport({ projectId: "project-1", snapshots: [] });
assert.equal(empty.stage, "NEEDS_FIRST_SCAN");
assert.equal(empty.beforeScore, null);
assert.equal(empty.afterScore, null);
assert.equal(empty.remainingBlockers.length, 0);

console.log(JSON.stringify({
  passed: true,
  stage: report.stage,
  beforeScore: report.beforeScore,
  afterScore: report.afterScore,
  scoreDelta: report.scoreDelta,
  remainingBlockers: report.remainingBlockers.length,
  nextActions: report.nextActions.length,
}, null, 2));

function scan(id: string, readinessScore: number, scannedAt: string, findings: ProjectScanSnapshot["findings"], fileHashes: Record<string, string>): ProjectScanSnapshot {
  return {
    id,
    projectId: "project-1",
    scanSource: "repo_scan",
    scanRefId: id,
    readinessScore,
    findingsCount: findings.length,
    criticalFindingsCount: findings.filter((item) => item.severity === "critical").length,
    riskLevel: readinessScore >= 75 ? "low" : "high",
    framework: "next",
    severityTotals: {
      critical: findings.filter((item) => item.severity === "critical").length,
      high: findings.filter((item) => item.severity === "high").length,
      medium: findings.filter((item) => item.severity === "medium").length,
      low: findings.filter((item) => item.severity === "low").length,
    },
    findings,
    codeSnapshot: {
      sourceHash: Object.values(fileHashes).join("|"),
      sourceLength: Object.values(fileHashes).join("|").length,
      fileHashes,
    },
    scannedAt,
  };
}

function finding(fingerprint: string, title: string, severity: string, fixSuggestion: string, filePath: string): ProjectScanSnapshot["findings"][number] {
  return {
    fingerprint,
    title,
    severity,
    category: "logic",
    filePath,
    affectedRoutes: [],
    evidence: `${filePath} contains scan evidence for ${title}.`,
    fixSuggestion,
  };
}
