import { createHash } from "node:crypto";

export type ScanAssuranceFile = {
  path: string;
  sha256: string;
  bytes: number;
};

export type ScanAssuranceInput = {
  engine: "ventureos-repo-scan" | "ventureos-ai-app-scanner";
  engineVersion: string;
  repository?: string | null;
  framework: string;
  modules: string[];
  files: Array<{ path: string; content: string }>;
  ruleIds: string[];
  blockThreshold?: number;
};

export type ScanAssuranceManifest = {
  deterministic: true;
  method: "static-analysis";
  engine: ScanAssuranceInput["engine"];
  engineVersion: string;
  generatedAt: string;
  scanId: string;
  sourceHash: string;
  ruleSetHash: string;
  repositoryHash: string | null;
  framework: string;
  modules: string[];
  fileCount: number;
  totalBytes: number;
  files: ScanAssuranceFile[];
  ruleSet: {
    ruleCount: number;
    rules: string[];
  };
  reproducibility: {
    inputsRequired: string[];
    command: string;
    notes: string[];
  };
};

export type ScanAssuranceDiff = {
  baselineAvailable: boolean;
  changedFiles: string[];
  addedFiles: string[];
  removedFiles: string[];
  unchangedFiles: number;
  sourceHashChanged: boolean;
  ruleSetHashChanged: boolean;
};

export const VENTUREOS_REPO_SCAN_RULE_IDS = [
  "security.exposed-secret-literal",
  "security.frontend-secret-exposure",
  "security.ai-fake-auth-flow",
  "security.ai-ui-only-protection",
  "security.ai-phantom-api",
  "security.ai-fake-persistence",
  "security.ai-no-op-action",
  "security.ai-missing-backend-implementation",
  "security.ai-broken-deployment-assumption",
  "security.unsafe-sql-query",
  "security.missing-auth-middleware",
  "security.insecure-mutating-api-route",
  "security.open-admin-endpoint",
  "security.weak-authorization-pattern",
  "security.webhook-without-signature-validation",
  "security.cors-wildcard",
  "security.missing-rate-limit",
  "security.dangerous-code-execution",
  "security.missing-env-validation",
  "repository.missing-internal-api-route",
  "repository.env-localhost-fallback",
  "repository.missing-lockfile",
  "repository.missing-ci",
  "repository.missing-tests",
  "repository.missing-env-template",
  "repository.serverless-localhost",
  "repository.serverless-file-writes",
  "repository.missing-health-route",
  "repository.migrations-missing",
] as const;

export function buildScanAssuranceManifest(input: ScanAssuranceInput): ScanAssuranceManifest {
  const files = normalizedFiles(input.files);
  const modules = normalizedStrings(input.modules);
  const ruleIds = normalizedStrings(input.ruleIds);
  const sourceHash = hashJson(files.map((file) => [file.path, file.sha256, file.bytes]));
  const ruleSetHash = hashJson({ engine: input.engine, engineVersion: input.engineVersion, rules: ruleIds });
  const repositoryHash = input.repository ? sha256(input.repository.trim().toLowerCase()) : null;
  const framework = input.framework.trim().toLowerCase() || "unknown";
  const scanId = hashJson({
    engine: input.engine,
    engineVersion: input.engineVersion,
    repositoryHash,
    sourceHash,
    ruleSetHash,
    framework,
    modules,
    blockThreshold: boundedThreshold(input.blockThreshold),
  }).slice(0, 32);

  return {
    deterministic: true,
    method: "static-analysis",
    engine: input.engine,
    engineVersion: input.engineVersion,
    generatedAt: new Date().toISOString(),
    scanId,
    sourceHash,
    ruleSetHash,
    repositoryHash,
    framework,
    modules,
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files,
    ruleSet: {
      ruleCount: ruleIds.length,
      rules: ruleIds,
    },
    reproducibility: {
      inputsRequired: [
        "Same repository ref or identical local file tree",
        "Same VentureOS scanner version",
        "Same deterministic rule set hash",
        "Same block threshold",
      ],
      command: "VENTUREOS_INTELLIGENCE_API_URL=https://your-ventureos-host VENTUREOS_INTELLIGENCE_API_KEY=$VENTUREOS_API_KEY node scripts/ventureos-scan-repo.mjs",
      notes: [
        "The scanner executes static analysis only; repository code is not executed.",
        "File hashes are SHA-256 over the exact submitted file contents.",
        "Rule-set hash changes when deterministic rule identifiers or engine version change.",
      ],
    },
  };
}

export function compareScanAssuranceManifests(previous: unknown, current: ScanAssuranceManifest): ScanAssuranceDiff {
  const baseline = parseAssurance(previous);
  if (!baseline) {
    return {
      baselineAvailable: false,
      changedFiles: [],
      addedFiles: [],
      removedFiles: [],
      unchangedFiles: 0,
      sourceHashChanged: true,
      ruleSetHashChanged: true,
    };
  }

  const previousFiles = new Map(baseline.files.map((file) => [file.path, file.sha256]));
  const currentFiles = new Map(current.files.map((file) => [file.path, file.sha256]));
  const changedFiles: string[] = [];
  const addedFiles: string[] = [];
  const removedFiles: string[] = [];
  let unchangedFiles = 0;

  for (const [path, hash] of currentFiles) {
    if (!previousFiles.has(path)) {
      addedFiles.push(path);
    } else if (previousFiles.get(path) !== hash) {
      changedFiles.push(path);
    } else {
      unchangedFiles += 1;
    }
  }

  for (const path of previousFiles.keys()) {
    if (!currentFiles.has(path)) removedFiles.push(path);
  }

  return {
    baselineAvailable: true,
    changedFiles: changedFiles.sort(),
    addedFiles: addedFiles.sort(),
    removedFiles: removedFiles.sort(),
    unchangedFiles,
    sourceHashChanged: baseline.sourceHash !== current.sourceHash,
    ruleSetHashChanged: baseline.ruleSetHash !== current.ruleSetHash,
  };
}

function normalizedFiles(files: Array<{ path: string; content: string }>): ScanAssuranceFile[] {
  return files
    .filter((file) => file && typeof file.path === "string" && typeof file.content === "string")
    .map((file) => ({
      path: normalizePath(file.path),
      sha256: sha256(file.content),
      bytes: Buffer.byteLength(file.content, "utf8"),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function normalizedStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))].sort();
}

function normalizePath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\/+/, "").trim().toLowerCase();
}

function boundedThreshold(value: unknown) {
  const number = Number(value ?? 75);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 75;
}

function hashJson(value: unknown) {
  return sha256(JSON.stringify(value));
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function parseAssurance(value: unknown): ScanAssuranceManifest | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<ScanAssuranceManifest>;
  if (record.deterministic !== true || !record.sourceHash || !record.ruleSetHash || !Array.isArray(record.files)) return null;
  const files = record.files.filter((file): file is ScanAssuranceFile =>
    Boolean(file && typeof file.path === "string" && typeof file.sha256 === "string"));
  return {
    deterministic: true,
    method: "static-analysis",
    engine: record.engine || "ventureos-repo-scan",
    engineVersion: record.engineVersion || "unknown",
    generatedAt: record.generatedAt || new Date(0).toISOString(),
    scanId: record.scanId || "",
    sourceHash: record.sourceHash,
    ruleSetHash: record.ruleSetHash,
    repositoryHash: record.repositoryHash || null,
    framework: record.framework || "unknown",
    modules: Array.isArray(record.modules) ? record.modules : [],
    fileCount: files.length,
    totalBytes: Number(record.totalBytes || 0),
    files,
    ruleSet: record.ruleSet || { ruleCount: 0, rules: [] },
    reproducibility: record.reproducibility || { inputsRequired: [], command: "", notes: [] },
  };
}
