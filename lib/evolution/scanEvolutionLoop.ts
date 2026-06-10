import { createHash, randomUUID } from "node:crypto";

import { tryDatabase } from "@/lib/prisma";
import { sanitizeMetadata } from "@/lib/services/platformSupport";
import type { FailureMode } from "@/lib/services/failureIntelligence";
import type { FailureReport } from "@/lib/services/failureAnalysisPipeline";
import type { IntelligenceIssue, SecurityCategory, SecuritySeverity, SeverityBreakdown } from "@/lib/services/intelligenceAnalysis";

export type ScanEvolutionKind = "app_analysis" | "repo_scan" | "public_demo";
export type ScanEvolutionNodeType = "scan" | "pattern" | "issue" | "file" | "route" | "insight";
export type ScanEvolutionEdgeType = "contains" | "caused_by" | "affects_file" | "affects_route" | "recommends";

export type ScanEvolutionInput = {
  projectId?: string | null;
  scanKind: ScanEvolutionKind;
  scanRefId?: string | null;
  framework: string;
  modules: string[];
  readinessScore: number;
  riskLevel: SecuritySeverity;
  severityBreakdown: SeverityBreakdown;
  issues: IntelligenceIssue[];
  failureReport?: FailureReport | null;
  metadata?: Record<string, unknown>;
};

export type FailurePatternMemory = {
  id: string;
  mode: FailureMode | "scan-finding";
  title: string;
  category: SecurityCategory | "failure-intelligence";
  severity: SecuritySeverity;
  confidence: number;
  occurrences: number;
  evidence: Array<{
    source: "issue" | "failure_prediction";
    id: string;
    title: string;
    filePath?: string;
    reason: string;
  }>;
};

export type CausalGraphNode = {
  id: string;
  type: ScanEvolutionNodeType;
  label: string;
  severity?: SecuritySeverity;
  confidence?: number;
  filePath?: string;
  route?: string;
};

export type CausalGraphEdge = {
  from: string;
  to: string;
  relationship: ScanEvolutionEdgeType;
  evidence: string;
};

export type CausalAnalysisGraph = {
  nodes: CausalGraphNode[];
  edges: CausalGraphEdge[];
  rootPatternIds: string[];
};

export type ImprovementInsight = {
  id: string;
  title: string;
  priority: "critical" | "high" | "medium" | "low";
  recommendation: string;
  confidence: number;
  patternIds: string[];
  evidence: Array<{
    patternId: string;
    reason: string;
    sourceIssueIds: string[];
  }>;
};

export type ScanEvolutionSnapshot = {
  engine: "ventureos-scan-evolution-loop";
  version: "1.0.0";
  generatedAt: string;
  applyMode: "snapshot-only";
  mutationPolicy: {
    autoModification: false;
    patching: false;
    deploymentActions: false;
    databaseSchemaChanges: false;
  };
  sourceScan: {
    kind: ScanEvolutionKind;
    scanRefId: string | null;
    framework: string;
    modules: string[];
    readinessScore: number;
    riskLevel: SecuritySeverity;
    issueCount: number;
    severityBreakdown: SeverityBreakdown;
  };
  failurePatterns: FailurePatternMemory[];
  causalAnalysisGraph: CausalAnalysisGraph;
  improvementInsights: ImprovementInsight[];
  telemetryMemory: {
    dataset: "evolution_scan_memory";
    eventType: "evolution.scan_result.ingested";
    compact: true;
    stored: boolean;
  };
};

export type ScanEvolutionIngestResult = ScanEvolutionSnapshot;

export function buildScanEvolutionSnapshot(input: ScanEvolutionInput): ScanEvolutionSnapshot {
  const normalized = normalizeInput(input);
  const failurePatterns = extractFailurePatterns(normalized);
  const improvementInsights = generateImprovementInsights(failurePatterns, normalized);
  const causalAnalysisGraph = buildCausalGraph(normalized, failurePatterns, improvementInsights);

  return {
    engine: "ventureos-scan-evolution-loop",
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    applyMode: "snapshot-only",
    mutationPolicy: {
      autoModification: false,
      patching: false,
      deploymentActions: false,
      databaseSchemaChanges: false,
    },
    sourceScan: {
      kind: normalized.scanKind,
      scanRefId: normalized.scanRefId || null,
      framework: normalized.framework,
      modules: normalized.modules,
      readinessScore: boundedScore(normalized.readinessScore),
      riskLevel: normalized.riskLevel,
      issueCount: normalized.issues.length,
      severityBreakdown: normalized.severityBreakdown,
    },
    failurePatterns,
    causalAnalysisGraph,
    improvementInsights,
    telemetryMemory: {
      dataset: "evolution_scan_memory",
      eventType: "evolution.scan_result.ingested",
      compact: true,
      stored: false,
    },
  };
}

export async function ingestScanEvolutionLoop(input: ScanEvolutionInput): Promise<ScanEvolutionIngestResult> {
  const snapshot = buildScanEvolutionSnapshot(input);
  const stored = await storeScanEvolutionMemory(input.projectId || null, snapshot, input.metadata || {});
  return {
    ...snapshot,
    telemetryMemory: {
      ...snapshot.telemetryMemory,
      stored,
    },
  };
}

async function storeScanEvolutionMemory(projectId: string | null, snapshot: ScanEvolutionSnapshot, metadata: Record<string, unknown>) {
  const stored = await tryDatabase(async (db) => {
    await db.$executeRawUnsafe(
      `INSERT INTO "app_telemetry_events" ("id", "projectId", "snapshotId", "analysisResultId", "eventType", "dataset", "framework", "riskLevel", "severity", "counts", "metadata")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb)`,
      randomUUID(),
      projectId,
      null,
      null,
      snapshot.telemetryMemory.eventType,
      snapshot.telemetryMemory.dataset,
      snapshot.sourceScan.framework,
      snapshot.sourceScan.riskLevel,
      highestSeverity(snapshot.sourceScan.severityBreakdown),
      JSON.stringify({
        readinessScore: snapshot.sourceScan.readinessScore,
        issueCount: snapshot.sourceScan.issueCount,
        patterns: snapshot.failurePatterns.length,
        graphNodes: snapshot.causalAnalysisGraph.nodes.length,
        graphEdges: snapshot.causalAnalysisGraph.edges.length,
        insights: snapshot.improvementInsights.length,
        ...snapshot.sourceScan.severityBreakdown,
      }),
      JSON.stringify(
        sanitizeMetadata({
          scanRefId: snapshot.sourceScan.scanRefId,
          scanKind: snapshot.sourceScan.kind,
          compact: true,
          snapshotOnly: true,
          mutationPolicy: snapshot.mutationPolicy,
          failurePatterns: snapshot.failurePatterns.slice(0, 12).map((pattern) => ({
            id: pattern.id,
            mode: pattern.mode,
            title: pattern.title,
            category: pattern.category,
            severity: pattern.severity,
            confidence: pattern.confidence,
            occurrences: pattern.occurrences,
          })),
          causalGraph: {
            nodes: snapshot.causalAnalysisGraph.nodes.length,
            edges: snapshot.causalAnalysisGraph.edges.length,
            rootPatternIds: snapshot.causalAnalysisGraph.rootPatternIds.slice(0, 12),
          },
          improvementInsights: snapshot.improvementInsights.slice(0, 10).map((insight) => ({
            id: insight.id,
            title: insight.title,
            priority: insight.priority,
            confidence: insight.confidence,
            patternIds: insight.patternIds,
          })),
          metadata,
        }),
      ),
    );
    return true;
  });

  return Boolean(stored);
}

function normalizeInput(input: ScanEvolutionInput): ScanEvolutionInput {
  const issues = (input.issues || [])
    .filter((issue) => issue && typeof issue.id === "string" && typeof issue.title === "string")
    .map((issue) => ({
      ...issue,
      severity: normalizeSeverity(issue.severity),
      category: normalizeCategory(issue.category),
      title: issue.title.trim().slice(0, 180),
      fixSuggestion: issue.fixSuggestion.trim().slice(0, 260),
      filePath: issue.filePath?.trim().slice(0, 240),
    }))
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.category.localeCompare(b.category) || a.title.localeCompare(b.title));

  return {
    ...input,
    framework: input.framework.trim().toLowerCase() || "unknown",
    modules: [...new Set((input.modules || []).map((moduleName) => moduleName.trim().toLowerCase()).filter(Boolean))].sort(),
    readinessScore: boundedScore(input.readinessScore),
    riskLevel: normalizeSeverity(input.riskLevel),
    severityBreakdown: normalizeSeverityBreakdown(input.severityBreakdown, issues),
    issues,
  };
}

function extractFailurePatterns(input: ScanEvolutionInput): FailurePatternMemory[] {
  const byKey = new Map<string, FailurePatternMemory>();

  for (const issue of input.issues) {
    const mode = modeForIssue(issue);
    const key = `${mode}:${issue.category}:${issue.severity}`;
    const existing = byKey.get(key);
    const evidence = {
      source: "issue" as const,
      id: issue.id,
      title: issue.title,
      filePath: issue.filePath,
      reason: issue.evidence || issue.explanation || "Scanner finding supplied evidence for this failure pattern.",
    };
    if (existing) {
      existing.occurrences += 1;
      existing.confidence = boundedConfidence(Math.max(existing.confidence, issue.confidenceScore || 0.72));
      existing.evidence.push(evidence);
    } else {
      byKey.set(key, {
        id: stableId(["pattern", key]),
        mode,
        title: titleForPattern(mode, issue),
        category: issue.category,
        severity: issue.severity,
        confidence: boundedConfidence(issue.confidenceScore || 0.72),
        occurrences: 1,
        evidence: [evidence],
      });
    }
  }

  for (const prediction of input.failureReport?.predictedFailureScenarios || []) {
    const key = `${prediction.mode}:failure-intelligence:${prediction.severity}`;
    const existing = byKey.get(key);
    const evidence = {
      source: "failure_prediction" as const,
      id: prediction.id,
      title: prediction.title,
      reason: prediction.productionScenario,
    };
    if (existing) {
      existing.occurrences += 1;
      existing.confidence = boundedConfidence(Math.max(existing.confidence, prediction.confidenceScore / 100));
      existing.evidence.push(evidence);
    } else {
      byKey.set(key, {
        id: stableId(["pattern", key]),
        mode: prediction.mode,
        title: prediction.title,
        category: "failure-intelligence",
        severity: prediction.severity,
        confidence: boundedConfidence(prediction.confidenceScore / 100),
        occurrences: 1,
        evidence: [evidence],
      });
    }
  }

  return [...byKey.values()]
    .map((pattern) => ({
      ...pattern,
      evidence: pattern.evidence.slice(0, 8),
    }))
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.occurrences - a.occurrences || a.title.localeCompare(b.title))
    .slice(0, 20);
}

function buildCausalGraph(input: ScanEvolutionInput, patterns: FailurePatternMemory[], insights: ImprovementInsight[]): CausalAnalysisGraph {
  const nodes = new Map<string, CausalGraphNode>();
  const edges: CausalGraphEdge[] = [];
  const scanNodeId = stableId(["scan", input.scanKind, input.scanRefId || input.readinessScore]);
  nodes.set(scanNodeId, {
    id: scanNodeId,
    type: "scan",
    label: `${input.scanKind} readiness ${input.readinessScore}`,
    severity: input.riskLevel,
  });

  for (const pattern of patterns) {
    nodes.set(pattern.id, {
      id: pattern.id,
      type: "pattern",
      label: pattern.title,
      severity: pattern.severity,
      confidence: pattern.confidence,
    });
    edges.push({ from: scanNodeId, to: pattern.id, relationship: "contains", evidence: `${pattern.occurrences} scan signal(s) map to this pattern.` });

    for (const item of pattern.evidence) {
      const issueNodeId = stableId(["issue", item.id]);
      nodes.set(issueNodeId, {
        id: issueNodeId,
        type: "issue",
        label: item.title,
        filePath: item.filePath,
      });
      edges.push({ from: pattern.id, to: issueNodeId, relationship: "caused_by", evidence: item.reason.slice(0, 240) });
      if (item.filePath) {
        const fileNodeId = stableId(["file", item.filePath]);
        nodes.set(fileNodeId, {
          id: fileNodeId,
          type: "file",
          label: item.filePath,
          filePath: item.filePath,
        });
        edges.push({ from: issueNodeId, to: fileNodeId, relationship: "affects_file", evidence: "Finding evidence includes this file path." });
      }
      const route = routeFromEvidence(item.title, item.reason);
      if (route) {
        const routeNodeId = stableId(["route", route]);
        nodes.set(routeNodeId, {
          id: routeNodeId,
          type: "route",
          label: route,
          route,
        });
        edges.push({ from: issueNodeId, to: routeNodeId, relationship: "affects_route", evidence: "Finding evidence references this route." });
      }
    }
  }

  for (const insight of insights) {
    nodes.set(insight.id, {
      id: insight.id,
      type: "insight",
      label: insight.title,
      severity: insight.priority,
      confidence: insight.confidence,
    });
    for (const patternId of insight.patternIds) {
      if (nodes.has(patternId)) {
        edges.push({ from: patternId, to: insight.id, relationship: "recommends", evidence: insight.recommendation.slice(0, 240) });
      }
    }
  }

  return {
    nodes: [...nodes.values()].slice(0, 80),
    edges: edges.slice(0, 160),
    rootPatternIds: patterns.slice(0, 8).map((pattern) => pattern.id),
  };
}

function generateImprovementInsights(patterns: FailurePatternMemory[], input: ScanEvolutionInput): ImprovementInsight[] {
  return patterns
    .filter((pattern) => pattern.evidence.length > 0)
    .slice(0, 12)
    .map((pattern) => {
      const sourceIssueIds = pattern.evidence.map((item) => item.id);
      const recommendation = recommendationForPattern(pattern, input);
      return {
        id: stableId(["insight", pattern.id, recommendation]),
        title: `Reduce ${pattern.mode} risk`,
        priority: pattern.severity,
        recommendation,
        confidence: boundedConfidence(pattern.confidence),
        patternIds: [pattern.id],
        evidence: [
          {
            patternId: pattern.id,
            reason: `${pattern.occurrences} supported signal(s) in the scan result indicate ${pattern.title}.`,
            sourceIssueIds,
          },
        ],
      };
    });
}

function recommendationForPattern(pattern: FailurePatternMemory, input: ScanEvolutionInput) {
  const issueEvidence = pattern.evidence.find((item) => item.source === "issue");
  const matchingIssue = input.issues.find((issue) => issue.id === issueEvidence?.id && issue.fixSuggestion);
  if (matchingIssue?.fixSuggestion) return matchingIssue.fixSuggestion;

  const predictionEvidence = pattern.evidence.find((item) => item.source === "failure_prediction");
  const matchingPrediction = input.failureReport?.predictedFailureScenarios.find((prediction) => prediction.id === predictionEvidence?.id);
  if (matchingPrediction?.preventionSteps?.[0]) return matchingPrediction.preventionSteps[0];

  if (pattern.mode === "deployment-failure") return "Validate deployment environment, build scripts, migrations, workers, and health checks before promotion.";
  if (pattern.mode === "identity-compromise") return "Move identity and permission checks to server-resolved session guards before data access.";
  if (pattern.mode === "data-loss") return "Connect critical writes to durable backend persistence and verify read-after-write behavior.";
  if (pattern.mode === "payment-or-billing-break") return "Bind billing operations to server-side customer identity and verified provider events.";
  return "Add an execution-path test that proves the affected workflow completes with backend persistence and visible error handling.";
}

function modeForIssue(issue: IntelligenceIssue): FailureMode | "scan-finding" {
  const text = `${issue.category} ${issue.title} ${issue.evidence} ${issue.fixSuggestion}`.toLowerCase();
  if (/auth|admin|role|permission|session|owner/.test(text)) return "identity-compromise";
  if (/stripe|billing|payment|checkout|webhook/.test(text)) return "payment-or-billing-break";
  if (/database|db|migration|persistence|localstorage|storage|data/.test(text)) return "data-loss";
  if (/deploy|env|worker|queue|redis|lockfile|ci|health|serverless/.test(text)) return "deployment-failure";
  if (/api|route|runtime|missing|no-op|phantom|handler/.test(text)) return "runtime-break";
  if (/ui|button|placeholder|fake|demo/.test(text)) return "fake-workflow";
  return "scan-finding";
}

function titleForPattern(mode: FailureMode | "scan-finding", issue: IntelligenceIssue) {
  if (mode === "scan-finding") return issue.title;
  return `${humanizeMode(mode)} pattern: ${issue.title}`;
}

function humanizeMode(mode: FailureMode) {
  return mode.replace(/-/g, " ");
}

function routeFromEvidence(title: string, reason: string) {
  const match = `${title} ${reason}`.match(/\/api\/[A-Za-z0-9_[\]./-]+/);
  return match?.[0]?.replace(/[.,;:)]+$/, "") || "";
}

function normalizeSeverity(value: string): SecuritySeverity {
  const clean = value.trim().toLowerCase();
  if (clean === "critical" || clean === "high" || clean === "medium" || clean === "low") return clean;
  return "low";
}

function normalizeCategory(value: string): SecurityCategory {
  const clean = value.trim().toLowerCase();
  if (clean === "auth" || clean === "api" || clean === "db" || clean === "deployment" || clean === "frontend") return clean;
  return "api";
}

function normalizeSeverityBreakdown(value: SeverityBreakdown, issues: IntelligenceIssue[]): SeverityBreakdown {
  const fromIssues = issues.reduce<SeverityBreakdown>(
    (counts, issue) => {
      counts[issue.severity] += 1;
      return counts;
    },
    { critical: 0, high: 0, medium: 0, low: 0 },
  );
  return {
    critical: boundedCount(value?.critical ?? fromIssues.critical),
    high: boundedCount(value?.high ?? fromIssues.high),
    medium: boundedCount(value?.medium ?? fromIssues.medium),
    low: boundedCount(value?.low ?? fromIssues.low),
  };
}

function highestSeverity(breakdown: SeverityBreakdown): SecuritySeverity | "none" {
  if (breakdown.critical > 0) return "critical";
  if (breakdown.high > 0) return "high";
  if (breakdown.medium > 0) return "medium";
  if (breakdown.low > 0) return "low";
  return "none";
}

function severityRank(value: SecuritySeverity) {
  if (value === "critical") return 4;
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}

function boundedScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

function boundedCount(value: number) {
  return Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
}

function boundedConfidence(value: number) {
  return Math.max(0, Math.min(0.99, Number(value.toFixed(2))));
}

function stableId(parts: Array<string | number | null | undefined>) {
  return `evo_${createHash("sha256").update(parts.map((part) => String(part ?? "")).join("|")).digest("hex").slice(0, 16)}`;
}
