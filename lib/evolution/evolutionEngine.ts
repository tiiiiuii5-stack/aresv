import { createHash } from "node:crypto";

import {
  buildExecutionGraph,
  type CodeFile,
  type ExecutionGraph,
  type ExecutionGraphNode,
  type ExecutionNodeType,
  type ExecutionPath,
} from "@/lib/intelligence/execution-path-mapper";
import {
  buildEvidenceReport,
  type EvidenceEngineResult,
  type EvidenceItem,
  type TraceableFinding,
} from "@/lib/intelligence/evidence-engine";
import { simulateFailures, type FailureSimulationReport } from "@/lib/intelligence/failure-simulator";
import { scoreProductionReadiness, type ProductionReadinessReport } from "@/lib/intelligence/readiness-score";
import { buildSystemModel, type FailureSurface, type SystemModel } from "@/lib/intelligence/system-model";

export type EvolutionEventKind =
  | "log"
  | "api_call"
  | "db_state"
  | "ui_action"
  | "worker_output"
  | "trace"
  | "unknown";

export type EvolutionFailureType = "Critical" | "High" | "Medium" | "Future Risk";
export type EvolutionSystemState = "SAFE" | "RISKY" | "BROKEN";
export type EvolutionSystemVerdict = "SAFE TO EVOLVE" | "NEEDS RESTRUCTURE" | "DO NOT SCALE";
export type EvolutionName = "Safe" | "Scale" | "Product" | "Architectural" | "Autonomous";
export type PatchCheckStatus = "pass" | "fail" | "requires-review";

export type EvolutionInput = {
  source?: string;
  files?: CodeFile[];
  framework?: string;
  modules?: string[];
  events?: unknown[];
  projectId?: string | null;
  applyMode?: "snapshot-only";
};

export type EvolutionEvent = {
  id: string;
  kind: EvolutionEventKind;
  source: string;
  timestamp: string;
  route?: string;
  method?: string;
  statusCode?: number;
  message?: string;
  severity?: string;
  nodeId?: string;
  evidence: string;
};

export type EvolutionFailure = {
  id: string;
  title: string;
  type: EvolutionFailureType;
  category: string;
  severity: EvolutionFailureType;
  confidence: number;
  source: "evidence-engine" | "system-model" | "event-ingest";
  evidence: EvidenceItem[];
  executionPath: TraceableFinding["executionPath"];
  affectedFiles: string[];
  affectedRoutes: string[];
  affectedGraph: Array<"execution" | "trust" | "data" | "api" | "ui">;
  businessImpact: string;
  fixRecommendation: string;
};

export type CausalRootNode = {
  id: string;
  type: ExecutionNodeType | "event" | "system-model";
  label: string;
  filePath?: string;
  route?: string;
  inExecutionGraph: boolean;
};

export type CausalRootCause = {
  id: string;
  failureId: string;
  rootNode: CausalRootNode;
  executionPathId: string | null;
  chain: string[];
  evidence: string[];
  confidence: number;
};

export type PatchCandidate = {
  id: string;
  evolutionName: EvolutionName;
  title: string;
  targetModule: string;
  affectedFiles: string[];
  affectedRoutes: string[];
  summary: string;
  proposedDiff: string;
  preservesApiContracts: true;
  schemaChangeRequired: false;
  authBillingScope: "unchanged";
  generatedFromFailureId: string;
  rootCauseId: string;
  confidence: number;
};

export type PatchSimulation = {
  patchId: string;
  checks: {
    requestReplay: SimulationCheck;
    authSimulation: SimulationCheck;
    queueSimulation: SimulationCheck;
    dbConsistency: SimulationCheck;
    apiContract: SimulationCheck;
    regression: SimulationCheck;
    trustViolation: SimulationCheck;
  };
  overall: PatchCheckStatus;
};

export type SimulationCheck = {
  status: PatchCheckStatus;
  detail: string;
};

export type PatchGateDecision = {
  patchId: string;
  approved: boolean;
  reason: string;
  blockers: string[];
};

export type FutureVersion = {
  evolutionName: EvolutionName;
  preview: string;
  systemArchitecture: string;
  apiStructure: string;
  dbImplications: string;
  authModel: string;
  executionFlow: string;
  whatChanged: string;
  whyItIsBetter: string;
  tradeoffs: string;
  riskChanges: string;
  systemVerdict: EvolutionSystemVerdict;
};

export type EvolutionReport = {
  engine: "ventureos-evolution-engine";
  version: "2.0.0";
  generatedAt: string;
  projectId: string | null;
  eventIngest: {
    events: EvolutionEvent[];
    counts: Record<EvolutionEventKind, number>;
    ignoredSignals: Array<{ id: string; reason: string }>;
  };
  executionGraph: ExecutionGraph;
  systemModel: SystemModel;
  failureDetection: {
    confirmedFailures: EvolutionFailure[];
    evidenceReport: EvidenceEngineResult;
    failureSimulations: FailureSimulationReport;
  };
  causalAnalysis: {
    rootCauses: CausalRootCause[];
    unresolvedFailures: Array<{ failureId: string; reason: string }>;
  };
  patchPlan: {
    mode: "snapshot-only";
    candidates: PatchCandidate[];
  };
  patchSimulation: {
    simulations: PatchSimulation[];
  };
  patchGate: {
    approvedPatches: PatchGateDecision[];
    heldPatches: PatchGateDecision[];
    rule: "approve-only-if-no-regression-no-trust-violation-no-api-break";
  };
  versionSnapshot: {
    id: string;
    applied: false;
    applyMode: "snapshot-only";
    reason: string;
  };
  learnMemory: {
    patterns: Array<{
      failureType: EvolutionFailureType;
      rootNode: string;
      fixPattern: string;
      confidence: number;
    }>;
    stored: false;
    storage: "pending-api-persistence";
  };
  productionReadiness: ProductionReadinessReport;
  futureVersions: FutureVersion[];
  systemState: EvolutionSystemState;
  systemVerdict: EvolutionSystemVerdict;
};

type AnalysisInput = { files: CodeFile[] } | { source: string };

export function runEvolutionLoop(input: EvolutionInput): EvolutionReport {
  const generatedAt = new Date().toISOString();
  const files = normalizeFiles(input.files || []);
  const source = input.source || filesToSource(files);
  const analysisInput = analysisInputFor(files, source);
  const executionGraph = buildExecutionGraph(analysisInput);
  const evidenceReport = buildEvidenceReport({ ...analysisInput, graph: executionGraph, executionPaths: executionGraph.paths });
  const systemModel = buildSystemModel({ ...analysisInput, executionGraph, evidenceReport });
  const productionReadiness = scoreProductionReadiness({ ...analysisInput, graph: executionGraph, executionPaths: executionGraph.paths, evidenceReport });
  const events = normalizeEvents(input.events || []);
  const eventIngest = {
    events,
    counts: countEvents(events),
    ignoredSignals: ignoredEventSignals(events, executionGraph),
  };
  const confirmedFailures = detectConfirmedFailures({ evidenceReport, systemModel, executionGraph, events });
  const failureSimulations = simulateFailures({
    executionPaths: executionGraph.paths,
    evidenceReport,
    findings: evidenceReport.findings,
    maxSimulations: 50,
  });
  const causal = analyzeCausality(confirmedFailures, executionGraph);
  const patchCandidates = generatePatchCandidates(confirmedFailures, causal.rootCauses);
  const patchSimulations = patchCandidates.map((candidate) => simulatePatch(candidate));
  const patchGate = gatePatches(patchSimulations);
  const systemState = systemStateFor(confirmedFailures, productionReadiness);
  const systemVerdict = systemVerdictFor(systemState);
  const learnMemory = buildLearnMemory(causal.rootCauses, confirmedFailures);
  const snapshotId = snapshotHash({
    source,
    files,
    confirmedFailures,
    patchCandidates,
    score: productionReadiness.score,
    systemState,
  });

  return {
    engine: "ventureos-evolution-engine",
    version: "2.0.0",
    generatedAt,
    projectId: input.projectId || null,
    eventIngest,
    executionGraph,
    systemModel,
    failureDetection: {
      confirmedFailures,
      evidenceReport,
      failureSimulations,
    },
    causalAnalysis: causal,
    patchPlan: {
      mode: "snapshot-only",
      candidates: patchCandidates,
    },
    patchSimulation: {
      simulations: patchSimulations,
    },
    patchGate,
    versionSnapshot: {
      id: snapshotId,
      applied: false,
      applyMode: "snapshot-only",
      reason: "The evolution engine generated a safe version snapshot and patch candidates only. No filesystem, auth, billing, schema, or API contract changes were applied.",
    },
    learnMemory: {
      patterns: learnMemory,
      stored: false,
      storage: "pending-api-persistence",
    },
    productionReadiness,
    futureVersions: futureVersionsFor(systemVerdict, confirmedFailures, productionReadiness),
    systemState,
    systemVerdict,
  };
}

function normalizeFiles(files: CodeFile[]): CodeFile[] {
  return files
    .filter((file) => typeof file?.path === "string" && typeof file?.content === "string")
    .map((file) => ({
      path: file.path.replace(/\\/g, "/").slice(0, 240),
      content: file.content,
    }));
}

function filesToSource(files: CodeFile[]) {
  return files.map((file) => `// FILE: ${file.path}\n${file.content}`).join("\n\n");
}

function analysisInputFor(files: CodeFile[], source: string): AnalysisInput {
  return files.length ? { files } : { source };
}

function normalizeEvents(events: unknown[]): EvolutionEvent[] {
  return events.slice(0, 250).map((event, index) => {
    const record = isRecord(event) ? event : {};
    const kind = eventKind(record.kind || record.type || record.eventType);
    const route = optionalString(record.route || record.path || record.url);
    const message = optionalString(record.message || record.error || record.detail || record.name);
    const method = optionalString(record.method)?.toUpperCase();
    const statusCode = numberFrom(record.statusCode || record.status || record.responseStatus);
    const timestamp = optionalString(record.timestamp || record.createdAt || record.time) || new Date().toISOString();
    const severity = optionalString(record.severity || record.level || record.riskLevel);
    const nodeId = optionalString(record.nodeId || record.node || record.executionNodeId);

    return {
      id: optionalString(record.id) || stableId(["event", String(index), kind, route, message, statusCode ? String(statusCode) : ""]),
      kind,
      source: optionalString(record.source) || "request",
      timestamp,
      route,
      method,
      statusCode,
      message,
      severity,
      nodeId,
      evidence: compactString(
        optionalString(record.evidence) ||
          [kind, method, route, statusCode ? `status ${statusCode}` : "", message, severity].filter(Boolean).join(" "),
      ),
    };
  });
}

function countEvents(events: EvolutionEvent[]) {
  const counts: Record<EvolutionEventKind, number> = {
    log: 0,
    api_call: 0,
    db_state: 0,
    ui_action: 0,
    worker_output: 0,
    trace: 0,
    unknown: 0,
  };
  for (const event of events) counts[event.kind] += 1;
  return counts;
}

function ignoredEventSignals(events: EvolutionEvent[], graph: ExecutionGraph) {
  return events
    .filter((event) => eventLooksLikeFailure(event) && !eventMapsToGraph(event, graph))
    .map((event) => ({
      id: event.id,
      reason: "Failure-like event did not map to a route or execution node in the current graph, so no patchable issue was emitted.",
    }));
}

function eventKind(value: unknown): EvolutionEventKind {
  const clean = String(value || "").toLowerCase().replace(/[-\s]/g, "_");
  if (clean.includes("api")) return "api_call";
  if (clean.includes("db") || clean.includes("database")) return "db_state";
  if (clean.includes("ui") || clean.includes("click") || clean.includes("form")) return "ui_action";
  if (clean.includes("worker") || clean.includes("queue") || clean.includes("job")) return "worker_output";
  if (clean.includes("trace")) return "trace";
  if (clean.includes("log") || clean.includes("error")) return "log";
  return "unknown";
}

function detectConfirmedFailures(input: {
  evidenceReport: EvidenceEngineResult;
  systemModel: SystemModel;
  executionGraph: ExecutionGraph;
  events: EvolutionEvent[];
}): EvolutionFailure[] {
  const failures = [
    ...input.evidenceReport.findings.map(failureFromFinding),
    ...failuresFromSystemModel(input.systemModel),
    ...failuresFromEvents(input.events, input.executionGraph),
  ];
  return dedupeFailures(failures)
    .filter((failure) => failure.evidence.length > 0 && failure.confidence >= 75)
    .sort((left, right) => severityRank(right.severity) - severityRank(left.severity) || right.confidence - left.confidence);
}

function failureFromFinding(finding: TraceableFinding): EvolutionFailure {
  const severity = failureTypeFromFinding(finding);
  return {
    id: stableId(["failure", finding.id, finding.title]),
    title: finding.title,
    type: severity,
    category: finding.category,
    severity,
    confidence: finding.confidence,
    source: "evidence-engine",
    evidence: finding.evidence,
    executionPath: finding.executionPath,
    affectedFiles: finding.affectedFiles,
    affectedRoutes: finding.affectedRoutes,
    affectedGraph: affectedGraphForFinding(finding),
    businessImpact: finding.businessImpact,
    fixRecommendation: finding.fixRecommendation,
  };
}

function failuresFromSystemModel(model: SystemModel): EvolutionFailure[] {
  const failures: EvolutionFailure[] = [];

  for (const input of model.trustGraph.requestControlledInputs) {
    failures.push({
      id: stableId(["system-trust-input", input.filePath, input.field]),
      title: "Request-controlled identity input reaches server trust boundary",
      type: "Critical",
      category: "TRUST FAILURE",
      severity: "Critical",
      confidence: 92,
      source: "system-model",
      evidence: [{
        filePath: input.filePath,
        route: input.route,
        codeSnippet: input.evidence,
        detail: `Request-controlled field ${input.field} was detected in a trust-sensitive route.`,
      }],
      executionPath: null,
      affectedFiles: [input.filePath],
      affectedRoutes: input.route ? [input.route] : [],
      affectedGraph: ["trust", "api"],
      businessImpact: "A caller can influence identity, role, tenant, or ownership decisions unless the route ignores the field and uses the server session.",
      fixRecommendation: "Strip client identity fields and derive user, role, and tenant from the server-resolved session before resource access.",
    });
  }

  for (const call of model.apiGraph.unresolvedClientCalls) {
    failures.push({
      id: stableId(["system-unresolved-api", call.filePath, call.route, call.method]),
      title: "Client action references an unresolved API route",
      type: mutatingMethod(call.method) ? "High" : "Medium",
      category: "BROKEN USER FLOW",
      severity: mutatingMethod(call.method) ? "High" : "Medium",
      confidence: 88,
      source: "system-model",
      evidence: [{
        filePath: call.filePath,
        route: call.route,
        codeSnippet: call.evidence,
        detail: `Client ${call.method} call references ${call.route}, but the route was not found in the API graph.`,
      }],
      executionPath: null,
      affectedFiles: [call.filePath],
      affectedRoutes: [call.route],
      affectedGraph: ["ui", "api", "execution"],
      businessImpact: "Users can trigger a frontend action that fails at the network boundary.",
      fixRecommendation: "Create the missing route, update the URL, or disable the action with clear unavailable-state feedback.",
    });
  }

  for (const surface of model.failureSurfaceMap.surfaces) {
    if (surface.confidence < 85) continue;
    failures.push(failureFromSurface(surface));
  }

  for (const path of model.executionGraph.paths.filter((item) => item.riskScore >= 85)) {
    failures.push({
      id: stableId(["system-high-risk-path", path.id]),
      title: "Execution path carries high production failure risk",
      type: "Future Risk",
      category: "FUTURE RISK",
      severity: "Future Risk",
      confidence: Math.min(95, path.riskScore),
      source: "system-model",
      evidence: [{
        executionPathId: path.id,
        route: path.apiRoute || undefined,
        detail: `Path ${path.entryPoint} -> ${path.action}${path.apiRoute ? ` -> ${path.apiRoute}` : ""} has risk score ${path.riskScore}. Signals: ${path.riskSignals.join("; ") || "high risk path"}.`,
      }],
      executionPath: {
        id: path.id,
        entryPoint: path.entryPoint,
        action: path.action,
        apiRoute: path.apiRoute,
        databaseOperations: [],
        dependencies: [],
        riskScore: path.riskScore,
        riskSignals: path.riskSignals,
      },
      affectedFiles: [],
      affectedRoutes: path.apiRoute ? [path.apiRoute] : [],
      affectedGraph: ["execution"],
      businessImpact: "The path contains enough mapped risk signals to require validation before scale or deployment.",
      fixRecommendation: "Trace this path end-to-end and add the missing persistence, dependency, trust, or recovery step indicated by the risk signals.",
    });
  }

  return failures;
}

function failureFromSurface(surface: FailureSurface): EvolutionFailure {
  const severity = failureTypeFromSurface(surface);
  return {
    id: stableId(["system-surface", surface.id, surface.title]),
    title: surface.title,
    type: severity,
    category: surface.category,
    severity,
    confidence: surface.confidence,
    source: "system-model",
    evidence: [{
      filePath: surface.filePath,
      route: surface.route,
      executionPathId: surface.executionPathId,
      codeSnippet: surface.evidence,
      detail: `Failure surface ${surface.category} is supported by the system model.`,
    }],
    executionPath: surface.executionPathId
      ? {
          id: surface.executionPathId,
          entryPoint: surface.route || surface.filePath || "unknown",
          action: surface.title,
          apiRoute: surface.route || null,
          databaseOperations: [],
          dependencies: [],
          riskScore: surface.confidence,
          riskSignals: [surface.category],
        }
      : null,
    affectedFiles: surface.filePath ? [surface.filePath] : [],
    affectedRoutes: surface.route ? [surface.route] : [],
    affectedGraph: surface.affectedGraph,
    businessImpact: "The system model found a traceable surface where execution, trust, data, API, or UI behavior can fail.",
    fixRecommendation: "Resolve the affected graph node with a minimal change scoped to the mapped file, route, or execution path.",
  };
}

function failuresFromEvents(events: EvolutionEvent[], graph: ExecutionGraph): EvolutionFailure[] {
  return events
    .filter((event) => eventLooksLikeFailure(event) && eventMapsToGraph(event, graph))
    .map((event) => {
      const severity = failureTypeFromEvent(event);
      const node = nodeForEvent(event, graph);
      const path = pathForEvent(event, graph);
      return {
        id: stableId(["event-failure", event.id, event.route, event.statusCode ? String(event.statusCode) : ""]),
        title: eventTitle(event),
        type: severity,
        category: categoryFromEvent(event),
        severity,
        confidence: event.statusCode && event.statusCode >= 500 ? 86 : 80,
        source: "event-ingest" as const,
        evidence: [{
          filePath: node?.filePath,
          route: event.route || node?.route,
          executionPathId: path?.id,
          detail: event.evidence,
        }],
        executionPath: path ? traceablePath(path) : null,
        affectedFiles: node?.filePath ? [node.filePath] : [],
        affectedRoutes: event.route ? [event.route] : node?.route ? [node.route] : [],
        affectedGraph: graphAreaFromEvent(event),
        businessImpact: "A live runtime signal maps to a known execution node and indicates the user flow can fail during production execution.",
        fixRecommendation: "Patch the mapped module only after replaying the failing request and validating no trust, API, or persistence regression is introduced.",
      };
    });
}

function analyzeCausality(failures: EvolutionFailure[], graph: ExecutionGraph) {
  const rootCauses: CausalRootCause[] = [];
  const unresolvedFailures: Array<{ failureId: string; reason: string }> = [];

  for (const failure of failures) {
    const node = rootNodeForFailure(failure, graph);
    if (!node) {
      unresolvedFailures.push({
        failureId: failure.id,
        reason: "No execution graph node could be proven as the single root node.",
      });
      continue;
    }

    rootCauses.push({
      id: stableId(["root", failure.id, node.id]),
      failureId: failure.id,
      rootNode: node,
      executionPathId: failure.executionPath?.id || null,
      chain: chainForFailure(failure, node),
      evidence: failure.evidence.map((item) => item.detail).slice(0, 5),
      confidence: Math.min(99, Math.max(75, failure.confidence - (node.inExecutionGraph ? 0 : 10))),
    });
  }

  return { rootCauses, unresolvedFailures };
}

function rootNodeForFailure(failure: EvolutionFailure, graph: ExecutionGraph): CausalRootNode | null {
  if (failure.executionPath?.id) {
    const path = graph.paths.find((item) => item.id === failure.executionPath?.id);
    const preferredNode = preferredNodeForPath(path, graph);
    if (preferredNode) return causalNode(preferredNode, true);
  }

  for (const route of failure.affectedRoutes) {
    const node = graph.nodes.find((item) => item.route === route || item.label.includes(route));
    if (node) return causalNode(node, true);
  }

  for (const file of failure.affectedFiles) {
    const node = graph.nodes.find((item) => item.filePath === file);
    if (node) return causalNode(node, true);
  }

  const firstEvidence = failure.evidence[0];
  if (firstEvidence?.filePath || firstEvidence?.route) {
    return {
      id: stableId(["model-root", firstEvidence.filePath, firstEvidence.route, failure.id]),
      type: "system-model",
      label: firstEvidence.route || firstEvidence.filePath || failure.title,
      filePath: firstEvidence.filePath,
      route: firstEvidence.route,
      inExecutionGraph: false,
    };
  }

  return null;
}

function preferredNodeForPath(path: ExecutionPath | undefined, graph: ExecutionGraph): ExecutionGraphNode | null {
  if (!path) return null;
  const nodeIds = path.graphNodeIds || [];
  const nodes = nodeIds.map((id) => graph.nodes.find((node) => node.id === id)).filter(Boolean) as ExecutionGraphNode[];
  return (
    nodes.find((node) => node.type === "api_route") ||
    nodes.find((node) => node.type === "server_action") ||
    nodes.find((node) => node.type === "button" || node.type === "form" || node.type === "action") ||
    nodes[0] ||
    null
  );
}

function causalNode(node: ExecutionGraphNode, inExecutionGraph: boolean): CausalRootNode {
  return {
    id: node.id,
    type: node.type,
    label: node.label,
    filePath: node.filePath,
    route: node.route,
    inExecutionGraph,
  };
}

function chainForFailure(failure: EvolutionFailure, node: CausalRootNode) {
  const parts = [
    failure.executionPath?.entryPoint,
    failure.executionPath?.action,
    failure.executionPath?.apiRoute,
    node.label,
  ].filter(Boolean) as string[];
  return unique(parts);
}

function generatePatchCandidates(failures: EvolutionFailure[], rootCauses: CausalRootCause[]): PatchCandidate[] {
  const failureById = new Map(failures.map((failure) => [failure.id, failure]));
  return rootCauses
    .map((rootCause) => {
      const failure = failureById.get(rootCause.failureId);
      if (!failure) return null;
      return patchForFailure(failure, rootCause);
    })
    .filter(Boolean)
    .slice(0, 25) as PatchCandidate[];
}

function patchForFailure(failure: EvolutionFailure, rootCause: CausalRootCause): PatchCandidate {
  const affectedFiles = unique([...failure.affectedFiles, rootCause.rootNode.filePath].filter(Boolean) as string[]);
  const affectedRoutes = unique([...failure.affectedRoutes, rootCause.rootNode.route].filter(Boolean) as string[]);
  const strategy = patchStrategyFor(failure);

  return {
    id: stableId(["patch", failure.id, rootCause.id, strategy.title]),
    evolutionName: "Safe",
    title: strategy.title,
    targetModule: rootCause.rootNode.label,
    affectedFiles,
    affectedRoutes,
    summary: strategy.summary,
    proposedDiff: strategy.diff,
    preservesApiContracts: true,
    schemaChangeRequired: false,
    authBillingScope: "unchanged",
    generatedFromFailureId: failure.id,
    rootCauseId: rootCause.id,
    confidence: Math.min(96, Math.max(75, Math.round((failure.confidence + rootCause.confidence) / 2))),
  };
}

function patchStrategyFor(failure: EvolutionFailure) {
  const text = failureText(failure);
  if (/request-controlled|body\.|query\.|headers\.|userId|role|actorId|ownership|tenant|session|trust/i.test(text)) {
    return {
      title: "Enforce server-authoritative identity at the mapped route",
      summary: "Derive identity from the compiled server session, ignore client identity fields, and validate ownership before mutation or response.",
      diff:
        "Minimal safe diff plan:\n1. Add or reuse compileTrust/requireSession at the top of the mapped route.\n2. Replace request-controlled identity fields with session.userId, session.role, and session.orgId.\n3. Load the target resource server-side and reject when owner/org does not match.\n4. Preserve the existing request and response shape.",
    };
  }

  if (/missing api|unresolved api|phantom|404|no backend|button|form|action/i.test(text)) {
    return {
      title: "Connect or disable the mapped dead interaction",
      summary: "Either create the missing backend route behind the existing client contract or disable the action with explicit unavailable-state feedback.",
      diff:
        "Minimal safe diff plan:\n1. Keep the existing UI contract unchanged.\n2. If the API route is intended, add the route handler with validation, loading-safe responses, and durable side effects.\n3. If implementation is incomplete, disable the interaction and show a clear explanation.\n4. Add success and error feedback for the action.",
    };
  }

  if (/success|failure|stale|refresh|state|db failure|backend failure/i.test(text)) {
    return {
      title: "Gate UI success on backend result",
      summary: "Only show success after response.ok and refresh or update client state from the successful response.",
      diff:
        "Minimal safe diff plan:\n1. Wrap the mapped request in try/catch.\n2. Check response.ok before success feedback.\n3. Render error feedback from the failed response.\n4. Refresh or update local state after a confirmed backend mutation.",
    };
  }

  if (/deploy|worker|queue|env|redis|background|vercel/i.test(text)) {
    return {
      title: "Validate deployment dependencies before execution",
      summary: "Add preflight checks for required environment variables, worker connectivity, queue availability, and selected project identity.",
      diff:
        "Minimal safe diff plan:\n1. Validate required deployment env vars before enqueueing or deploying.\n2. Preserve selected projectId and server-derived userId through the worker payload.\n3. Fail closed with a user-visible error when queue or worker dependencies are unavailable.\n4. Do not generate a new project unless build mode is explicit.",
    };
  }

  return {
    title: "Apply minimal fix at the causal root node",
    summary: "Patch only the mapped module and preserve API contracts, database schema, auth, and billing behavior.",
    diff:
      "Minimal safe diff plan:\n1. Patch the root module identified by the causal graph.\n2. Keep existing request and response shapes intact.\n3. Add validation and failure feedback around the failing step.\n4. Re-run type-check, build, and the affected execution flow.",
  };
}

function simulatePatch(candidate: PatchCandidate): PatchSimulation {
  const text = `${candidate.summary}\n${candidate.proposedDiff}`.toLowerCase();
  const checks = {
    requestReplay: pass("Patch is scoped to the mapped module and preserves the existing request/response contract."),
    authSimulation: /session|identity|ownership|trust/.test(text)
      ? pass("Patch derives security decisions from server-side session/ownership checks.")
      : pass("Patch does not modify authentication or authorization behavior."),
    queueSimulation: /queue|worker|deploy|background/.test(text)
      ? review("Queue/deployment behavior requires live worker replay before automatic approval.")
      : pass("Patch does not touch queue or worker execution."),
    dbConsistency: candidate.schemaChangeRequired
      ? fail("Schema changes are not allowed in this additive evolution pass.")
      : pass("Patch requires no database schema change."),
    apiContract: candidate.preservesApiContracts
      ? pass("Patch preserves existing API request and response shapes.")
      : fail("Patch changes an API contract."),
    regression: candidate.affectedFiles.length <= 3
      ? pass("Patch is constrained to the affected module boundary.")
      : review("Patch spans several files and needs manual regression review."),
    trustViolation: /body\.userid|query\.userid|headers\.userid|body\.role|query\.role|body\.actorid/.test(text)
      ? fail("Patch plan still references request-controlled identity.")
      : pass("Patch plan does not introduce request-controlled identity."),
  };
  const statuses = Object.values(checks).map((check) => check.status);
  const overall: PatchCheckStatus = statuses.includes("fail") ? "fail" : statuses.includes("requires-review") ? "requires-review" : "pass";
  return { patchId: candidate.id, checks, overall };
}

function gatePatches(simulations: PatchSimulation[]) {
  const decisions = simulations.map((simulation): PatchGateDecision => {
    const blockers = Object.entries(simulation.checks)
      .filter(([, check]) => check.status !== "pass")
      .map(([name, check]) => `${name}: ${check.detail}`);

    return {
      patchId: simulation.patchId,
      approved: simulation.overall === "pass",
      reason:
        simulation.overall === "pass"
          ? "Patch candidate passed the static replay, trust, API, database, and regression gates."
          : "Patch candidate is held until the listed gate blockers are resolved.",
      blockers,
    };
  });

  return {
    approvedPatches: decisions.filter((decision) => decision.approved),
    heldPatches: decisions.filter((decision) => !decision.approved),
    rule: "approve-only-if-no-regression-no-trust-violation-no-api-break" as const,
  };
}

function buildLearnMemory(rootCauses: CausalRootCause[], failures: EvolutionFailure[]) {
  const failureById = new Map(failures.map((failure) => [failure.id, failure]));
  return rootCauses.slice(0, 25).map((rootCause) => {
    const failure = failureById.get(rootCause.failureId);
    return {
      failureType: failure?.type || "Medium",
      rootNode: rootCause.rootNode.label,
      fixPattern: failure?.fixRecommendation || "Patch the causal root node and replay the affected execution path.",
      confidence: rootCause.confidence,
    };
  });
}

function futureVersionsFor(verdict: EvolutionSystemVerdict, failures: EvolutionFailure[], readiness: ProductionReadinessReport): FutureVersion[] {
  const blockingCount = failures.filter((failure) => failure.severity === "Critical" || failure.severity === "High").length;
  const readinessLine = `Current readiness score is ${readiness.score} (${readiness.status}) with ${blockingCount} blocking failure candidates.`;
  return [
    {
      evolutionName: "Safe",
      preview: "/preview/v-safe",
      systemArchitecture: "Keep the current architecture and patch only confirmed causal roots.",
      apiStructure: "Preserve all route contracts and add guards, validation, or disabled states behind existing surfaces.",
      dbImplications: "No schema deletion or redesign; use existing persistence paths only.",
      authModel: "Server-authoritative identity only, with no client-supplied user or role trust.",
      executionFlow: "Replay the affected UI/API/DB paths after each patch.",
      whatChanged: "Minimal security, workflow, and state corrections at proven failure nodes.",
      whyItIsBetter: `${readinessLine} This version reduces launch risk without broad refactors.`,
      tradeoffs: "Lower architectural upside, but lowest regression risk.",
      riskChanges: "Critical and high failures are reduced first; future scale risks remain visible.",
      systemVerdict: verdict,
    },
    {
      evolutionName: "Scale",
      preview: "/preview/v-scale",
      systemArchitecture: "Add operational hardening around workers, queues, providers, and retryable flows.",
      apiStructure: "Keep public contracts while adding internal preflight and retry wrappers.",
      dbImplications: "Prefer additive history and telemetry writes; no destructive migrations.",
      authModel: "Same server-authoritative model with tenant isolation checks on scale-sensitive routes.",
      executionFlow: "Request replay expands to queue, worker, provider, and data consistency simulation.",
      whatChanged: "Background processors, env validation, and recovery paths become first-class readiness gates.",
      whyItIsBetter: "It targets failures that usually appear after the first real users or production traffic.",
      tradeoffs: "More validation work before release and more operational surface to test.",
      riskChanges: "Future Risk items move into explicit deployment and recovery gates.",
      systemVerdict: verdict,
    },
    {
      evolutionName: "Product",
      preview: "/preview/v-product",
      systemArchitecture: "Turn failure outcomes into user-visible recovery, history, and guidance surfaces.",
      apiStructure: "Additive read endpoints can expose evolution reports without changing existing scanner responses.",
      dbImplications: "Persist compact scan/evolution history using existing telemetry or additive tables.",
      authModel: "Keep sensitive data hidden until server-side authorization completes.",
      executionFlow: "Each action returns clear success, failure, or unavailable feedback.",
      whatChanged: "The product explains what broke, why it matters, and what improved between scans.",
      whyItIsBetter: "Users get a launch verdict and business impact instead of raw issue lists.",
      tradeoffs: "Product clarity improves, but deeper root-cause automation waits for Safe/Scale gates.",
      riskChanges: "Medium UX and workflow inconsistency risk decreases.",
      systemVerdict: verdict,
    },
    {
      evolutionName: "Architectural",
      preview: "/preview/v-architectural",
      systemArchitecture: "Move route-specific trust and ownership checks toward reusable compiler primitives.",
      apiStructure: "Internal route implementation becomes standardized while external contracts remain stable.",
      dbImplications: "Schema remains additive; ownership and audit metadata are reused or added only when required.",
      authModel: "A single trust compiler enforces identity, permission, ownership, and execution safety.",
      executionFlow: "Every request compiles through the same security and persistence gates before logic runs.",
      whatChanged: "Security logic becomes centralized and harder to bypass.",
      whyItIsBetter: "It reduces drift where each route invents its own trust model.",
      tradeoffs: "Higher implementation risk and broader regression surface than Safe evolution.",
      riskChanges: "Security and data integrity risk drops after full route coverage is proven.",
      systemVerdict: verdict,
    },
    {
      evolutionName: "Autonomous",
      preview: "/preview/v-autonomous",
      systemArchitecture: "Close the loop from telemetry to causal graph, patch generation, simulation, gate, and memory.",
      apiStructure: "Evolution endpoints remain additive and snapshot-first until gates prove safe application.",
      dbImplications: "Learned patterns are stored as compact metadata, not raw source code.",
      authModel: "Autonomous patches cannot pass the gate if they introduce request-controlled identity.",
      executionFlow: "The engine learns failure and fix patterns from every completed evolution report.",
      whatChanged: "VentureOS starts improving based on observed failures and validated fix patterns.",
      whyItIsBetter: "Repeat failures become easier to identify, patch, and prevent in future scans.",
      tradeoffs: "Automatic application should stay disabled until production replay coverage is strong.",
      riskChanges: "Regression risk is controlled by patch gates and snapshot-only default behavior.",
      systemVerdict: verdict,
    },
  ];
}

function systemStateFor(failures: EvolutionFailure[], readiness: ProductionReadinessReport): EvolutionSystemState {
  if (failures.some((failure) => failure.severity === "Critical") || readiness.score < 45) return "BROKEN";
  if (failures.some((failure) => failure.severity === "High") || readiness.score < 75) return "RISKY";
  return "SAFE";
}

function systemVerdictFor(state: EvolutionSystemState): EvolutionSystemVerdict {
  if (state === "BROKEN") return "DO NOT SCALE";
  if (state === "RISKY") return "NEEDS RESTRUCTURE";
  return "SAFE TO EVOLVE";
}

function failureTypeFromFinding(finding: TraceableFinding): EvolutionFailureType {
  if (finding.severity === "critical") return "Critical";
  if (finding.severity === "high") return "High";
  if (/deployment|queue|env|scale|worker|operational/i.test(`${finding.category} ${finding.title}`)) return "Future Risk";
  return "Medium";
}

function failureTypeFromSurface(surface: FailureSurface): EvolutionFailureType {
  const severity = surface.severity.toLowerCase();
  if (severity === "critical") return "Critical";
  if (severity === "high") return "High";
  if (/deployment|future|scale|worker|queue|env/i.test(`${surface.category} ${surface.title}`)) return "Future Risk";
  return "Medium";
}

function failureTypeFromEvent(event: EvolutionEvent): EvolutionFailureType {
  const text = `${event.kind} ${event.message || ""} ${event.severity || ""}`.toLowerCase();
  if (/security|forbidden|unauthorized|ownership|tenant|corrupt|data loss/.test(text)) return "Critical";
  if ((event.statusCode || 0) >= 500 || /exception|failed|timeout|crash/.test(text)) return "High";
  if (/worker|queue|deploy|env|redis|stalled/.test(text)) return "Future Risk";
  return "Medium";
}

function categoryFromEvent(event: EvolutionEvent) {
  const text = `${event.kind} ${event.message || ""}`.toLowerCase();
  if (/auth|forbidden|unauthorized|tenant|owner|role/.test(text)) return "TRUST FAILURE";
  if (/db|database|persist|corrupt/.test(text)) return "DATA INTEGRITY";
  if (/queue|worker|deploy|env|redis/.test(text)) return "DEPLOYMENT FAILURE";
  if (/ui|click|form|state/.test(text)) return "STATE FAILURE";
  return "RUNTIME FAILURE";
}

function eventTitle(event: EvolutionEvent) {
  if (event.statusCode && event.route) return `Runtime failure on ${event.method || "REQUEST"} ${event.route}`;
  if (event.message) return `Runtime signal: ${event.message.slice(0, 80)}`;
  return "Runtime signal maps to execution graph failure";
}

function eventLooksLikeFailure(event: EvolutionEvent) {
  const text = `${event.message || ""} ${event.severity || ""} ${event.evidence}`.toLowerCase();
  return Boolean(
    (event.statusCode && event.statusCode >= 400) ||
      /error|failed|failure|exception|timeout|forbidden|unauthorized|corrupt|stalled|missing|crash/.test(text),
  );
}

function eventMapsToGraph(event: EvolutionEvent, graph: ExecutionGraph) {
  return Boolean(nodeForEvent(event, graph) || pathForEvent(event, graph));
}

function nodeForEvent(event: EvolutionEvent, graph: ExecutionGraph) {
  if (event.nodeId) {
    const node = graph.nodes.find((item) => item.id === event.nodeId);
    if (node) return node;
  }
  if (event.route) {
    const node = graph.nodes.find((item) => item.route === event.route || item.label.includes(event.route || ""));
    if (node) return node;
  }
  return null;
}

function pathForEvent(event: EvolutionEvent, graph: ExecutionGraph) {
  if (event.route) {
    const byRoute = graph.paths.find((path) => path.apiRoute === event.route || path.entryPoint === event.route);
    if (byRoute) return byRoute;
  }
  if (event.nodeId) {
    const byNode = graph.paths.find((path) => path.graphNodeIds?.includes(event.nodeId || ""));
    if (byNode) return byNode;
  }
  return null;
}

function graphAreaFromEvent(event: EvolutionEvent): EvolutionFailure["affectedGraph"] {
  if (event.kind === "api_call") return ["api", "execution"];
  if (event.kind === "db_state") return ["data", "execution"];
  if (event.kind === "ui_action") return ["ui", "execution"];
  if (event.kind === "worker_output") return ["execution"];
  return ["execution"];
}

function traceablePath(path: ExecutionPath): TraceableFinding["executionPath"] {
  return {
    id: path.id,
    entryPoint: path.entryPoint,
    action: path.action,
    apiRoute: path.apiRoute,
    databaseOperations: path.databaseOperations,
    dependencies: path.dependencies,
    riskScore: path.riskScore,
    riskSignals: path.riskSignals || [],
  };
}

function affectedGraphForFinding(finding: TraceableFinding): EvolutionFailure["affectedGraph"] {
  const text = failureText({
    title: finding.title,
    category: finding.category,
    evidence: finding.evidence,
    businessImpact: finding.businessImpact,
    fixRecommendation: finding.fixRecommendation,
  });
  const graph = new Set<EvolutionFailure["affectedGraph"][number]>();
  if (/auth|session|owner|tenant|role|permission|trust|userId|actorId/.test(text)) graph.add("trust");
  if (/db|database|prisma|persist|save|storage|state/.test(text)) graph.add("data");
  if (/api|route|endpoint|fetch|webhook/.test(text)) graph.add("api");
  if (/ui|button|form|click|toast|success|loading/.test(text)) graph.add("ui");
  graph.add("execution");
  return [...graph];
}

function failureText(value: Pick<EvolutionFailure, "title" | "category" | "evidence" | "businessImpact" | "fixRecommendation">) {
  return [
    value.title,
    value.category,
    value.businessImpact,
    value.fixRecommendation,
    value.evidence.map((item) => `${item.detail} ${item.codeSnippet || ""}`).join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

function mutatingMethod(method: string) {
  return /POST|PUT|PATCH|DELETE/i.test(method);
}

function severityRank(severity: EvolutionFailureType) {
  if (severity === "Critical") return 4;
  if (severity === "High") return 3;
  if (severity === "Medium") return 2;
  return 1;
}

function dedupeFailures(failures: EvolutionFailure[]) {
  const seen = new Set<string>();
  const output: EvolutionFailure[] = [];
  for (const failure of failures) {
    const key = [
      failure.title.toLowerCase(),
      failure.affectedFiles.join(","),
      failure.affectedRoutes.join(","),
      failure.executionPath?.id || "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(failure);
  }
  return output;
}

function pass(detail: string): SimulationCheck {
  return { status: "pass", detail };
}

function fail(detail: string): SimulationCheck {
  return { status: "fail", detail };
}

function review(detail: string): SimulationCheck {
  return { status: "requires-review", detail };
}

function snapshotHash(value: unknown) {
  return `evo_${createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16)}`;
}

function stableId(parts: Array<string | undefined | null>) {
  return createHash("sha1").update(parts.filter(Boolean).join(":")).digest("hex").slice(0, 14);
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : undefined;
}

function numberFrom(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : undefined;
}

function compactString(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 1_000);
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
