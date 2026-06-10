import assert from "node:assert/strict";

import { compareHistoricalScans } from "@/lib/evolution/diffEngine";
import { verifyRecommendedFixes } from "@/lib/evolution/verificationEngine";
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

const diff = compareHistoricalScans({ projectId: "project-1", snapshots: [current, previous] });
assert.equal(diff.currentReadiness, 81);
assert.equal(diff.previousReadiness, 57);
assert.equal(diff.delta, 24);
assert.equal(diff.trend, "IMPROVING");
assert.equal(diff.issuesFixed.length, 1);
assert.equal(diff.issuesFixed[0]?.status, "FIXED");
assert.equal(diff.issuesIntroduced.length, 1);
assert.equal(diff.issuesIntroduced[0]?.status, "NEW");
assert.equal(diff.issuesUnchanged.length, 1);
assert.equal(diff.issuesUnchanged[0]?.status, "UNCHANGED");
assert.equal(diff.recurringIssues.length, 1);
assert.equal(diff.recurringIssues[0]?.issueId, diff.issuesUnchanged[0]?.issueId);
assert.equal(diff.severityChanges.length, 1);
assert.equal(diff.severityChanges[0]?.status, "IMPROVED");
assert.deepEqual(diff.improvementMetrics, { scoreIncrease: 24, scoreDecrease: 0, netChange: 24 });
assert.ok(diff.issuesFixed[0]?.evidence.length);
assert.ok(diff.confidence >= 0.9);

const verification = verifyRecommendedFixes({ previousScan: diff.previousScan, currentScan: diff.currentScan });
assert.equal(verification.verifiedFixes.length, 1);
assert.equal(verification.partialFixes.length, 1);
assert.equal(verification.failedFixes.length, 1);
assert.equal(verification.verifiedFixes[0]?.status, "VERIFIED");
assert.equal(verification.partialFixes[0]?.status, "PARTIAL");
assert.equal(verification.failedFixes[0]?.status, "FAILED");
assert.ok(verification.verifiedFixes[0]?.evidence.length);
assert.ok(verification.verifiedFixes[0]?.evidence.some((item) => item.source === "code_diff"));
assert.equal(verification.partialFixes[0]?.checks.codeDiff.status, "CHANGED");
assert.equal(verification.failedFixes[0]?.checks.codeDiff.status, "UNCHANGED");

const firstScan = compareHistoricalScans({ projectId: "project-1", snapshots: [current] });
assert.equal(firstScan.previousReadiness, null);
assert.equal(firstScan.delta, 0);
assert.equal(firstScan.issuesFixed.length, 0);
assert.equal(firstScan.issuesIntroduced.length, 0);
assert.equal(firstScan.recurringIssues.length, 0);
assert.equal(firstScan.trend, "STABLE");
assert.deepEqual(firstScan.improvementMetrics, { scoreIncrease: 0, scoreDecrease: 0, netChange: 0 });

console.log(JSON.stringify({
  passed: true,
  diff: {
    fixed: diff.issuesFixed.length,
    introduced: diff.issuesIntroduced.length,
    unchanged: diff.issuesUnchanged.length,
    recurring: diff.recurringIssues.length,
    severityChanges: diff.severityChanges.length,
    trend: diff.trend,
    confidence: diff.confidence,
    improvementMetrics: diff.improvementMetrics,
  },
  verification: {
    verified: verification.verifiedFixes.length,
    partial: verification.partialFixes.length,
    failed: verification.failedFixes.length,
  },
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
