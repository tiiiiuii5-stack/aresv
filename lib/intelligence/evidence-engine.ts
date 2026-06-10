import {
  buildExecutionGraph,
  type CodeFile,
  type ExecutionGraph,
  type ExecutionPath,
} from "@/lib/intelligence/execution-path-mapper";
import {
  detectFailureModes,
  type FailureModeFinding,
  type FailureModeSeverity,
} from "@/lib/intelligence/failure-mode-detector";
import type { FindingFileEvidence, FindingProofBundle, ReproducibleProof } from "@/lib/intelligence/finding-proof";
import { attachFindingProof } from "@/lib/intelligence/finding-proof";

export type EvidenceEngineCategory =
  | "BROKEN USER FLOW"
  | "TRUST FAILURE"
  | "STATE FAILURE"
  | "AI GENERATED CODE FAILURE"
  | "DEPLOYMENT FAILURE"
  | string;

export type EvidenceItem = {
  filePath?: string;
  route?: string;
  executionPathId?: string;
  codeSnippet?: string;
  detail: string;
};

export type TraceableExecutionPath = {
  id: string;
  entryPoint: string;
  action: string;
  apiRoute: string | null;
  databaseOperations: ExecutionPath["databaseOperations"];
  dependencies: ExecutionPath["dependencies"];
  riskScore: number;
  riskSignals: string[];
};

export type TraceableFinding = {
  id: string;
  title: string;
  category: EvidenceEngineCategory;
  severity: FailureModeSeverity;
  confidence: number;
  evidence: EvidenceItem[];
  executionPath: TraceableExecutionPath | null;
  affectedFiles: string[];
  affectedRoutes: string[];
  businessImpact: string;
  fixRecommendation: string;
  fileEvidence: FindingFileEvidence[];
  reasoning: string;
  confidenceScore: number;
  reproducibleProof: ReproducibleProof;
  proof: FindingProofBundle;
  traceability: {
    supported: true;
    evidenceCount: number;
    hasExecutionPath: boolean;
    hasAffectedSurface: boolean;
  };
};

export type EvidenceEngineInput = {
  files?: CodeFile[];
  source?: string;
  graph?: ExecutionGraph;
  executionPaths?: ExecutionPath[];
  findings?: FailureModeFinding[];
};

export type EvidenceEngineResult = {
  findings: TraceableFinding[];
  discarded: Array<{
    id?: string;
    title?: string;
    reason: string;
  }>;
  summary: {
    supportedFindings: number;
    discardedFindings: number;
    affectedFiles: string[];
    affectedRoutes: string[];
  };
};

type NormalizedFile = CodeFile & {
  lowerPath: string;
  lowerContent: string;
};

export function buildEvidenceReport(input: EvidenceEngineInput): EvidenceEngineResult {
  const files = normalizeFiles(input.files || (input.source ? parseSourceFiles(input.source) : []));
  const graph = input.graph || (files.length ? buildExecutionGraph({ files }) : { nodes: [], edges: [], paths: input.executionPaths || [] });
  const executionPaths = input.executionPaths || graph.paths;
  const findings = input.findings || detectFailureModes({ files, graph, executionPaths });
  const supported: TraceableFinding[] = [];
  const discarded: EvidenceEngineResult["discarded"] = [];

  for (const finding of findings) {
    const result = traceFinding(finding, { files, graph, executionPaths });
    if (result.supported) supported.push(result.finding);
    else discarded.push({ id: finding.id, title: finding.title, reason: result.reason });
  }

  return {
    findings: supported,
    discarded,
    summary: {
      supportedFindings: supported.length,
      discardedFindings: discarded.length,
      affectedFiles: unique(supported.flatMap((finding) => finding.affectedFiles)).sort(),
      affectedRoutes: unique(supported.flatMap((finding) => finding.affectedRoutes)).sort(),
    },
  };
}

export function buildEvidenceReportFromSource(source: string): EvidenceEngineResult {
  return buildEvidenceReport({ source });
}

function traceFinding(
  finding: FailureModeFinding,
  context: { files: NormalizedFile[]; graph: ExecutionGraph; executionPaths: ExecutionPath[] },
): { supported: true; finding: TraceableFinding } | { supported: false; reason: string } {
  const executionPath = resolveExecutionPath(finding, context.executionPaths);
  const evidence = normalizeEvidence(finding, context, executionPath);
  const affectedFiles = affectedFilesFor(finding, evidence, executionPath);
  const affectedRoutes = affectedRoutesFor(finding, evidence, executionPath);

  const missing = requiredMissing(finding, evidence, affectedFiles, affectedRoutes, executionPath);
  if (missing) return { supported: false, reason: missing };

  const traceable = {
    id: finding.id,
    title: finding.title,
    category: finding.category,
    severity: finding.severity,
    confidence: finding.confidenceScore,
    evidence,
    executionPath: executionPath ? traceablePath(executionPath) : null,
    affectedFiles,
    affectedRoutes,
    businessImpact: finding.impact,
    fixRecommendation: finding.fixSuggestion,
    traceability: {
      supported: true as const,
      evidenceCount: evidence.length,
      hasExecutionPath: Boolean(executionPath),
      hasAffectedSurface: affectedFiles.length > 0 || affectedRoutes.length > 0,
    },
  };

  return {
    supported: true,
    finding: attachFindingProof(traceable, {
      files: context.files.map((file) => ({ path: file.path, content: file.content })),
      scanner: "ventureos-evidence-engine",
    }),
  };
}

function requiredMissing(
  finding: FailureModeFinding,
  evidence: EvidenceItem[],
  affectedFiles: string[],
  affectedRoutes: string[],
  executionPath: ExecutionPath | null,
) {
  if (!finding.title?.trim()) return "missing title";
  if (!finding.category?.trim()) return "missing category";
  if (!finding.severity) return "missing severity";
  if (typeof finding.confidenceScore !== "number" || finding.confidenceScore < 75) return "missing high-confidence score";
  if (evidence.length === 0) return "missing evidence";
  if (!finding.impact?.trim()) return "missing business impact";
  if (!finding.fixSuggestion?.trim()) return "missing fix recommendation";
  if (affectedFiles.length === 0 && affectedRoutes.length === 0 && !executionPath) return "missing affected file, route, or execution path";
  if (requiresExecutionPath(finding) && !executionPath) return "missing execution path";
  return null;
}

function requiresExecutionPath(finding: FailureModeFinding) {
  return finding.category === "BROKEN USER FLOW" || finding.category === "STATE FAILURE";
}

function resolveExecutionPath(finding: FailureModeFinding, executionPaths: ExecutionPath[]) {
  if (finding.executionPathId) {
    const exact = executionPaths.find((path) => path.id === finding.executionPathId);
    if (exact) return exact;
  }
  if (finding.apiRoute) {
    const byRoute = executionPaths.find((path) => path.apiRoute === finding.apiRoute);
    if (byRoute) return byRoute;
  }
  if (finding.entryPoint && finding.action) {
    const byAction = executionPaths.find((path) => path.entryPoint === finding.entryPoint && path.action === finding.action);
    if (byAction) return byAction;
  }
  if (finding.action) {
    const byLabel = executionPaths.find((path) => path.action === finding.action);
    if (byLabel) return byLabel;
  }
  return null;
}

function normalizeEvidence(
  finding: FailureModeFinding,
  context: { files: NormalizedFile[]; graph: ExecutionGraph; executionPaths: ExecutionPath[] },
  executionPath: ExecutionPath | null,
): EvidenceItem[] {
  const explicit = (finding.evidence || []).map((item) => ({
    filePath: item.filePath,
    route: routeFromEvidence(item.filePath, finding.apiRoute),
    executionPathId: item.executionPathId || finding.executionPathId,
    codeSnippet: item.codeSnippet,
    detail: item.detail,
  }));
  const fromPath = executionPath ? evidenceFromExecutionPath(executionPath) : [];
  const fromFile = finding.filePath ? evidenceFromFile(finding, context.files) : [];
  return uniqueEvidence([...explicit, ...fromPath, ...fromFile].filter(hasEvidenceSupport));
}

function evidenceFromExecutionPath(path: ExecutionPath): EvidenceItem[] {
  const items: EvidenceItem[] = [
    {
      executionPathId: path.id,
      route: path.apiRoute || undefined,
      detail: `Execution path ${path.id}: ${path.entryPoint} -> ${path.action}${path.apiRoute ? ` -> ${path.apiRoute}` : ""}.`,
    },
  ];
  for (const operation of path.databaseOperations) {
    items.push({
      filePath: operation.filePath,
      executionPathId: path.id,
      codeSnippet: operation.evidence,
      detail: `Database ${operation.operation} operation on ${operation.target}.`,
    });
  }
  for (const dependency of path.dependencies) {
    items.push({
      filePath: dependency.filePath,
      executionPathId: path.id,
      codeSnippet: dependency.evidence,
      detail: `${dependency.type} dependency: ${dependency.name}.`,
    });
  }
  for (const signal of path.riskSignals || []) {
    items.push({
      executionPathId: path.id,
      route: path.apiRoute || undefined,
      detail: `Execution risk signal: ${signal}.`,
    });
  }
  return items;
}

function evidenceFromFile(finding: FailureModeFinding, files: NormalizedFile[]): EvidenceItem[] {
  const file = files.find((item) => item.path === finding.filePath);
  if (!file) return [];
  return [{
    filePath: file.path,
    route: routeFromEvidence(file.path, finding.apiRoute),
    codeSnippet: bestSnippetForFinding(finding, file),
    detail: `Finding is anchored to ${file.path}.`,
  }];
}

function hasEvidenceSupport(item: EvidenceItem) {
  return Boolean(item.detail?.trim() && (item.filePath || item.route || item.executionPathId || item.codeSnippet));
}

function affectedFilesFor(finding: FailureModeFinding, evidence: EvidenceItem[], executionPath: ExecutionPath | null) {
  return unique([
    finding.filePath,
    ...evidence.map((item) => item.filePath),
    ...(executionPath?.databaseOperations.map((operation) => operation.filePath) || []),
    ...(executionPath?.dependencies.map((dependency) => dependency.filePath) || []),
  ].filter((item): item is string => Boolean(item)));
}

function affectedRoutesFor(finding: FailureModeFinding, evidence: EvidenceItem[], executionPath: ExecutionPath | null) {
  return unique([
    finding.apiRoute || undefined,
    executionPath?.entryPoint?.startsWith("/") ? executionPath.entryPoint : undefined,
    executionPath?.apiRoute || undefined,
    ...evidence.map((item) => item.route),
  ].filter((item): item is string => Boolean(item)));
}

function traceablePath(path: ExecutionPath): TraceableExecutionPath {
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

function routeFromEvidence(filePath?: string, fallback?: string | null) {
  if (fallback) return fallback;
  if (!filePath) return undefined;
  const normalized = filePath.replace(/\\/g, "/");
  const apiMatch = normalized.match(/(?:^|\/)app\/api\/(.+)\/route\.(?:ts|tsx|js|jsx)$/i);
  if (apiMatch?.[1]) return `/api/${apiMatch[1]}`;
  const pageMatch = normalized.match(/(?:^|\/)app\/(?:(.*)\/)?page\.(?:ts|tsx|js|jsx)$/i);
  if (pageMatch) return pageMatch[1] ? `/${pageMatch[1]}` : "/";
  return undefined;
}

function bestSnippetForFinding(finding: FailureModeFinding, file: NormalizedFile) {
  const existing = finding.evidence.find((item) => item.filePath === file.path && item.codeSnippet)?.codeSnippet;
  if (existing) return existing;
  const patterns = [
    /fetch\s*\(/i,
    /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)/,
    /(body|req\.body|requestBody|searchParams|params)\.(userId|role|ownerId|orgId|tenantId|teamId)/i,
    /(prisma|db|tx)\.[A-Za-z0-9_]+\.(create|update|upsert|delete|deleteMany|updateMany)/i,
    /process\.env\.[A-Z0-9_]+/i,
    /import\s+/i,
  ];
  for (const pattern of patterns) {
    const match = file.content.match(pattern);
    if (match) return snippetAt(file.content, match.index || 0);
  }
  return snippetAt(file.content, 0);
}

function normalizeFiles(files: CodeFile[]): NormalizedFile[] {
  return files.map((file) => ({
    path: file.path.replace(/\\/g, "/"),
    content: file.content,
    lowerPath: file.path.replace(/\\/g, "/").toLowerCase(),
    lowerContent: file.content.toLowerCase(),
  }));
}

function parseSourceFiles(source: string): CodeFile[] {
  const markerPattern = /^\/\/ FILE:\s+(.+)$/gm;
  const markers = [...source.matchAll(markerPattern)];
  if (markers.length === 0) return [{ path: "submitted-code", content: source }];
  return markers.map((marker, index) => {
    const markerEnd = (marker.index || 0) + marker[0].length;
    const nextMarkerStart = markers[index + 1]?.index ?? source.length;
    return {
      path: marker[1]?.trim() || `submitted-code-${index + 1}`,
      content: source.slice(markerEnd, nextMarkerStart).replace(/^\r?\n/, ""),
    };
  });
}

function snippetAt(source: string, index: number) {
  const start = Math.max(0, source.lastIndexOf("\n", index - 1) + 1);
  const end = source.indexOf("\n", index);
  return source.slice(start, end === -1 ? source.length : end).replace(/\s+/g, " ").trim().slice(0, 260);
}

function uniqueEvidence(items: EvidenceItem[]) {
  const seen = new Set<string>();
  const output: EvidenceItem[] = [];
  for (const item of items) {
    const key = `${item.filePath || ""}:${item.route || ""}:${item.executionPathId || ""}:${item.detail}:${item.codeSnippet || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}
