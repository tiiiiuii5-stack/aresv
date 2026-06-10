import { createHash } from "node:crypto";

import type { IntelligenceIssue, SecuritySeverity } from "@/lib/services/intelligenceAnalysis";

export type ExternalSourceId =
  | "nvd_cve"
  | "github_advisory"
  | "proprietary_benchmark_dataset"
  | "repository_corpus"
  | "runtime_monitoring_agent"
  | "software_valuation_dataset";

export type ExternalSourceStatus = {
  id: ExternalSourceId;
  label: string;
  status: "available" | "not_configured" | "unavailable" | "not_applicable";
  evidence: string;
  checkedAt: string;
};

export type ExternalVulnerabilityMatch = {
  id: string;
  source: "github_advisory";
  packageName: string;
  packageVersion?: string;
  ecosystem: "npm";
  advisoryId: string;
  cveId?: string | null;
  title: string;
  severity: SecuritySeverity;
  url: string;
  vulnerableVersionRange?: string | null;
  firstPatchedVersion?: string | null;
  cvssScore?: number | null;
  nvd?: {
    cveId: string;
    url: string;
    cvssScore?: number | null;
    severity?: SecuritySeverity | null;
    published?: string | null;
    lastModified?: string | null;
  } | null;
  confidence: number;
};

export type ExternalIntelligenceReport = {
  engine: "ventureos-external-intelligence";
  version: "1.0.0";
  generatedAt: string;
  readOnly: true;
  networkAccess: boolean;
  dependenciesChecked: Array<{ name: string; version?: string }>;
  sources: ExternalSourceStatus[];
  vulnerabilities: ExternalVulnerabilityMatch[];
  findings: IntelligenceIssue[];
  limitations: string[];
};

type Dependency = {
  name: string;
  version?: string;
  ecosystem: "npm";
  packageFilePath?: string;
};

type GitHubAdvisory = {
  ghsa_id?: string;
  cve_id?: string | null;
  html_url?: string;
  summary?: string;
  severity?: string;
  vulnerabilities?: Array<{
    package?: { ecosystem?: string; name?: string };
    vulnerable_version_range?: string | null;
    first_patched_version?: string | null;
  }>;
  cvss?: { score?: number | null };
};

type NvdResponse = {
  vulnerabilities?: Array<{
    cve?: {
      id?: string;
      published?: string;
      lastModified?: string;
      metrics?: {
        cvssMetricV40?: Array<{ cvssData?: { baseScore?: number; baseSeverity?: string } }>;
        cvssMetricV31?: Array<{ cvssData?: { baseScore?: number; baseSeverity?: string } }>;
        cvssMetricV30?: Array<{ cvssData?: { baseScore?: number; baseSeverity?: string } }>;
        cvssMetricV2?: Array<{ cvssData?: { baseScore?: number; baseSeverity?: string } }>;
      };
    };
  }>;
};

const REQUEST_TIMEOUT_MS = 4_500;
const MAX_DEPENDENCIES = 12;
const MAX_ADVISORIES_PER_DEPENDENCY = 5;
const GITHUB_API_VERSION = "2026-03-10";
type NvdMetrics = NonNullable<NonNullable<NvdResponse["vulnerabilities"]>[number]["cve"]>["metrics"];

export async function collectExternalIntelligence(input: {
  source: string;
  framework: string;
  modules: string[];
}): Promise<ExternalIntelligenceReport> {
  const generatedAt = new Date().toISOString();
  const dependencies = extractNpmDependencies(input.source).slice(0, MAX_DEPENDENCIES);
  const baseSources = sourceStatuses(generatedAt);
  const limitations = [
    "External advisory findings are emitted only when a dependency has an exact npm version from package-lock.json or an exact package.json declaration.",
    "NVD is used to enrich CVE identifiers from matched advisories; VentureOS does not infer CPE matches from package names.",
    "Proprietary benchmark, runtime monitoring, repository corpus, and valuation sources are marked unavailable unless explicitly configured.",
  ];

  if (process.env.VENTUREOS_EXTERNAL_INTELLIGENCE === "disabled") {
    return {
      engine: "ventureos-external-intelligence",
      version: "1.0.0",
      generatedAt,
      readOnly: true,
      networkAccess: false,
      dependenciesChecked: dependencies.map(publicDependency),
      sources: baseSources.map((source) =>
        source.id === "github_advisory" || source.id === "nvd_cve"
          ? { ...source, status: "not_configured", evidence: "External advisory enrichment is disabled by VENTUREOS_EXTERNAL_INTELLIGENCE=disabled." }
          : source,
      ),
      vulnerabilities: [],
      findings: [],
      limitations,
    };
  }

  if (dependencies.length === 0) {
    return {
      engine: "ventureos-external-intelligence",
      version: "1.0.0",
      generatedAt,
      readOnly: true,
      networkAccess: false,
      dependenciesChecked: [],
      sources: baseSources.map((source) =>
        source.id === "github_advisory" || source.id === "nvd_cve"
          ? { ...source, status: "not_applicable", evidence: "No package.json dependencies were found in the submitted source evidence." }
          : source,
      ),
      vulnerabilities: [],
      findings: [],
      limitations,
    };
  }

  const advisoryDependencies = dependencies.filter((dependency) => dependency.version);
  if (advisoryDependencies.length === 0) {
    return {
      engine: "ventureos-external-intelligence",
      version: "1.0.0",
      generatedAt,
      readOnly: true,
      networkAccess: false,
      dependenciesChecked: dependencies.map(publicDependency),
      sources: baseSources.map((source) =>
        source.id === "github_advisory" || source.id === "nvd_cve"
          ? { ...source, status: "not_applicable", evidence: "Dependencies were found, but no exact npm dependency versions were available for advisory matching." }
          : source,
      ),
      vulnerabilities: [],
      findings: [],
      limitations,
    };
  }

  const advisoryResults = await Promise.all(advisoryDependencies.map((dependency) => queryGitHubAdvisories(dependency)));
  const advisories = advisoryResults.flatMap((result) => result.matches);
  const cveIds = [...new Set(advisories.map((item) => item.cveId).filter((value): value is string => Boolean(value)))].slice(0, 20);
  const nvdByCve = await queryNvdCves(cveIds);
  const vulnerabilities = advisories.map((match) => ({ ...match, nvd: match.cveId ? nvdByCve.get(match.cveId) || null : null }));
  const failures = [...advisoryResults.flatMap((result) => result.failures), ...(cveIds.length > 0 && nvdByCve.size === 0 ? ["NVD CVE enrichment returned no records or was unavailable."] : [])];
  const sources = sourceStatuses(generatedAt, {
    githubAvailable: advisoryResults.some((result) => result.available),
    nvdAvailable: cveIds.length === 0 || nvdByCve.size > 0,
    nvdNotApplicable: cveIds.length === 0,
    githubEvidence: advisoryResults.some((result) => result.available)
      ? `GitHub Advisory Database checked ${advisoryDependencies.length} exact npm dependenc${advisoryDependencies.length === 1 ? "y" : "ies"}.`
      : "GitHub Advisory Database did not return usable responses during this scan.",
    nvdEvidence: cveIds.length
      ? `NVD CVE API enrichment attempted for ${cveIds.length} CVE identifier${cveIds.length === 1 ? "" : "s"}.`
      : "No CVE identifiers were available for NVD enrichment.",
  });

  return {
    engine: "ventureos-external-intelligence",
    version: "1.0.0",
    generatedAt,
    readOnly: true,
    networkAccess: true,
    dependenciesChecked: dependencies.map(publicDependency),
    sources,
    vulnerabilities,
    findings: vulnerabilities.map(vulnerabilityToIssue),
    limitations: failures.length ? [...limitations, ...failures.slice(0, 5)] : limitations,
  };
}

function extractNpmDependencies(source: string): Dependency[] {
  const segments = sourceSegments(source);
  const exactVersions = exactNpmVersionsFromLockfiles(segments);
  const dependencies: Dependency[] = [];
  for (const segment of segments) {
    if (!/(^|\/)package\.json$/i.test(segment.path)) continue;
    const parsed = parseJsonObject(segment.content);
    const candidates = {
      ...stringRecord(parsed.dependencies),
      ...stringRecord(parsed.devDependencies),
      ...stringRecord(parsed.peerDependencies),
      ...stringRecord(parsed.optionalDependencies),
    };
    for (const [name, version] of Object.entries(candidates)) {
      if (!isSafePackageName(name)) continue;
      dependencies.push({
        name,
        version: exactVersions.get(name) || cleanExactVersion(version),
        ecosystem: "npm",
        packageFilePath: segment.path,
      });
    }
  }

  const byName = new Map<string, Dependency>();
  for (const dependency of dependencies.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!byName.has(dependency.name)) byName.set(dependency.name, dependency);
  }
  return [...byName.values()];
}

function exactNpmVersionsFromLockfiles(segments: Array<{ path: string; content: string }>) {
  const versions = new Map<string, string>();
  for (const segment of segments) {
    if (!/(^|\/)package-lock\.json$/i.test(segment.path)) continue;
    const parsed = parseJsonObject(segment.content);
    const packages = parsed.packages && typeof parsed.packages === "object" && !Array.isArray(parsed.packages)
      ? parsed.packages as Record<string, unknown>
      : {};
    for (const [path, value] of Object.entries(packages)) {
      const packageName = path.replace(/^node_modules\//, "");
      if (!packageName || packageName === path || packageName.includes("node_modules/") || !isSafePackageName(packageName)) continue;
      const item = parseJsonRecord(value);
      const version = typeof item.version === "string" ? cleanExactVersion(item.version) : undefined;
      if (version && !versions.has(packageName)) versions.set(packageName, version);
    }

    const dependencies = parsed.dependencies && typeof parsed.dependencies === "object" && !Array.isArray(parsed.dependencies)
      ? parsed.dependencies as Record<string, unknown>
      : {};
    for (const [packageName, value] of Object.entries(dependencies)) {
      if (!isSafePackageName(packageName)) continue;
      const item = parseJsonRecord(value);
      const version = typeof item.version === "string" ? cleanExactVersion(item.version) : undefined;
      if (version && !versions.has(packageName)) versions.set(packageName, version);
    }
  }
  return versions;
}

async function queryGitHubAdvisories(dependency: Dependency): Promise<{ available: boolean; matches: ExternalVulnerabilityMatch[]; failures: string[] }> {
  const affects = dependency.version ? `${dependency.name}@${dependency.version}` : dependency.name;
  const url = new URL("https://api.github.com/advisories");
  url.searchParams.set("ecosystem", dependency.ecosystem);
  url.searchParams.set("affects", affects);
  url.searchParams.set("per_page", String(MAX_ADVISORIES_PER_DEPENDENCY));
  url.searchParams.set("sort", "updated");
  url.searchParams.set("direction", "desc");

  try {
    const response = await fetchWithTimeout(url.toString(), {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
    });
    if (!response.ok) return { available: false, matches: [], failures: [`GitHub Advisory request failed with HTTP ${response.status}.`] };
    const payload = await response.json() as GitHubAdvisory[];
    const matches = (Array.isArray(payload) ? payload : [])
      .map((advisory) => advisoryToMatch(advisory, dependency))
      .filter((match): match is ExternalVulnerabilityMatch => Boolean(match));
    return { available: true, matches, failures: [] };
  } catch (error) {
    return { available: false, matches: [], failures: [`GitHub Advisory request failed: ${errorMessage(error)}`] };
  }
}

async function queryNvdCves(cveIds: string[]) {
  const output = new Map<string, NonNullable<ExternalVulnerabilityMatch["nvd"]>>();
  if (cveIds.length === 0) return output;
  const url = new URL("https://services.nvd.nist.gov/rest/json/cves/2.0");
  url.searchParams.set("cveIds", cveIds.join(","));
  url.searchParams.set("noRejected", "");

  try {
    const response = await fetchWithTimeout(url.toString(), {
      headers: {
        Accept: "application/json",
        ...(process.env.NVD_API_KEY ? { apiKey: process.env.NVD_API_KEY } : {}),
      },
    });
    if (!response.ok) return output;
    const payload = await response.json() as NvdResponse;
    for (const item of payload.vulnerabilities || []) {
      const cve = item.cve;
      const cveId = cve?.id;
      if (!cveId) continue;
      const metric = firstMetric(cve.metrics);
      output.set(cveId, {
        cveId,
        url: `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cveId)}`,
        cvssScore: metric.score,
        severity: metric.severity,
        published: cve.published || null,
        lastModified: cve.lastModified || null,
      });
    }
  } catch {
    return output;
  }
  return output;
}

function advisoryToMatch(advisory: GitHubAdvisory, dependency: Dependency): ExternalVulnerabilityMatch | null {
  const advisoryId = advisory.ghsa_id || "";
  const vulnerability = (advisory.vulnerabilities || []).find((item) =>
    item.package?.ecosystem?.toLowerCase() === dependency.ecosystem && item.package?.name === dependency.name,
  );
  if (!advisoryId || !vulnerability) return null;
  const cveId = advisory.cve_id || identifierValue(advisory, "CVE");
  const severity = normalizeSeverity(advisory.severity);
  const title = cleanText(advisory.summary || `${dependency.name} security advisory`, 180);
  return {
    id: `external:${hashText([dependency.name, dependency.version || "", advisoryId].join("|")).slice(0, 16)}`,
    source: "github_advisory",
    packageName: dependency.name,
    packageVersion: dependency.version,
    ecosystem: dependency.ecosystem,
    advisoryId,
    cveId,
    title,
    severity,
    url: advisory.html_url || `https://github.com/advisories/${encodeURIComponent(advisoryId)}`,
    vulnerableVersionRange: vulnerability.vulnerable_version_range || null,
    firstPatchedVersion: vulnerability.first_patched_version || null,
    cvssScore: numberOrNull(advisory.cvss?.score),
    confidence: dependency.version ? 0.94 : 0.88,
  };
}

function vulnerabilityToIssue(match: ExternalVulnerabilityMatch): IntelligenceIssue {
  const nvdText = match.nvd ? ` NVD CVE enrichment: ${match.nvd.cveId}${match.nvd.cvssScore ? ` CVSS ${match.nvd.cvssScore}` : ""}.` : "";
  const patchText = match.firstPatchedVersion ? ` Upgrade ${match.packageName} to ${match.firstPatchedVersion} or later.` : ` Upgrade ${match.packageName} to a non-vulnerable version.`;
  return {
    id: match.id,
    severity: match.severity,
    category: "deployment",
    title: `Vulnerable dependency advisory: ${match.packageName}`,
    evidence: `GitHub Advisory Database reports ${match.advisoryId}${match.cveId ? ` (${match.cveId})` : ""} affects npm package ${match.packageName}${match.packageVersion ? `@${match.packageVersion}` : ""}.${match.vulnerableVersionRange ? ` Vulnerable range: ${match.vulnerableVersionRange}.` : ""}${nvdText}`,
    fixSuggestion: `${patchText} Review advisory: ${match.url}`,
    filePath: "package.json",
    explanation: match.title,
    confidenceScore: Math.round(match.confidence * 100),
    reasoning: "Finding is based on an exact npm package advisory match from GitHub Advisory Database, optionally enriched by NVD for matching CVE identifiers.",
  };
}

function sourceStatuses(generatedAt: string, options: {
  githubAvailable?: boolean;
  nvdAvailable?: boolean;
  nvdNotApplicable?: boolean;
  githubEvidence?: string;
  nvdEvidence?: string;
} = {}): ExternalSourceStatus[] {
  return [
    {
      id: "github_advisory",
      label: "GitHub Advisory Database",
      status: options.githubAvailable === undefined ? "available" : options.githubAvailable ? "available" : "unavailable",
      evidence: options.githubEvidence || "Public GitHub global security advisories are queried by exact npm package.",
      checkedAt: generatedAt,
    },
    {
      id: "nvd_cve",
      label: "NVD CVE API",
      status: options.nvdNotApplicable ? "not_applicable" : options.nvdAvailable === undefined ? "available" : options.nvdAvailable ? "available" : "unavailable",
      evidence: options.nvdEvidence || "NVD CVE API is used only for CVE identifiers already present in matched advisories.",
      checkedAt: generatedAt,
    },
    configuredSource("proprietary_benchmark_dataset", "Proprietary benchmark dataset", process.env.VENTUREOS_BENCHMARK_DATASET_URL, generatedAt),
    configuredSource("repository_corpus", "Large repository corpus", process.env.VENTUREOS_REPOSITORY_CORPUS_URL, generatedAt),
    configuredSource("runtime_monitoring_agent", "Runtime monitoring agent", process.env.VENTUREOS_RUNTIME_TELEMETRY_URL, generatedAt),
    configuredSource("software_valuation_dataset", "Software valuation dataset", process.env.VENTUREOS_VALUATION_DATASET_URL, generatedAt),
  ];
}

function configuredSource(id: ExternalSourceId, label: string, value: unknown, checkedAt: string): ExternalSourceStatus {
  const configured = typeof value === "string" && /^https?:\/\//i.test(value.trim());
  return {
    id,
    label,
    status: configured ? "available" : "not_configured",
    evidence: configured ? "A configured source URL is present. This scan records availability only; no claims are emitted without evidence payloads." : "No configured source URL is present, so VentureOS will not claim evidence from this source.",
    checkedAt,
  };
}

function firstMetric(metrics: NvdMetrics | undefined) {
  const candidates = [
    metrics?.cvssMetricV40?.[0]?.cvssData,
    metrics?.cvssMetricV31?.[0]?.cvssData,
    metrics?.cvssMetricV30?.[0]?.cvssData,
    metrics?.cvssMetricV2?.[0]?.cvssData,
  ];
  const metric = candidates.find(Boolean);
  return {
    score: numberOrNull(metric?.baseScore),
    severity: normalizeSeverity(metric?.baseSeverity),
  };
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function sourceSegments(source: string) {
  const markerPattern = /^\/\/ FILE:\s+(.+)$/gm;
  const markers = [...source.matchAll(markerPattern)];
  if (markers.length === 0) return [{ path: "submitted-code", content: source }];

  return markers.map((marker, index) => {
    const markerEnd = (marker.index ?? 0) + marker[0].length;
    const nextMarkerStart = markers[index + 1]?.index ?? source.length;
    return {
      path: marker[1]?.trim() || "unknown-file",
      content: source.slice(markerEnd, nextMarkerStart).replace(/^\r?\n/, ""),
    };
  });
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function stringRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") output[key] = item;
  }
  return output;
}

function isSafePackageName(value: string) {
  return /^(@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i.test(value) && value.length <= 160;
}

function cleanExactVersion(value: string) {
  const clean = value.trim();
  return /^\d+(?:\.\d+){0,3}(?:[-+][A-Za-z0-9_.-]+)?$/.test(clean) ? clean : undefined;
}

function publicDependency(dependency: Dependency) {
  return { name: dependency.name, version: dependency.version };
}

function parseJsonRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function identifierValue(advisory: GitHubAdvisory, type: string) {
  const identifiers = (advisory as GitHubAdvisory & { identifiers?: Array<{ type?: string; value?: string }> }).identifiers || [];
  return identifiers.find((item) => item.type === type)?.value || null;
}

function normalizeSeverity(value: unknown): SecuritySeverity {
  const clean = String(value || "").trim().toLowerCase();
  if (clean === "critical" || clean === "high" || clean === "medium" || clean === "low") return clean;
  return "medium";
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function cleanText(value: string, maxLength: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
