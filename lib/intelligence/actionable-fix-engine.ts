export type ActionableFixLocation = {
  line: number;
  column?: number;
};

export type ActionableFixType = "replace_snippet" | "insert_snippet" | "create_file" | "edit_json" | "run_command";

export type ActionableFix = {
  issueId: string;
  ruleId?: string;
  title: string;
  filePath: string;
  location: ActionableFixLocation;
  fixType: ActionableFixType;
  evidenceSnippet: string;
  copyPasteFix: string;
  frameworkGuidance: string;
  verificationSteps: string[];
  confidence: number;
};

export type ActionableFixIssue = {
  id: string;
  ruleId?: string;
  category?: string;
  severity?: string;
  title: string;
  filePath?: string;
  recommendation?: string;
  fixSuggestion?: string;
  codeSnippet?: string;
  location?: {
    line?: number;
    column?: number;
  };
  evidence?: unknown;
};

export type ActionableFixInput = {
  issues: ActionableFixIssue[];
  files?: Array<{
    path: string;
    content: string;
  }>;
  framework?: string;
  packageManager?: string;
  requiredEnv?: string[];
};

type NormalizedFile = {
  path: string;
  lowerPath: string;
  content: string;
  lines: string[];
};

type IssueContext = {
  issue: ActionableFixIssue;
  key: string;
  files: NormalizedFile[];
  framework: string;
  packageManager: string;
  requiredEnv: string[];
  filePath: string;
  location: ActionableFixLocation;
  evidenceSnippet: string;
};

export function buildActionableFixes(input: ActionableFixInput): ActionableFix[] {
  const files = normalizeFiles(input.files || []);
  const framework = normalizeFramework(input.framework);
  const packageManager = normalizePackageManager(input.packageManager);
  const requiredEnv = unique((input.requiredEnv || []).map(cleanText).filter(Boolean));
  const fixes: ActionableFix[] = [];

  for (const issue of input.issues || []) {
    const context = contextForIssue(issue, { files, framework, packageManager, requiredEnv });
    const fix = fixForIssue(context);
    if (fix) fixes.push(fix);
  }

  return dedupeFixes(fixes);
}

function fixForIssue(context: IssueContext): ActionableFix | null {
  switch (context.key) {
    case "deployment.missing-package-json":
      return createFix(context, "package.json", 1, "create_file", packageJsonSnippet(context), "Create package.json at the repository root with deterministic scripts.");
    case "deployment.missing-build-script":
      return createFix(context, "package.json", context.location.line, "edit_json", buildScriptSnippet(context), "Add this script entry inside package.json scripts.");
    case "deployment.missing-lockfile":
      return createFix(context, lockfileFor(context.packageManager), 1, "run_command", lockfileCommand(context.packageManager), "Generate and commit the lockfile with the same package manager used for production installs.");
    case "deployment.missing-env-example":
    case "deployment.env-example-incomplete":
    case "deployment.queue-missing-redis-env":
    case "missing-env-validation":
      return createFix(context, ".env.example", 1, "create_file", envExampleSnippet(context), "Document required production environment variable names without secret values.");
    case "deployment.prisma-schema-without-migrations":
      return createFix(context, "prisma/migrations", 1, "run_command", "npx prisma migrate dev --name init", "Generate a real Prisma migration and commit the created prisma/migrations directory.");
    case "deployment.missing-health-route":
      return createFix(context, "app/api/health/route.ts", 1, "create_file", nextHealthRouteSnippet(), "Next.js App Router health checks belong in app/api/health/route.ts.");
    case "deployment.serverless-filesystem-write":
    case "repo-serverless-file-writes":
    case "ai-broken-deployment-assumption":
      return createFix(context, context.filePath, context.location.line, "replace_snippet", durableWriteSnippet(), "Replace request-time local filesystem writes with durable storage or database writes before deploying to serverless.");
    case "architecture.missing-next-entry-page":
      return createFix(context, "app/page.tsx", 1, "create_file", nextEntryPageSnippet(), "Next.js App Router requires app/page.tsx for the root route.");
    case "architecture.phantom-api-route":
    case "architecture.expected-api-route-missing":
    case "ai-phantom-api":
    case "ai-missing-backend-implementation":
      return createFix(context, apiRouteFileFor(extractApiRoute(context) || "/api/implemented"), 1, "create_file", nextApiRouteSnippet(), "Create the missing Next.js App Router route handler or update the client call to an existing route.");
    case "architecture.browser-only-persistence":
    case "ai-fake-persistence":
      return createFix(context, context.filePath, context.location.line, "replace_snippet", persistentActionSnippet(), "Client workflows that must survive refreshes should submit to a route handler or server action, not browser storage.");
    case "architecture.database-code-without-schema":
      return createFix(context, "prisma/schema.prisma", 1, "create_file", prismaSchemaSnippet(), "Commit a schema artifact that matches the database access used by the application.");
    case "security.public-client-secret":
    case "frontend-secret-exposure":
    case "exposed-secret-literal":
    case "security.hardcoded-secret":
      return createFix(context, context.filePath || ".env.example", context.location.line, "replace_snippet", secretRemovalSnippet(context), "Secrets must live in server-only environment variables; client code may receive only non-sensitive derived values.");
    case "security.client-server-env-boundary":
      return createFix(context, context.filePath, context.location.line, "replace_snippet", clientEnvBoundarySnippet(), "Next.js Client Components cannot safely read server-only environment variables.");
    case "security.mutation-route-without-auth":
    case "missing-auth-middleware":
    case "insecure-mutating-api-route":
      return createFix(context, context.filePath, context.location.line, "insert_snippet", nextRouteAuthSnippet(), "In Next.js route handlers, authenticate before reading the body or performing writes.");
    case "security.mutation-route-without-validation":
      return createFix(context, context.filePath, context.location.line, "insert_snippet", requestValidationSnippet(), "Validate request.json() before persistence or provider calls.");
    case "security.stripe-webhook-unverified":
    case "webhook-without-signature-validation":
      return createFix(context, context.filePath, context.location.line, "replace_snippet", stripeWebhookSnippet(), "Stripe webhooks in Next.js App Router must use request.text() and stripe.webhooks.constructEvent().");
    case "weak-authorization-pattern":
    case "ai-fake-auth-flow":
    case "ai-ui-only-protection":
      return createFix(context, context.filePath, context.location.line, "replace_snippet", serverAuthoritativeIdentitySnippet(), "Authorization must be enforced server-side from the resolved session, not browser state or request-controlled fields.");
    case "cors-wildcard":
      return createFix(context, context.filePath, context.location.line, "replace_snippet", corsSnippet(), "Never combine credentialed requests with wildcard CORS; compare Origin against an allowlist.");
    case "missing-rate-limit":
      return createFix(context, context.filePath, context.location.line, "insert_snippet", rateLimitSnippet(), "Apply rate limiting at sensitive Next.js route-handler entry points before expensive work.");
    case "dangerous-code-execution":
      return createFix(context, context.filePath, context.location.line, "replace_snippet", dangerousExecutionSnippet(), "Do not execute untrusted strings in production request paths.");
    case "ai-no-op-action":
      return createFix(context, context.filePath, context.location.line, "replace_snippet", noOpActionSnippet(), "A user action should either call a real backend path or render a disabled state with clear unavailable copy.");
    case "repo-missing-lockfile":
      return createFix(context, lockfileFor(context.packageManager), 1, "run_command", lockfileCommand(context.packageManager), "Generate and commit the package manager lockfile.");
    case "repo-missing-ci":
      return createFix(context, ".github/workflows/ci.yml", 1, "create_file", ciWorkflowSnippet(context), "Run install, type-check, lint, build, and scanner checks before deployment.");
    case "repo-missing-tests":
      return createFix(context, "scripts/smoke-test.mjs", 1, "create_file", smokeTestSnippet(), "Add a deterministic smoke test script and wire it into CI.");
    case "repo-missing-env-template":
      return createFix(context, ".env.example", 1, "create_file", envExampleSnippet(context), "Commit required env names without values.");
    case "repo-missing-health-route":
      return createFix(context, "app/api/health/route.ts", 1, "create_file", nextHealthRouteSnippet(), "Expose a fast health endpoint for deployment verification.");
    case "repo-migrations-missing":
      return createFix(context, "prisma/migrations", 1, "run_command", "npx prisma migrate dev --name init", "Generate and commit Prisma migrations before deployment.");
    case "repo-serverless-localhost":
      return createFix(context, context.filePath, context.location.line, "replace_snippet", productionUrlSnippet(), "Production code should read service URLs from validated environment variables.");
    default:
      return fallbackFix(context);
  }
}

function contextForIssue(
  issue: ActionableFixIssue,
  input: {
    files: NormalizedFile[];
    framework: string;
    packageManager: string;
    requiredEnv: string[];
  },
): IssueContext {
  const evidence = firstEvidence(issue);
  const filePath = normalizePath(issue.filePath || evidence.filePath || inferredFilePath(issue) || "");
  const file = input.files.find((item) => item.lowerPath === filePath.toLowerCase());
  const evidenceSnippet = cleanText(issue.codeSnippet || evidence.snippet || lineAt(file, evidence.line || issue.location?.line || 1));
  const line = boundedLine(issue.location?.line || evidence.line || lineForSnippet(file, evidenceSnippet) || 1);
  return {
    issue,
    key: issue.ruleId || issue.id,
    files: input.files,
    framework: input.framework,
    packageManager: input.packageManager,
    requiredEnv: input.requiredEnv,
    filePath,
    location: {
      line,
      column: issue.location?.column || 1,
    },
    evidenceSnippet,
  };
}

function createFix(
  context: IssueContext,
  filePath: string,
  line: number,
  fixType: ActionableFixType,
  copyPasteFix: string,
  frameworkGuidance: string,
): ActionableFix {
  return {
    issueId: context.issue.id,
    ruleId: context.issue.ruleId,
    title: context.issue.title,
    filePath: normalizePath(filePath || context.filePath || "unknown-file"),
    location: { line: boundedLine(line), column: 1 },
    fixType,
    evidenceSnippet: context.evidenceSnippet || "No source line was supplied; this fix targets a missing or structural file.",
    copyPasteFix: copyPasteFix.trim(),
    frameworkGuidance: frameworkGuidanceFor(context.framework, frameworkGuidance),
    verificationSteps: verificationStepsFor(context, fixType),
    confidence: confidenceFor(context, fixType),
  };
}

function fallbackFix(context: IssueContext): ActionableFix | null {
  void context;
  return null;
}

function packageJsonSnippet(context: IssueContext) {
  const build = context.framework === "vite" ? "vite build" : context.framework === "remix" ? "remix vite:build" : "next build";
  const dev = context.framework === "vite" ? "vite" : context.framework === "remix" ? "remix vite:dev" : "next dev";
  return JSON.stringify({
    scripts: {
      dev,
      build,
      lint: "eslint .",
      "type-check": "tsc --noEmit",
    },
    dependencies: {},
    devDependencies: {},
  }, null, 2);
}

function buildScriptSnippet(context: IssueContext) {
  const build = context.framework === "vite" ? "vite build" : context.framework === "remix" ? "remix vite:build" : "next build";
  return `"scripts": {\n  "build": "${build}",\n  "type-check": "tsc --noEmit",\n  "lint": "eslint ."\n}`;
}

function envExampleSnippet(context: IssueContext) {
  const names = unique([
    ...context.requiredEnv,
    ...extractEnvNames(`${context.issue.title} ${context.issue.recommendation || ""} ${context.issue.fixSuggestion || ""} ${context.evidenceSnippet}`),
  ]);
  const output = names.length ? names : ["DATABASE_URL", "AUTH_SECRET"];
  return output.map((name) => `${name}=`).join("\n");
}

function nextHealthRouteSnippet() {
  return `export const runtime = "nodejs";\n\nexport async function GET() {\n  return Response.json({ ok: true, service: "healthy", timestamp: new Date().toISOString() });\n}`;
}

function nextEntryPageSnippet() {
  return `export default function Page() {\n  return (\n    <main>\n      <h1>Application Ready</h1>\n    </main>\n  );\n}`;
}

function nextApiRouteSnippet() {
  return `export const runtime = "nodejs";\n\nexport async function GET() {\n  return Response.json({ ok: true });\n}\n\nexport async function POST(request: Request) {\n  const body = await request.json().catch(() => ({}));\n  return Response.json({ ok: true, data: body });\n}`;
}

function persistentActionSnippet() {
  return `const response = await fetch("/api/drafts", {\n  method: "POST",\n  headers: { "content-type": "application/json" },\n  body: JSON.stringify({ value: draftValue }),\n});\n\nif (!response.ok) {\n  throw new Error("Failed to persist draft");\n}\n\nconst savedDraft = await response.json();`;
}

function durableWriteSnippet() {
  return `const record = await db.fileRecord.create({\n  data: {\n    name: fileName,\n    content: fileContent,\n  },\n});\n\nreturn Response.json({ ok: true, record });`;
}

function prismaSchemaSnippet() {
  return `datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\n\ngenerator client {\n  provider = "prisma-client-js"\n}\n\nmodel AppRecord {\n  id        String   @id @default(cuid())\n  createdAt DateTime @default(now())\n  updatedAt DateTime @updatedAt\n}`;
}

function secretRemovalSnippet(context: IssueContext) {
  const envName = preferredSecretEnvName(context);
  return `const secretValue = process.env.${envName};\n\nif (!secretValue) {\n  throw new Error("${envName} is required");\n}`;
}

function clientEnvBoundarySnippet() {
  return `const response = await fetch("/api/public-config", { cache: "no-store" });\n\nif (!response.ok) {\n  throw new Error("Failed to load public configuration");\n}\n\nconst publicConfig = await response.json() as { configured: boolean };`;
}

function nextRouteAuthSnippet() {
  return `import { requireSession } from "@/lib/auth/session";\n\nexport async function POST(request: Request) {\n  const session = await requireSession();\n  const body = await request.json();\n\n  return Response.json({ ok: true, userId: session.userId });\n}`;
}

function requestValidationSnippet() {
  return `import { z } from "zod";\n\nconst BodySchema = z.object({}).passthrough();\n\nexport async function POST(request: Request) {\n  const body = BodySchema.parse(await request.json());\n\n  return Response.json({ ok: true, body });\n}`;
}

function stripeWebhookSnippet() {
  return `import Stripe from "stripe";\n\nconst stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");\n\nexport async function POST(request: Request) {\n  const signature = request.headers.get("stripe-signature");\n  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;\n\n  if (!signature || !webhookSecret) {\n    return new Response("Missing Stripe webhook configuration", { status: 400 });\n  }\n\n  const payload = await request.text();\n\n  try {\n    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);\n    return Response.json({ received: true, type: event.type });\n  } catch {\n    return new Response("Invalid Stripe signature", { status: 400 });\n  }\n}`;
}

function serverAuthoritativeIdentitySnippet() {
  return `const session = await requireSession();\n\nif (!session?.userId) {\n  return Response.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });\n}\n\nconst userId = session.userId;`;
}

function corsSnippet() {
  return `const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean));\nconst origin = request.headers.get("origin") || "";\n\nif (!allowedOrigins.has(origin)) {\n  return new Response("Forbidden origin", { status: 403 });\n}\n\nconst headers = { "Access-Control-Allow-Origin": origin, "Vary": "Origin" };`;
}

function rateLimitSnippet() {
  return `const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";\nconst allowed = await rateLimit({ key, limit: 20, windowSeconds: 60 });\n\nif (!allowed) {\n  return Response.json({ ok: false, error: "RATE_LIMITED" }, { status: 429 });\n}`;
}

function dangerousExecutionSnippet() {
  return `return Response.json({\n  ok: false,\n  error: "Dynamic code execution is disabled in production",\n}, { status: 400 });`;
}

function noOpActionSnippet() {
  return `const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");\n\nasync function handleAction() {\n  setStatus("loading");\n  const response = await fetch("/api/action", { method: "POST" });\n  setStatus(response.ok ? "success" : "error");\n}`;
}

function productionUrlSnippet() {
  return `const serviceUrl = process.env.SERVICE_BASE_URL;\n\nif (!serviceUrl) {\n  throw new Error("SERVICE_BASE_URL is required");\n}\n\nconst response = await fetch(new URL("/health", serviceUrl));`;
}

function ciWorkflowSnippet(context: IssueContext) {
  const install = context.packageManager === "pnpm" ? "pnpm install --frozen-lockfile" : context.packageManager === "yarn" ? "yarn install --frozen-lockfile" : "npm ci";
  const run = context.packageManager === "pnpm" ? "pnpm" : context.packageManager === "yarn" ? "yarn" : "npm run";
  return `name: CI\n\non:\n  pull_request:\n  push:\n    branches: [main]\n\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n          cache: "${context.packageManager === "unknown" ? "npm" : context.packageManager}"\n      - run: ${install}\n      - run: ${run} type-check\n      - run: ${run} lint\n      - run: ${run} build`;
}

function smokeTestSnippet() {
  return `import assert from "node:assert/strict";\n\nconst baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";\nconst response = await fetch(new URL("/api/health", baseUrl));\n\nassert.equal(response.ok, true);\nconsole.log("smoke test passed");`;
}

function lockfileCommand(packageManager: string) {
  if (packageManager === "pnpm") return "pnpm install --lockfile-only";
  if (packageManager === "yarn") return "yarn install --mode=update-lockfile";
  if (packageManager === "bun") return "bun install";
  return "npm install --package-lock-only";
}

function lockfileFor(packageManager: string) {
  if (packageManager === "pnpm") return "pnpm-lock.yaml";
  if (packageManager === "yarn") return "yarn.lock";
  if (packageManager === "bun") return "bun.lock";
  return "package-lock.json";
}

function verificationStepsFor(context: IssueContext, fixType: ActionableFixType) {
  const steps = ["Run the scanner again and confirm this issue id is absent or lower severity."];
  if (context.framework === "nextjs") steps.push("Run npm run type-check and npm run build for the Next.js app.");
  if (fixType === "create_file" || fixType === "edit_json") steps.push(`Confirm ${context.filePath || "the target file"} is committed.`);
  if (fixType === "run_command") steps.push("Commit the generated files after the command completes.");
  return unique(steps);
}

function frameworkGuidanceFor(framework: string, guidance: string) {
  if (framework === "nextjs") return `${guidance} Use App Router route handlers under app/api/**/route.ts and keep secrets in server-only code.`;
  if (framework === "vite") return `${guidance} Vite exposes only VITE_* variables to the browser, so server secrets need a backend endpoint.`;
  if (framework === "remix") return `${guidance} Remix loaders/actions should validate input and read secrets only on the server.`;
  return guidance;
}

function confidenceFor(context: IssueContext, fixType: ActionableFixType) {
  const anchored = context.filePath && context.evidenceSnippet ? 0.9 : 0.78;
  const structural = fixType === "create_file" || fixType === "run_command" ? 0.86 : anchored;
  return boundedConfidence(structural);
}

function firstEvidence(issue: ActionableFixIssue): { filePath?: string; line?: number; snippet?: string } {
  if (!Array.isArray(issue.evidence)) return {};
  const item = issue.evidence.find((candidate) => candidate && typeof candidate === "object") as Record<string, unknown> | undefined;
  if (!item) return {};
  return {
    filePath: typeof item.filePath === "string" ? item.filePath : undefined,
    line: typeof item.line === "number" ? item.line : undefined,
    snippet: typeof item.snippet === "string" ? item.snippet : undefined,
  };
}

function inferredFilePath(issue: ActionableFixIssue) {
  const key = issue.ruleId || issue.id;
  if (key.includes("env")) return ".env.example";
  if (key.includes("health")) return "app/api/health/route.ts";
  if (key.includes("package")) return "package.json";
  if (key.includes("lockfile")) return "package-lock.json";
  if (key.includes("prisma") || key.includes("schema")) return "prisma/schema.prisma";
  return "";
}

function extractApiRoute(context: IssueContext) {
  const text = `${context.issue.title} ${context.issue.recommendation || ""} ${context.issue.fixSuggestion || ""} ${context.evidenceSnippet}`;
  const match = text.match(/\/api\/[A-Za-z0-9_./[\]-]+/);
  return match?.[0]?.replace(/[.,;:]$/, "") || "";
}

function apiRouteFileFor(route: string) {
  const clean = route.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!clean.startsWith("api/")) return "app/api/implemented/route.ts";
  return `app/${clean}/route.ts`;
}

function preferredSecretEnvName(context: IssueContext) {
  const found = extractEnvNames(`${context.evidenceSnippet} ${context.issue.title}`)[0];
  if (found && !found.startsWith("NEXT_PUBLIC_")) return found;
  if (/database|postgres/i.test(context.evidenceSnippet)) return "DATABASE_URL";
  if (/stripe/i.test(context.evidenceSnippet)) return "STRIPE_SECRET_KEY";
  if (/openai/i.test(context.evidenceSnippet)) return "OPENAI_API_KEY";
  if (/gemini|google/i.test(context.evidenceSnippet)) return "GEMINI_API_KEY";
  return "APP_SECRET";
}

function extractEnvNames(value: string) {
  const output = new Set<string>();
  for (const match of value.matchAll(/\b[A-Z][A-Z0-9_]{2,}\b/g)) {
    const name = match[0];
    if (["POST", "GET", "PUT", "PATCH", "DELETE", "JSON", "URL"].includes(name)) continue;
    output.add(name);
  }
  return [...output].sort();
}

function normalizeFiles(files: Array<{ path: string; content: string }>): NormalizedFile[] {
  return files
    .filter((file) => file && typeof file.path === "string" && typeof file.content === "string")
    .map((file) => {
      const path = normalizePath(file.path);
      return {
        path,
        lowerPath: path.toLowerCase(),
        content: file.content,
        lines: file.content.split(/\r?\n/),
      };
    });
}

function lineAt(file: NormalizedFile | undefined, line: number) {
  return file?.lines[boundedLine(line) - 1]?.trim() || "";
}

function lineForSnippet(file: NormalizedFile | undefined, snippet: string) {
  if (!file || !snippet) return 0;
  const clean = cleanText(snippet);
  const index = file.lines.findIndex((line) => cleanText(line).includes(clean) || clean.includes(cleanText(line)));
  return index >= 0 ? index + 1 : 0;
}

function normalizeFramework(value: unknown) {
  const clean = String(value || "").trim().toLowerCase();
  if (clean === "next" || clean === "next.js") return "nextjs";
  return clean || "unknown";
}

function normalizePackageManager(value: unknown) {
  const clean = String(value || "").trim().toLowerCase();
  if (["npm", "pnpm", "yarn", "bun"].includes(clean)) return clean;
  return "npm";
}

function normalizePath(value: string) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "").trim();
}

function cleanText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function boundedLine(value: unknown) {
  const number = Math.round(Number(value || 1));
  return Number.isFinite(number) && number > 0 ? number : 1;
}

function boundedConfidence(value: number) {
  return Math.max(0, Math.min(0.99, Number(value.toFixed(2))));
}

function dedupeFixes(fixes: ActionableFix[]) {
  const seen = new Set<string>();
  const output: ActionableFix[] = [];
  for (const fix of fixes) {
    const key = `${fix.issueId}:${fix.filePath}:${fix.location.line}:${fix.copyPasteFix}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(fix);
  }
  return output;
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}
