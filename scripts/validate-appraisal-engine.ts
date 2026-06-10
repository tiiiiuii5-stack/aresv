import assert from "node:assert/strict";

import { buildBadgeEmbed, buildBadgeSvg } from "@/lib/appraisal/badge";
import { buildAppraisalReport } from "@/lib/appraisal/scoring";
import type { ProjectWorkspace } from "@/lib/services/projectWorkspace";

const riskyWorkspace = workspace({
  readinessScore: 62,
  criticalFindingsCount: 1,
  findings: [
    finding("critical", "Missing ownership validation", "Security", "app/api/projects/route.ts", "Add server-side ownership checks.", "Use assertOwnership before mutation."),
    finding("high", "Billing entitlement is not verified", "Payments", "app/api/billing/route.ts", "Bind billing actions to the server session.", "Fetch subscription by session.userId."),
    finding("medium", "Deployment env validation missing", "Deployment", "lib/env.ts", "Validate production env before deploy.", "Export a production env guard."),
    finding("low", "Copy action has weak feedback", "UX", "components/report.tsx", "Show copy success and failure states.", "Use shared clipboard utility."),
  ],
});

const risky = buildAppraisalReport(riskyWorkspace, "2026-06-05T20:30:00.000Z");
risky.publicSummary.publicId = "vos-test-risk";

assert.equal(risky.publicSummary.grade, "F");
assert.equal(risky.publicSummary.launchVerdict, "BLOCKED");
assert.equal(risky.publicSummary.badgeState, "VENTUREOS_APPRAISED");
assert.equal(risky.publicSummary.topRisks.length, 3);
assert.ok(risky.publicSummary.repairCost.low > 0);
assert.ok(risky.publicSummary.technicalValue.high >= risky.publicSummary.technicalValue.low);
assert.ok(risky.privateReport.evidence.some((item) => item.filePath === "app/api/projects/route.ts"));
assert.ok(risky.privateReport.fixPlan[0]?.codeFix);
assert.doesNotMatch(JSON.stringify(risky.publicSummary), /Use assertOwnership before mutation/);

const thinReadyWorkspace = workspace({
  readinessScore: 94,
  criticalFindingsCount: 0,
  findings: [],
  readinessDelta: 8,
});
const thinReady = buildAppraisalReport(thinReadyWorkspace, "2026-06-05T20:34:00.000Z");
thinReady.publicSummary.publicId = "vos-test-thin-ready";

assert.equal(thinReady.publicSummary.grade, "C");
assert.equal(thinReady.publicSummary.launchVerdict, "RISKY");
assert.equal(thinReady.publicSummary.evidenceCoverage.scoreCapped, true);
assert.equal(thinReady.publicSummary.technicalValue.label, "Not verified");
assert.ok(thinReady.publicSummary.unknowns.length > 0);

const truncatedReadyWorkspace = workspace({
  readinessScore: 94,
  criticalFindingsCount: 0,
  findings: [],
  readinessDelta: 8,
  fileCount: 80,
  sourceLength: 900_000,
  inputTruncated: true,
  includePreviousScan: true,
});
const truncatedReady = buildAppraisalReport(truncatedReadyWorkspace, "2026-06-05T20:34:30.000Z");
truncatedReady.publicSummary.publicId = "vos-test-truncated-ready";

assert.equal(truncatedReady.publicSummary.evidenceCoverage.scope, "partial_submission");
assert.equal(truncatedReady.publicSummary.evidenceCoverage.scoreCap, 82);
assert.equal(truncatedReady.publicSummary.evidenceCoverage.scoreCapped, true);
assert.equal(truncatedReady.publicSummary.launchVerdict, "RISKY");
assert.ok(truncatedReady.publicSummary.unknowns.some((item) => /truncated/i.test(item)));

const readyWorkspace = workspace({
  readinessScore: 94,
  criticalFindingsCount: 0,
  findings: [],
  readinessDelta: 8,
  fileCount: 24,
  sourceLength: 900_000,
  includePreviousScan: true,
  externalDataSources: [
    source("github_advisory", "GitHub Advisory Database", "available"),
    source("software_valuation_dataset", "Software valuation dataset", "available"),
  ],
});
const ready = buildAppraisalReport(readyWorkspace, "2026-06-05T20:35:00.000Z");
ready.publicSummary.publicId = "vos-test-ready";

assert.equal(ready.publicSummary.grade, "A");
assert.equal(ready.publicSummary.launchVerdict, "READY");
assert.equal(ready.publicSummary.badgeState, "REVERIFIED");
assert.equal(ready.publicSummary.topRisks.length, 0);
assert.equal(ready.publicSummary.evidenceCoverage.level, "strong");
assert.equal(ready.publicSummary.technicalValue.available, true);

const staleCriticalFinding = finding("critical", "Old missing ownership validation", "Security", "app/api/projects/route.ts", "Historical issue from an older scan.", "Use assertOwnership before mutation.");
staleCriticalFinding.scanId = "scan-previous";
const historyPollutedWorkspace = workspace({
  readinessScore: 94,
  criticalFindingsCount: 0,
  findings: [staleCriticalFinding],
  readinessDelta: 18,
  fileCount: 24,
  sourceLength: 900_000,
  includePreviousScan: true,
  externalDataSources: [
    source("github_advisory", "GitHub Advisory Database", "available"),
    source("software_valuation_dataset", "Software valuation dataset", "available"),
  ],
});
historyPollutedWorkspace.scans[0] = {
  ...historyPollutedWorkspace.scans[0],
  issueCount: 0,
  findingsCount: 0,
  criticalFindingsCount: 0,
};
historyPollutedWorkspace.scanHistory = historyPollutedWorkspace.scans;
const historyPolluted = buildAppraisalReport(historyPollutedWorkspace, "2026-06-05T20:36:00.000Z");
historyPolluted.publicSummary.publicId = "vos-test-history-polluted";

assert.equal(historyPolluted.publicSummary.grade, "A");
assert.equal(historyPolluted.publicSummary.launchVerdict, "READY");
assert.equal(historyPolluted.publicSummary.topRisks.length, 0);
assert.equal(historyPolluted.privateReport.scoreBreakdown.riskCounts.critical, 0);

const svg = buildBadgeSvg({
  appName: ready.publicSummary.appName,
  grade: ready.publicSummary.grade,
  verdict: ready.publicSummary.launchVerdict,
  state: ready.publicSummary.badgeState,
  score: ready.publicSummary.readinessScore,
});
assert.match(svg, /<svg/);
assert.match(svg, /Reverified/);
assert.doesNotMatch(svg, /assertOwnership/);

const embed = buildBadgeEmbed({ publicId: "vos-test-ready", appName: "Validated App" });
assert.match(embed, /\/appraisal\/vos-test-ready/);
assert.match(embed, /\/api\/appraisals\/vos-test-ready\/badge/);

console.log(JSON.stringify({
  passed: true,
  risky: {
    grade: risky.publicSummary.grade,
    verdict: risky.publicSummary.launchVerdict,
    repairCost: risky.publicSummary.repairCost.label,
    value: risky.publicSummary.technicalValue.label,
    evidence: risky.privateReport.evidence.length,
  },
  ready: {
    grade: ready.publicSummary.grade,
    verdict: ready.publicSummary.launchVerdict,
    badgeState: ready.publicSummary.badgeState,
    coverage: ready.publicSummary.evidenceCoverage.level,
  },
  historyPolluted: {
    grade: historyPolluted.publicSummary.grade,
    verdict: historyPolluted.publicSummary.launchVerdict,
    evidence: historyPolluted.privateReport.evidence.length,
  },
  thinReady: {
    grade: thinReady.publicSummary.grade,
    verdict: thinReady.publicSummary.launchVerdict,
    scoreCap: thinReady.publicSummary.evidenceCoverage.scoreCap,
  },
  truncatedReady: {
    grade: truncatedReady.publicSummary.grade,
    verdict: truncatedReady.publicSummary.launchVerdict,
    scope: truncatedReady.publicSummary.evidenceCoverage.scope,
    scoreCap: truncatedReady.publicSummary.evidenceCoverage.scoreCap,
  },
}, null, 2));

function workspace(input: {
  readinessScore: number;
  criticalFindingsCount: number;
  findings: ProjectWorkspace["findings"];
  readinessDelta?: number;
  fileCount?: number;
  sourceLength?: number;
  includePreviousScan?: boolean;
  externalDataSources?: ProjectWorkspace["scans"][number]["externalDataSources"];
  inputTruncated?: boolean;
}): ProjectWorkspace {
  const now = "2026-06-05T20:00:00.000Z";
  const scan = {
    id: `scan-${input.readinessScore}`,
    source: "repo_scan",
    scanRefId: `ref-${input.readinessScore}`,
    framework: "next",
    riskLevel: input.readinessScore >= 85 ? "low" : "high",
    securityScore: input.readinessScore,
    failureScore: 100 - input.readinessScore,
    readinessScore: input.readinessScore,
    issueCount: input.findings.length,
    findingsCount: input.findings.length,
    criticalFindingsCount: input.criticalFindingsCount,
    createdAt: now,
    scannedAt: now,
    externalDataSources: input.externalDataSources || [],
    sourceLength: input.sourceLength || null,
    rawCodeStored: input.sourceLength ? true : null,
    inputTruncated: input.inputTruncated ?? false,
  };
  const previousScan = input.includePreviousScan
    ? { ...scan, id: "scan-previous", readinessScore: input.readinessScore - (input.readinessDelta || 0), scannedAt: "2026-06-04T20:00:00.000Z" }
    : null;
  const scans = previousScan ? [scan, previousScan] : [scan];

  return {
    project: {
      id: "project-appraisal-test",
      name: "Validated App",
      slug: "validated-app",
      category: "saas",
      problem: "prove software readiness",
      audience: "founders",
      uiDirection: "decision system",
      monetization: "appraisals",
      prompt: "Build a validated app",
      status: "ready",
      createdAt: now,
      updatedAt: now,
      files: Array.from({ length: input.fileCount || 0 }, (_, index) => ({ path: `app/file-${index}.ts`, content: "export const value = true;" })),
      onboarding: [],
      features: [],
      qa: {
        score: input.readinessScore,
        threshold: 85,
        releaseApproved: input.readinessScore >= 85,
        issues: [],
        blockers: [],
        simulatedUsers: [],
        productionQuestions: {
          wouldSomeonePay: true,
          wouldEmbarrassFounder: false,
          survivesRealUsers: input.readinessScore >= 85,
          feelsPremiumBesideSaaS: true,
        },
        dimensions: {},
      },
    } as NonNullable<ProjectWorkspace["project"]>,
    isLegacy: false,
    scans,
    scanHistory: scans,
    scoreHistory: [{
      id: scan.id,
      label: "Scan 1",
      readinessScore: input.readinessScore,
      findingsCount: input.findings.length,
      criticalFindingsCount: input.criticalFindingsCount,
      scannedAt: now,
    }],
    scanComparison: input.readinessDelta === undefined ? null : {
      current: scan,
      previous: { ...scan, id: "scan-previous", readinessScore: input.readinessScore - input.readinessDelta, scannedAt: "2026-06-04T20:00:00.000Z" },
      readinessDelta: input.readinessDelta,
      findingsDelta: 0,
      criticalFindingsDelta: 0,
      summary: "Current scan improved against the previous scan.",
    },
    regressionReport: null,
    findings: input.findings,
    reports: [],
    history: [],
    repositoryLinks: [{ id: "repo-1", provider: "github", repository: "owner/validated-app", url: "https://github.com/owner/validated-app", branch: "main", updatedAt: now }],
    legacyScans: [],
    migration: { projectIdOptional: true, legacyScansAccessible: true },
  };
}

function finding(
  severity: string,
  title: string,
  category: string,
  filePath: string,
  evidence: string,
  codeFix: string,
): ProjectWorkspace["findings"][number] {
  return {
    id: `${severity}:${title}`,
    scanId: "scan-62",
    severity,
    category,
    title,
    evidence,
    fixSuggestion: evidence,
    filePath,
    codeFix,
    expectedResult: `Next appraisal no longer reports ${title}.`,
    verificationEvidence: `${filePath} contains evidence for ${title}.`,
    confidenceScore: 0.94,
    createdAt: "2026-06-05T20:00:00.000Z",
  };
}

function source(id: string, label: string, status: string) {
  return {
    id,
    label,
    status,
    evidence: `${label} fixture is ${status}.`,
    checkedAt: "2026-06-05T20:00:00.000Z",
  };
}
