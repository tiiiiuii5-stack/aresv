import assert from "node:assert/strict";

import { scanAIApp } from "@/lib/scanner/aiAppScanner";

const files = [
  {
    path: "package.json",
    content: JSON.stringify({
      dependencies: {
        next: "16.0.0",
        react: "19.0.0",
        "@prisma/client": "7.0.0",
      },
      scripts: {
        dev: "next dev",
      },
    }, null, 2),
  },
  {
    path: "app/page.tsx",
    content: `export default function Page() {
  return <button onClick={() => fetch("/api/missing")}>Launch</button>;
}`,
  },
  {
    path: "app/api/users/route.ts",
    content: `import { prisma } from "@/lib/prisma";
export async function POST(request: Request) {
  const body = await request.json();
  const user = await prisma.user.create({ data: body });
  return Response.json({ user });
}`,
  },
  {
    path: "components/ClientPanel.tsx",
    content: `"use client";
export function ClientPanel() {
  localStorage.setItem("draft", "value");
  return <div>{process.env.NEXT_PUBLIC_SECRET_KEY}</div>;
}`,
  },
  {
    path: "prisma/schema.prisma",
    content: `datasource db { provider = "postgresql" }
model User { id String @id }`,
  },
];

const metadata = {
  framework: "nextjs",
  expectedRoutes: ["/api/missing", "/api/users"],
  requiredEnv: ["DATABASE_URL"],
};

const first = scanAIApp({ files, metadata });
const second = scanAIApp({ files, metadata });

assert.deepEqual(first, second);
assert.equal(first.schemaVersion, "ai-app-scanner.v1");
assert.equal(first.readOnly, true);
assert.equal(first.deterministic, true);
assert.equal(first.summary.codeExecuted, false);
assert.equal(first.summary.networkAccess, false);
assert.equal(first.summary.mutations, false);
assert.ok(first.readinessScore < 100);
assert.ok(first.actionableFixes.length > 0);
assert.ok(first.launchReadinessScore.finalReadinessScore >= 0);
assert.ok(first.launchReadinessScore.finalReadinessScore <= 100);
assert.equal(typeof first.launchReadinessScore.scores.securityScore, "number");
assert.equal(typeof first.launchReadinessScore.scores.scalabilityScore, "number");
assert.equal(typeof first.launchReadinessScore.scores.deploymentSafetyScore, "number");
assert.equal(typeof first.launchReadinessScore.scores.paymentReliabilityScore, "number");
assert.ok(["SAFE", "RISKY", "DO NOT LAUNCH"].includes(first.launchReadinessScore.launchRecommendation));
assert.equal(first.launchReadinessScore.launchRecommendation, "DO NOT LAUNCH");

const ruleIds = new Set([
  ...first.securityIssues,
  ...first.deploymentIssues,
  ...first.architectureIssues,
].map((issue) => issue.ruleId));

assert.ok(ruleIds.has("security.public-client-secret"));
assert.ok(ruleIds.has("security.mutation-route-without-auth"));
assert.ok(ruleIds.has("security.mutation-route-without-validation"));
assert.ok(ruleIds.has("deployment.missing-build-script"));
assert.ok(ruleIds.has("deployment.missing-lockfile"));
assert.ok(ruleIds.has("deployment.missing-env-example"));
assert.ok(ruleIds.has("deployment.prisma-schema-without-migrations"));
assert.ok(ruleIds.has("deployment.missing-health-route"));
assert.ok(ruleIds.has("architecture.phantom-api-route"));
assert.ok(ruleIds.has("architecture.browser-only-persistence"));

for (const issue of [...first.securityIssues, ...first.deploymentIssues, ...first.architectureIssues]) {
  assert.ok(issue.id);
  assert.ok(issue.evidence.length > 0);
  assert.ok(issue.confidence >= 0 && issue.confidence <= 0.99);
  assert.ok(issue.confidenceScore >= 0 && issue.confidenceScore <= 99);
  assert.ok(issue.fileEvidence.length > 0);
  assert.ok(issue.fileEvidence.every((item) => item.filePath && item.reason && item.codeSnippet && item.confidence >= 0 && item.confidence <= 99));
  assert.ok(issue.reasoning.includes(issue.title));
  assert.equal(issue.reproducibleProof.method, "static-analysis");
  assert.equal(issue.reproducibleProof.deterministic, true);
  assert.ok(issue.reproducibleProof.steps.length >= 3);
  assert.equal(issue.proof.supported, true);
  assert.equal(issue.proof.confidenceScore, issue.confidenceScore);
  assert.ok(issue.actionableFix, `${issue.ruleId} should include an actionable fix`);
  assert.equal(issue.actionableFix?.issueId, issue.id);
  assert.ok(issue.actionableFix?.filePath);
  assert.ok((issue.actionableFix?.location.line || 0) >= 1);
  assert.ok(issue.actionableFix?.copyPasteFix.trim());
  assert.ok(issue.actionableFix?.frameworkGuidance.includes("Next.js") || issue.actionableFix?.frameworkGuidance.includes("App Router"));
}

console.log(JSON.stringify({
  passed: true,
  readinessScore: first.readinessScore,
  securityIssues: first.securityIssues.length,
  deploymentIssues: first.deploymentIssues.length,
  architectureIssues: first.architectureIssues.length,
  actionableFixes: first.actionableFixes.length,
  launchReadinessScore: first.launchReadinessScore,
  scores: first.scores,
}, null, 2));
