import assert from "node:assert/strict";

import { buildAndGateTrustLedgerClaims } from "@/lib/trust-ledger/claimGate";
import { buildTrustLedgerEvidenceGraph } from "@/lib/trust-ledger/evidenceGraph";
import { stableHash } from "@/lib/trust-ledger/hash";
import { compileSoftwareTrustScore } from "@/lib/trust-ledger/scoreCompiler";
import type { ProjectWorkspace } from "@/lib/services/projectWorkspace";

const workspace = buildWorkspace();
const graph = buildTrustLedgerEvidenceGraph(workspace);
const score = compileSoftwareTrustScore({ workspace, graph });
const claimGate = buildAndGateTrustLedgerClaims({ workspace, graph, score });

const secondGraph = buildTrustLedgerEvidenceGraph(workspace);
const secondScore = compileSoftwareTrustScore({ workspace, graph: secondGraph });
const secondClaimGate = buildAndGateTrustLedgerClaims({ workspace, graph: secondGraph, score: secondScore });

const evidenceIds = new Set(graph.nodes.filter((node) => node.type === "evidence").map((node) => node.id));
const categoryKeys = new Set(score.categories.map((category) => category.key));

assert.equal(stableHash(graph), stableHash(secondGraph));
assert.equal(stableHash(score), stableHash(secondScore));
assert.equal(stableHash(claimGate.acceptedClaims), stableHash(secondClaimGate.acceptedClaims));
assert.ok(graph.counts.evidence >= 4);
assert.ok(graph.counts.findings >= 3);
assert.ok(score.score <= score.rawScore);
assert.ok(score.capsApplied.some((cap) => cap.rule === "CRITICAL_SECURITY"));
assert.ok(score.categories.every((category) => category.score <= category.maxScore && category.maxScore <= category.weight));
assert.ok(score.categories.some((category) => category.key === "securityTrust" && category.deductions.length > 0));
assert.ok(claimGate.acceptedClaims.length > 0);

for (const claim of claimGate.acceptedClaims) {
  assert.ok(claim.evidenceIds.length, `claim ${claim.id} is missing evidence`);
  assert.ok(claim.evidenceIds.every((id) => evidenceIds.has(id)), `claim ${claim.id} references unknown evidence`);
  assert.ok(claim.relatedScoreKeys.every((key) => categoryKeys.has(key)), `claim ${claim.id} references unknown score key`);
}

const unsupported = buildAndGateTrustLedgerClaims({
  workspace,
  graph: { ...graph, nodes: graph.nodes.filter((node) => node.type !== "evidence") },
  score,
});
assert.ok(unsupported.rejectedClaims.length > 0);

console.log(JSON.stringify({
  passed: true,
  graph: graph.counts,
  score: {
    score: score.score,
    rawScore: score.rawScore,
    rating: score.rating,
    verdict: score.verdict,
    confidence: score.confidence,
    caps: score.capsApplied.map((cap) => cap.rule),
  },
  claims: claimGate.stats,
}, null, 2));

function buildWorkspace(): ProjectWorkspace {
  const now = "2026-06-06T11:00:00.000Z";
  const previous = scan("scan-previous", 75, 0, "2026-06-05T11:00:00.000Z");
  const current = scan("scan-current", 63, 1, now);

  return {
    project: {
      id: "project-trust-ledger",
      name: "Ledger Test App",
      slug: "ledger-test-app",
      category: "saas",
      problem: "prove software trust",
      audience: "buyers",
      uiDirection: "decision system",
      monetization: "appraisals",
      prompt: "Build a trust ledger",
      status: "ready",
      createdAt: "2026-06-01T11:00:00.000Z",
      updatedAt: now,
      files: [],
      onboarding: [],
      features: [],
      qa: {
        score: 63,
        threshold: 85,
        releaseApproved: false,
        issues: [],
        blockers: [],
        simulatedUsers: [],
        productionQuestions: {
          wouldSomeonePay: true,
          wouldEmbarrassFounder: false,
          survivesRealUsers: false,
          feelsPremiumBesideSaaS: true,
        },
        dimensions: {},
      },
    } as NonNullable<ProjectWorkspace["project"]>,
    isLegacy: false,
    scans: [current, previous],
    scanHistory: [current, previous],
    scoreHistory: [
      { id: previous.id, label: "Scan 1", readinessScore: previous.readinessScore, findingsCount: previous.findingsCount, criticalFindingsCount: previous.criticalFindingsCount, scannedAt: previous.scannedAt },
      { id: current.id, label: "Scan 2", readinessScore: current.readinessScore, findingsCount: current.findingsCount, criticalFindingsCount: current.criticalFindingsCount, scannedAt: current.scannedAt },
    ],
    scanComparison: {
      current,
      previous,
      readinessDelta: current.readinessScore - previous.readinessScore,
      findingsDelta: current.findingsCount - previous.findingsCount,
      criticalFindingsDelta: current.criticalFindingsCount - previous.criticalFindingsCount,
      summary: "Current scan regressed and needs review.",
    },
    regressionReport: null,
    findings: [
      finding("critical", "Missing ownership validation", "Security", "app/api/projects/route.ts", "Project mutation route lacks ownership validation before update."),
      finding("high", "Billing entitlement gap", "Payments", "app/api/billing/route.ts", "Checkout flow has payment entitlement risk."),
      finding("medium", "Deployment env validation missing", "Deployment", "lib/env.ts", "Required deployment environment checks are not proven by scan evidence."),
    ],
    reports: [{ id: "report-1", source: "analysis_result", title: "Analysis result", riskLevel: "high", score: 63, createdAt: now }],
    history: [{ id: "deployment-1", type: "deployment", title: "Deployment", detail: "ready", createdAt: now }],
    repositoryLinks: [{ id: "repo-1", provider: "github", repository: "owner/ledger-test-app", url: "https://github.com/owner/ledger-test-app", branch: "main", updatedAt: now }],
    legacyScans: [],
    migration: { projectIdOptional: true, legacyScansAccessible: true },
  };
}

function scan(id: string, readinessScore: number, criticalFindingsCount: number, scannedAt: string) {
  return {
    id,
    source: "repo_scan",
    scanRefId: id,
    framework: "next",
    riskLevel: readinessScore >= 85 ? "low" : "high",
    securityScore: readinessScore,
    failureScore: 100 - readinessScore,
    readinessScore,
    issueCount: criticalFindingsCount + 2,
    findingsCount: criticalFindingsCount + 2,
    criticalFindingsCount,
    createdAt: scannedAt,
    scannedAt,
  };
}

function finding(severity: string, title: string, category: string, filePath: string, evidence: string): ProjectWorkspace["findings"][number] {
  return {
    id: `${severity}:${title}`,
    scanId: "scan-current",
    severity,
    category,
    title,
    evidence,
    fixSuggestion: `Fix ${title}.`,
    filePath,
    codeFix: `// ${title}`,
    expectedResult: `Next scan no longer reports ${title}.`,
    verificationEvidence: `${filePath} contains evidence for ${title}.`,
    confidenceScore: 0.93,
    createdAt: "2026-06-06T11:00:00.000Z",
  };
}

