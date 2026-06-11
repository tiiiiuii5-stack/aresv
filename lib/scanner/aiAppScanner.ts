import { createHash } from "node:crypto";

import { buildActionableFixes, type ActionableFix } from "@/lib/intelligence/actionable-fix-engine";
import type { FindingFileEvidence, FindingProofBundle, ReproducibleProof } from "@/lib/intelligence/finding-proof";
import { attachFindingProof } from "@/lib/intelligence/finding-proof";
import { buildProductionReadinessScore, type ProductionReadinessScoreReport } from "@/lib/intelligence/readiness-score";
import {
  apiDynamicPrefixMatchesRoute,
  apiPathMatchesRoute,
  apiRouteFromFilePath,
  isDynamicApiExpression,
} from "@/lib/scanner/api-route-matcher";

export type AIAppScannerFile = {
  path: string;
  content: string;
};

export type AIAppScannerMetadata = {
  name?: string;
  framework?: string;
  runtime?: string;
  packageManager?: string;
  environment?: string;
  expectedRoutes?: string[];
  requiredEnv?: string[];
  repository?: string;
  [key: string]: unknown;
};

export type AIAppIssueCategory = "security" | "deployment" | "architecture";
export type AIAppIssueSeverity = "critical" | "high" | "medium" | "low";

export type AIAppIssueEvidence = {
  source: "codebase" | "metadata" | "manifest";
  filePath?: string;
  line?: number;
  snippet?: string;
  reason: string;
  confidence: number;
};

export type AIAppScannerIssue = {
  id: string;
  ruleId: string;
  category: AIAppIssueCategory;
  severity: AIAppIssueSeverity;
  title: string;
  filePath?: string;
  recommendation: string;
  confidence: number;
  confidenceScore: number;
  evidence: AIAppIssueEvidence[];
  fileEvidence: FindingFileEvidence[];
  reasoning: string;
  reproducibleProof: ReproducibleProof;
  proof: FindingProofBundle;
  actionableFix?: ActionableFix;
};

export type AIAppScannerSummary = {
  framework: string;
  filesScanned: number;
  packageManager: string;
  codeExecuted: false;
  networkAccess: false;
  mutations: false;
};

export type AIAppScannerScore = {
  overall: number;
  security: number;
  deployment: number;
  architecture: number;
};

export type AIAppScannerOutput = {
  schemaVersion: "ai-app-scanner.v1";
  scanner: "ventureos-ai-app-scanner";
  deterministic: true;
  readOnly: true;
  summary: AIAppScannerSummary;
  securityIssues: AIAppScannerIssue[];
  deploymentIssues: AIAppScannerIssue[];
  architectureIssues: AIAppScannerIssue[];
  actionableFixes: ActionableFix[];
  launchReadinessScore: ProductionReadinessScoreReport;
  readinessScore: number;
  scores: AIAppScannerScore;
};

type NormalizedFile = AIAppScannerFile & {
  lowerPath: string;
  lowerContent: string;
  lines: string[];
};

type ScannerContext = {
  files: NormalizedFile[];
  packageJson: PackageJson | null;
  dependencyNames: string[];
  framework: string;
  packageManager: string;
  metadata: AIAppScannerMetadata;
  apiRoutes: string[];
  expectedRoutes: string[];
  envExample: string;
};

type PackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type IssueDraft = {
  ruleId: string;
  category: AIAppIssueCategory;
  severity: AIAppIssueSeverity;
  title: string;
  file?: NormalizedFile;
  recommendation: string;
  confidence: number;
  reason: string;
  line?: number;
  snippet?: string;
  source?: AIAppIssueEvidence["source"];
};

const ignoredPathPattern = /(^|\/)(node_modules|\.next|dist|build|coverage|\.git)\//i;
const binaryPathPattern = /\.(png|jpg|jpeg|gif|webp|ico|zip|pdf|woff2?|ttf|eot|mp4|mov)$/i;

export function scanAIApp(input: { files: AIAppScannerFile[]; metadata?: AIAppScannerMetadata }): AIAppScannerOutput {
  const metadata = normalizeMetadata(input.metadata || {});
  const files = normalizeFiles(input.files || []);
  const packageJson = parsePackageJson(files);
  const dependencyNames = dependenciesFor(packageJson);
  const context: ScannerContext = {
    files,
    packageJson,
    dependencyNames,
    framework: inferFramework(files, packageJson, metadata),
    packageManager: inferPackageManager(files, metadata),
    metadata,
    apiRoutes: inferApiRoutes(files),
    expectedRoutes: normalizeStringArray(metadata.expectedRoutes),
    envExample: envExampleContent(files),
  };

  const baseIssues = normalizeIssues([
    ...securityRules(context),
    ...deploymentRules(context),
    ...architectureRules(context),
  ], files);
  const actionableFixes = buildActionableFixes({
    issues: baseIssues,
    files,
    framework: context.framework,
    packageManager: context.packageManager,
    requiredEnv: normalizeStringArray(metadata.requiredEnv),
  });
  const actionableByIssueId = new Map(actionableFixes.map((fix) => [fix.issueId, fix]));
  const issues = baseIssues.map((issue) => ({
    ...issue,
    actionableFix: actionableByIssueId.get(issue.id),
  }));

  const securityIssues = issues.filter((issue) => issue.category === "security");
  const deploymentIssues = issues.filter((issue) => issue.category === "deployment");
  const architectureIssues = issues.filter((issue) => issue.category === "architecture");
  const scores = {
    security: scoreCategory(securityIssues),
    deployment: scoreCategory(deploymentIssues),
    architecture: scoreCategory(architectureIssues),
    overall: scoreOverall(securityIssues, deploymentIssues, architectureIssues),
  };
  const launchReadinessScore = buildProductionReadinessScore({
    securityScore: scores.security,
    scalabilityScore: scalabilityScoreFor(deploymentIssues, architectureIssues),
    deploymentSafetyScore: scores.deployment,
    paymentReliabilityScore: paymentReliabilityScoreFor(issues),
    blockers: issues.filter((issue) => issue.severity === "critical" || issue.severity === "high").map((issue) => issue.title),
    warnings: issues.filter((issue) => issue.severity === "medium").map((issue) => issue.title),
    generatedAt: "1970-01-01T00:00:00.000Z",
  });

  return {
    schemaVersion: "ai-app-scanner.v1",
    scanner: "ventureos-ai-app-scanner",
    deterministic: true,
    readOnly: true,
    summary: {
      framework: context.framework,
      filesScanned: files.length,
      packageManager: context.packageManager,
      codeExecuted: false,
      networkAccess: false,
      mutations: false,
    },
    securityIssues,
    deploymentIssues,
    architectureIssues,
    actionableFixes,
    launchReadinessScore,
    readinessScore: scores.overall,
    scores,
  };
}

function securityRules(context: ScannerContext): IssueDraft[] {
  const issues: IssueDraft[] = [];

  for (const file of context.files) {
    const publicSecret = file.content.match(/\bNEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|TOKEN|PRIVATE|PASSWORD|API_KEY|GEMINI|OPENAI|STRIPE_SECRET)[A-Z0-9_]*\b/);
    if (publicSecret) {
      issues.push(issue({
        ruleId: "security.public-client-secret",
        category: "security",
        severity: "critical",
        title: "Public client environment variable appears to expose a secret",
        file,
        recommendation: "Move secret values to server-only environment variables and expose only non-sensitive public identifiers.",
        confidence: 0.94,
        reason: `Secret-shaped public environment variable ${publicSecret[0]} is referenced in source code.`,
        ...locationFor(file, publicSecret[0]),
      }));
    }

    const hardcodedSecret = secretMatch(file.content);
    if (hardcodedSecret) {
      issues.push(issue({
        ruleId: "security.hardcoded-secret",
        category: "security",
        severity: "critical",
        title: "Hardcoded production secret detected",
        file,
        recommendation: "Remove the secret from source, rotate it, and load it from a server-side secret manager or deployment environment.",
        confidence: 0.96,
        reason: "A production-shaped secret or private connection string is present in committed source.",
        ...locationFor(file, hardcodedSecret),
      }));
    }

    if (isClientComponent(file) && /process\.env\.(?!NEXT_PUBLIC_)[A-Z0-9_]+/.test(file.content)) {
      const match = file.content.match(/process\.env\.(?!NEXT_PUBLIC_)[A-Z0-9_]+/);
      issues.push(issue({
        ruleId: "security.client-server-env-boundary",
        category: "security",
        severity: "high",
        title: "Client component reads server-only environment variables",
        file,
        recommendation: "Move server-only environment reads into API routes or Server Components and pass safe derived values to the client.",
        confidence: 0.86,
        reason: `Client-rendered file references ${match?.[0] || "a server-only environment variable"}.`,
        ...locationFor(file, match?.[0] || "process.env."),
      }));
    }

    if (isApiRoute(file) && hasMutationExport(file) && hasPersistentWrite(file) && !hasAuthGuard(file)) {
      issues.push(issue({
        ruleId: "security.mutation-route-without-auth",
        category: "security",
        severity: "critical",
        title: "Mutation API route writes data without an authentication guard",
        file,
        recommendation: "Require a server-resolved session or API key before any mutation and reject unauthenticated requests before reading or writing data.",
        confidence: 0.91,
        reason: "The route exports a mutating HTTP handler, performs a persistent write, and no session/API-key guard was found.",
        ...locationFor(file, "export async function"),
      }));
    }

    if (isApiRoute(file) && hasMutationExport(file) && hasPersistentWrite(file) && readsJsonBody(file) && !hasValidationGuard(file)) {
      issues.push(issue({
        ruleId: "security.mutation-route-without-validation",
        category: "security",
        severity: "high",
        title: "Mutation API route writes request body data without clear validation",
        file,
        recommendation: "Validate request bodies with a schema or explicit field checks before writing to persistence or external providers.",
        confidence: 0.82,
        reason: "The route reads JSON input and performs a write, but no schema validation or safe parsing guard was detected.",
        ...locationFor(file, "request.json"),
      }));
    }

    if (isStripeWebhookLike(file) && !/stripe-signature|constructEvent|webhooks\.constructEvent/i.test(file.content)) {
      issues.push(issue({
        ruleId: "security.stripe-webhook-unverified",
        category: "security",
        severity: "critical",
        title: "Stripe webhook handler does not verify the webhook signature",
        file,
        recommendation: "Verify Stripe webhook payloads with the stripe-signature header before processing billing events.",
        confidence: 0.9,
        reason: "Stripe webhook-shaped route found without signature verification evidence.",
        ...locationFor(file, "webhook"),
      }));
    }
  }

  return issues;
}

function deploymentRules(context: ScannerContext): IssueDraft[] {
  const issues: IssueDraft[] = [];
  const packageFile = context.files.find((file) => file.lowerPath.endsWith("package.json"));

  if (!packageFile) {
    issues.push(issue({
      ruleId: "deployment.missing-package-json",
      category: "deployment",
      severity: "high",
      title: "Missing package.json",
      recommendation: "Add package.json with install, type-check, lint, and build scripts for reproducible deployment.",
      confidence: 0.95,
      reason: "No package.json file was supplied in the scanned codebase.",
      source: "manifest",
    }));
  } else if (!context.packageJson?.scripts?.build) {
    issues.push(issue({
      ruleId: "deployment.missing-build-script",
      category: "deployment",
      severity: "high",
      title: "package.json does not define a build script",
      file: packageFile,
      recommendation: "Add a deterministic build script so CI and hosting platforms can compile the app before promotion.",
      confidence: 0.9,
      reason: "package.json exists, but scripts.build is missing.",
      ...locationFor(packageFile, "\"scripts\""),
    }));
  }

  if (packageFile && !hasLockfile(context.files)) {
    issues.push(issue({
      ruleId: "deployment.missing-lockfile",
      category: "deployment",
      severity: "medium",
      title: "Dependency lockfile is missing",
      recommendation: "Commit a package lockfile so production installs are reproducible.",
      confidence: 0.88,
      reason: "No npm, pnpm, yarn, or bun lockfile was supplied.",
      source: "manifest",
    }));
  }

  const envRefs = requiredEnvNames(context);
  const missingEnvNames = envRefs.filter((name) => !envExampleContains(context.envExample, name));
  if (envRefs.length > 0 && !context.envExample) {
    issues.push(issue({
      ruleId: "deployment.missing-env-example",
      category: "deployment",
      severity: "high",
      title: "Required environment variables are undocumented",
      recommendation: "Add .env.example with required variable names and no secret values.",
      confidence: 0.9,
      reason: `Code or metadata references ${envRefs.slice(0, 6).join(", ")} but no .env.example was found.`,
      source: "metadata",
    }));
  } else if (missingEnvNames.length > 0) {
    issues.push(issue({
      ruleId: "deployment.env-example-incomplete",
      category: "deployment",
      severity: "medium",
      title: ".env.example is missing required variable names",
      recommendation: "Document every required production environment variable in .env.example without storing actual secret values.",
      confidence: 0.84,
      reason: `.env.example does not include ${missingEnvNames.slice(0, 8).join(", ")}.`,
      source: "metadata",
    }));
  }

  if (hasPrismaSchema(context.files) && !hasPrismaMigration(context.files)) {
    const schema = context.files.find((file) => /(^|\/)prisma\/schema\.prisma$/i.test(file.path));
    issues.push(issue({
      ruleId: "deployment.prisma-schema-without-migrations",
      category: "deployment",
      severity: "high",
      title: "Prisma schema exists without migrations",
      file: schema,
      recommendation: "Commit Prisma migrations and run them during deployment before serving traffic.",
      confidence: 0.9,
      reason: "prisma/schema.prisma was found, but no prisma/migrations migration files were supplied.",
      ...(schema ? locationFor(schema, "datasource") : {}),
    }));
  }

  if (usesQueue(context) && !envExampleContains(context.envExample, "REDIS_URL")) {
    issues.push(issue({
      ruleId: "deployment.queue-missing-redis-env",
      category: "deployment",
      severity: "high",
      title: "Queue dependency is present without documented Redis configuration",
      recommendation: "Document REDIS_URL and verify the worker can connect before enabling queued jobs in production.",
      confidence: 0.84,
      reason: "BullMQ/Redis usage was detected, but REDIS_URL is not documented in .env.example.",
      source: "manifest",
    }));
  }

  if (context.framework === "nextjs" && !context.apiRoutes.includes("/api/health")) {
    issues.push(issue({
      ruleId: "deployment.missing-health-route",
      category: "deployment",
      severity: "medium",
      title: "Health check API route is missing",
      recommendation: "Add a lightweight /api/health route so deployments can be verified before traffic promotion.",
      confidence: 0.82,
      reason: "Next.js API routes were inferred, but /api/health was not present.",
      source: "manifest",
    }));
  }

  for (const route of context.files.filter(isApiRoute)) {
    if (/\bfs\.(writeFile|writeFileSync|appendFile|appendFileSync|mkdir|mkdirSync|rm|rmSync|rename|renameSync)\b/.test(route.content)) {
      const match = route.content.match(/\bfs\.(writeFile|writeFileSync|appendFile|appendFileSync|mkdir|mkdirSync|rm|rmSync|rename|renameSync)\b/);
      issues.push(issue({
        ruleId: "deployment.serverless-filesystem-write",
        category: "deployment",
        severity: "high",
        title: "API route writes to the local filesystem",
        file: route,
        recommendation: "Use durable object storage or a database for runtime writes; serverless filesystems are ephemeral.",
        confidence: 0.86,
        reason: "A route handler performs filesystem mutation during request handling.",
        ...locationFor(route, match?.[0] || "fs."),
      }));
    }
  }

  return issues;
}

function architectureRules(context: ScannerContext): IssueDraft[] {
  const issues: IssueDraft[] = [];

  if (context.framework === "nextjs" && !hasNextEntryPage(context.files)) {
    issues.push(issue({
      ruleId: "architecture.missing-next-entry-page",
      category: "architecture",
      severity: "high",
      title: "Next.js app has no entry page",
      recommendation: "Add app/page.tsx or pages/index.tsx so the app has a deployable first route.",
      confidence: 0.88,
      reason: "Next.js was inferred, but no app/page or pages/index route was supplied.",
      source: "manifest",
    }));
  }

  for (const call of collectApiCalls(context.files)) {
    if (!apiRouteExists(context.apiRoutes, call.route, call.dynamicPrefix)) {
      issues.push(issue({
        ruleId: "architecture.phantom-api-route",
        category: "architecture",
        severity: "high",
        title: "Frontend calls an API route that is not implemented",
        file: call.file,
        recommendation: "Create the API route or remove/disable the UI action that calls it.",
        confidence: 0.9,
        reason: `Code calls ${call.route}, but no matching app/api route was found in the scanned files.`,
        ...locationFor(call.file, call.route),
      }));
    }
  }

  for (const expectedRoute of context.expectedRoutes) {
    if (expectedRoute.startsWith("/api/") && !apiRouteExists(context.apiRoutes, expectedRoute)) {
      issues.push(issue({
        ruleId: "architecture.expected-api-route-missing",
        category: "architecture",
        severity: "high",
        title: "Expected API route is missing from implementation",
        recommendation: "Implement the expected API route or update project metadata so deployment expectations match the codebase.",
        confidence: 0.88,
        reason: `Metadata declares ${expectedRoute}, but the route was not found in scanned files.`,
        source: "metadata",
      }));
    }
  }

  for (const file of context.files) {
    if (/localStorage\.setItem|sessionStorage\.setItem/.test(file.content) && !/fetch\(|axios\.|server action|use server/i.test(file.content)) {
      issues.push(issue({
        ruleId: "architecture.browser-only-persistence",
        category: "architecture",
        severity: "medium",
        title: "Workflow appears to persist only in browser storage",
        file,
        recommendation: "Connect production workflows to a backend persistence layer or clearly label them as demo-only.",
        confidence: 0.82,
        reason: "Browser storage writes were found without an API/server-action persistence path in the same file.",
        ...locationFor(file, "localStorage.setItem"),
      }));
    }
  }

  if (usesDatabase(context) && !hasDatabaseSchema(context.files)) {
    issues.push(issue({
      ruleId: "architecture.database-code-without-schema",
      category: "architecture",
      severity: "high",
      title: "Database access exists without a database schema artifact",
      recommendation: "Commit schema/migration files that define the data model used by the application.",
      confidence: 0.84,
      reason: "Database client usage was detected, but no Prisma, Drizzle, SQL, or migration schema file was supplied.",
      source: "manifest",
    }));
  }

  return issues;
}

function issue(input: IssueDraft): IssueDraft {
  return input;
}

function normalizeIssues(drafts: IssueDraft[], files: NormalizedFile[]): AIAppScannerIssue[] {
  const deduped = new Map<string, AIAppScannerIssue>();
  for (const draft of drafts) {
    const evidenceItem: AIAppIssueEvidence = {
      source: draft.source || "codebase",
      filePath: draft.file?.path,
      line: draft.line,
      snippet: draft.snippet,
      reason: draft.reason,
      confidence: boundedConfidence(draft.confidence),
    };
    const issueId = stableIssueId(draft, evidenceItem);
    const normalized: AIAppScannerIssue = {
      id: issueId,
      ruleId: draft.ruleId,
      category: draft.category,
      severity: draft.severity,
      title: draft.title,
      filePath: draft.file?.path,
      recommendation: draft.recommendation,
      confidence: boundedConfidence(draft.confidence),
      confidenceScore: Math.round(boundedConfidence(draft.confidence) * 100),
      evidence: [evidenceItem],
      fileEvidence: [],
      reasoning: "",
      reproducibleProof: {
        method: "static-analysis",
        deterministic: true,
        steps: [],
        observedResult: "",
        expectedResult: "",
      },
      proof: {
        fileEvidence: [],
        reasoning: "",
        confidenceScore: Math.round(boundedConfidence(draft.confidence) * 100),
        reproducibleProof: {
          method: "static-analysis",
          deterministic: true,
          steps: [],
          observedResult: "",
          expectedResult: "",
        },
        supported: true,
      },
    };
    const proofed = attachFindingProof(normalized, {
      files: files.map((file) => ({ path: file.path, content: file.content })),
      scanner: "ventureos-ai-app-scanner",
    });
    const key = `${proofed.ruleId}:${proofed.filePath || "global"}:${proofed.title}`;
    const existing = deduped.get(key);
    if (!existing || severityRank(proofed.severity) > severityRank(existing.severity)) {
      deduped.set(key, proofed);
    }
  }

  return [...deduped.values()].sort(
    (a, b) =>
      severityRank(b.severity) - severityRank(a.severity) ||
      a.category.localeCompare(b.category) ||
      a.ruleId.localeCompare(b.ruleId) ||
      (a.filePath || "").localeCompare(b.filePath || "") ||
      a.title.localeCompare(b.title),
  );
}

function stableIssueId(draft: IssueDraft, evidence: AIAppIssueEvidence) {
  const material = [draft.ruleId, draft.category, draft.severity, draft.title, evidence.filePath || "", evidence.line || "", evidence.reason].join("|");
  return `ais_${createHash("sha256").update(material).digest("hex").slice(0, 16)}`;
}

function normalizeFiles(files: AIAppScannerFile[]): NormalizedFile[] {
  return files
    .filter((file) => file && typeof file.path === "string" && typeof file.content === "string")
    .map((file) => ({ path: file.path.replace(/\\/g, "/").replace(/^\.\/+/, ""), content: file.content }))
    .filter((file) => file.path && !ignoredPathPattern.test(file.path) && !binaryPathPattern.test(file.path))
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(0, 750)
    .map((file) => ({
      ...file,
      content: file.content.slice(0, 200_000),
      lowerPath: file.path.toLowerCase(),
      lowerContent: file.content.toLowerCase(),
      lines: file.content.split(/\r?\n/),
    }));
}

function normalizeMetadata(metadata: AIAppScannerMetadata): AIAppScannerMetadata {
  const output: AIAppScannerMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === "string") output[key] = value.slice(0, 500);
    else if (Array.isArray(value)) output[key] = value.slice(0, 100).map((item) => (typeof item === "string" ? item.slice(0, 200) : item));
    else if (typeof value === "number" || typeof value === "boolean" || value === null) output[key] = value;
  }
  return output;
}

function parsePackageJson(files: NormalizedFile[]): PackageJson | null {
  const packageFile = files.find((file) => file.lowerPath.endsWith("package.json"));
  if (!packageFile) return null;
  try {
    const parsed = JSON.parse(packageFile.content) as PackageJson;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function dependenciesFor(packageJson: PackageJson | null) {
  return Object.keys({ ...(packageJson?.dependencies || {}), ...(packageJson?.devDependencies || {}) }).sort();
}

function inferFramework(files: NormalizedFile[], packageJson: PackageJson | null, metadata: AIAppScannerMetadata) {
  const explicit = typeof metadata.framework === "string" ? metadata.framework.trim().toLowerCase() : "";
  if (explicit) return explicit;
  const deps = dependenciesFor(packageJson);
  if (deps.includes("next")) return "nextjs";
  if (deps.includes("@remix-run/react")) return "remix";
  if (deps.includes("vite")) return "vite";
  if (deps.includes("express")) return "express";
  if (files.some((file) => file.lowerPath.startsWith("app/") || file.lowerPath.includes("/app/"))) return "nextjs";
  return "unknown";
}

function inferPackageManager(files: NormalizedFile[], metadata: AIAppScannerMetadata) {
  const explicit = typeof metadata.packageManager === "string" ? metadata.packageManager.trim().toLowerCase() : "";
  if (explicit) return explicit;
  if (files.some((file) => /(^|\/)pnpm-lock\.yaml$/.test(file.lowerPath))) return "pnpm";
  if (files.some((file) => /(^|\/)yarn\.lock$/.test(file.lowerPath))) return "yarn";
  if (files.some((file) => /(^|\/)bun\.lockb?$/.test(file.lowerPath))) return "bun";
  if (files.some((file) => /(^|\/)package-lock\.json$/.test(file.lowerPath))) return "npm";
  return "unknown";
}

function inferApiRoutes(files: NormalizedFile[]) {
  return files
    .filter(isApiRoute)
    .map((file) => routePathForApiFile(file.path))
    .filter(Boolean)
    .sort();
}

function routePathForApiFile(path: string) {
  return apiRouteFromFilePath(path) || "";
}

function collectApiCalls(files: NormalizedFile[]) {
  const calls: Array<{ file: NormalizedFile; route: string; dynamicPrefix: boolean }> = [];
  for (const file of files) {
    const regex = /\b(?:fetch|axios\.(?:get|post|put|patch|delete))\(\s*["'`]((?:\/api\/)[^"'`?\s)]+)["'`]/g;
    for (const match of file.content.matchAll(regex)) {
      const route = match[1]?.replace(/\/+$/, "");
      if (route) calls.push({
        file,
        route,
        dynamicPrefix: isDynamicApiExpression(file.content, (match.index ?? 0) + match[0].length),
      });
    }
  }
  return calls.sort((a, b) => a.route.localeCompare(b.route) || a.file.path.localeCompare(b.file.path));
}

function apiRouteExists(apiRoutes: string[], route: string, dynamicPrefix = false) {
  const cleanRoute = route.replace(/\/+$/, "");
  return apiRoutes.some((candidate) => {
    if (candidate === cleanRoute) return true;
    return dynamicPrefix
      ? apiDynamicPrefixMatchesRoute(candidate, cleanRoute)
      : apiPathMatchesRoute(candidate, cleanRoute);
  });
}

function locationFor(file: NormalizedFile, needle: string): Pick<IssueDraft, "line" | "snippet"> {
  const lineIndex = file.lines.findIndex((line) => line.includes(needle));
  const index = lineIndex >= 0 ? lineIndex : 0;
  return {
    line: index + 1,
    snippet: (file.lines[index] || "").trim().slice(0, 260),
  };
}

function secretMatch(content: string) {
  const patterns = [
    /sk_live_[A-Za-z0-9_]{12,}/,
    /whsec_[A-Za-z0-9_]{12,}/,
    /postgres(?:ql)?:\/\/[^"'\s]+:[^"'\s]+@[^"'\s]+/i,
    /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/,
    /\b(?:GEMINI_API_KEY|GOOGLE_API_KEY|OPENAI_API_KEY|STRIPE_SECRET_KEY)\s*[:=]\s*["'`][^"'`]{12,}["'`]/,
  ];
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function isApiRoute(file: NormalizedFile) {
  return /(^|\/)app\/api\/.+\/route\.(ts|tsx|js|mjs|cjs)$/i.test(file.path);
}

function hasMutationExport(file: NormalizedFile) {
  return /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/.test(file.content);
}

function hasPersistentWrite(file: NormalizedFile) {
  return /\.(create|update|upsert|delete|deleteMany|updateMany)\s*\(|\bINSERT\s+INTO\b|\bUPDATE\s+["`\w]|\bDELETE\s+FROM\b|\.set\(|\.add\(|\.send\(/i.test(file.content);
}

function hasAuthGuard(file: NormalizedFile) {
  return /\b(compileTrust|requireSession|getSession|requireAuth|verifyApiKey|requireApiAccess|jwtVerify|auth\(|currentUser|stripe-signature)\b/.test(file.content);
}

function hasValidationGuard(file: NormalizedFile) {
  return /\b(z\.object|safeParse|parse\(|validate[A-Z]\w*|schema\.|required\(|typeof\s+\w+|Array\.isArray)\b/.test(file.content);
}

function readsJsonBody(file: NormalizedFile) {
  return /request\.json\(\)|req\.body|await\s+req\.json\(\)/.test(file.content);
}

function isClientComponent(file: NormalizedFile) {
  return /^\s*["']use client["'];?/m.test(file.content);
}

function isStripeWebhookLike(file: NormalizedFile) {
  return isApiRoute(file) && /stripe/i.test(file.content) && /webhook/i.test(file.path + "\n" + file.content);
}

function hasLockfile(files: NormalizedFile[]) {
  return files.some((file) => /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/i.test(file.path));
}

function envExampleContent(files: NormalizedFile[]) {
  return files.find((file) => /(^|\/)\.env\.example$/i.test(file.path))?.content || "";
}

function requiredEnvNames(context: ScannerContext) {
  const fromCode = new Set<string>();
  for (const file of context.files) {
    for (const match of file.content.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      const name = match[1];
      if (name && !name.startsWith("NEXT_PUBLIC_")) fromCode.add(name);
    }
  }
  for (const name of normalizeStringArray(context.metadata.requiredEnv)) {
    if (/^[A-Z0-9_]+$/.test(name)) fromCode.add(name);
  }
  return [...fromCode].sort();
}

function envExampleContains(envExample: string, name: string) {
  return new RegExp(`^\\s*${escapeRegex(name)}\\s*=`, "m").test(envExample);
}

function hasPrismaSchema(files: NormalizedFile[]) {
  return files.some((file) => /(^|\/)prisma\/schema\.prisma$/i.test(file.path));
}

function hasPrismaMigration(files: NormalizedFile[]) {
  return files.some((file) => /(^|\/)prisma\/migrations\/[^/]+\/migration\.sql$/i.test(file.path));
}

function usesQueue(context: ScannerContext) {
  return context.dependencyNames.includes("bullmq") || context.files.some((file) => /\bfrom\s+["']bullmq["']|\bnew\s+Queue\b|\bnew\s+Worker\b/i.test(file.content));
}

function hasNextEntryPage(files: NormalizedFile[]) {
  return files.some((file) => /(^|\/)(app\/page|pages\/index)\.(tsx|ts|jsx|js)$/i.test(file.path));
}

function usesDatabase(context: ScannerContext) {
  return context.dependencyNames.some((name) => ["@prisma/client", "prisma", "drizzle-orm", "sequelize", "typeorm", "pg", "mysql2"].includes(name)) ||
    context.files.some((file) => /\b(prisma\.|drizzle\(|new\s+PrismaClient|from\s+["']pg["'])/i.test(file.content));
}

function hasDatabaseSchema(files: NormalizedFile[]) {
  return files.some((file) => /(^|\/)(prisma\/schema\.prisma|drizzle\.config\.(ts|js)|migrations\/.+\.sql|schema\.sql)$/i.test(file.path));
}

function scoreCategory(issues: AIAppScannerIssue[]) {
  const penalty = issues.reduce((sum, item) => sum + severityWeight(item.severity), 0);
  return clampScore(100 - penalty);
}

function scoreOverall(securityIssues: AIAppScannerIssue[], deploymentIssues: AIAppScannerIssue[], architectureIssues: AIAppScannerIssue[]) {
  const security = scoreCategory(securityIssues);
  const deployment = scoreCategory(deploymentIssues);
  const architecture = scoreCategory(architectureIssues);
  const weighted = Math.round(security * 0.42 + deployment * 0.33 + architecture * 0.25);
  const combinedPenalty = [...securityIssues, ...deploymentIssues, ...architectureIssues].reduce((sum, item) => sum + overallSeverityWeight(item.severity), 0);
  return clampScore(Math.min(weighted, 100 - combinedPenalty));
}

function scalabilityScoreFor(deploymentIssues: AIAppScannerIssue[], architectureIssues: AIAppScannerIssue[]) {
  return clampScore(Math.round(scoreCategory(architectureIssues) * 0.58 + scoreCategory(deploymentIssues) * 0.42));
}

function paymentReliabilityScoreFor(issues: AIAppScannerIssue[]) {
  const paymentIssues = issues.filter((issue) => /\b(stripe|billing|payment|checkout|webhook|subscription|invoice)\b/i.test(`${issue.ruleId} ${issue.title} ${issue.recommendation} ${issue.evidence.map((item) => item.reason).join(" ")}`));
  if (paymentIssues.length === 0) return 100;
  return scoreCategory(paymentIssues);
}

function severityWeight(severity: AIAppIssueSeverity) {
  if (severity === "critical") return 34;
  if (severity === "high") return 20;
  if (severity === "medium") return 9;
  return 4;
}

function overallSeverityWeight(severity: AIAppIssueSeverity) {
  if (severity === "critical") return 26;
  if (severity === "high") return 14;
  if (severity === "medium") return 6;
  return 2;
}

function severityRank(severity: AIAppIssueSeverity | string) {
  if (severity === "critical") return 4;
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  if (severity === "low") return 1;
  return 0;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

function boundedConfidence(value: number) {
  return Math.max(0, Math.min(0.99, Number(value.toFixed(2))));
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean).sort() : [];
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
