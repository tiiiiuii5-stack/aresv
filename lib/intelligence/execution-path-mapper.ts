export type CodeFile = {
  path: string;
  content: string;
};

export type ExecutionNodeType =
  | "page"
  | "component"
  | "form"
  | "button"
  | "action"
  | "api_route"
  | "server_action"
  | "service"
  | "database_write"
  | "external_provider"
  | "queue_job";

export type ExecutionGraphNode = {
  id: string;
  type: ExecutionNodeType;
  label: string;
  filePath?: string;
  route?: string;
  method?: string;
  evidence?: string;
};

export type ExecutionGraphEdge = {
  from: string;
  to: string;
  relationship:
    | "renders"
    | "contains"
    | "triggers"
    | "calls_api"
    | "calls_server_action"
    | "uses_service"
    | "writes_database"
    | "calls_provider"
    | "enqueues_job";
  evidence?: string;
};

export type DatabaseOperation = {
  operation: "create" | "update" | "upsert" | "delete" | "deleteMany" | "updateMany" | "raw" | "insert" | "unknown";
  target: string;
  filePath: string;
  evidence: string;
};

export type ExecutionDependency = {
  type: "service" | "external_provider" | "queue_job" | "server_action" | "component";
  name: string;
  filePath?: string;
  evidence?: string;
};

export type ExecutionPath = {
  id: string;
  entryPoint: string;
  action: string;
  apiRoute: string | null;
  databaseOperations: DatabaseOperation[];
  dependencies: ExecutionDependency[];
  riskScore: number;
  graphNodeIds?: string[];
  riskSignals?: string[];
};

export type ExecutionGraph = {
  nodes: ExecutionGraphNode[];
  edges: ExecutionGraphEdge[];
  paths: ExecutionPath[];
};

export type ExecutionPathMapperInput =
  | {
      files: CodeFile[];
    }
  | {
      source: string;
    };

type NormalizedFile = CodeFile & {
  lowerPath: string;
  lowerContent: string;
};

type PageEntity = {
  id: string;
  path: string;
  route: string;
  content: string;
  components: string[];
  actions: UiAction[];
};

type ComponentEntity = {
  id: string;
  path: string;
  name: string;
  content: string;
  actions: UiAction[];
};

type UiAction = {
  id: string;
  kind: "button" | "form" | "action";
  label: string;
  filePath: string;
  apiRoute: string | null;
  serverAction: string | null;
  evidence: string;
  mutatingIntent: boolean;
};

type ApiRouteEntity = {
  id: string;
  path: string;
  route: string;
  methods: string[];
  content: string;
  serviceNames: string[];
  databaseOperations: DatabaseOperation[];
  externalProviders: ExecutionDependency[];
  queueJobs: ExecutionDependency[];
};

type ServerActionEntity = {
  id: string;
  path: string;
  name: string;
  content: string;
  databaseOperations: DatabaseOperation[];
  externalProviders: ExecutionDependency[];
  queueJobs: ExecutionDependency[];
};

type ServiceEntity = {
  id: string;
  path: string;
  name: string;
  content: string;
  databaseOperations: DatabaseOperation[];
  externalProviders: ExecutionDependency[];
  queueJobs: ExecutionDependency[];
};

export function mapExecutionPaths(input: ExecutionPathMapperInput): ExecutionPath[] {
  return buildExecutionGraph(input).paths;
}

export function buildExecutionGraph(input: ExecutionPathMapperInput): ExecutionGraph {
  const files = normalizeFiles("files" in input ? input.files : parseSourceFiles(input.source));
  const pages = files.filter(isPageFile).map(parsePage);
  const components = files.filter(isComponentFile).map(parseComponent);
  const apiRoutes = files.filter(isApiRouteFile).map(parseApiRoute);
  const serverActions = files.filter(isServerActionFile).flatMap(parseServerActions);
  const services = files.filter(isServiceFile).map(parseService);

  const nodes: ExecutionGraphNode[] = [];
  const edges: ExecutionGraphEdge[] = [];
  const paths: ExecutionPath[] = [];

  for (const page of pages) {
    nodes.push({ id: page.id, type: "page", label: page.route, filePath: page.path, route: page.route });
  }
  for (const component of components) {
    nodes.push({ id: component.id, type: "component", label: component.name, filePath: component.path });
  }
  for (const apiRoute of apiRoutes) {
    for (const method of apiRoute.methods.length ? apiRoute.methods : ["UNKNOWN"]) {
      nodes.push({
        id: routeNodeId(apiRoute.route, method),
        type: "api_route",
        label: `${method} ${apiRoute.route}`,
        filePath: apiRoute.path,
        route: apiRoute.route,
        method,
      });
    }
  }
  for (const serverAction of serverActions) {
    nodes.push({ id: serverAction.id, type: "server_action", label: serverAction.name, filePath: serverAction.path });
  }
  for (const service of services) {
    nodes.push({ id: service.id, type: "service", label: service.name, filePath: service.path });
  }

  const componentByName = new Map(components.map((component) => [component.name, component]));
  const apiRoutesByRoute = new Map(apiRoutes.map((route) => [route.route, route]));
  const serverActionsByName = new Map(serverActions.map((action) => [action.name, action]));
  const servicesByName = new Map(services.map((service) => [service.name.toLowerCase(), service]));

  for (const page of pages) {
    for (const componentName of page.components) {
      const component = componentByName.get(componentName);
      if (!component) continue;
      edges.push({ from: page.id, to: component.id, relationship: "renders", evidence: componentName });
    }
  }

  const pageActions = pages.flatMap((page) => page.actions.map((action) => ({ owner: page, action })));
  for (const { owner, action } of pageActions) {
    const path = buildPathForAction({
      action,
      entryPoint: owner.route,
      ownerNodeId: owner.id,
      apiRoutesByRoute,
      serverActionsByName,
      servicesByName,
      nodes,
      edges,
    });
    paths.push(path);
  }

  for (const component of components) {
    const renderedByPages = pages.filter((page) => page.components.includes(component.name));
    const entryPoints = renderedByPages.length ? renderedByPages.map((page) => ({ label: page.route, nodeId: page.id })) : [{ label: component.path, nodeId: component.id }];
    for (const action of component.actions) {
      for (const entryPoint of entryPoints) {
        paths.push(
          buildPathForAction({
            action,
            entryPoint: entryPoint.label,
            ownerNodeId: component.id,
            apiRoutesByRoute,
            serverActionsByName,
            servicesByName,
            nodes,
            edges,
          }),
        );
      }
    }
  }

  for (const apiRoute of apiRoutes) {
    if (paths.some((path) => path.apiRoute === apiRoute.route)) continue;
    const method = apiRoute.methods.find((item) => item !== "GET") || apiRoute.methods[0] || "UNKNOWN";
    const routeNode = routeNodeId(apiRoute.route, method);
    const serviceDeps = serviceDependenciesFor(apiRoute, servicesByName);
    const databaseOperations = mergeDatabaseOperations([apiRoute.databaseOperations, ...serviceDeps.map((service) => service.databaseOperations)]);
    const dependencies = mergeDependencies([
      serviceDeps.map((service) => dependency("service", service.name, service.path)),
      apiRoute.externalProviders,
      apiRoute.queueJobs,
      ...serviceDeps.map((service) => [...service.externalProviders, ...service.queueJobs]),
    ]);
    paths.push({
      id: stableId(["path", apiRoute.route, method]),
      entryPoint: apiRoute.route,
      action: `${method} ${apiRoute.route}`,
      apiRoute: apiRoute.route,
      databaseOperations,
      dependencies,
      riskScore: riskScoreFor({ actionLabel: `${method} ${apiRoute.route}`, apiRoute: apiRoute.route, databaseOperations, dependencies, mutatingIntent: method !== "GET" }),
      graphNodeIds: [routeNode, ...serviceDeps.map((service) => service.id)],
      riskSignals: riskSignalsFor({ actionLabel: `${method} ${apiRoute.route}`, apiRoute: apiRoute.route, databaseOperations, dependencies, mutatingIntent: method !== "GET" }),
    });
  }

  return {
    nodes: dedupeNodes(nodes),
    edges: dedupeEdges(edges),
    paths: dedupePaths(paths),
  };
}

export function mapExecutionPathsFromSource(source: string): ExecutionPath[] {
  return mapExecutionPaths({ source });
}

function buildPathForAction(input: {
  action: UiAction;
  entryPoint: string;
  ownerNodeId: string;
  apiRoutesByRoute: Map<string, ApiRouteEntity>;
  serverActionsByName: Map<string, ServerActionEntity>;
  servicesByName: Map<string, ServiceEntity>;
  nodes: ExecutionGraphNode[];
  edges: ExecutionGraphEdge[];
}): ExecutionPath {
  const actionNodeId = actionNodeIdFor(input.action);
  input.nodes.push({ id: actionNodeId, type: input.action.kind, label: input.action.label, filePath: input.action.filePath, evidence: input.action.evidence });
  input.edges.push({ from: input.ownerNodeId, to: actionNodeId, relationship: "contains", evidence: input.action.evidence });

  const apiRoute = input.action.apiRoute ? resolveApiRoute(input.action.apiRoute, input.apiRoutesByRoute) : null;
  const serverAction = input.action.serverAction ? input.serverActionsByName.get(input.action.serverAction) || null : null;
  const serviceDeps = apiRoute ? serviceDependenciesFor(apiRoute, input.servicesByName) : [];
  const databaseOperations = mergeDatabaseOperations([
    apiRoute?.databaseOperations || [],
    serverAction?.databaseOperations || [],
    ...serviceDeps.map((service) => service.databaseOperations),
  ]);
  const dependencies = mergeDependencies([
    serverAction ? [dependency("server_action", serverAction.name, serverAction.path)] : [],
    serviceDeps.map((service) => dependency("service", service.name, service.path)),
    apiRoute?.externalProviders || [],
    apiRoute?.queueJobs || [],
    serverAction?.externalProviders || [],
    serverAction?.queueJobs || [],
    ...serviceDeps.map((service) => [...service.externalProviders, ...service.queueJobs]),
  ]);
  const apiRouteNodeId = apiRoute ? routeNodeId(apiRoute.route, preferredMethodForAction(input.action, apiRoute)) : null;

  if (apiRouteNodeId) {
    input.edges.push({ from: actionNodeId, to: apiRouteNodeId, relationship: "calls_api", evidence: input.action.evidence });
  }
  if (serverAction) {
    input.edges.push({ from: actionNodeId, to: serverAction.id, relationship: "calls_server_action", evidence: input.action.evidence });
  }
  for (const service of serviceDeps) {
    if (apiRouteNodeId) input.edges.push({ from: apiRouteNodeId, to: service.id, relationship: "uses_service" });
  }

  const riskSignals = riskSignalsFor({
    actionLabel: input.action.label,
    apiRoute: apiRoute?.route || null,
    databaseOperations,
    dependencies,
    mutatingIntent: input.action.mutatingIntent,
  });

  return {
    id: stableId(["path", input.entryPoint, input.action.label, apiRoute?.route || input.action.serverAction || input.action.filePath]),
    entryPoint: input.entryPoint,
    action: input.action.label,
    apiRoute: apiRoute?.route || null,
    databaseOperations,
    dependencies,
    riskScore: riskScoreFromSignals(riskSignals),
    graphNodeIds: [input.ownerNodeId, actionNodeId, ...(apiRouteNodeId ? [apiRouteNodeId] : []), ...(serverAction ? [serverAction.id] : []), ...serviceDeps.map((service) => service.id)],
    riskSignals,
  };
}

function parsePage(file: NormalizedFile): PageEntity {
  return {
    id: stableId(["page", file.path]),
    path: file.path,
    route: pageRouteFromPath(file.path),
    content: file.content,
    components: extractRenderedComponents(file.content),
    actions: extractUiActions(file),
  };
}

function parseComponent(file: NormalizedFile): ComponentEntity {
  return {
    id: stableId(["component", file.path]),
    path: file.path,
    name: componentNameFromFile(file),
    content: file.content,
    actions: extractUiActions(file),
  };
}

function parseApiRoute(file: NormalizedFile): ApiRouteEntity {
  return {
    id: stableId(["api", file.path]),
    path: file.path,
    route: apiRouteFromPath(file.path),
    methods: extractHttpMethods(file.content),
    content: file.content,
    serviceNames: extractServiceNames(file.content),
    databaseOperations: extractDatabaseOperations(file),
    externalProviders: extractExternalProviders(file),
    queueJobs: extractQueueJobs(file),
  };
}

function parseServerActions(file: NormalizedFile): ServerActionEntity[] {
  const actionNames = [...file.content.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)]
    .map((match) => match[1])
    .filter((name): name is string => Boolean(name));
  const names = actionNames.length ? actionNames : [file.path.split("/").pop()?.replace(/\.(ts|tsx|js|jsx)$/i, "") || "serverAction"];
  return names.map((name) => ({
    id: stableId(["server_action", file.path, name]),
    path: file.path,
    name,
    content: file.content,
    databaseOperations: extractDatabaseOperations(file),
    externalProviders: extractExternalProviders(file),
    queueJobs: extractQueueJobs(file),
  }));
}

function parseService(file: NormalizedFile): ServiceEntity {
  return {
    id: stableId(["service", file.path]),
    path: file.path,
    name: serviceNameFromFile(file),
    content: file.content,
    databaseOperations: extractDatabaseOperations(file),
    externalProviders: extractExternalProviders(file),
    queueJobs: extractQueueJobs(file),
  };
}

function extractUiActions(file: NormalizedFile): UiAction[] {
  const actions: UiAction[] = [];
  for (const match of file.content.matchAll(/<button\b([\s\S]*?)>([\s\S]*?)<\/button>/gi)) {
    const attrs = match[1] || "";
    const body = stripJsx(match[2] || "");
    const evidence = compact(`${match[0] || ""}`).slice(0, 500);
    const action = actionFromAttributes(attrs, file.content);
    actions.push({
      id: stableId(["button", file.path, evidence]),
      kind: "button",
      label: cleanLabel(attributeValue(attrs, "aria-label") || attributeValue(attrs, "data-action") || body || action.handler || "button action"),
      filePath: file.path,
      apiRoute: action.apiRoute,
      serverAction: action.serverAction,
      evidence,
      mutatingIntent: mutatingIntent(`${attrs} ${body} ${action.handler || ""}`),
    });
  }

  for (const match of file.content.matchAll(/<form\b([\s\S]*?)>([\s\S]*?)<\/form>/gi)) {
    const attrs = match[1] || "";
    const evidence = compact(`${match[0] || ""}`).slice(0, 500);
    const action = actionFromAttributes(attrs, file.content);
    actions.push({
      id: stableId(["form", file.path, evidence]),
      kind: "form",
      label: cleanLabel(attributeValue(attrs, "aria-label") || attributeValue(attrs, "name") || action.handler || "form submission"),
      filePath: file.path,
      apiRoute: action.apiRoute,
      serverAction: action.serverAction,
      evidence,
      mutatingIntent: true,
    });
  }

  return actions;
}

function actionFromAttributes(attrs: string, source: string) {
  const directApi = attributeValue(attrs, "data-api") || attributeValue(attrs, "formAction");
  const onClick = jsxHandler(attrs, "onClick");
  const onSubmit = jsxHandler(attrs, "onSubmit");
  const action = jsxHandler(attrs, "action") || attributeValue(attrs, "action");
  const handler = onClick || onSubmit || action || null;
  const handlerSource = handler ? resolveHandlerSource(handler, source) : "";
  const inlineSource = `${attrs}\n${handlerSource}`;
  const apiRoute = extractApiFetches(inlineSource)[0] || (directApi?.startsWith("/api/") ? directApi : null);
  const serverAction = action && !String(action).startsWith("/") ? cleanHandlerName(action) : inferServerAction(handler, source);
  return { handler: cleanHandlerName(handler), apiRoute, serverAction };
}

function resolveHandlerSource(handler: string, source: string) {
  const clean = cleanHandlerName(handler);
  if (!clean) return handler;
  const escaped = escapeRegExp(clean);
  const functionMatch = source.match(new RegExp(`(?:async\\s+)?function\\s+${escaped}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]{0,3000}?)\\}`, "m"));
  const constMatch = source.match(new RegExp(`(?:const|let|var)\\s+${escaped}\\s*=\\s*(?:async\\s*)?\\([^)]*\\)\\s*=>\\s*\\{([\\s\\S]{0,3000}?)\\}`, "m"));
  return functionMatch?.[0] || constMatch?.[0] || handler;
}

function inferServerAction(handler: string | null, source: string) {
  const clean = cleanHandlerName(handler);
  if (!clean) return null;
  if (/(^|\n)\s*["']use server["']/.test(source)) return clean;
  const handlerSource = resolveHandlerSource(clean, source);
  return /["']use server["']/.test(handlerSource) ? clean : null;
}

function extractRenderedComponents(source: string) {
  const imported = new Set<string>();
  for (const match of source.matchAll(/import\s+\{\s*([^}]+)\s*\}\s+from\s+["'][^"']+["']/g)) {
    for (const name of (match[1] || "").split(",")) {
      const clean = name.trim().split(/\s+as\s+/i).pop()?.trim();
      if (clean && /^[A-Z]/.test(clean)) imported.add(clean);
    }
  }
  for (const match of source.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)) {
    if (match[1]) imported.add(match[1]);
  }
  return [...imported];
}

function extractHttpMethods(source: string) {
  return [...source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s*\(/g)]
    .map((match) => match[1])
    .filter((method): method is string => Boolean(method));
}

function extractServiceNames(source: string) {
  const services = new Set<string>();
  for (const match of source.matchAll(/from\s+["']@\/lib\/services\/([A-Za-z0-9_-]+)["']/g)) {
    if (match[1]) services.add(match[1]);
  }
  for (const match of source.matchAll(/\b([A-Za-z_$][\w$]*(?:Service|Repository|Client))\./g)) {
    if (match[1]) services.add(match[1]);
  }
  return [...services];
}

function extractDatabaseOperations(file: NormalizedFile): DatabaseOperation[] {
  const operations: DatabaseOperation[] = [];
  const patterns: Array<{ pattern: RegExp; operation: DatabaseOperation["operation"]; targetGroup?: number }> = [
    { pattern: /\b(?:prisma|db|tx)\.([A-Za-z0-9_]+)\.(create|update|upsert|delete|deleteMany|updateMany)\b/g, operation: "unknown", targetGroup: 1 },
    { pattern: /\$executeRawUnsafe|\$queryRawUnsafe|\$executeRaw|\$queryRaw/g, operation: "raw" },
    { pattern: /\.(insert|update|delete|upsert)\s*\(/g, operation: "unknown" },
    { pattern: /\b(setDoc|addDoc|deleteDoc)\s*\(/g, operation: "unknown" },
    { pattern: /supabase[\s\S]{0,160}\.(insert|update|upsert|delete)\s*\(/g, operation: "unknown" },
  ];

  for (const item of patterns) {
    for (const match of file.content.matchAll(item.pattern)) {
      const rawOperation = match[2] || match[1] || item.operation;
      operations.push({
        operation: normalizeDbOperation(rawOperation, item.operation),
        target: match[item.targetGroup || 0] || "database",
        filePath: file.path,
        evidence: snippetAt(file.content, match.index || 0),
      });
    }
  }
  return dedupeBy(operations, (operation) => `${operation.filePath}:${operation.operation}:${operation.target}:${operation.evidence}`);
}

function extractExternalProviders(file: NormalizedFile): ExecutionDependency[] {
  const providers: ExecutionDependency[] = [];
  const providerPatterns: Array<[RegExp, string]> = [
    [/\bstripe\b|from\s+["']stripe["']/i, "Stripe"],
    [/@google\/genai|GoogleGenAI|gemini/i, "Google GenAI"],
    [/\bopenai\b|api\.openai\.com/i, "OpenAI"],
    [/\banthropic\b|api\.anthropic\.com/i, "Anthropic"],
    [/\bsupabase\b|@supabase/i, "Supabase"],
    [/\bclerk\b|@clerk/i, "Clerk"],
    [/\bresend\b|sendgrid|twilio/i, "Messaging provider"],
  ];
  for (const [pattern, name] of providerPatterns) {
    const match = file.content.match(pattern);
    if (match) providers.push(dependency("external_provider", name, file.path, snippetAt(file.content, match.index || 0)));
  }
  for (const match of file.content.matchAll(/\bfetch\s*\(\s*["'](https?:\/\/[^"']+)["']/g)) {
    const url = match[1] || "";
    providers.push(dependency("external_provider", providerNameFromUrl(url), file.path, snippetAt(file.content, match.index || 0)));
  }
  return dedupeDependencies(providers);
}

function extractQueueJobs(file: NormalizedFile): ExecutionDependency[] {
  const jobs: ExecutionDependency[] = [];
  const patterns = [
    /\bnew\s+Queue\b/g,
    /\bnew\s+Worker\b/g,
    /\bbuildQueue\.add\b/g,
    /\b\w+Queue\.add\b/g,
    /\baddBuildJob\s*\(/g,
    /\bqueue\.(add|push)\s*\(/g,
  ];
  for (const pattern of patterns) {
    for (const match of file.content.matchAll(pattern)) {
      jobs.push(dependency("queue_job", queueNameFromEvidence(match[0] || "queue job"), file.path, snippetAt(file.content, match.index || 0)));
    }
  }
  return dedupeDependencies(jobs);
}

function serviceDependenciesFor(route: ApiRouteEntity, servicesByName: Map<string, ServiceEntity>) {
  const deps: ServiceEntity[] = [];
  for (const name of route.serviceNames) {
    const normalized = name.toLowerCase().replace(/service$/, "");
    const direct = servicesByName.get(name.toLowerCase()) || servicesByName.get(normalized);
    if (direct) deps.push(direct);
    for (const [serviceName, service] of servicesByName) {
      if (serviceName.includes(normalized) || normalized.includes(serviceName)) deps.push(service);
    }
  }
  return dedupeBy(deps, (service) => service.path);
}

function resolveApiRoute(apiPath: string, apiRoutesByRoute: Map<string, ApiRouteEntity>) {
  const clean = apiPath.split(/[?#]/)[0] || apiPath;
  const direct = apiRoutesByRoute.get(clean);
  if (direct) return direct;
  for (const route of apiRoutesByRoute.values()) {
    if (apiPathMatchesRoute(route.route, clean)) return route;
  }
  return null;
}

function riskSignalsFor(input: {
  actionLabel: string;
  apiRoute: string | null;
  databaseOperations: DatabaseOperation[];
  dependencies: ExecutionDependency[];
  mutatingIntent: boolean;
}) {
  const signals: string[] = [];
  if (input.mutatingIntent && !input.apiRoute && !input.dependencies.some((dependencyItem) => dependencyItem.type === "server_action")) {
    signals.push("mutating action has no API route or server action");
  }
  if (input.mutatingIntent && input.apiRoute && input.databaseOperations.length === 0) {
    signals.push("mutating API path has no detected database write");
  }
  if (/delete|admin|billing|checkout|payment|role|permission/i.test(input.actionLabel) && input.databaseOperations.length > 0) {
    signals.push("sensitive action mutates data");
  }
  if (input.dependencies.some((dependencyItem) => dependencyItem.type === "external_provider")) {
    signals.push("path depends on external provider");
  }
  if (input.dependencies.some((dependencyItem) => dependencyItem.type === "queue_job")) {
    signals.push("path depends on async queue job");
  }
  return signals;
}

function riskScoreFor(input: {
  actionLabel: string;
  apiRoute: string | null;
  databaseOperations: DatabaseOperation[];
  dependencies: ExecutionDependency[];
  mutatingIntent: boolean;
}) {
  return riskScoreFromSignals(riskSignalsFor(input));
}

function riskScoreFromSignals(signals: string[]) {
  return Math.min(
    100,
    signals.reduce((score, signal) => {
      if (/no API route/.test(signal)) return score + 35;
      if (/no detected database write/.test(signal)) return score + 25;
      if (/sensitive action/.test(signal)) return score + 20;
      if (/external provider/.test(signal)) return score + 12;
      if (/queue job/.test(signal)) return score + 10;
      return score + 8;
    }, 0),
  );
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

function isPageFile(file: NormalizedFile) {
  return /(^|\/)app\/(?:.+\/)?page\.(tsx|jsx|ts|js)$/.test(file.lowerPath) || /(^|\/)pages\/.+\.(tsx|jsx|ts|js)$/.test(file.lowerPath);
}

function isComponentFile(file: NormalizedFile) {
  return /(^|\/)(components|app\/.+\/components|src\/components)\//.test(file.lowerPath) && /\.(tsx|jsx)$/.test(file.lowerPath);
}

function isApiRouteFile(file: NormalizedFile) {
  return /(^|\/)app\/api\/.+\/route\.(ts|tsx|js|jsx)$/.test(file.lowerPath) || /(^|\/)pages\/api\/.+\.(ts|tsx|js|jsx)$/.test(file.lowerPath);
}

function isServerActionFile(file: NormalizedFile) {
  return /(actions?|server-actions?)\.(ts|tsx|js|jsx)$/.test(file.lowerPath) || /(^|\n)\s*["']use server["']/.test(file.content);
}

function isServiceFile(file: NormalizedFile) {
  return /(^|\/)lib\/services\/.+\.(ts|tsx|js|jsx)$/.test(file.lowerPath) || /(^|\/)services\/.+\.(ts|tsx|js|jsx)$/.test(file.lowerPath);
}

function pageRouteFromPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const appMatch = normalized.match(/(?:^|\/)app\/(?:(.*)\/)?page\.(?:ts|tsx|js|jsx)$/i);
  if (appMatch) {
    const route = (appMatch[1] || "").replace(/\/?\([^)]*\)/g, "").replace(/\/index$/i, "");
    return route === "" ? "/" : `/${route}`;
  }
  const pagesMatch = normalized.match(/(?:^|\/)pages\/(.+)\.(?:ts|tsx|js|jsx)$/i);
  if (pagesMatch?.[1]) {
    const route = pagesMatch[1].replace(/\/index$/i, "");
    return route === "index" ? "/" : `/${route}`;
  }
  return normalized;
}

function apiRouteFromPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const appMatch = normalized.match(/(?:^|\/)app\/api\/(.+)\/route\.(?:ts|tsx|js|jsx)$/i);
  if (appMatch?.[1]) return `/api/${appMatch[1].replace(/\/index$/i, "")}`;
  const pagesMatch = normalized.match(/(?:^|\/)pages\/api\/(.+)\.(?:ts|tsx|js|jsx)$/i);
  if (pagesMatch?.[1]) return `/api/${pagesMatch[1].replace(/\/index$/i, "")}`;
  return normalized;
}

function apiPathMatchesRoute(routePath: string, apiPath: string) {
  const routeParts = routePath.split("/").filter(Boolean);
  const apiParts = apiPath.split("/").filter(Boolean);
  if (routeParts.length !== apiParts.length && !routeParts.some((part) => part.startsWith("[..."))) return false;
  return routeParts.every((routePart, index) => {
    const apiPart = apiParts[index];
    if (routePart?.startsWith("[...")) return true;
    if (routePart?.startsWith("[") && routePart.endsWith("]")) return Boolean(apiPart);
    return routePart === apiPart;
  });
}

function componentNameFromFile(file: NormalizedFile) {
  const exportMatch = file.content.match(/export\s+function\s+([A-Z][A-Za-z0-9_]*)\s*\(/) || file.content.match(/export\s+const\s+([A-Z][A-Za-z0-9_]*)\s*=/);
  if (exportMatch?.[1]) return exportMatch[1];
  return pascal(file.path.split("/").pop()?.replace(/\.(tsx|jsx|ts|js)$/i, "") || "Component");
}

function serviceNameFromFile(file: NormalizedFile) {
  const exportMatch =
    file.content.match(/export\s+class\s+([A-Za-z_$][\w$]*)/) ||
    file.content.match(/export\s+const\s+([A-Za-z_$][\w$]*(?:Service|Repository|Client)?)\s*=/);
  if (exportMatch?.[1]) return exportMatch[1];
  return file.path.split("/").pop()?.replace(/\.(ts|tsx|js|jsx)$/i, "") || "service";
}

function extractApiFetches(source: string) {
  return [...source.matchAll(/\bfetch\s*\(\s*["'](\/api\/[A-Za-z0-9_./\-[\]]+)["']/g)]
    .map((match) => match[1])
    .filter((path): path is string => Boolean(path));
}

function jsxHandler(attrs: string, name: string) {
  const match = attrs.match(new RegExp(`${name}\\s*=\\s*\\{([\\s\\S]*?)\\}`, "i"));
  return match?.[1]?.trim() || null;
}

function attributeValue(attrs: string, name: string) {
  const match = attrs.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1]?.trim() || null;
}

function cleanHandlerName(value: string | null) {
  if (!value) return null;
  const direct = value.match(/^([A-Za-z_$][\w$]*)$/)?.[1];
  if (direct) return direct;
  const call = value.match(/^([A-Za-z_$][\w$]*)\s*\(/)?.[1];
  if (call) return call;
  return null;
}

function mutatingIntent(value: string) {
  return /\b(create|add|save|submit|update|edit|delete|remove|archive|book|cancel|checkout|pay|send|publish|deploy|retry|generate|upload|mark|assign|move)\b/i.test(value);
}

function preferredMethodForAction(action: UiAction, apiRoute: ApiRouteEntity) {
  if (action.mutatingIntent) {
    return apiRoute.methods.find((method) => method !== "GET") || apiRoute.methods[0] || "UNKNOWN";
  }
  return apiRoute.methods.find((method) => method === "GET") || apiRoute.methods[0] || "UNKNOWN";
}

function normalizeDbOperation(raw: string, fallback: DatabaseOperation["operation"]): DatabaseOperation["operation"] {
  if (["create", "update", "upsert", "delete", "deleteMany", "updateMany", "insert"].includes(raw)) return raw as DatabaseOperation["operation"];
  if (/raw/i.test(raw)) return "raw";
  if (raw === "addDoc" || raw === "setDoc") return "create";
  if (raw === "deleteDoc") return "delete";
  return fallback === "unknown" ? "unknown" : fallback;
}

function providerNameFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^api\./, "");
  } catch {
    return "external provider";
  }
}

function queueNameFromEvidence(evidence: string) {
  const match = evidence.match(/([A-Za-z_$][\w$]*Queue|addBuildJob|Queue|Worker)/);
  return match?.[1] || "queue job";
}

function dependency(type: ExecutionDependency["type"], name: string, filePath?: string, evidence?: string): ExecutionDependency {
  return { type, name, filePath, evidence };
}

function mergeDatabaseOperations(groups: DatabaseOperation[][]) {
  return dedupeBy(groups.flat(), (operation) => `${operation.filePath}:${operation.operation}:${operation.target}:${operation.evidence}`);
}

function mergeDependencies(groups: ExecutionDependency[][]) {
  return dedupeDependencies(groups.flat());
}

function dedupeDependencies(items: ExecutionDependency[]) {
  return dedupeBy(items, (item) => `${item.type}:${item.name}:${item.filePath || ""}`);
}

function dedupeNodes(nodes: ExecutionGraphNode[]) {
  return dedupeBy(nodes, (node) => node.id);
}

function dedupeEdges(edges: ExecutionGraphEdge[]) {
  return dedupeBy(edges, (edge) => `${edge.from}:${edge.to}:${edge.relationship}`);
}

function dedupePaths(paths: ExecutionPath[]) {
  return dedupeBy(paths, (path) => path.id).sort((a, b) => b.riskScore - a.riskScore);
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

function actionNodeIdFor(action: UiAction) {
  return stableId([action.kind, action.filePath, action.label, action.evidence]);
}

function routeNodeId(route: string, method: string) {
  return stableId(["api_route", method, route]);
}

function stableId(parts: Array<string | null | undefined>) {
  const input = parts.filter(Boolean).join(":");
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return `exec_${Math.abs(hash).toString(36)}`;
}

function snippetAt(source: string, index: number) {
  const start = Math.max(0, source.lastIndexOf("\n", index - 1) + 1);
  const end = source.indexOf("\n", index);
  return compact(source.slice(start, end === -1 ? source.length : end)).slice(0, 240);
}

function stripJsx(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\{[^}]+\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanLabel(value: string) {
  return compact(value).replace(/^["']|["']$/g, "").slice(0, 120) || "user action";
}

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function pascal(value: string) {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
