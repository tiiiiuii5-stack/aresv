import assert from "node:assert/strict";

import { scanAIApp } from "@/lib/scanner/aiAppScanner";
import { ventureOSIntelligenceService } from "@/lib/services/intelligenceAnalysis";

const source = `// FILE: package.json
{"dependencies":{"next":"16.0.0","react":"19.0.0"},"scripts":{"build":"next build"}}

// FILE: app/page.tsx
"use client";
export function DeleteButton({ projectId }: { projectId: string }) {
  return <button onClick={() => fetch('/api/projects/' + projectId, { method: 'DELETE' })}>Delete</button>;
}

// FILE: app/api/projects/[id]/route.ts
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  return Response.json({ ok: true, id: params.id });
}
`;

const files = [
  {
    path: "package.json",
    content: "{\"dependencies\":{\"next\":\"16.0.0\",\"react\":\"19.0.0\"},\"scripts\":{\"build\":\"next build\"}}",
  },
  {
    path: "app/page.tsx",
    content: `"use client";
export function DeleteButton({ projectId }: { projectId: string }) {
  return <button onClick={() => fetch('/api/projects/' + projectId, { method: 'DELETE' })}>Delete</button>;
}`,
  },
  {
    path: "app/api/projects/[id]/route.ts",
    content: `export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  return Response.json({ ok: true, id: params.id });
}`,
  },
];

const scanner = scanAIApp({ files, metadata: { framework: "nextjs" } });
const scannerRuleIds = new Set([
  ...scanner.securityIssues,
  ...scanner.deploymentIssues,
  ...scanner.architectureIssues,
].map((issue) => issue.ruleId));

assert.equal(scannerRuleIds.has("architecture.phantom-api-route"), false);

void main();

async function main() {
  const analysis = await ventureOSIntelligenceService.analyze({
    projectId: "phantom-api-regression",
    persist: false,
    appCode: source,
    framework: "nextjs",
    modules: [],
  });

  assert.equal(analysis.issues.some((issue) => issue.title === "Phantom API call"), false);

  console.log(JSON.stringify({
    passed: true,
    scannerPhantom: scannerRuleIds.has("architecture.phantom-api-route"),
    analysisPhantom: analysis.issues.some((issue) => issue.title === "Phantom API call"),
  }, null, 2));
}
