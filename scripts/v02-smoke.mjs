import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const requiredFiles = [
  "lib/evolution/evolutionEngine.ts",
  "lib/evolution/evolutionMemory.ts",
  "lib/intelligence/execution-path-mapper.ts",
  "lib/intelligence/failure-mode-detector.ts",
  "lib/intelligence/evidence-engine.ts",
  "lib/intelligence/failure-simulator.ts",
  "lib/intelligence/readiness-score.ts",
  "lib/intelligence/regression-detection.ts",
  "app/api/evolution-loop/route.ts",
];

const missing = requiredFiles.filter((file) => !existsSync(file));
if (missing.length > 0) {
  console.error(`v0.2 smoke failed. Missing files: ${missing.join(", ")}`);
  process.exit(1);
}

const code = `
import { runEvolutionLoop } from "./lib/evolution/evolutionEngine";

const report = runEvolutionLoop({
  applyMode: "snapshot-only",
  files: [
    {
      path: "app/api/health/route.ts",
      content: "export async function GET() { return Response.json({ ok: true }); }",
    },
    {
      path: "app/page.tsx",
      content: "export default function Page() { return <button>Open dashboard</button>; }",
    },
  ],
});

if (report.engine !== "ventureos-evolution-engine") throw new Error("unexpected engine");
if (!report.executionGraph?.nodes?.length) throw new Error("execution graph did not build");
if (!report.productionReadiness || typeof report.productionReadiness.score !== "number") throw new Error("readiness score missing");
if (!report.systemVerdict) throw new Error("system verdict missing");

console.log(JSON.stringify({
  engine: report.engine,
  version: report.version,
  score: report.productionReadiness.score,
  verdict: report.systemVerdict,
  nodes: report.executionGraph.nodes.length,
  paths: report.executionGraph.paths.length,
}, null, 2));
`;

const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", code], {
  stdio: "inherit",
  shell: false,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
