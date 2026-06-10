import assert from "node:assert/strict";

import { buildScanEvolutionSnapshot } from "@/lib/evolution/scanEvolutionLoop";
import type { IntelligenceIssue, SeverityBreakdown } from "@/lib/services/intelligenceAnalysis";

const issues: IntelligenceIssue[] = [
  {
    id: "auth-owner-missing",
    severity: "critical",
    category: "auth",
    title: "Project mutation route does not validate ownership",
    evidence: "POST /api/projects updates prisma.project without assertOwnership.",
    fixSuggestion: "Require server session and assert project ownership before mutation.",
    filePath: "app/api/projects/route.ts",
    confidenceScore: 0.94,
  },
  {
    id: "env-missing",
    severity: "high",
    category: "deployment",
    title: "Production env validation is incomplete",
    evidence: "Deployment scan found required API keys not documented in .env.example.",
    fixSuggestion: "Document and validate required production environment variables before boot.",
    filePath: "lib/env.ts",
    confidenceScore: 0.88,
  },
  {
    id: "local-storage-only",
    severity: "medium",
    category: "frontend",
    title: "Booking workflow persists only in localStorage",
    evidence: "localStorage.setItem is used without a backend persistence route.",
    fixSuggestion: "Connect booking actions to backend persistence or label the workflow demo-only.",
    filePath: "components/studio-booking-platform.tsx",
    confidenceScore: 0.82,
  },
];

const severityBreakdown: SeverityBreakdown = {
  critical: 1,
  high: 1,
  medium: 1,
  low: 0,
};

const snapshot = buildScanEvolutionSnapshot({
  projectId: "project-1",
  scanKind: "repo_scan",
  scanRefId: "scan-1",
  framework: "nextjs",
  modules: ["next", "prisma"],
  readinessScore: 52,
  riskLevel: "high",
  severityBreakdown,
  issues,
});

assert.equal(snapshot.engine, "ventureos-scan-evolution-loop");
assert.equal(snapshot.applyMode, "snapshot-only");
assert.equal(snapshot.mutationPolicy.autoModification, false);
assert.equal(snapshot.mutationPolicy.patching, false);
assert.equal(snapshot.mutationPolicy.deploymentActions, false);
assert.equal(snapshot.mutationPolicy.databaseSchemaChanges, false);
assert.equal(snapshot.sourceScan.issueCount, 3);
assert.ok(snapshot.failurePatterns.length >= 3);
assert.ok(snapshot.failurePatterns.some((pattern) => pattern.mode === "identity-compromise"));
assert.ok(snapshot.failurePatterns.some((pattern) => pattern.mode === "deployment-failure"));
assert.ok(snapshot.failurePatterns.some((pattern) => pattern.mode === "data-loss" || pattern.mode === "fake-workflow"));
assert.ok(snapshot.causalAnalysisGraph.nodes.some((node) => node.type === "scan"));
assert.ok(snapshot.causalAnalysisGraph.nodes.some((node) => node.type === "pattern"));
assert.ok(snapshot.causalAnalysisGraph.edges.some((edge) => edge.relationship === "caused_by"));
assert.ok(snapshot.improvementInsights.length > 0);
assert.ok(snapshot.improvementInsights.every((insight) => insight.patternIds.length > 0 && insight.evidence.length > 0));
assert.equal(snapshot.telemetryMemory.dataset, "evolution_scan_memory");
assert.equal(snapshot.telemetryMemory.eventType, "evolution.scan_result.ingested");
assert.equal(snapshot.telemetryMemory.stored, false);

console.log(JSON.stringify({
  passed: true,
  patterns: snapshot.failurePatterns.length,
  graphNodes: snapshot.causalAnalysisGraph.nodes.length,
  graphEdges: snapshot.causalAnalysisGraph.edges.length,
  insights: snapshot.improvementInsights.length,
  snapshotOnly: snapshot.applyMode === "snapshot-only",
}, null, 2));
