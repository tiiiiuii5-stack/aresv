import { readdir, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const API_URL = (process.env.VENTUREOS_INTELLIGENCE_API_URL || "").replace(/\/$/, "");
const API_KEY = process.env.VENTUREOS_INTELLIGENCE_API_KEY || "";
const ROOT = process.env.VENTUREOS_SCAN_ROOT || process.cwd();
const BLOCK_THRESHOLD = Number(process.env.VENTUREOS_SCAN_BLOCK_THRESHOLD || 75);
const OUTPUT = process.env.VENTUREOS_SCAN_OUTPUT || "";
const SCAN_MODE = process.env.VENTUREOS_SCAN_MODE === "deep" ? "deep" : "quick";
const BASELINE = process.env.VENTUREOS_SCAN_BASELINE || "";
const DIFF_ONLY = process.env.VENTUREOS_SCAN_DIFF_ONLY === "1" || process.env.VENTUREOS_SCAN_DIFF_ONLY === "true";
const PROJECT_ID = process.env.VENTUREOS_SCAN_PROJECT_ID || process.env.VENTUREOS_PROJECT_ID || "";
const BRANCH = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || process.env.VENTUREOS_SCAN_BRANCH || "";

if (!API_URL) fail("VENTUREOS_INTELLIGENCE_API_URL is required.");
if (!API_KEY) fail("VENTUREOS_INTELLIGENCE_API_KEY is required.");

const baseline = BASELINE ? await readBaseline(BASELINE) : null;
const allFiles = await collectFiles(ROOT);
const files = DIFF_ONLY && baseline?.files?.length ? changedFilesOnly(allFiles, baseline) : allFiles;
if (DIFF_ONLY && baseline?.files?.length && files.length === 0) {
  const noChange = {
    statusCode: 200,
    status: "pass",
    riskScore: null,
    blockingIssues: [],
    summary: { filesScanned: 0, diffOnly: true, message: "No changed files since baseline manifest." },
    ci: { shouldBlockDeployment: false, exitCode: 0, message: "No changed files since baseline manifest." },
    assurance: {
      deterministic: true,
      scanId: baseline.scanId,
      sourceHash: baseline.sourceHash,
      ruleSetHash: baseline.ruleSetHash,
      fileCount: baseline.files.length,
      ruleCount: baseline.ruleSet?.ruleCount,
    },
  };
  console.log(JSON.stringify(noChange, null, 2));
  process.exit(0);
}
const response = await fetch(`${API_URL}/api/scan-repo`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-api-key": API_KEY,
    "x-ventureos-scan-mode": SCAN_MODE,
  },
  body: JSON.stringify({
    repository: process.env.GITHUB_REPOSITORY || path.basename(ROOT),
    projectId: PROJECT_ID || undefined,
    branch: BRANCH || undefined,
    blockThreshold: BLOCK_THRESHOLD,
    scanMode: SCAN_MODE,
    previousAssurance: baseline,
    files,
  }),
});

const result = await response.json().catch(() => ({}));
const summary = {
  statusCode: response.status,
  status: result.status || "error",
  riskScore: result.riskScore,
  scanMode: result.scanMode || SCAN_MODE,
  scanDiff: result.scanDiff,
  trustScoreExplanation: result.trustScoreExplanation,
  changeImpact: result.changeImpact || result.ci?.changeImpact,
  severityStandard: result.severityStandard ? {
    version: result.severityStandard.version,
  } : undefined,
  sbom: result.sbom ? {
    componentCount: result.sbom.componentCount,
    ecosystems: result.sbom.ecosystems,
    hash: result.sbom.hash,
  } : undefined,
  blockingIssues: result.blockingIssues || [],
  summary: result.summary,
  ci: result.ci,
  gate: result.ci?.gate,
  assurance: result.assurance ? {
    deterministic: result.assurance.deterministic,
    scanId: result.assurance.scanId,
    sourceHash: result.assurance.sourceHash,
    ruleSetHash: result.assurance.ruleSetHash,
    fileCount: result.assurance.fileCount,
    ruleCount: result.assurance.ruleSet?.ruleCount,
  } : undefined,
  error: result.error,
};

console.log(JSON.stringify(summary, null, 2));
await writeStepSummary(summary);

if (OUTPUT) {
  await import("node:fs/promises").then(({ writeFile }) =>
    writeFile(OUTPUT, JSON.stringify({ summary, result }, null, 2), "utf8"),
  );
}

if (!response.ok || result.pass === false) process.exit(1);

async function collectFiles(root) {
  const output = [];
  await walk(root, output);
  return output.slice(0, SCAN_MODE === "deep" ? 2500 : 750);
}

async function walk(dir, output) {
  const entries = (await readdir(dir, { withFileTypes: true }))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    const relative = path.relative(ROOT, absolute).replace(/\\/g, "/");
    if (shouldIgnore(relative)) continue;
    if (entry.isDirectory()) {
      await walk(absolute, output);
      continue;
    }
    if (!entry.isFile()) continue;
    const info = await stat(absolute);
    if (info.size > (SCAN_MODE === "deep" ? 500_000 : 200_000)) continue;
    const content = await readFile(absolute, "utf8").catch(() => "");
    if (content) output.push({ path: relative, content });
  }
}

async function readBaseline(filePath) {
  const { readFile } = await import("node:fs/promises");
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    return parsed.result?.assurance || parsed.assurance || parsed.summary?.assurance || null;
  } catch {
    return null;
  }
}

function changedFilesOnly(files, baseline) {
  const previous = new Map((baseline.files || []).map((file) => [file.path, file.sha256]));
  return files.filter((file) => previous.get(file.path.toLowerCase()) !== sha256(file.content));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function writeStepSummary(summary) {
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (!target) return;
  const gate = summary.gate || summary.ci?.gate || {};
  const reasons = Array.isArray(gate.reasons) ? gate.reasons : [];
  const warnings = Array.isArray(gate.warnings) ? gate.warnings : [];
  const impacts = Array.isArray(summary.changeImpact?.impacts) ? summary.changeImpact.impacts : [];
  const lines = [
    "## VentureOS CI Gate",
    "",
    `Status: **${gate.status || summary.status || "unknown"}**`,
    `Readiness: **${summary.riskScore ?? "unavailable"} / 100**`,
    `Scan mode: **${summary.scanMode || SCAN_MODE}**`,
    `Gate: ${summary.ci?.message || gate.summary || "No gate summary available."}`,
    "",
    "### Blocking reasons",
    reasons.length ? reasons.slice(0, 8).map((reason) => `- **${String(reason.severity || "risk").toUpperCase()}** ${reason.title}${reason.filePath ? ` (${reason.filePath})` : ""}`).join("\n") : "- None",
    "",
    "### Review warnings",
    warnings.length ? warnings.slice(0, 5).map((warning) => `- **${String(warning.severity || "review").toUpperCase()}** ${warning.title}`).join("\n") : "- None",
    "",
    "### What changed and why it matters",
    impacts.length ? impacts.slice(0, 6).map((impact) => `- **${String(impact.gateEffect || "INFO")}** ${String(impact.changeType || "CHANGED")} \`${String(impact.path || "unknown")}\`: ${String(impact.reason || "No explanation available.")}`).join("\n") : `- ${summary.changeImpact?.summary || "No baseline manifest was supplied."}`,
    "",
    "### Assurance",
    `- Scan ID: \`${summary.assurance?.scanId || "unavailable"}\``,
    `- Source hash: \`${summary.assurance?.sourceHash ? summary.assurance.sourceHash.slice(0, 12) : "unavailable"}\``,
    `- Rule-set hash: \`${summary.assurance?.ruleSetHash ? summary.assurance.ruleSetHash.slice(0, 12) : "unavailable"}\``,
  ];
  const { appendFile } = await import("node:fs/promises");
  await appendFile(target, `${lines.join("\n")}\n`, "utf8").catch(() => null);
}

function shouldIgnore(relative) {
  return /(^|\/)(node_modules|\.next|dist|build|coverage|\.git|generated-apps|MoneyPilot)\b/.test(relative) ||
    /\.(png|jpg|jpeg|gif|webp|ico|zip|pdf|lockb|exe|dll)$/i.test(relative);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
