import assert from "node:assert/strict";

import { buildScanAssuranceManifest, VENTUREOS_REPO_SCAN_RULE_IDS } from "@/lib/scanner/scanAssurance";
import { VENTUREOS_SEVERITY_STANDARD_VERSION } from "@/lib/scanner/severityStandard";
import { repoScanService } from "@/lib/services/repoScan";

const files = [
  {
    path: "app/api/projects/route.ts",
    content: `export async function POST() { return Response.json({ ok: true }); }`,
  },
  {
    path: "package.json",
    content: JSON.stringify({ scripts: { build: "next build" }, dependencies: { next: "16.2.6" } }),
  },
];

const first = buildScanAssuranceManifest({
  engine: "ventureos-repo-scan",
  engineVersion: "test",
  repository: "owner/app",
  framework: "nextjs",
  modules: ["next", "repository"],
  files,
  ruleIds: [...VENTUREOS_REPO_SCAN_RULE_IDS],
  blockThreshold: 75,
});

const second = buildScanAssuranceManifest({
  engine: "ventureos-repo-scan",
  engineVersion: "test",
  repository: "owner/app",
  framework: "nextjs",
  modules: ["repository", "next"],
  files: files.slice().reverse(),
  ruleIds: [...VENTUREOS_REPO_SCAN_RULE_IDS].reverse(),
  blockThreshold: 75,
});

assert.equal(first.deterministic, true);
assert.equal(first.sourceHash, second.sourceHash);
assert.equal(first.ruleSetHash, second.ruleSetHash);
assert.equal(first.scanId, second.scanId);

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const scan = await repoScanService.scan({
    repository: "owner/app",
    framework: "nextjs",
    modules: ["next"],
    files,
    blockThreshold: 75,
  });

  assert.equal(scan.assurance.deterministic, true);
  assert.equal(scan.assurance.method, "static-analysis");
  assert.equal(scan.assurance.ruleSet.ruleCount, VENTUREOS_REPO_SCAN_RULE_IDS.length);
  assert.equal(scan.ci.scanId, scan.assurance.scanId);
  assert.equal(scan.ci.sourceHash, scan.assurance.sourceHash);
  assert.equal(scan.ci.ruleSetHash, scan.assurance.ruleSetHash);

  const classifiedFiles = [
    {
      path: "package.json",
      content: JSON.stringify({ scripts: { build: "next build" }, dependencies: { next: "16.2.6", stripe: "22.2.0" } }),
    },
    {
      path: "app/page.tsx",
      content: `"use client";
export default function Page() {
  return <button onClick={() => fetch("/api/checkout")}>Pay</button>;
}`,
    },
    {
      path: "archive/legacy/App_v4_production.js",
      content: `export async function legacy() { return fetch("http://localhost:4000/api"); }`,
    },
  ];
  const baselineForChangeImpact = buildScanAssuranceManifest({
    engine: "ventureos-repo-scan",
    engineVersion: "test",
    repository: "owner/classifier-app",
    framework: "nextjs",
    modules: ["next"],
    files: classifiedFiles.map((file) =>
      file.path === "app/page.tsx"
        ? { ...file, content: `"use client";\nexport default function Page() { return <button>Pay</button>; }` }
        : file),
    ruleIds: [...VENTUREOS_REPO_SCAN_RULE_IDS],
    blockThreshold: 75,
  });

  const classified = await repoScanService.scan({
    repository: "owner/classifier-app",
    framework: "nextjs",
    modules: ["next"],
    files: classifiedFiles,
    blockThreshold: 75,
    previousAssurance: baselineForChangeImpact,
  });

  const missingInternalApi = classified.issues.find((issue) => issue.id === "repo-missing-internal-api-route");
  assert.ok(missingInternalApi, "missing internal API route should be classified");
  assert.equal(missingInternalApi?.endpoint, "/api/checkout");
  assert.equal(missingInternalApi?.blocking, true);
  assert.ok(!classified.issues.some((issue) => issue.id === "ai-phantom-api"), "generic phantom API finding should be replaced");
  assert.ok(classified.issues.some((issue) => issue.source === "archive" && issue.blocking === false), "unreferenced archive findings should not block");
  assert.ok(classified.sbom.componentCount >= 2, "SBOM should include npm dependencies");
  assert.equal(classified.summary.endpointClassifications.missingInternalApi, 1);
  assert.equal(classified.ci.gate.status, "FAIL");
  assert.equal(classified.ci.gate.shouldBlock, true);
  assert.ok(classified.ci.gate.reasons.some((reason) => reason.id === "repo-missing-internal-api-route"));
  assert.equal(classified.trustScoreExplanation.score, classified.riskScore);
  assert.equal(classified.severityStandard.version, VENTUREOS_SEVERITY_STANDARD_VERSION);
  assert.ok(classified.scanDiff.changedFiles.includes("app/page.tsx"));
  assert.ok(classified.changeImpact.baselineAvailable);
  assert.ok(classified.changeImpact.impacts.some((impact) => impact.path === "app/page.tsx" && impact.gateEffect === "BLOCKING"));

  console.log(JSON.stringify({
    ok: true,
    scanId: scan.assurance.scanId,
    sourceHash: scan.assurance.sourceHash,
    ruleSetHash: scan.assurance.ruleSetHash,
    deterministic: scan.assurance.deterministic,
    classifier: {
      missingInternalApi: classified.summary.endpointClassifications.missingInternalApi,
      sbomComponents: classified.sbom.componentCount,
    },
  }, null, 2));
}
