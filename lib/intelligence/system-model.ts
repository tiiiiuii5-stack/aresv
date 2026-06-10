import {
  buildExecutionGraph,
  type CodeFile,
  type ExecutionGraph,
  type ExecutionGraphNode,
  type ExecutionPath,
} from "@/lib/intelligence/execution-path-mapper";
import { buildEvidenceReport, type EvidenceEngineResult, type TraceableFinding } from "@/lib/intelligence/evidence-engine";

export type SystemModelInput = {
  files?: CodeFile[];
  source?: string;
  executionGraph?: ExecutionGraph;
  evidenceReport?: EvidenceEngineResult;
};

export type SystemModel = {
  modeler: "ventureos-system-model";
  version: "1.0.0";
  generatedAt: string;
  executionGraph: RuntimeExecutionGraph;
  trustGraph: TrustGraph;
  dataGraph: DataGraph;
  apiGraph: ApiGraph;
  uiGraph: UiGraph;
  failureSurfaceMap: FailureSurfaceMap;
  summary: {
    pages: number;
    apiRoutes: number;
    uiInteractions: number;
    databaseOperations: number;
    trustBoundaries: number;
    failureSurfaces: number;
    highRiskExecutionPaths: number;
  };
};

export type RuntimeExecutionGraph = {
  nodeCount: number;
  edgeCount: number;
  pathCount: number;
  highRiskPathCount: number;
  nodes: ExecutionGraphNode[];
  paths: SystemExecutionPath[];
};

export type SystemExecutionPath = {
  id: string;
  entryPoint: string;
  action: string;
  apiRoute: string | null;
  databaseOperationCount: number;
  dependencyCount: number;
  riskScore: number;
  riskSignals: string[];
};

export type TrustGraph = {
  principals: TrustPrincipal[];
  guards: TrustGuard[];
  trustBoundaries: TrustBoundary[];
  requestControlledInputs: TrustInput[];
  ownershipChecks: TrustGuard[];
  summary: {
    serverSessionGuards: number;
    adminGuards: number;
    ownershipChecks: number;
    requestControlledIdentityInputs: number;
  };
};

export type TrustPrincipal = {
  id: string;
  label: string;
  source: "server-session" | "api-key" | "admin-session" | "public" | "request-input";
  filePath?: string;
  route?: string;
  evidence: string;
};

export type TrustGuard = {
  id: string;
  type: "session" | "api-key" | "admin" | "ownership" | "org-access" | "public-read" | "public-non-persistent" | "webhook";
  filePath: string;
  route?: string;
  evidence: string;
};

export type TrustBoundary = {
  id: string;
  route?: string;
  filePath: string;
  boundary: "browser-to-api" | "public-to-server" | "api-key-to-server" | "session-to-resource" | "webhook-to-server";
  guardType?: TrustGuard["type"];
  evidence: string;
};

export type TrustInput = {
  id: string;
  filePath: string;
  route?: string;
  field: string;
  evidence: string;
};

export type DataGraph = {
  databaseOperations: DataOperationNode[];
  stateStores: StateStoreNode[];
  dataFlows: DataFlow[];
  externalPersistence: ExternalPersistenceNode[];
  summary: {
    databaseWrites: number;
    clientStateStores: number;
    externalPersistenceDependencies: number;
    pathsWithPersistence: number;
  };
};

export type DataOperationNode = {
  id: string;
  operation: string;
  target: string;
  filePath: string;
  executionPathId?: string;
  evidence: string;
};

export type StateStoreNode = {
  id: string;
  kind: "localStorage" | "sessionStorage" | "cookie" | "react-state" | "zustand" | "unknown";
  filePath: string;
  evidence: string;
};

export type DataFlow = {
  id: string;
  from: string;
  to: string;
  via: string;
  executionPathId?: string;
};

export type ExternalPersistenceNode = {
  id: string;
  provider: string;
  filePath?: string;
  executionPathId?: string;
  evidence?: string;
};

export type ApiGraph = {
  routes: ApiRouteNode[];
  clientCalls: ApiClientCall[];
  dependencies: ApiDependency[];
  unresolvedClientCalls: ApiClientCall[];
  summary: {
    routeCount: number;
    clientCallCount: number;
    unresolvedClientCallCount: number;
    externalDependencyCount: number;
  };
};

export type ApiRouteNode = {
  id: string;
  route: string;
  method: string;
  filePath?: string;
  hasTrustGuard: boolean;
  databaseOperationCount: number;
  dependencyCount: number;
};

export type ApiClientCall = {
  id: string;
  route: string;
  method: string;
  filePath: string;
  evidence: string;
  resolved: boolean;
};

export type ApiDependency = {
  id: string;
  type: string;
  name: string;
  filePath?: string;
  executionPathId?: string;
};

export type UiGraph = {
  pages: UiSurface[];
  components: UiSurface[];
  interactions: UiInteraction[];
  summary: {
    pageCount: number;
    componentCount: number;
    interactionCount: number;
    interactionsWithoutBackend: number;
  };
};

export type UiSurface = {
  id: string;
  label: string;
  filePath?: string;
  route?: string;
};

export type UiInteraction = {
  id: string;
  label: string;
  entryPoint: string;
  apiRoute: string | null;
  riskScore: number;
  riskSignals: string[];
};

export type FailureSurfaceMap = {
  surfaces: FailureSurface[];
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
  summary: {
    total: number;
    critical: number;
    high: number;
    routesAffected: number;
    filesAffected: number;
  };
};

export type FailureSurface = {
  id: string;
  title: string;
  category: string;
  severity: string;
  confidence: number;
  filePath?: string;
  route?: string;
  executionPathId?: string;
  affectedGraph: Array<"execution" | "trust" | "data" | "api" | "ui">;
  evidence: string;
};

type NormalizedFile = CodeFile & {
  lowerPath: string;
  lowerContent: string;
};

export function buildSystemModel(input: SystemModelInput): SystemModel {
  const files = normalizeFiles(input.files || (input.source ? parseSourceFiles(input.source) : []));
  const executionGraph = input.executionGraph || (files.length ? buildExecutionGraph({ files }) : { nodes: [], edges: [], paths: [] });
  const evidenceReport = input.evidenceReport || buildEvidenceReport({ files, graph: executionGraph, executionPaths: executionGraph.paths });
  const execution = modelExecutionGraph(executionGraph);
  const trust = modelTrustGraph(files, executionGraph);
  const data = modelDataGraph(files, executionGraph);
  const api = modelApiGraph(files, executionGraph, trust);
  const ui = modelUiGraph(executionGraph);
  const failures = modelFailureSurfaceMap(evidenceReport);

  return {
    modeler: "ventureos-system-model",
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    executionGraph: execution,
    trustGraph: trust,
    dataGraph: data,
    apiGraph: api,
    uiGraph: ui,
    failureSurfaceMap: failures,
    summary: {
      pages: ui.summary.pageCount,
      apiRoutes: api.summary.routeCount,
      uiInteractions: ui.summary.interactionCount,
      databaseOperations: data.summary.databaseWrites,
      trustBoundaries: trust.trustBoundaries.length,
      failureSurfaces: failures.summary.total,
      highRiskExecutionPaths: execution.highRiskPathCount,
    },
  };
}

export function buildSystemModelFromSource(source: string): SystemModel {
  return buildSystemModel({ source });
}

function modelExecutionGraph(graph: ExecutionGraph): RuntimeExecutionGraph {
  return {
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    pathCount: graph.paths.length,
    highRiskPathCount: graph.paths.filter((path) => path.riskScore >= 70).length,
    nodes: graph.nodes.slice(0, 120),
    paths: graph.paths.slice(0, 80).map((path) => ({
      id: path.id,
      entryPoint: path.entryPoint,
      action: path.action,
      apiRoute: path.apiRoute,
      databaseOperationCount: path.databaseOperations.length,
      dependencyCount: path.dependencies.length,
      riskScore: path.riskScore,
      riskSignals: path.riskSignals || [],
    })),
  };
}

function modelTrustGraph(files: NormalizedFile[], graph: ExecutionGraph): TrustGraph {
  const guards = files.flatMap(extractTrustGuards);
  const requestControlledInputs = files.flatMap(extractRequestControlledInputs);
  const routeGuardByFile = new Map(guards.map((guard) => [guard.filePath, guard]));
  const apiFiles = files.filter(isApiRouteFile);
  const trustBoundaries = [
    ...apiFiles.map((file) => {
      const guard = routeGuardByFile.get(file.path);
      return {
        id: stableId(["trust-boundary", file.path]),
        route: apiRouteFromPath(file.path),
        filePath: file.path,
        boundary: boundaryForGuard(guard),
        guardType: guard?.type,
        evidence: guard?.evidence || "No explicit trust guard detected in route file.",
      } satisfies TrustBoundary;
    }),
    ...graph.paths
      .filter((path) => path.entryPoint !== path.apiRoute && path.apiRoute)
      .map((path) => ({
        id: stableId(["browser-to-api", path.id]),
        route: path.apiRoute || undefined,
        filePath: path.entryPoint,
        boundary: "browser-to-api" as const,
        evidence: `${path.entryPoint} -> ${path.action} -> ${path.apiRoute}`,
      })),
  ];

  const principals = [
    ...guards.map((guard): TrustPrincipal => ({
      id: stableId(["principal", guard.type, guard.filePath, guard.route]),
      label: principalLabelForGuard(guard),
      source: principalSourceForGuard(guard),
      filePath: guard.filePath,
      route: guard.route,
      evidence: guard.evidence,
    })),
    ...requestControlledInputs.map((input): TrustPrincipal => ({
      id: stableId(["principal", "request", input.filePath, input.field]),
      label: `request input ${input.field}`,
      source: "request-input",
      filePath: input.filePath,
      route: input.route,
      evidence: input.evidence,
    })),
  ];

  const ownershipChecks = guards.filter((guard) => guard.type === "ownership" || guard.type === "org-access");

  return {
    principals: dedupeBy(principals, (item) => item.id).slice(0, 120),
    guards: dedupeBy(guards, (item) => item.id).slice(0, 120),
    trustBoundaries: dedupeBy(trustBoundaries, (item) => item.id).slice(0, 120),
    requestControlledInputs: dedupeBy(requestControlledInputs, (item) => item.id).slice(0, 120),
    ownershipChecks,
    summary: {
      serverSessionGuards: guards.filter((guard) => guard.type === "session").length,
      adminGuards: guards.filter((guard) => guard.type === "admin").length,
      ownershipChecks: ownershipChecks.length,
      requestControlledIdentityInputs: requestControlledInputs.length,
    },
  };
}

function modelDataGraph(files: NormalizedFile[], graph: ExecutionGraph): DataGraph {
  const databaseOperations = graph.paths.flatMap((path) =>
    path.databaseOperations.map((operation) => ({
      id: stableId(["db", path.id, operation.filePath, operation.operation, operation.target, operation.evidence]),
      operation: operation.operation,
      target: operation.target,
      filePath: operation.filePath,
      executionPathId: path.id,
      evidence: operation.evidence,
    })),
  );
  const stateStores = files.flatMap(extractStateStores);
  const externalPersistence = graph.paths.flatMap((path) =>
    path.dependencies
      .filter((dependency) => /storage|s3|blob|redis|upstash|stripe|supabase|firebase|queue|worker/i.test(`${dependency.name} ${dependency.type}`))
      .map((dependency) => ({
        id: stableId(["external-persistence", path.id, dependency.type, dependency.name]),
        provider: dependency.name,
        filePath: dependency.filePath,
        executionPathId: path.id,
        evidence: dependency.evidence,
      })),
  );
  const dataFlows = graph.paths.flatMap((path) =>
    path.databaseOperations.map((operation) => ({
      id: stableId(["flow", path.id, operation.target]),
      from: path.entryPoint,
      to: operation.target,
      via: path.apiRoute || path.action,
      executionPathId: path.id,
    })),
  );

  return {
    databaseOperations: dedupeBy(databaseOperations, (item) => item.id).slice(0, 120),
    stateStores: dedupeBy(stateStores, (item) => item.id).slice(0, 120),
    dataFlows: dedupeBy(dataFlows, (item) => item.id).slice(0, 120),
    externalPersistence: dedupeBy(externalPersistence, (item) => item.id).slice(0, 120),
    summary: {
      databaseWrites: databaseOperations.length,
      clientStateStores: stateStores.length,
      externalPersistenceDependencies: externalPersistence.length,
      pathsWithPersistence: graph.paths.filter((path) => path.databaseOperations.length > 0 || path.dependencies.some((dependency) => /storage|s3|blob|redis|supabase|firebase/i.test(dependency.name))).length,
    },
  };
}

function modelApiGraph(files: NormalizedFile[], graph: ExecutionGraph, trustGraph: TrustGraph): ApiGraph {
  const routeNodes = graph.nodes.filter((node) => node.type === "api_route");
  const guardByRoute = new Set(trustGraph.guards.map((guard) => guard.route).filter(Boolean));
  const routes = routeNodes.map((node) => {
    const routePaths = graph.paths.filter((path) => path.apiRoute === node.route);
    return {
      id: node.id,
      route: node.route || node.label,
      method: node.method || "UNKNOWN",
      filePath: node.filePath,
      hasTrustGuard: Boolean(node.route && guardByRoute.has(node.route)),
      databaseOperationCount: routePaths.reduce((sum, path) => sum + path.databaseOperations.length, 0),
      dependencyCount: routePaths.reduce((sum, path) => sum + path.dependencies.length, 0),
    };
  });
  const routeSet = new Set(routes.map((route) => route.route));
  const clientCalls = files.flatMap((file) => extractClientApiCalls(file, routeSet));
  const dependencies = graph.paths.flatMap((path) =>
    path.dependencies.map((dependency) => ({
      id: stableId(["api-dependency", path.id, dependency.type, dependency.name]),
      type: dependency.type,
      name: dependency.name,
      filePath: dependency.filePath,
      executionPathId: path.id,
    })),
  );

  return {
    routes: dedupeBy(routes, (item) => `${item.method}:${item.route}`).slice(0, 120),
    clientCalls: dedupeBy(clientCalls, (item) => item.id).slice(0, 120),
    dependencies: dedupeBy(dependencies, (item) => item.id).slice(0, 120),
    unresolvedClientCalls: clientCalls.filter((call) => !call.resolved).slice(0, 80),
    summary: {
      routeCount: routes.length,
      clientCallCount: clientCalls.length,
      unresolvedClientCallCount: clientCalls.filter((call) => !call.resolved).length,
      externalDependencyCount: dependencies.filter((dependency) => dependency.type === "external_provider").length,
    },
  };
}

function modelUiGraph(graph: ExecutionGraph): UiGraph {
  const pages = graph.nodes
    .filter((node) => node.type === "page")
    .map((node) => ({ id: node.id, label: node.label, filePath: node.filePath, route: node.route }));
  const components = graph.nodes
    .filter((node) => node.type === "component")
    .map((node) => ({ id: node.id, label: node.label, filePath: node.filePath, route: node.route }));
  const interactions = graph.paths.map((path) => ({
    id: path.id,
    label: path.action,
    entryPoint: path.entryPoint,
    apiRoute: path.apiRoute,
    riskScore: path.riskScore,
    riskSignals: path.riskSignals || [],
  }));

  return {
    pages: pages.slice(0, 120),
    components: components.slice(0, 120),
    interactions: interactions.slice(0, 120),
    summary: {
      pageCount: pages.length,
      componentCount: components.length,
      interactionCount: interactions.length,
      interactionsWithoutBackend: interactions.filter((interaction) => !interaction.apiRoute).length,
    },
  };
}

function modelFailureSurfaceMap(evidenceReport: EvidenceEngineResult): FailureSurfaceMap {
  const surfaces = evidenceReport.findings.map(failureSurfaceFromFinding);
  const byCategory = countBy(surfaces, (surface) => surface.category);
  const bySeverity = countBy(surfaces, (surface) => surface.severity);
  return {
    surfaces: surfaces.slice(0, 120),
    byCategory,
    bySeverity,
    summary: {
      total: surfaces.length,
      critical: bySeverity.critical || 0,
      high: bySeverity.high || 0,
      routesAffected: unique(surfaces.map((surface) => surface.route).filter(Boolean)).length,
      filesAffected: unique(surfaces.map((surface) => surface.filePath).filter(Boolean)).length,
    },
  };
}

function failureSurfaceFromFinding(finding: TraceableFinding): FailureSurface {
  return {
    id: finding.id,
    title: finding.title,
    category: finding.category,
    severity: finding.severity,
    confidence: finding.confidence,
    filePath: finding.affectedFiles[0],
    route: finding.affectedRoutes[0],
    executionPathId: finding.executionPath?.id,
    affectedGraph: affectedGraphsForFinding(finding),
    evidence: finding.evidence[0]?.detail || finding.businessImpact,
  };
}

function affectedGraphsForFinding(finding: TraceableFinding): FailureSurface["affectedGraph"] {
  const text = `${finding.category} ${finding.title} ${finding.businessImpact} ${finding.fixRecommendation}`.toLowerCase();
  const graphs = new Set<FailureSurface["affectedGraph"][number]>();
  if (finding.executionPath) graphs.add("execution");
  if (/trust|auth|session|owner|tenant|role|permission|admin/.test(text)) graphs.add("trust");
  if (/data|db|database|persist|save|prisma|migration|state/.test(text)) graphs.add("data");
  if (/api|route|endpoint|backend|provider|integration/.test(text)) graphs.add("api");
  if (/ui|button|form|action|success|loading/.test(text)) graphs.add("ui");
  if (!graphs.size) graphs.add("execution");
  return [...graphs];
}

function extractTrustGuards(file: NormalizedFile): TrustGuard[] {
  const guardPatterns: Array<[TrustGuard["type"], RegExp]> = [
    ["admin", /(?:compileTrust\s*\([^)]*mode:\s*["']admin["']|requireCompiledAdmin\s*\(|requireAdmin\s*\()/gi],
    ["api-key", /compileTrust\s*\([^)]*mode:\s*["']apiKey["']/gi],
    ["session", /(?:compileTrust\s*\([^)]*mode:\s*["']session["']|requireSession\s*\(|getSession\s*\(|requireAuth\s*\()/gi],
    ["ownership", /(?:assertOwnership\s*\(|ownerId\s*===\s*session\.userId|userId\s*===\s*session\.userId)/gi],
    ["org-access", /(?:assertOrgAccess\s*\(|orgId\s*===\s*session\.orgId|teamId\s*===\s*session\.orgId)/gi],
    ["public-read", /compileTrust\s*\([^)]*mode:\s*["']publicRead["']/gi],
    ["public-non-persistent", /compileTrust\s*\([^)]*mode:\s*["']publicNonPersistent["']/gi],
    ["webhook", /compileTrust\s*\([^)]*mode:\s*["']stripeWebhook["']/gi],
  ];
  return guardPatterns.flatMap(([type, pattern]) =>
    [...file.content.matchAll(pattern)].map((match) => ({
      id: stableId(["guard", type, file.path, String(match.index || 0)]),
      type,
      filePath: file.path,
      route: isApiRouteFile(file) ? apiRouteFromPath(file.path) : undefined,
      evidence: snippetAt(file.content, match.index || 0),
    })),
  );
}

function extractRequestControlledInputs(file: NormalizedFile): TrustInput[] {
  const pattern = /(body|req\.body|requestBody|searchParams|params|headers)\.(userId|role|ownerId|orgId|tenantId|teamId|actorId|isAdmin|permission)|\b(userId|role|ownerId|orgId|tenantId|teamId|actorId)\s*=\s*(body|req\.body|requestBody|searchParams|params|headers)/gi;
  return [...file.content.matchAll(pattern)].map((match) => ({
    id: stableId(["request-input", file.path, String(match.index || 0), match[0]]),
    filePath: file.path,
    route: isApiRouteFile(file) ? apiRouteFromPath(file.path) : undefined,
    field: match[2] || match[3] || "request-controlled identity",
    evidence: snippetAt(file.content, match.index || 0),
  }));
}

function extractStateStores(file: NormalizedFile): StateStoreNode[] {
  const patterns: Array<[StateStoreNode["kind"], RegExp]> = [
    ["localStorage", /localStorage\.(setItem|getItem|removeItem)|window\.localStorage/gi],
    ["sessionStorage", /sessionStorage\.(setItem|getItem|removeItem)|window\.sessionStorage/gi],
    ["cookie", /document\.cookie|cookies\s*\(/gi],
    ["react-state", /useState\s*\(/gi],
    ["zustand", /create\s*<.*>\s*\(|from\s+["']zustand["']/gi],
  ];
  return patterns.flatMap(([kind, pattern]) =>
    [...file.content.matchAll(pattern)].map((match) => ({
      id: stableId(["state", kind, file.path, String(match.index || 0)]),
      kind,
      filePath: file.path,
      evidence: snippetAt(file.content, match.index || 0),
    })),
  );
}

function extractClientApiCalls(file: NormalizedFile, routeSet: Set<string>): ApiClientCall[] {
  const pattern = /fetch\s*\(\s*["'](\/api\/[^"']+)["'][\s\S]{0,220}?(?:method\s*:\s*["']([A-Z]+)["'])?/gi;
  return [...file.content.matchAll(pattern)].map((match) => {
    const route = match[1] || "/api/unknown";
    return {
      id: stableId(["client-api-call", file.path, String(match.index || 0), route]),
      route,
      method: match[2] || "GET",
      filePath: file.path,
      evidence: snippetAt(file.content, match.index || 0),
      resolved: apiCallResolved(route, routeSet),
    };
  });
}

function apiCallResolved(route: string, routeSet: Set<string>) {
  if (routeSet.has(route)) return true;
  const routeParts = route.split("/").filter(Boolean);
  return [...routeSet].some((candidate) => {
    const candidateParts = candidate.split("/").filter(Boolean);
    if (candidateParts.length !== routeParts.length && !candidateParts.some((part) => part.startsWith("[..."))) return false;
    return candidateParts.every((part, index) => part.startsWith("[") || part === routeParts[index]);
  });
}

function boundaryForGuard(guard: TrustGuard | undefined): TrustBoundary["boundary"] {
  if (guard?.type === "api-key") return "api-key-to-server";
  if (guard?.type === "webhook") return "webhook-to-server";
  if (guard?.type === "session" || guard?.type === "admin" || guard?.type === "ownership" || guard?.type === "org-access") return "session-to-resource";
  return "public-to-server";
}

function principalLabelForGuard(guard: TrustGuard) {
  if (guard.type === "api-key") return "API key identity";
  if (guard.type === "admin") return "admin session";
  if (guard.type === "session") return "server session";
  if (guard.type === "webhook") return "verified webhook";
  if (guard.type === "public-read") return "public reader";
  if (guard.type === "public-non-persistent") return "public non-persistent user";
  return `${guard.type} guard`;
}

function principalSourceForGuard(guard: TrustGuard): TrustPrincipal["source"] {
  if (guard.type === "api-key") return "api-key";
  if (guard.type === "admin") return "admin-session";
  if (guard.type === "public-read" || guard.type === "public-non-persistent" || guard.type === "webhook") return "public";
  return "server-session";
}

function normalizeFiles(files: CodeFile[]): NormalizedFile[] {
  return files
    .filter((file) => file && typeof file.path === "string" && typeof file.content === "string")
    .map((file) => ({
      path: file.path.replace(/\\/g, "/"),
      content: file.content,
      lowerPath: file.path.replace(/\\/g, "/").toLowerCase(),
      lowerContent: file.content.toLowerCase(),
    }));
}

function parseSourceFiles(source: string): CodeFile[] {
  const markerPattern = /^\/\/ FILE:\s+(.+)$/gm;
  const markers = [...source.matchAll(markerPattern)];
  if (!markers.length) return [{ path: "submitted-code", content: source }];
  return markers.map((marker, index) => {
    const markerEnd = (marker.index || 0) + marker[0].length;
    const nextMarkerStart = markers[index + 1]?.index ?? source.length;
    return {
      path: marker[1]?.trim() || `submitted-code-${index + 1}`,
      content: source.slice(markerEnd, nextMarkerStart).replace(/^\r?\n/, ""),
    };
  });
}

function isApiRouteFile(file: NormalizedFile) {
  return /(^|\/)app\/api\/.+\/route\.(ts|tsx|js|jsx)$/.test(file.lowerPath) || /(^|\/)pages\/api\/.+\.(ts|tsx|js|jsx)$/.test(file.lowerPath);
}

function apiRouteFromPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const appMatch = normalized.match(/(?:^|\/)app\/api\/(.+)\/route\.(?:ts|tsx|js|jsx)$/i);
  if (appMatch?.[1]) return `/api/${appMatch[1].replace(/\/index$/i, "")}`;
  const pagesMatch = normalized.match(/(?:^|\/)pages\/api\/(.+)\.(?:ts|tsx|js|jsx)$/i);
  if (pagesMatch?.[1]) return `/api/${pagesMatch[1].replace(/\/index$/i, "")}`;
  return normalized;
}

function snippetAt(source: string, index: number) {
  const start = Math.max(0, source.lastIndexOf("\n", index - 1) + 1);
  const end = source.indexOf("\n", index);
  return source.slice(start, end === -1 ? source.length : end).replace(/\s+/g, " ").trim().slice(0, 260);
}

function countBy<T>(items: T[], keyFor: (item: T) => string) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyFor(item) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function dedupeBy<T>(items: T[], keyFor: (item: T) => string) {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const item of items) {
    const key = keyFor(item);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function stableId(parts: Array<string | null | undefined>) {
  const input = parts.filter(Boolean).join(":");
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return `model_${Math.abs(hash).toString(36)}`;
}
