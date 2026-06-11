import {
  buildExecutionGraph,
  type CodeFile,
  type ExecutionGraph,
  type ExecutionPath,
} from "@/lib/intelligence/execution-path-mapper";
import {
  apiDynamicPrefixMatchesRoute,
  apiPathMatchesRoute,
  apiRouteFromFilePath,
  isDynamicApiExpression,
} from "@/lib/scanner/api-route-matcher";

export type FailureModeCategory =
  | "BROKEN USER FLOW"
  | "TRUST FAILURE"
  | "STATE FAILURE"
  | "AI GENERATED CODE FAILURE"
  | "DEPLOYMENT FAILURE";

export type FailureModeSeverity = "critical" | "high" | "medium" | "low";

export type FailureModeEvidence = {
  filePath?: string;
  codeSnippet?: string;
  executionPathId?: string;
  detail: string;
};

export type FailureModeFinding = {
  id: string;
  category: FailureModeCategory;
  title: string;
  severity: FailureModeSeverity;
  confidenceScore: number;
  executionPathId?: string;
  entryPoint?: string;
  action?: string;
  apiRoute?: string | null;
  filePath?: string;
  evidence: FailureModeEvidence[];
  impact: string;
  fixSuggestion: string;
  riskScore: number;
};

export type FailureModeDetectorInput = {
  files?: CodeFile[];
  source?: string;
  executionPaths?: ExecutionPath[];
  graph?: ExecutionGraph;
};

type NormalizedFile = CodeFile & {
  lowerPath: string;
  lowerContent: string;
};

type DetectionContext = {
  files: NormalizedFile[];
  graph: ExecutionGraph;
  paths: ExecutionPath[];
  apiRoutes: Set<string>;
  staticApiCalls: Array<{ apiRoute: string; dynamicPrefix: boolean; file: NormalizedFile; snippet: string }>;
};

export function detectFailureModes(input: FailureModeDetectorInput): FailureModeFinding[] {
  const context = buildContext(input);
  const findings = [
    ...detectBrokenUserFlows(context),
    ...detectTrustFailures(context),
    ...detectStateFailures(context),
    ...detectAiGeneratedCodeFailures(context),
    ...detectDeploymentFailures(context),
  ];
  return normalizeFindings(findings);
}

export function detectFailureModesFromSource(source: string): FailureModeFinding[] {
  return detectFailureModes({ source });
}

function buildContext(input: FailureModeDetectorInput): DetectionContext {
  const files = normalizeFiles(input.files || (input.source ? parseSourceFiles(input.source) : []));
  const graph = input.graph || (files.length ? buildExecutionGraph({ files }) : { nodes: [], edges: [], paths: input.executionPaths || [] });
  const paths = input.executionPaths || graph.paths;
  const apiRoutes = new Set(
    files
      .filter(isApiRouteFile)
      .map((file) => apiRouteFromPath(file.path)),
  );
  return {
    files,
    graph,
    paths,
    apiRoutes,
    staticApiCalls: extractStaticApiCalls(files),
  };
}

function detectBrokenUserFlows(context: DetectionContext): FailureModeFinding[] {
  const findings: FailureModeFinding[] = [];

  for (const call of context.staticApiCalls) {
    if (!hasMatchingApiRoute(call.apiRoute, context.apiRoutes, call.dynamicPrefix)) {
      findings.push(finding({
        category: "BROKEN USER FLOW",
        title: "UI action calls a missing API route",
        severity: mutatingApiName(call.apiRoute) ? "high" : "medium",
        confidenceScore: 92,
        filePath: call.file.path,
        evidence: [{ filePath: call.file.path, codeSnippet: call.snippet, detail: `Static fetch references ${call.apiRoute}, but no matching route file was found.` }],
        impact: "Users can click a visible action and hit a 404 or failed request in production.",
        fixSuggestion: "Create the matching API route, update the fetch URL, or disable the action with clear unavailable-state copy.",
      }));
    }
  }

  for (const path of context.paths) {
    if (path.riskSignals?.some((signal) => /no API route or server action/i.test(signal))) {
      findings.push(pathFinding(path, {
        category: "BROKEN USER FLOW",
        title: "Mutating user action has no backend execution path",
        severity: /deploy|billing|delete|admin|checkout|payment/i.test(path.action) ? "high" : "medium",
        confidenceScore: 88,
        detail: "Execution path mapper found a mutating UI action without an API route or server action.",
        impact: "The UI can imply work was done even though no backend step runs.",
        fixSuggestion: "Wire the action to an API route or server action, or disable it until implementation exists.",
      }));
    }

    if (isMutatingPath(path) && path.apiRoute && path.databaseOperations.length === 0 && !hasExternalPersistence(path)) {
      findings.push(pathFinding(path, {
        category: "BROKEN USER FLOW",
        title: "Form or action submits without durable persistence",
        severity: "medium",
        confidenceScore: 82,
        detail: "Execution path has a mutating action and API route, but no database write or durable provider dependency was detected.",
        impact: "Submitted data can be acknowledged without being saved for later sessions or teammates.",
        fixSuggestion: "Persist the mutation through a database or durable storage operation and return that result to the UI.",
      }));
    }

    if (/deploy/i.test(path.action) && !/deploy/i.test(path.apiRoute || "") && !path.dependencies.some((dependency) => /deploy|vercel|worker|queue/i.test(dependency.name))) {
      findings.push(pathFinding(path, {
        category: "BROKEN USER FLOW",
        title: "Deploy action is not connected to a deployment backend",
        severity: "high",
        confidenceScore: 86,
        detail: "A deploy-labeled action was detected without a deployment API route, deployment service, worker, or queue dependency.",
        impact: "Users can attempt to deploy but no production deployment will be created.",
        fixSuggestion: "Connect the action to the deployment service/worker path or label it as unavailable.",
      }));
    }
  }

  return findings;
}

function detectTrustFailures(context: DetectionContext): FailureModeFinding[] {
  const findings: FailureModeFinding[] = [];
  for (const file of context.files.filter(isApiRouteFile)) {
    const mutates = hasMutatingRoute(file.content) || hasDatabaseWrite(file.content);
    if (!mutates) continue;

    if (!hasServerSessionGuard(file.content)) {
      findings.push(finding({
        category: "TRUST FAILURE",
        title: "Mutating API route has no server session guard",
        severity: "critical",
        confidenceScore: 90,
        filePath: file.path,
        apiRoute: apiRouteFromPath(file.path),
        evidence: [{ filePath: file.path, codeSnippet: routeSnippet(file), detail: "Route mutates data, but no requireSession/getSession/compileTrust/auth guard was detected before execution." }],
        impact: "Unauthenticated callers may be able to trigger production mutations.",
        fixSuggestion: "Resolve identity from a server session at the top of the route before reading or mutating resources.",
      }));
    }

    if (hasRequestIdentityUsage(file.content)) {
      findings.push(finding({
        category: "TRUST FAILURE",
        title: "Route trusts request-controlled identity or role",
        severity: "critical",
        confidenceScore: 94,
        filePath: file.path,
        apiRoute: apiRouteFromPath(file.path),
        evidence: [{ filePath: file.path, codeSnippet: snippetForPattern(file.content, /(body|req\.body|requestBody|searchParams|params)\.(userId|role|ownerId|orgId|tenantId|teamId|actorId|isAdmin|permission)/i), detail: "Identity or authorization data is read from request-controlled input." }],
        impact: "Users can impersonate another account, tenant, or role by changing request data.",
        fixSuggestion: "Ignore client identity fields and derive user, role, and tenant from the server session only.",
      }));
    }

    if (looksTenantScoped(file.content) && !hasTenantBoundaryCheck(file.content)) {
      findings.push(finding({
        category: "TRUST FAILURE",
        title: "Tenant or ownership boundary is not enforced",
        severity: "high",
        confidenceScore: 84,
        filePath: file.path,
        apiRoute: apiRouteFromPath(file.path),
        evidence: [{ filePath: file.path, codeSnippet: routeSnippet(file), detail: "Tenant/user-scoped resource terms were detected, but no ownership or organization access check was found." }],
        impact: "A valid user may cross account, organization, or tenant boundaries.",
        fixSuggestion: "Load the resource server-side and validate owner/org access before mutation or response.",
      }));
    }
  }
  return findings;
}

function detectStateFailures(context: DetectionContext): FailureModeFinding[] {
  const findings: FailureModeFinding[] = [];
  for (const file of context.files.filter(isClientFile)) {
    const mutatingFetch = /\bfetch\s*\(\s*["']\/api\/[^"']+["'][\s\S]{0,400}method\s*:\s*["'](POST|PUT|PATCH|DELETE)["']/i.test(file.content);
    if (!mutatingFetch) continue;

    if (hasSuccessFeedback(file.content) && !/response\.ok|res\.ok|catch\s*\(|try\s*\{/i.test(file.content)) {
      findings.push(finding({
        category: "STATE FAILURE",
        title: "UI can show success without handling backend failure",
        severity: "medium",
        confidenceScore: 83,
        filePath: file.path,
        evidence: [{ filePath: file.path, codeSnippet: snippetForPattern(file.content, /(toast\.success|setSuccess|alert\s*\(|setStatus\s*\(\s*["'][^"']*(saved|success|created|done))/i), detail: "Success feedback is present around a mutating request without an obvious response.ok or catch branch." }],
        impact: "Users may see success while the database write failed.",
        fixSuggestion: "Only show success after checking the backend response and render a failure state when the request fails.",
      }));
    }

    if (!/(set[A-Z][A-Za-z0-9_]*\(|router\.refresh\s*\(|revalidate|mutate\s*\(|invalidate|window\.location\.reload)/.test(file.content)) {
      findings.push(finding({
        category: "STATE FAILURE",
        title: "Database mutation does not refresh client state",
        severity: "medium",
        confidenceScore: 80,
        filePath: file.path,
        evidence: [{ filePath: file.path, codeSnippet: snippetForPattern(file.content, /\bfetch\s*\(\s*["']\/api\/[^"']+["']/), detail: "Client performs a mutating API request without a detected state update, cache invalidation, or refresh." }],
        impact: "The database can update while the UI continues showing stale information.",
        fixSuggestion: "Update local state from the response, refresh server data, or invalidate the relevant cache after mutation.",
      }));
    }
  }

  for (const path of context.paths) {
    if (path.databaseOperations.length > 0 && path.riskSignals?.some((signal) => /no detected database write/i.test(signal))) {
      findings.push(pathFinding(path, {
        category: "STATE FAILURE",
        title: "Execution path state model is inconsistent",
        severity: "medium",
        confidenceScore: 78,
        detail: "Execution path has conflicting mutation/state signals.",
        impact: "The UI and backend state can diverge after the action runs.",
        fixSuggestion: "Trace the response shape and refresh behavior for this path.",
      }));
    }
  }
  return findings;
}

function detectAiGeneratedCodeFailures(context: DetectionContext): FailureModeFinding[] {
  const findings: FailureModeFinding[] = [];
  findings.push(...detectHallucinatedImports(context));
  findings.push(...detectUnusedServices(context));
  findings.push(...detectOrphanApis(context));
  findings.push(...detectDuplicatedLogic(context));
  findings.push(...detectDeadIntegrations(context));
  return findings;
}

function detectDeploymentFailures(context: DetectionContext): FailureModeFinding[] {
  const findings: FailureModeFinding[] = [];
  const envExample = context.files.find((file) => /(^|\/)\.env\.example$/i.test(file.path));
  const envNames = extractEnvNames(context.files);
  const documentedEnv = envExample ? new Set([...envExample.content.matchAll(/^([A-Z0-9_]+)=/gm)].map((match) => match[1]).filter(Boolean)) : new Set<string>();

  for (const env of envNames) {
    if (!envExample || !documentedEnv.has(env.name)) {
      findings.push(finding({
        category: "DEPLOYMENT FAILURE",
        title: "Required environment dependency is not documented",
        severity: sensitiveEnvName(env.name) ? "high" : "medium",
        confidenceScore: envExample ? 88 : 82,
        filePath: env.file.path,
        evidence: [{ filePath: env.file.path, codeSnippet: env.snippet, detail: envExample ? `${env.name} is used in source but missing from .env.example.` : `${env.name} is used in source but no .env.example file was found.` }],
        impact: "Production can build or boot without required runtime configuration.",
        fixSuggestion: "Add the variable name to .env.example and validate it during server startup without exposing the secret value.",
      }));
    }
  }

  const queueUsage = context.files.filter((file) => /\b(new\s+Queue|new\s+Worker|\w+Queue\.add|addBuildJob\s*\(|queue\.add\s*\()/i.test(file.content));
  if (queueUsage.length > 0 && !envNames.some((env) => /REDIS|QUEUE|BULL/i.test(env.name))) {
    findings.push(finding({
      category: "DEPLOYMENT FAILURE",
      title: "Queue dependency is used without runtime connection configuration",
      severity: "high",
      confidenceScore: 86,
      filePath: queueUsage[0]?.path,
      evidence: [{ filePath: queueUsage[0]?.path, codeSnippet: snippetForPattern(queueUsage[0]?.content || "", /\b(new\s+Queue|new\s+Worker|\w+Queue\.add|addBuildJob\s*\(|queue\.add\s*\()/i), detail: "Queue usage was detected, but no Redis/queue environment dependency was detected in source." }],
      impact: "Background work can fail to enqueue or process after deployment.",
      fixSuggestion: "Define and validate the queue connection env var, and fail clearly when the worker dependency is unavailable.",
    }));
  }

  const enqueues = context.files.some((file) => /\b(\w+Queue\.add|addBuildJob\s*\(|queue\.add\s*\()/i.test(file.content));
  const hasWorker = context.files.some((file) => /\bnew\s+Worker\b|processBuildJob|worker/i.test(file.lowerPath + "\n" + file.content));
  if (enqueues && !hasWorker) {
    findings.push(finding({
      category: "DEPLOYMENT FAILURE",
      title: "Background jobs are enqueued without a processor",
      severity: "high",
      confidenceScore: 88,
      evidence: [{ detail: "Queue enqueue calls were detected, but no worker or background processor file was found in the submitted files." }],
      impact: "Jobs can sit in the queue forever, making async workflows appear broken.",
      fixSuggestion: "Add a worker process for the queue or route the action through an existing background processor.",
    }));
  }

  return findings;
}

function detectHallucinatedImports(context: DetectionContext): FailureModeFinding[] {
  const filesByPath = new Set(context.files.map((file) => trimExtension(file.path)));
  const findings: FailureModeFinding[] = [];
  for (const file of context.files) {
    for (const item of extractLocalImports(file.content)) {
      const resolved = resolveLocalImport(item.source, file.path);
      if (!resolved || hasLocalFile(filesByPath, resolved)) continue;
      findings.push(finding({
        category: "AI GENERATED CODE FAILURE",
        title: "Local import points to a missing file",
        severity: "high",
        confidenceScore: 91,
        filePath: file.path,
        evidence: [{ filePath: file.path, codeSnippet: item.snippet, detail: `Import ${item.source} could not be resolved to a submitted file.` }],
        impact: "The app can fail build or runtime module resolution.",
        fixSuggestion: "Create the imported module, correct the import path, or remove the unused import.",
      }));
    }
  }
  return findings;
}

function detectUnusedServices(context: DetectionContext): FailureModeFinding[] {
  const findings: FailureModeFinding[] = [];
  const allSourceExcept = (path: string) => context.files.filter((file) => file.path !== path).map((file) => file.content).join("\n");
  for (const file of context.files.filter(isServiceFile)) {
    const serviceName = exportedName(file);
    if (!serviceName) continue;
    if (new RegExp(`\\b${escapeRegExp(serviceName)}\\b`).test(allSourceExcept(file.path))) continue;
    findings.push(finding({
      category: "AI GENERATED CODE FAILURE",
      title: "Service is defined but unused",
      severity: "low",
      confidenceScore: 80,
      filePath: file.path,
      evidence: [{ filePath: file.path, codeSnippet: snippetForPattern(file.content, /export\s+(class|const|function)\s+([A-Za-z_$][\w$]*)/), detail: `${serviceName} is exported but not referenced by other submitted files.` }],
      impact: "The codebase can contain dead generated service logic that no workflow actually uses.",
      fixSuggestion: "Wire the service into a route/action or remove it if it is not part of a real execution path.",
    }));
  }
  return findings;
}

function detectOrphanApis(context: DetectionContext): FailureModeFinding[] {
  const findings: FailureModeFinding[] = [];
  for (const file of context.files.filter(isApiRouteFile)) {
    const route = apiRouteFromPath(file.path);
    const referenced = context.staticApiCalls.some((call) =>
      call.dynamicPrefix
        ? apiDynamicPrefixMatchesRoute(route, call.apiRoute)
        : apiPathMatchesRoute(route, call.apiRoute),
    );
    if (referenced || isExpectedPublicRoute(route)) continue;
    findings.push(finding({
      category: "AI GENERATED CODE FAILURE",
      title: "API route is not connected to a UI action",
      severity: hasMutatingRoute(file.content) ? "medium" : "low",
      confidenceScore: 78,
      filePath: file.path,
      apiRoute: route,
      evidence: [{ filePath: file.path, codeSnippet: routeSnippet(file), detail: `${route} exists, but no static UI fetch call references it.` }],
      impact: "Generated backend logic may be orphaned and never exercised by users.",
      fixSuggestion: "Connect a real UI action/client to the route or mark the endpoint as intentionally external.",
    }));
  }
  return findings;
}

function detectDuplicatedLogic(context: DetectionContext): FailureModeFinding[] {
  const blocks = new Map<string, NormalizedFile[]>();
  for (const file of context.files.filter((item) => /\.(ts|tsx|js|jsx)$/.test(item.lowerPath))) {
    const normalized = normalizeLogicBlock(file.content);
    if (normalized.length < 180) continue;
    blocks.set(normalized, [...(blocks.get(normalized) || []), file]);
  }
  const findings: FailureModeFinding[] = [];
  for (const files of blocks.values()) {
    if (files.length < 2) continue;
    findings.push(finding({
      category: "AI GENERATED CODE FAILURE",
      title: "Duplicated logic appears in multiple files",
      severity: "low",
      confidenceScore: 76,
      filePath: files[0]?.path,
      evidence: files.slice(0, 3).map((file) => ({ filePath: file.path, codeSnippet: snippetForPattern(file.content, /export|function|const|async/), detail: "Substantially identical normalized logic was detected." })),
      impact: "Fixes can be applied to one copy while another generated copy keeps failing.",
      fixSuggestion: "Consolidate the duplicated logic behind one service/helper or deliberately separate the flows with tests.",
    }));
  }
  return findings;
}

function detectDeadIntegrations(context: DetectionContext): FailureModeFinding[] {
  const providerFiles = context.files.filter((file) => /(stripe|openai|anthropic|gemini|google|supabase|resend|sendgrid|twilio)/i.test(file.path + "\n" + file.content));
  const findings: FailureModeFinding[] = [];
  for (const file of providerFiles) {
    const name = exportedName(file) || providerName(file);
    const sourceElsewhere = context.files.filter((item) => item.path !== file.path).map((item) => item.content).join("\n");
    if (name && new RegExp(`\\b${escapeRegExp(name)}\\b`, "i").test(sourceElsewhere)) continue;
    if (context.paths.some((path) => path.dependencies.some((dependency) => dependency.filePath === file.path))) continue;
    findings.push(finding({
      category: "AI GENERATED CODE FAILURE",
      title: "Integration code is present but disconnected",
      severity: "medium",
      confidenceScore: 79,
      filePath: file.path,
      evidence: [{ filePath: file.path, codeSnippet: snippetForPattern(file.content, /(stripe|openai|anthropic|gemini|google|supabase|resend|sendgrid|twilio)/i), detail: "Provider integration code was detected without a connected execution path." }],
      impact: "The app can appear integrated with a provider while no user workflow actually calls it.",
      fixSuggestion: "Connect the integration through a route/action and test the provider boundary, or remove the unused integration.",
    }));
  }
  return findings;
}

function pathFinding(path: ExecutionPath, input: {
  category: FailureModeCategory;
  title: string;
  severity: FailureModeSeverity;
  confidenceScore: number;
  detail: string;
  impact: string;
  fixSuggestion: string;
}): FailureModeFinding {
  return finding({
    ...input,
    executionPathId: path.id,
    entryPoint: path.entryPoint,
    action: path.action,
    apiRoute: path.apiRoute,
    evidence: [{ executionPathId: path.id, detail: input.detail }],
    riskScore: Math.max(path.riskScore, severityBaseRisk(input.severity)),
  });
}

function finding(input: Omit<FailureModeFinding, "id" | "riskScore"> & { riskScore?: number }): FailureModeFinding {
  return {
    ...input,
    id: stableId([input.category, input.title, input.filePath || "", input.executionPathId || "", input.apiRoute || ""]),
    riskScore: input.riskScore ?? severityBaseRisk(input.severity),
  };
}

function normalizeFindings(findings: FailureModeFinding[]) {
  const bestByKey = new Map<string, FailureModeFinding>();
  for (const findingItem of findings.filter((item) => item.confidenceScore >= 75)) {
    const key = `${findingItem.category}:${findingItem.title}:${findingItem.filePath || findingItem.executionPathId || findingItem.apiRoute || "global"}`;
    const existing = bestByKey.get(key);
    if (!existing || findingRank(findingItem) > findingRank(existing)) bestByKey.set(key, findingItem);
  }
  return [...bestByKey.values()].sort((a, b) => findingRank(b) - findingRank(a));
}

function findingRank(item: FailureModeFinding) {
  return severityRank(item.severity) * 10_000 + item.riskScore * 100 + item.confidenceScore;
}

function severityBaseRisk(severity: FailureModeSeverity) {
  return severity === "critical" ? 95 : severity === "high" ? 78 : severity === "medium" ? 55 : 25;
}

function severityRank(severity: FailureModeSeverity) {
  return severity === "critical" ? 4 : severity === "high" ? 3 : severity === "medium" ? 2 : 1;
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

function extractStaticApiCalls(files: NormalizedFile[]) {
  return files.flatMap((file) =>
    [...file.content.matchAll(/\bfetch\s*\(\s*["'](\/api\/[A-Za-z0-9_./\-[\]]+)["']/g)].map((match) => ({
      apiRoute: match[1] || "",
      dynamicPrefix: isDynamicApiExpression(file.content, (match.index ?? 0) + match[0].length),
      file,
      snippet: snippetAt(file.content, match.index || 0),
    })),
  ).filter((call) => call.apiRoute);
}

function extractEnvNames(files: NormalizedFile[]) {
  return files.flatMap((file) =>
    [...file.content.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((match) => ({
      name: match[1] || "",
      file,
      snippet: snippetAt(file.content, match.index || 0),
    })),
  ).filter((env) => env.name && !env.name.startsWith("NEXT_PUBLIC_"));
}

function extractLocalImports(source: string) {
  return [...source.matchAll(/import\s+(?:type\s+)?(?:[^"']+\s+from\s+)?["']([^"']+)["']/g)]
    .map((match) => ({
      source: match[1] || "",
      snippet: match[0] || "",
    }))
    .filter((item) => item.source.startsWith("@/") || item.source.startsWith("./") || item.source.startsWith("../"));
}

function resolveLocalImport(source: string, fromPath: string) {
  if (source.startsWith("@/")) return source.replace(/^@\//, "");
  if (!source.startsWith(".")) return null;
  const base = fromPath.split("/").slice(0, -1);
  for (const part of source.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") base.pop();
    else base.push(part);
  }
  return base.join("/");
}

function hasLocalFile(filesByPath: Set<string>, importPath: string) {
  const normalized = trimExtension(importPath);
  return (
    filesByPath.has(normalized) ||
    filesByPath.has(`${normalized}/index`) ||
    filesByPath.has(`${normalized}/route`) ||
    [...filesByPath].some((file) => file === normalized || file.startsWith(`${normalized}.`))
  );
}

function hasMatchingApiRoute(apiRoute: string, routes: Set<string>, dynamicPrefix = false) {
  if (routes.has(apiRoute)) return true;
  return [...routes].some((route) =>
    dynamicPrefix
      ? apiDynamicPrefixMatchesRoute(route, apiRoute)
      : apiPathMatchesRoute(route, apiRoute),
  );
}

function isApiRouteFile(file: NormalizedFile) {
  return /(^|\/)app\/api\/.+\/route\.(ts|tsx|js|jsx)$/.test(file.lowerPath) || /(^|\/)pages\/api\/.+\.(ts|tsx|js|jsx)$/.test(file.lowerPath);
}

function isClientFile(file: NormalizedFile) {
  return /(^|\n)\s*["']use client["']/.test(file.content) || /\.(tsx|jsx)$/.test(file.lowerPath);
}

function isServiceFile(file: NormalizedFile) {
  return /(^|\/)lib\/services\/.+\.(ts|tsx|js|jsx)$/.test(file.lowerPath) || /(^|\/)services\/.+\.(ts|tsx|js|jsx)$/.test(file.lowerPath);
}

function apiRouteFromPath(path: string) {
  return apiRouteFromFilePath(path) || path.replace(/\\/g, "/");
}

function hasMutatingRoute(source: string) {
  return /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\s*\(/.test(source);
}

function hasDatabaseWrite(source: string) {
  return /(prisma|db|tx)\.[A-Za-z0-9_]+\.(create|update|upsert|delete|deleteMany|updateMany)|\$executeRawUnsafe|\$queryRawUnsafe|\.insert\s*\(|\.update\s*\(|\.delete\s*\(/i.test(source);
}

function hasServerSessionGuard(source: string) {
  return /(compileTrust\s*\(|requireSession\s*\(|getSession\s*\(|requireAuth\s*\(|auth\s*\(|currentUser\s*\(|getServerSession\s*\(|jwtVerify\s*\(|verifyToken\s*\()/i.test(source);
}

function hasRequestIdentityUsage(source: string) {
  return /(body|req\.body|requestBody|searchParams|params)\.(userId|role|ownerId|orgId|tenantId|teamId|actorId|isAdmin|permission)|\b(userId|role|ownerId|orgId|tenantId|teamId)\s*=\s*(body|req\.body|requestBody|searchParams|params)/i.test(source);
}

function looksTenantScoped(source: string) {
  return /(userId|ownerId|orgId|organizationId|tenantId|teamId|workspaceId|projectId)/i.test(source) && hasDatabaseWrite(source);
}

function hasTenantBoundaryCheck(source: string) {
  return /(assertOwnership|assertOrgAccess|canAccess|ownerId\s*===\s*session\.userId|userId\s*===\s*session\.userId|orgId\s*===\s*session\.orgId|teamId\s*===\s*session\.orgId|where:\s*\{[\s\S]{0,220}(userId|ownerId|orgId|teamId))/i.test(source);
}

function hasSuccessFeedback(source: string) {
  return /(toast\.success|setSuccess|alert\s*\(|setStatus\s*\(\s*["'][^"']*(saved|success|created|done|complete))/i.test(source);
}

function isMutatingPath(path: ExecutionPath) {
  return /create|add|save|submit|update|edit|delete|remove|archive|book|cancel|checkout|pay|send|publish|deploy|retry|generate|upload|mark|assign|move|POST|PUT|PATCH|DELETE/i.test(path.action);
}

function hasExternalPersistence(path: ExecutionPath) {
  return path.dependencies.some((dependency) => dependency.type === "external_provider" && /(supabase|postgres|neon|mongodb|firebase|storage|blob|stripe)/i.test(dependency.name));
}

function mutatingApiName(apiRoute: string) {
  return /save|create|update|delete|checkout|billing|deploy|book|cancel|admin|project|job|upload/i.test(apiRoute);
}

function isExpectedPublicRoute(route: string) {
  return /\/api\/(health|webhook|waitlist|public|session|schedule)|\/webhook/i.test(route);
}

function sensitiveEnvName(name: string) {
  return /(DATABASE_URL|SECRET|TOKEN|PRIVATE|SERVICE_ROLE|STRIPE|SUPABASE|OPENAI|GEMINI|ANTHROPIC|KEY|REDIS_URL)/i.test(name);
}

function exportedName(file: NormalizedFile) {
  return (
    file.content.match(/export\s+(?:class|function|const)\s+([A-Za-z_$][\w$]*)/)?.[1] ||
    file.path.split("/").pop()?.replace(/\.(ts|tsx|js|jsx)$/i, "")
  );
}

function providerName(file: NormalizedFile) {
  return file.content.match(/(stripe|openai|anthropic|gemini|google|supabase|resend|sendgrid|twilio)/i)?.[1] || "provider";
}

function routeSnippet(file: NormalizedFile) {
  return snippetForPattern(file.content, /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)/);
}

function snippetForPattern(source: string, pattern: RegExp) {
  const match = source.match(pattern);
  return snippetAt(source, match?.index || 0);
}

function snippetAt(source: string, index: number) {
  const start = Math.max(0, source.lastIndexOf("\n", index - 1) + 1);
  const end = source.indexOf("\n", index);
  return compact(source.slice(start, end === -1 ? source.length : end)).slice(0, 260);
}

function normalizeLogicBlock(source: string) {
  return source
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/["'][^"']*["']/g, "\"\"")
    .replace(/\s+/g, " ")
    .trim();
}

function trimExtension(path: string) {
  return path.replace(/\.(ts|tsx|js|jsx|mjs|cjs|json)$/i, "");
}

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stableId(parts: Array<string | null | undefined>) {
  const input = parts.filter(Boolean).join(":");
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return `failure_${Math.abs(hash).toString(36)}`;
}
