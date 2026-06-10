import assert from "node:assert/strict";

import { ventureOSIntelligenceService } from "@/lib/services/intelligenceAnalysis";

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const scannerRuleText = await scan(`// FILE: lib/services/intelligenceAnalysis.ts
const evidenceRules = [
  /\\$queryRawUnsafe/i,
  /\\beval\\s*\\(/,
  /https?:\\/\\/(localhost|127\\.0\\.0\\.1)/i,
];

export function stripClientIdentity(value: unknown) {
  const body = value && typeof value === "object" ? { ...(value as Record<string, unknown>) } : {};
  delete body.userId;
  delete body.role;
  return body;
}
`);
  assertNoIssue(scannerRuleText, "dangerous-code-execution");
  assertNoIssue(scannerRuleText, "unsafe-sql-query");
  assertNoIssue(scannerRuleText, "ai-broken-deployment-assumption");
  assertNoIssue(scannerRuleText, "weak-authorization-pattern");

  const parameterizedSql = await scan(`// FILE: lib/services/projectWorkspace.ts
export async function loadProject(db: any, projectId: string) {
  return db.$queryRawUnsafe(
    \`SELECT "id", "title" FROM "projects" WHERE "id" = $1 LIMIT 1\`,
    projectId,
  );
}
`);
  assertNoIssue(parameterizedSql, "unsafe-sql-query");

  const interpolatedSql = await scan(`// FILE: app/api/projects/route.ts
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  return db.$queryRawUnsafe(\`SELECT * FROM projects WHERE id = \${id}\`);
}
`);
  assertHasIssue(interpolatedSql, "unsafe-sql-query");

  const weakAuthRoute = await scan(`// FILE: app/api/admin/users/route.ts
export async function POST(request: Request) {
  const session = await requireSession();
  const body = await request.json();
  if (body.role === "admin") {
    return Response.json({ ok: true, promotedBy: session.userId });
  }
  return Response.json({ ok: true });
}
`);
  assertHasIssue(weakAuthRoute, "weak-authorization-pattern");

  const optionalCatchAllRoute = await scan(`// FILE: app/account/page.tsx
"use client";
export function Account() {
  return <button onClick={() => fetch("/api/billing/status")}>Billing</button>;
}

// FILE: app/api/billing/[[...slug]]/route.ts
export async function GET(request: Request, context: { params: Promise<{ slug?: string[] }> }) {
  const { session } = await compileTrust(request, { mode: "session" });
  const slug = (await context.params).slug || [];
  if (slug[0] === "status") return Response.json({ ok: true, userId: session.userId });
  return Response.json({ ok: true });
}
`);
  assertNoIssue(optionalCatchAllRoute, "ai-phantom-api");

  const checkoutCreation = await scan(`// FILE: app/api/appraisal-checkout/route.ts
export async function POST(request: Request) {
  await compileTrust(request, { mode: "publicNonPersistent" });
  await enforceRateLimit(request, { name: "checkout", limit: 10, windowMs: 60000 });
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
  const session = await stripe.checkout.sessions.create({ mode: "payment", line_items: [] });
  return Response.json({ ok: true, url: session.url });
}
`);
  assertNoIssue(checkoutCreation, "webhook-without-signature-validation");
  assertNoIssue(checkoutCreation, "missing-rate-limit");

  const rateLimitedScanner = await scan(`// FILE: app/api/ai-app-scanner/route.ts
export async function POST(request: Request) {
  await enforceRateLimit(request, RATE_LIMITS.scanRepo);
  const trust = await compileTrust(request, { mode: "apiKey", endpoint: "/api/ai-app-scanner", scope: "intelligence:scan" });
  return Response.json({ ok: true, userId: trust.session.userId });
}
`);
  assertNoIssue(rateLimitedScanner, "missing-rate-limit");

  const ownedMutation = await scan(`// FILE: app/api/agent-memory/[[...slug]]/route.ts
export async function POST(request: Request) {
  const { session } = await compileTrust(request, { mode: "session" });
  const body = await request.json();
  const projectId = await resolveWorkspaceProjectIdForUser(body.projectId, session.userId);
  await prisma.agentMemory.create({ data: { userId: session.userId, projectId, content: body.content } });
  return Response.json({ ok: true });
}
`);
  assertNoIssue(ownedMutation, "insecure-mutating-api-route");

  const anonymousTelemetry = await scan(`// FILE: app/api/product-events/route.ts
const allowedEvents = new Set(["free_review.view"]);

export async function POST(request: Request) {
  await compileTrust(request, { mode: "publicNonPersistent", reason: "anonymous product funnel telemetry" });
  await enforceRateLimit(request, { name: "product-events", limit: 120, windowMs: 60000 });
  const body = await request.json();
  const eventType = String(body.event || "");
  if (!allowedEvents.has(eventType)) return Response.json({ ok: false }, { status: 400 });
  const metadata = sanitizeMetadata(body.metadata || {});
  metadata.repositoryHash = createHash("sha256").update(String(body.repositoryUrl || "")).digest("hex");
  metadata.rawSourceStored = false;
  await db.$executeRawUnsafe("INSERT INTO \\"app_telemetry_events\\" (\\"id\\", \\"eventType\\", \\"metadata\\") VALUES ($1, $2, $3::jsonb)", crypto.randomUUID(), eventType, JSON.stringify(metadata));
  return Response.json({ ok: true });
}
`);
  assertNoIssue(anonymousTelemetry, "insecure-mutating-api-route");

  const productionGuardedLocalhost = await scan(`// FILE: lib/appraisal/app-url.ts
const LOCAL_APP_URL = "http://localhost:3002";
export function canonicalAppUrl() {
  const raw = process.env.APP_URL || (process.env.NODE_ENV === "production" ? "" : LOCAL_APP_URL);
  if (!raw) throw new Error("APP_URL is required.");
  return raw;
}
`);
  assertNoIssue(productionGuardedLocalhost, "ai-broken-deployment-assumption");

  const localExecutionHarness = await scan(`// FILE: lib/execution-runtime/health-check.js
export async function waitForHealthyApp(port) {
  const url = \`http://localhost:\${port}\`;
  const response = await fetch(url);
  return { ready: response.status === 200 };
}
`);
  assertNoIssue(localExecutionHarness, "ai-broken-deployment-assumption");

  console.log(JSON.stringify({
    passed: true,
    scannerRuleText: summary(scannerRuleText),
    parameterizedSql: summary(parameterizedSql),
    interpolatedSql: summary(interpolatedSql),
    weakAuthRoute: summary(weakAuthRoute),
    optionalCatchAllRoute: summary(optionalCatchAllRoute),
    checkoutCreation: summary(checkoutCreation),
    rateLimitedScanner: summary(rateLimitedScanner),
    ownedMutation: summary(ownedMutation),
    productionGuardedLocalhost: summary(productionGuardedLocalhost),
    localExecutionHarness: summary(localExecutionHarness),
  }, null, 2));
}

async function scan(source: string) {
  return ventureOSIntelligenceService.analyze({
    persist: false,
    recordHistory: false,
    appCode: source,
    framework: "nextjs",
    modules: ["prisma", "next"],
  });
}

function assertNoIssue(result: Awaited<ReturnType<typeof scan>>, issueId: string) {
  assert.equal(
    result.issues.some((issue) => issue.id === issueId),
    false,
    `Expected ${issueId} not to be emitted. Issues: ${result.issues.map((issue) => issue.id).join(", ")}`,
  );
}

function assertHasIssue(result: Awaited<ReturnType<typeof scan>>, issueId: string) {
  assert.equal(
    result.issues.some((issue) => issue.id === issueId),
    true,
    `Expected ${issueId} to be emitted. Issues: ${result.issues.map((issue) => issue.id).join(", ")}`,
  );
}

function summary(result: Awaited<ReturnType<typeof scan>>) {
  return {
    readinessScore: result.productionReadinessScore,
    riskLevel: result.riskLevel,
    issues: result.issues.map((issue) => ({
      id: issue.id,
      severity: issue.severity,
      filePath: issue.filePath,
    })),
  };
}
