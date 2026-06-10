import {
  buildFailureIntelligence,
  summarizeFailureIntelligence,
  type FailureIntelligenceReport,
  type FailureMode,
  type FailurePrediction,
} from "@/lib/services/failureIntelligence";
import { buildActionableFixes, type ActionableFix } from "@/lib/intelligence/actionable-fix-engine";
import { buildExecutionGraph, type ExecutionPath } from "@/lib/intelligence/execution-path-mapper";
import { buildEvidenceReport, type EvidenceEngineResult, type TraceableFinding } from "@/lib/intelligence/evidence-engine";
import { simulateFailures, type FailureSimulationReport } from "@/lib/intelligence/failure-simulator";
import { buildLaunchVerdict, type LaunchVerdict } from "@/lib/intelligence/launch-verdict";
import { buildProductionReadinessScoreFromReadiness, scoreProductionReadiness, type ProductionReadinessReport, type ProductionReadinessScoreReport } from "@/lib/intelligence/readiness-score";
import { buildSystemModel, type SystemModel } from "@/lib/intelligence/system-model";
import type { IntelligenceIssue, SeverityBreakdown } from "@/lib/services/intelligenceAnalysis";

export type ExecutionPathReport = {
  total: number;
  highRiskCount: number;
  paths: ExecutionPathReportItem[];
};

export type ExecutionPathReportItem = {
  id: string;
  entryPoint: string;
  action: string;
  apiRoute: string | null;
  databaseOperations: Array<{
    operation: string;
    target: string;
    filePath: string;
  }>;
  dependencies: Array<{
    type: string;
    name: string;
    filePath?: string;
  }>;
  riskScore: number;
  riskSignals: string[];
};

export type BusinessImpactReport = {
  summary: string;
  affectedSystems: string[];
  revenueRisk: number;
  trustRisk: number;
  dataRisk: number;
  launchRisk: number;
  topImpacts: BusinessImpactItem[];
};

export type BusinessImpactItem = {
  source: "failure-intelligence" | "evidence-engine" | "production-readiness";
  title: string;
  severity: IntelligenceIssue["severity"];
  confidence: number;
  impact: string;
  affectedFiles: string[];
  affectedRoutes: string[];
  recommendation?: string;
};

export type FailureReport = {
  reportType: "failure-report";
  pipeline: "post-scan-failure-intelligence";
  pipelineVersion: "1.0.0";
  generatedAfter: "scanner";
  generatedAt: string;
  sourceScan: {
    kind: "app_analysis" | "repo_scan" | "public_demo";
    framework: string;
    modules: string[];
    findingsCount: number;
    securityScore: number;
    severityBreakdown: SeverityBreakdown;
  };
  failureIntelligence: FailureIntelligenceReport;
  predictedFailureScenarios: FailurePrediction[];
  legacyPredictedFailurePoints: string[];
  releaseDecision: FailureIntelligenceReport["launchDecision"];
  launchVerdict: LaunchVerdict;
  highestRiskMode: FailureMode | null;
  systemModel: SystemModel;
  executionPaths: ExecutionPathReport;
  failureSimulations: FailureSimulationReport;
  businessImpact: BusinessImpactReport;
  productionReadiness: ProductionReadinessReport;
  launchReadinessScore: ProductionReadinessScoreReport;
  actionableFixes: ActionableFix[];
  evidenceSummary: EvidenceEngineResult["summary"];
  backwardCompatible: true;
  summary: string;
};

export type PostScanFailurePipelineInput = {
  scanKind: "app_analysis" | "repo_scan" | "public_demo";
  framework: string;
  modules: string[];
  findings: IntelligenceIssue[];
  securityScore: number;
  severityBreakdown: SeverityBreakdown;
  source?: string;
  validationResults?: Record<string, unknown>;
  failureEvents?: unknown[];
  legacyPredictedFailurePoints?: string[];
};

export type PostScanFailurePipelineResult = {
  failureIntelligence: FailureIntelligenceReport;
  failureReport: FailureReport;
  predictedFailureScenarios: FailurePrediction[];
};

export function runPostScanFailurePipeline(input: PostScanFailurePipelineInput): PostScanFailurePipelineResult {
  const reportUpgrade = buildReportUpgrade(input);
  const failureIntelligence = buildFailureIntelligence({
    issues: input.findings,
    framework: input.framework,
    modules: input.modules,
    securityScore: input.securityScore,
    severityBreakdown: input.severityBreakdown,
    source: input.source,
    validationResults: input.validationResults,
    failureEvents: input.failureEvents,
    context: input.scanKind,
  });
  const predictedFailureScenarios = failureIntelligence.topPredictions;
  const businessImpact = buildBusinessImpactReport({
    predictions: predictedFailureScenarios,
    evidenceReport: reportUpgrade.evidenceReport,
    productionReadiness: reportUpgrade.productionReadiness,
  });
  const launchVerdict = buildLaunchVerdict({
    productionReadiness: reportUpgrade.productionReadiness,
    evidenceReport: reportUpgrade.evidenceReport,
    failureIntelligence,
    predictedFailureScenarios,
    failureSimulations: reportUpgrade.failureSimulations,
    severityBreakdown: input.severityBreakdown,
  });
  const failureReport: FailureReport = {
    reportType: "failure-report",
    pipeline: "post-scan-failure-intelligence",
    pipelineVersion: "1.0.0",
    generatedAfter: "scanner",
    generatedAt: failureIntelligence.generatedAt,
    sourceScan: {
      kind: input.scanKind,
      framework: input.framework,
      modules: input.modules,
      findingsCount: input.findings.length,
      securityScore: input.securityScore,
      severityBreakdown: input.severityBreakdown,
    },
    failureIntelligence,
    predictedFailureScenarios,
    legacyPredictedFailurePoints: input.legacyPredictedFailurePoints || input.findings.map((finding) => finding.title),
    releaseDecision: failureIntelligence.launchDecision,
    launchVerdict,
    highestRiskMode: predictedFailureScenarios[0]?.mode || null,
    systemModel: reportUpgrade.systemModel,
    executionPaths: reportUpgrade.executionPaths,
    failureSimulations: reportUpgrade.failureSimulations,
    businessImpact,
    productionReadiness: reportUpgrade.productionReadiness,
    launchReadinessScore: buildProductionReadinessScoreFromReadiness(reportUpgrade.productionReadiness),
    actionableFixes: reportUpgrade.actionableFixes,
    evidenceSummary: reportUpgrade.evidenceReport.summary,
    backwardCompatible: true,
    summary: failureIntelligence.summary,
  };

  return {
    failureIntelligence,
    failureReport,
    predictedFailureScenarios,
  };
}

export function summarizeFailureReport(report: FailureReport) {
  return {
    reportType: report.reportType,
    pipeline: report.pipeline,
    pipelineVersion: report.pipelineVersion,
    generatedAfter: report.generatedAfter,
    sourceScan: {
      kind: report.sourceScan.kind,
      findingsCount: report.sourceScan.findingsCount,
      securityScore: report.sourceScan.securityScore,
    },
    releaseDecision: report.releaseDecision,
    launchVerdict: {
      title: report.launchVerdict.title,
      verdict: report.launchVerdict.verdict,
      confidence: report.launchVerdict.confidence,
      summary: report.launchVerdict.summary,
      reasons: report.launchVerdict.reasons.slice(0, 5),
      blockers: report.launchVerdict.blockers.slice(0, 5),
      warnings: report.launchVerdict.warnings.slice(0, 5),
      nextAction: report.launchVerdict.nextAction,
      proofGate: report.launchVerdict.proofGate,
    },
    highestRiskMode: report.highestRiskMode,
    systemModel: summarizeSystemModel(report.systemModel),
    backwardCompatible: report.backwardCompatible,
    failureIntelligence: summarizeFailureIntelligence(report.failureIntelligence),
    executionPaths: {
      total: report.executionPaths.total,
      highRiskCount: report.executionPaths.highRiskCount,
      topPaths: report.executionPaths.paths.slice(0, 5),
    },
    failureSimulations: {
      coverage: report.failureSimulations.coverage,
      simulations: report.failureSimulations.simulations.slice(0, 5),
    },
    businessImpact: {
      summary: report.businessImpact.summary,
      affectedSystems: report.businessImpact.affectedSystems,
      revenueRisk: report.businessImpact.revenueRisk,
      trustRisk: report.businessImpact.trustRisk,
      dataRisk: report.businessImpact.dataRisk,
      launchRisk: report.businessImpact.launchRisk,
      topImpacts: report.businessImpact.topImpacts.slice(0, 5),
    },
    productionReadiness: {
      score: report.productionReadiness.score,
      status: report.productionReadiness.status,
      subscores: report.productionReadiness.subscores,
      blockers: report.productionReadiness.blockers.slice(0, 5),
      warnings: report.productionReadiness.warnings.slice(0, 5),
      evidenceSummary: report.productionReadiness.evidenceSummary,
    },
    launchReadinessScore: report.launchReadinessScore,
    actionableFixes: report.actionableFixes.slice(0, 12),
    evidenceSummary: report.evidenceSummary,
  };
}

function summarizeSystemModel(model: SystemModel) {
  return {
    modeler: model.modeler,
    version: model.version,
    summary: model.summary,
    executionGraph: {
      nodeCount: model.executionGraph.nodeCount,
      edgeCount: model.executionGraph.edgeCount,
      pathCount: model.executionGraph.pathCount,
      highRiskPathCount: model.executionGraph.highRiskPathCount,
      paths: model.executionGraph.paths.slice(0, 8),
    },
    trustGraph: {
      summary: model.trustGraph.summary,
      trustBoundaries: model.trustGraph.trustBoundaries.slice(0, 8),
      requestControlledInputs: model.trustGraph.requestControlledInputs.slice(0, 8),
      ownershipChecks: model.trustGraph.ownershipChecks.slice(0, 8),
    },
    dataGraph: {
      summary: model.dataGraph.summary,
      databaseOperations: model.dataGraph.databaseOperations.slice(0, 8),
      stateStores: model.dataGraph.stateStores.slice(0, 8),
      dataFlows: model.dataGraph.dataFlows.slice(0, 8),
    },
    apiGraph: {
      summary: model.apiGraph.summary,
      routes: model.apiGraph.routes.slice(0, 12),
      unresolvedClientCalls: model.apiGraph.unresolvedClientCalls.slice(0, 8),
      dependencies: model.apiGraph.dependencies.slice(0, 8),
    },
    uiGraph: {
      summary: model.uiGraph.summary,
      pages: model.uiGraph.pages.slice(0, 12),
      interactions: model.uiGraph.interactions.slice(0, 12),
    },
    failureSurfaceMap: {
      summary: model.failureSurfaceMap.summary,
      byCategory: model.failureSurfaceMap.byCategory,
      bySeverity: model.failureSurfaceMap.bySeverity,
      surfaces: model.failureSurfaceMap.surfaces.slice(0, 8),
    },
  };
}

function buildReportUpgrade(input: PostScanFailurePipelineInput) {
  if (!input.source?.trim()) {
    const evidenceReport = emptyEvidenceReport();
    const productionReadiness = scoreProductionReadiness();
    return {
      systemModel: buildSystemModel({ executionGraph: { nodes: [], edges: [], paths: [] }, evidenceReport }),
      executionPaths: summarizeExecutionPaths([]),
      failureSimulations: simulateFailures({ evidenceReport, executionPaths: [] }),
      evidenceReport,
      productionReadiness,
      actionableFixes: [],
    };
  }

  const graph = buildExecutionGraph({ source: input.source });
  const evidenceReport = buildEvidenceReport({ source: input.source, graph, executionPaths: graph.paths });
  const systemModel = buildSystemModel({ source: input.source, executionGraph: graph, evidenceReport });
  const productionReadiness = scoreProductionReadiness({
    source: input.source,
    graph,
    executionPaths: graph.paths,
    evidenceReport,
  });
  const actionableFixes = buildActionableFixes({
    issues: input.findings,
    files: sourceFiles(input.source),
    framework: input.framework,
  });

  return {
    systemModel,
    executionPaths: summarizeExecutionPaths(graph.paths),
    failureSimulations: simulateFailures({ evidenceReport, executionPaths: graph.paths }),
    evidenceReport,
    productionReadiness,
    actionableFixes,
  };
}

function summarizeExecutionPaths(paths: ExecutionPath[]): ExecutionPathReport {
  const sorted = [...paths].sort((a, b) => b.riskScore - a.riskScore);
  return {
    total: paths.length,
    highRiskCount: paths.filter((path) => path.riskScore >= 70).length,
    paths: sorted.slice(0, 30).map((path) => ({
      id: path.id,
      entryPoint: path.entryPoint,
      action: path.action,
      apiRoute: path.apiRoute,
      databaseOperations: path.databaseOperations.map((operation) => ({
        operation: operation.operation,
        target: operation.target,
        filePath: operation.filePath,
      })),
      dependencies: path.dependencies.map((dependency) => ({
        type: dependency.type,
        name: dependency.name,
        filePath: dependency.filePath,
      })),
      riskScore: path.riskScore,
      riskSignals: path.riskSignals || [],
    })),
  };
}

function buildBusinessImpactReport(input: {
  predictions: FailurePrediction[];
  evidenceReport: EvidenceEngineResult;
  productionReadiness: ProductionReadinessReport;
}): BusinessImpactReport {
  const topImpacts = dedupeBusinessImpacts([
    ...input.predictions.slice(0, 8).map(impactFromPrediction),
    ...input.evidenceReport.findings.slice(0, 8).map(impactFromEvidenceFinding),
    ...input.productionReadiness.blockers.slice(0, 6).map((reason): BusinessImpactItem => ({
      source: "production-readiness",
      title: reason.title,
      severity: reason.severity || "medium",
      confidence: reason.confidence || 75,
      impact: reason.impact,
      affectedFiles: reason.affectedFiles,
      affectedRoutes: reason.affectedRoutes,
      recommendation: reason.fixRecommendation,
    })),
  ]).slice(0, 12);

  const affectedSystems = unique(topImpacts.flatMap((impact) => systemsForImpact(impact))).sort();

  return {
    summary: businessImpactSummary(topImpacts),
    affectedSystems,
    revenueRisk: riskScoreFor(topImpacts, /\b(billing|stripe|checkout|payment|subscription|revenue|invoice|portal)\b/i),
    trustRisk: riskScoreFor(topImpacts, /\b(auth|session|owner|tenant|role|admin|permission|cross-user|trust)\b/i),
    dataRisk: riskScoreFor(topImpacts, /\b(data|database|db|prisma|persist|save|migration|schema|loss)\b/i),
    launchRisk: riskScoreFor(topImpacts, /\b(deploy|launch|env|worker|queue|build|runtime|api|route|endpoint)\b/i),
    topImpacts,
  };
}

function impactFromPrediction(prediction: FailurePrediction): BusinessImpactItem {
  return {
    source: "failure-intelligence",
    title: prediction.title,
    severity: prediction.severity,
    confidence: prediction.confidenceScore,
    impact: prediction.businessImpact,
    affectedFiles: unique(prediction.evidenceChain.map((item) => item.filePath).filter((item): item is string => Boolean(item))),
    affectedRoutes: [],
    recommendation: prediction.preventionSteps[0],
  };
}

function impactFromEvidenceFinding(finding: TraceableFinding): BusinessImpactItem {
  return {
    source: "evidence-engine",
    title: finding.title,
    severity: finding.severity,
    confidence: finding.confidence,
    impact: finding.businessImpact,
    affectedFiles: finding.affectedFiles,
    affectedRoutes: finding.affectedRoutes,
    recommendation: finding.fixRecommendation,
  };
}

function businessImpactSummary(impacts: BusinessImpactItem[]) {
  if (impacts.length === 0) return "No high-confidence business impact was generated from the current evidence.";
  const top = impacts[0];
  return `${top.severity.toUpperCase()} business impact: ${top.impact}`;
}

function systemsForImpact(impact: BusinessImpactItem) {
  const text = `${impact.title} ${impact.impact} ${impact.recommendation || ""} ${impact.affectedFiles.join(" ")} ${impact.affectedRoutes.join(" ")}`;
  const systems: string[] = [];
  if (/\b(billing|stripe|checkout|payment|subscription|invoice|portal)\b/i.test(text)) systems.push("Billing");
  if (/\b(auth|session|login|token|cookie|credential)\b/i.test(text)) systems.push("Authentication");
  if (/\b(owner|tenant|org|role|admin|permission|cross-user)\b/i.test(text)) systems.push("Authorization");
  if (/\b(data|database|db|prisma|persist|save|migration|schema)\b/i.test(text)) systems.push("Data");
  if (/\b(deploy|launch|env|worker|queue|build|runtime)\b/i.test(text)) systems.push("Deployment");
  if (/\b(api|route|endpoint|service|provider|integration)\b/i.test(text)) systems.push("API");
  return systems.length ? systems : ["Operations"];
}

function riskScoreFor(impacts: BusinessImpactItem[], matcher: RegExp) {
  const scoped = impacts.filter((impact) => matcher.test(`${impact.title} ${impact.impact} ${impact.recommendation || ""}`));
  if (scoped.length === 0) return 0;
  const maxSeverity = Math.max(...scoped.map((impact) => severityScore(impact.severity)));
  const confidence = Math.round(scoped.reduce((sum, impact) => sum + impact.confidence, 0) / scoped.length);
  return clamp(Math.round(maxSeverity * 0.65 + confidence * 0.35));
}

function severityScore(severity: IntelligenceIssue["severity"]) {
  if (severity === "critical") return 100;
  if (severity === "high") return 82;
  if (severity === "medium") return 58;
  return 32;
}

function dedupeBusinessImpacts(items: BusinessImpactItem[]) {
  const seen = new Set<string>();
  const output: BusinessImpactItem[] = [];
  for (const item of items) {
    const key = `${item.source}:${item.title}:${item.impact}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output.sort((a, b) => severityScore(b.severity) * 100 + b.confidence - (severityScore(a.severity) * 100 + a.confidence));
}

function emptyEvidenceReport(): EvidenceEngineResult {
  return {
    findings: [],
    discarded: [],
    summary: {
      supportedFindings: 0,
      discardedFindings: 0,
      affectedFiles: [],
      affectedRoutes: [],
    },
  };
}

function sourceFiles(source: string) {
  const markerPattern = /^\/\/ FILE:\s+(.+)$/gm;
  const markers = [...source.matchAll(markerPattern)];
  if (markers.length === 0) return [{ path: "submitted-code", content: source }];
  return markers.map((marker, index) => {
    const markerEnd = (marker.index ?? 0) + marker[0].length;
    const nextMarkerStart = markers[index + 1]?.index ?? source.length;
    return {
      path: marker[1]?.trim() || `submitted-code-${index + 1}`,
      content: source.slice(markerEnd, nextMarkerStart).replace(/^\r?\n/, ""),
    };
  });
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}
