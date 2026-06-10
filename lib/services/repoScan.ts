import { createHash } from "node:crypto";

import { buildActionableFixes } from "@/lib/intelligence/actionable-fix-engine";
import { attachFindingProof } from "@/lib/intelligence/finding-proof";
import { buildAssuranceGate } from "@/lib/scanner/assuranceGate";
import { classifyRepositoryEndpoints, type EndpointClassification } from "@/lib/scanner/endpointClassifier";
import { buildScanAssuranceManifest, compareScanAssuranceManifests, VENTUREOS_REPO_SCAN_RULE_IDS } from "@/lib/scanner/scanAssurance";
import { buildRepositorySbom } from "@/lib/scanner/sbom";
import { enrichFindingsWithEvidence } from "@/lib/services/evidenceEngine";
import { runPostScanFailurePipeline, summarizeFailureReport } from "@/lib/services/failureAnalysisPipeline";
import { ventureOSIntelligenceService, type IntelligenceIssue, type SecuritySeverity, type SeverityBreakdown } from "@/lib/services/intelligenceAnalysis";
import { countCriticalFindings, recordScanHistory } from "@/lib/services/scanHistory";
import { ingestScanEvolutionLoop } from "@/lib/evolution/scanEvolutionLoop";

export type RepoFile = {
  path: string;
  content: string;
};

export type ScanRepoInput = {
  projectId?: string | null;
  repository?: string;
  framework?: string;
  modules?: string[];
  files: RepoFile[];
  blockThreshold?: number;
  scanMode?: "quick" | "deep";
  previousAssurance?: unknown;
};

export type RepoScanIssue = IntelligenceIssue & {
  source: "security" | "failure" | "archive";
  filePath?: string;
  blocking: boolean;
  dedupeGroup?: string;
  endpoint?: string;
  classification?: string;
};

type FailureDetector = {
  id: string;
  severity: SecuritySeverity;
  confidenceScore: number;
  dedupeGroup?: string;
  category: IntelligenceIssue["category"];
  title: string;
  evidence: string;
  fixSuggestion: string;
  blocking: boolean;
  test: (context: RepoScanContext) => boolean;
  filePath?: (context: RepoScanContext) => string | undefined;
};

type RepoScanContext = {
  files: NormalizedRepoFile[];
  combinedSource: string;
  lower: string;
  paths: string[];
  framework: string;
  modules: string[];
  endpointClassifications: EndpointClassification[];
};

type NormalizedRepoFile = RepoFile & {
  lowerPath: string;
  lowerContent: string;
};

const severityWeight = {
  critical: 30,
  high: 18,
  medium: 9,
  low: 4,
} satisfies Record<SecuritySeverity, number>;

const REPO_SCAN_ENGINE_VERSION = "1.1.0";

export class RepoScanService {
  async scan(input: ScanRepoInput) {
    const scanMode = input.scanMode === "deep" ? "deep" : "quick";
    const files = normalizeFiles(input.files, scanMode);
    if (files.length === 0) throw new Error("files must include at least one repository file.");

    const modules = unique([...(input.modules || []), ...inferModules(files)]).sort();
    const framework = String(input.framework || inferFramework(files)).toLowerCase();
    const combinedSource = files.map((file) => `\n// FILE: ${file.path}\n${file.content}`).join("\n");
    const endpointClassifications = classifyRepositoryEndpoints(files);
    const sbom = buildRepositorySbom(files);
    const assurance = buildScanAssuranceManifest({
      engine: "ventureos-repo-scan",
      engineVersion: REPO_SCAN_ENGINE_VERSION,
      repository: input.repository,
      framework,
      modules,
      files,
      ruleIds: [...VENTUREOS_REPO_SCAN_RULE_IDS],
      blockThreshold: input.blockThreshold,
    });
    const scanDiff = compareScanAssuranceManifests(input.previousAssurance, assurance);
    const context: RepoScanContext = {
      files,
      combinedSource,
      lower: combinedSource.toLowerCase(),
      paths: files.map((file) => file.lowerPath),
      framework,
      modules,
      endpointClassifications,
    };

    const security = await ventureOSIntelligenceService.analyze({
      projectId: input.projectId || null,
      recordHistory: false,
      appCode: combinedSource,
      framework,
      modules,
      appMetadata: {
        repositoryHash: input.repository ? hashValue(input.repository) : undefined,
        scanType: "repository",
        scanMode,
        fileCount: files.length,
      },
      validationResults: {
        repositoryScan: "completed",
        structure: summarizeStructure(files),
      },
    });

    const endpointIssues = endpointIssuesFromClassifications(endpointClassifications);
    const failureIssues = [
      ...endpointIssues,
      ...failureDetectors.filter((detector) => detector.test(context)).map((detector): RepoScanIssue => ({
      id: detector.id,
      source: "failure",
      severity: detector.severity,
      category: detector.category,
      title: detector.title,
      evidence: detector.evidence,
      fixSuggestion: detector.fixSuggestion,
      blocking: detector.blocking,
      confidenceScore: detector.confidenceScore,
      dedupeGroup: detector.dedupeGroup,
      filePath: detector.filePath?.(context),
      })),
    ];

    const securityIssues: RepoScanIssue[] = security.vulnerabilities.flatMap((issue) => {
      if (issue.id === "ai-phantom-api") return [];
      return [{
      ...issue,
      source: "security",
      blocking: issue.severity === "critical" || issue.severity === "high",
      filePath: issue.filePath || findLikelyFile(files, issue.id),
      }];
    });

    const issues = normalizeRepoIssues(classifyArchiveIssues(enrichFindingsWithEvidence([...securityIssues, ...failureIssues], combinedSource), files), files);
    const actionableFixes = buildActionableFixes({
      issues,
      files,
      framework,
      packageManager: inferPackageManager(files),
    });
    const blockingIssues = issues.filter((issue) => issue.blocking);
    const finalFailureIssues = issues.filter((issue) => issue.source === "failure");
    const finalSecurityIssues = issues.filter((issue) => issue.source === "security");
    const failureScore = clamp(100 - finalFailureIssues.reduce((sum, issue) => sum + severityWeight[issue.severity], 0));
    const adjustedSecurityScore = clamp(100 - finalSecurityIssues.reduce((sum, issue) => sum + severityWeight[issue.severity], 0));
    const riskScore = Math.min(adjustedSecurityScore, failureScore);
    const blockThreshold = Math.max(0, Math.min(100, Number(input.blockThreshold ?? 75)));
    const initialAssuranceGate = buildAssuranceGate({
      readinessScore: riskScore,
      blockThreshold,
      issues,
      assurance,
      scanDiff,
    });
    const status = initialAssuranceGate.shouldBlock ? "fail" : "pass";
    const severityBreakdown = buildRepoSeverityBreakdown(issues);
    const failurePipeline = runPostScanFailurePipeline({
      scanKind: "repo_scan",
      findings: issues,
      framework,
      modules,
      securityScore: riskScore,
      severityBreakdown,
      source: combinedSource,
      validationResults: {
        repositoryScan: status,
        structure: summarizeStructure(files),
        blockingIssues: blockingIssues.length,
        securityIssues: finalSecurityIssues.length,
        failureIssues: finalFailureIssues.length,
      },
      legacyPredictedFailurePoints: security.predictedFailurePoints,
    });
    const { failureIntelligence, failureReport, predictedFailureScenarios } = failurePipeline;

    const sourceHash = hashValue(combinedSource);
    const scanRefId = security.analysisId || security.telemetry?.analysisResultId || sourceHash;
    const historyRecord = await recordScanHistory({
      projectId: input.projectId || null,
      scanSource: "repo_scan",
      scanRefId,
      readinessScore: riskScore,
      findingsCount: issues.length,
      criticalFindingsCount: countCriticalFindings(issues),
      riskLevel: riskLevelFor(riskScore, blockingIssues),
      framework,
      findings: issues,
      metadata: {
        repositoryHash: input.repository ? hashValue(input.repository) : undefined,
        repositorySourceHash: sourceHash,
        sourceHash,
        sourceLength: combinedSource.length,
        codeSnapshot: codeSnapshotForFiles(files, combinedSource, sourceHash),
        scanMode,
        sbom: {
          componentCount: sbom.componentCount,
          ecosystems: sbom.ecosystems,
          hash: sbom.hash,
        },
        scanDiff,
        assuranceGate: initialAssuranceGate,
        filesScanned: files.length,
        blockingIssues: blockingIssues.length,
        securityIssues: finalSecurityIssues.length,
        failureIssues: finalFailureIssues.length,
        failureReport: summarizeFailureReport(failureReport),
        scanAssurance: assurance,
      },
    });
    const assuranceGate = buildAssuranceGate({
      readinessScore: riskScore,
      blockThreshold,
      issues,
      assurance,
      scanDiff,
      regressionReport: historyRecord.regressionReport,
    });

    await ingestScanEvolutionLoop({
      projectId: input.projectId || null,
      scanKind: "repo_scan",
      scanRefId,
      framework,
      modules,
      readinessScore: riskScore,
      riskLevel: riskLevelFor(riskScore, blockingIssues),
      severityBreakdown,
      issues,
      failureReport,
      metadata: {
        repositoryHash: input.repository ? hashValue(input.repository) : undefined,
        repositorySourceHash: sourceHash,
        historyStored: Boolean(historyRecord.stored),
        filesScanned: files.length,
        scanAssurance: {
          scanId: assurance.scanId,
          sourceHash: assurance.sourceHash,
          ruleSetHash: assurance.ruleSetHash,
          deterministic: assurance.deterministic,
        },
        scanDiff,
        assuranceGate: {
          status: assuranceGate.status,
          shouldBlock: assuranceGate.shouldBlock,
          reasons: assuranceGate.reasons.slice(0, 5).map((reason) => ({
            id: reason.id,
            title: reason.title,
            severity: reason.severity,
          })),
        },
      },
    }).catch(() => null);

    return {
      status: assuranceGate.shouldBlock ? "fail" : "pass",
      pass: !assuranceGate.shouldBlock,
      riskScore,
      blockThreshold,
      securityScore: adjustedSecurityScore,
      failureScore,
      riskLevel: riskLevelFor(riskScore, blockingIssues),
      repository: input.repository ? hashValue(input.repository) : null,
      scanMode,
      summary: {
        framework,
        modules,
        filesScanned: files.length,
        endpointClassifications: summarizeEndpointClassifications(endpointClassifications),
        sbom: {
          componentCount: sbom.componentCount,
          ecosystems: sbom.ecosystems,
          hash: sbom.hash,
        },
        blockingIssues: blockingIssues.length,
        securityIssues: finalSecurityIssues.length,
        failureIssues: finalFailureIssues.length,
        structure: summarizeStructure(files),
      },
      blockingIssues,
      issues,
      actionableFixes,
      predictedFailureScenarios,
      failureIntelligence,
      failureReport,
      launchReadinessScore: failureReport.launchReadinessScore,
      launchVerdict: failureReport.launchVerdict,
      regressionReport: historyRecord.regressionReport,
      assurance,
      scanDiff,
      assuranceGate,
      trustScoreExplanation: assuranceGate.trustScoreExplanation,
      severityStandard: assuranceGate.severityStandard,
      changeImpact: assuranceGate.changeImpact,
      sbom,
      recommendations: unique([...security.recommendations, ...finalFailureIssues.map((issue) => issue.fixSuggestion)]),
      ci: {
        shouldBlockDeployment: assuranceGate.shouldBlock,
        exitCode: assuranceGate.exitCode,
        message: assuranceGate.summary,
        gate: assuranceGate,
        trustScoreExplanation: assuranceGate.trustScoreExplanation,
        severityStandard: assuranceGate.severityStandard,
        changeImpact: assuranceGate.changeImpact,
        reproducibleCommand: assurance.reproducibility.command,
        scanId: assurance.scanId,
        sourceHash: assurance.sourceHash,
        ruleSetHash: assurance.ruleSetHash,
        scanMode,
        diff: scanDiff,
      },
      telemetry: security.telemetry,
    };
  }
}

export const repoScanService = new RepoScanService();

function normalizeFiles(files: RepoFile[], scanMode: "quick" | "deep") {
  const maxFiles = scanMode === "deep" ? 2_500 : 750;
  const maxFileChars = scanMode === "deep" ? 500_000 : 200_000;
  return files
    .filter((file) => file && typeof file.path === "string" && typeof file.content === "string")
    .filter((file) => !ignoredPath(file.path))
    .slice(0, maxFiles)
    .map((file) => ({
      path: file.path.replace(/\\/g, "/"),
      content: file.content.slice(0, maxFileChars),
      lowerPath: file.path.replace(/\\/g, "/").toLowerCase(),
      lowerContent: file.content.toLowerCase(),
    }))
    .sort((a, b) => a.lowerPath.localeCompare(b.lowerPath));
}

function ignoredPath(path: string) {
  return /(^|\/)(node_modules|\.next|dist|build|coverage|\.git|generated-apps)\//i.test(path) || /\.(png|jpg|jpeg|gif|webp|ico|zip|pdf|lockb)$/i.test(path);
}

function inferFramework(files: NormalizedRepoFile[]) {
  const packageJson = parsePackageJson(files);
  const deps = dependencyNames(packageJson);
  if (deps.includes("next")) return "nextjs";
  if (deps.includes("@remix-run/react")) return "remix";
  if (deps.includes("vite")) return "vite";
  if (deps.includes("express")) return "express";
  if (deps.includes("fastify")) return "fastify";
  if (files.some((file) => file.lowerPath.startsWith("app/") || file.lowerPath.includes("/app/"))) return "nextjs";
  return "unknown";
}

function inferModules(files: NormalizedRepoFile[]) {
  const packageJson = parsePackageJson(files);
  return dependencyNames(packageJson).filter((name) =>
    ["next", "react", "vite", "stripe", "prisma", "drizzle-orm", "supabase", "@supabase/supabase-js", "redis", "bullmq", "next-auth", "@clerk/nextjs"].includes(name),
  );
}

function inferPackageManager(files: NormalizedRepoFile[]) {
  if (files.some((file) => /(^|\/)pnpm-lock\.yaml$/i.test(file.lowerPath))) return "pnpm";
  if (files.some((file) => /(^|\/)yarn\.lock$/i.test(file.lowerPath))) return "yarn";
  if (files.some((file) => /(^|\/)bun\.lockb?$/i.test(file.lowerPath))) return "bun";
  return "npm";
}

function parsePackageJson(files: NormalizedRepoFile[]) {
  const file = files.find((item) => item.lowerPath.endsWith("package.json"));
  if (!file) return null;
  try {
    return JSON.parse(file.content) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  } catch {
    return null;
  }
}

function dependencyNames(packageJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null) {
  return Object.keys({ ...(packageJson?.dependencies || {}), ...(packageJson?.devDependencies || {}) });
}

function summarizeStructure(files: NormalizedRepoFile[]) {
  return {
    hasPackageJson: files.some((file) => file.lowerPath.endsWith("package.json")),
    hasLockfile: files.some((file) => /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(file.lowerPath)),
    hasCi: hasCiConfig(files),
    hasEnvExample: files.some((file) => /(^|\/)\.env\.example$/.test(file.lowerPath)),
    apiRoutes: files.filter((file) => /(^|\/)(app\/api|pages\/api)\//.test(file.lowerPath)).length,
    testFiles: files.filter((file) => /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file.lowerPath)).length,
    migrationFiles: files.filter((file) => /(^|\/)(prisma\/migrations|migrations)\//.test(file.lowerPath)).length,
  };
}

function hasPackageJson(files: NormalizedRepoFile[]) {
  return files.some((file) => file.lowerPath.endsWith("package.json"));
}

function hasCiConfig(files: NormalizedRepoFile[]) {
  return files.some((file) =>
    file.lowerPath.startsWith(".github/workflows/") ||
    /(^|\/)(\.gitlab-ci\.yml|azure-pipelines\.yml|bitbucket-pipelines\.yml|Jenkinsfile)$/i.test(file.path) ||
    file.lowerPath.startsWith(".circleci/") ||
    file.lowerPath.startsWith(".buildkite/"),
  );
}

function isProductionSourceFile(file: NormalizedRepoFile) {
  return (
    !/(^|\/)(__tests__|tests?|spec|fixtures?|mocks?|docs?|examples?)\//.test(file.lowerPath) &&
    !/(^|\/)(sample-report|demo|fixture|fixtures|mock|mocks|examples?)\//.test(file.lowerPath) &&
    !isArchivePath(file.lowerPath) &&
    !/\.(test|spec|stories)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file.lowerPath) &&
    !/(^|\/)(readme|changelog|license)(\.[a-z0-9]+)?$/i.test(file.lowerPath)
  );
}

function isProductionCodeFile(file: NormalizedRepoFile) {
  return isProductionSourceFile(file) && /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file.lowerPath);
}

function productionCodeFiles(files: NormalizedRepoFile[]) {
  return files.filter(isProductionCodeFile);
}

function hasRuntimeSurface(files: NormalizedRepoFile[]) {
  const structure = summarizeStructure(files);
  return (
    structure.apiRoutes > 0 ||
    productionCodeFiles(files).some((file) =>
      /(^|\/)(server|backend|src|app|pages|lib)\//.test(file.lowerPath) &&
      /(export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)|createServer|express\(|fastify\(|prisma\.|stripe\.|supabase\.)/i.test(file.content),
    )
  );
}

function hasTestableRuntimeSurface(files: NormalizedRepoFile[]) {
  return productionCodeFiles(files).some((file) =>
    /(export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)|prisma\.[a-zA-Z0-9_]+\.(create|update|upsert|delete|deleteMany|updateMany)|stripe\.|supabase\.[\s\S]{0,120}\.(insert|update|upsert|delete)\()/i.test(file.content),
  );
}

function usesSensitiveEnv(files: NormalizedRepoFile[]) {
  return productionCodeFiles(files).some((file) =>
    /process\.env\.(DATABASE_URL|[A-Z0-9_]*(SECRET|TOKEN|PRIVATE|SERVICE_ROLE|STRIPE|SUPABASE|OPENAI|GEMINI|ANTHROPIC|KEY)[A-Z0-9_]*)/i.test(file.content),
  );
}

function hasHealthRoute(paths: string[]) {
  return paths.some((path) => /api\/health\/route\.(ts|js)|pages\/api\/health\.(ts|js)|api\/health\.(ts|js)/.test(path));
}

function hasPrismaModelsWithoutMigrations(files: NormalizedRepoFile[]) {
  const schema = files.find((file) => file.lowerPath.endsWith("prisma/schema.prisma"));
  return Boolean(schema && /\bmodel\s+[A-Z][A-Za-z0-9_]*/.test(schema.content) && !files.some((file) => file.lowerPath.includes("prisma/migrations/")));
}

function hasUnsafeSqlConstruction(file: NormalizedRepoFile) {
  return (
    /\$(?:queryRawUnsafe|executeRawUnsafe)\s*\(\s*`[^`]*\$\{/i.test(file.content) ||
    /\$(?:queryRawUnsafe|executeRawUnsafe)\s*\(\s*["'][^"']*["']\s*\+/i.test(file.content) ||
    /\b(?:query|execute)\s*\([^)]*\+[^)]*\)/i.test(file.content)
  );
}

function hasHardcodedLocalhostRuntime(file: NormalizedRepoFile) {
  if (!/https?:\/\/(localhost|127\.0\.0\.1)/i.test(file.content)) return false;
  if (!/(fetch|axios|API|BASE_URL|BACKEND_URL|WEBHOOK|CALLBACK|PUBLIC_URL|ORIGIN|origin)/i.test(file.content)) return false;
  if (/production[\s\S]{0,240}(localhost|127\.0\.0\.1)|(localhost|127\.0\.0\.1)[\s\S]{0,240}production|NODE_ENV\s*={0,2}={0,1}\s*["']production["']/i.test(file.content)) return false;
  return true;
}

function findLikelyFile(files: NormalizedRepoFile[], issueId: string) {
  if (issueId.includes("sql")) return productionCodeFiles(files).find(hasUnsafeSqlConstruction)?.path;
  if (issueId.includes("secret")) return files.find((file) => /(sk_live_|sk_test_|whsec_|service_role|DATABASE_URL\s*=)/i.test(file.content))?.path;
  if (issueId.includes("webhook")) return files.find((file) => /webhook/i.test(file.content))?.path;
  if (issueId.includes("admin")) return files.find((file) => /admin|deleteUser|setRole|impersonate/i.test(file.content))?.path;
  if (issueId.includes("deployment")) return files.find((file) => hasHardcodedLocalhostRuntime(file) || /fs\.(writeFile|writeFileSync|appendFile|mkdirSync)/.test(file.content))?.path;
  return undefined;
}

function endpointIssuesFromClassifications(classifications: EndpointClassification[]): RepoScanIssue[] {
  return classifications
    .filter((classification) => classification.status === "missing_internal_api" || classification.status === "missing_env_fallback")
    .map((classification): RepoScanIssue => ({
      id: classification.status === "missing_internal_api" ? "repo-missing-internal-api-route" : "repo-env-localhost-fallback",
      source: "failure",
      severity: classification.severity,
      category: classification.status === "missing_internal_api" ? "api" : "deployment",
      title: classification.status === "missing_internal_api" ? "Missing internal API route" : "Environment variable falls back to localhost",
      evidence: classification.evidence,
      fixSuggestion: classification.fixSuggestion,
      blocking: classification.blocking,
      confidenceScore: classification.status === "missing_internal_api" ? 92 : 94,
      dedupeGroup: `${classification.status}:${classification.endpoint}`,
      filePath: classification.filePath,
      endpoint: classification.endpoint,
      classification: classification.status,
    }));
}

function summarizeEndpointClassifications(classifications: EndpointClassification[]) {
  return {
    total: classifications.length,
    missingInternalApi: classifications.filter((item) => item.status === "missing_internal_api").length,
    implementedInternalApi: classifications.filter((item) => item.status === "implemented").length,
    thirdPartyEndpoints: classifications.filter((item) => item.status === "external_reference").length,
    localhostDependencies: classifications.filter((item) => item.status === "localhost_runtime_dependency").length,
    envFallbacks: classifications.filter((item) => item.status === "missing_env_fallback").length,
    examples: classifications.slice(0, 10),
  };
}

function classifyArchiveIssues(issues: RepoScanIssue[], files: NormalizedRepoFile[]): RepoScanIssue[] {
  return issues.map((issue) => {
    const filePath = issue.filePath || "";
    if (!isArchivePath(filePath)) return issue;

    const referenced = isArchiveFileReferenced(filePath, files);
    return {
      ...issue,
      source: "archive",
      severity: referenced ? issue.severity : "low",
      blocking: referenced && issue.blocking,
      title: referenced ? `Referenced archive/legacy code risk: ${issue.title}` : `Archive/legacy code risk: ${issue.title}`,
      evidence: referenced
        ? `${issue.evidence} The affected file is inside an archive/legacy path and appears to be referenced by active source.`
        : `${issue.evidence} The affected file is inside an archive/legacy path and was not found referenced by active source.`,
      fixSuggestion: referenced
        ? `${issue.fixSuggestion} Also move referenced archive/legacy code into an active maintained module or remove the active reference.`
        : "Keep archive/legacy code out of production scans and deployment bundles, or delete it when no longer needed.",
      classification: referenced ? "referenced_archive_code" : "unreferenced_archive_code",
      confidenceScore: referenced ? issue.confidenceScore : Math.min(issue.confidenceScore ?? 80, 82),
    };
  });
}

function isArchivePath(value: string) {
  return /(^|\/)(archive|archives|legacy|old|backup|backups|deprecated)(\/|$)/i.test(value.replace(/\\/g, "/"));
}

function isArchiveFileReferenced(filePath: string, files: NormalizedRepoFile[]) {
  const normalized = filePath.replace(/\\/g, "/");
  const base = normalized.split("/").pop() || normalized;
  const withoutExt = base.replace(/\.[a-z0-9]+$/i, "");
  return productionCodeFiles(files).some((file) => {
    if (file.path === normalized) return false;
    return file.content.includes(normalized) || file.content.includes(base) || (withoutExt.length > 4 && file.content.includes(withoutExt));
  });
}

function riskLevelFor(score: number, blockingIssues: RepoScanIssue[]) {
  if (blockingIssues.some((issue) => issue.severity === "critical") || score < 45) return "critical";
  if (blockingIssues.some((issue) => issue.severity === "high") || score < 70) return "high";
  if (score < 85) return "medium";
  return "low";
}

function normalizeRepoIssues(issues: RepoScanIssue[], files: NormalizedRepoFile[]): RepoScanIssue[] {
  const bestByKey = new Map<string, RepoScanIssue>();

  for (const issue of issues.map(calibrateRepoIssue).filter((item) => (item.confidenceScore ?? 0) >= 75)) {
    const key = repoIssueKey(issue);
    const existing = bestByKey.get(key);
    if (!existing || repoIssueRank(issue) > repoIssueRank(existing)) {
      bestByKey.set(key, issue);
    }
  }

  return [...bestByKey.values()]
    .sort((a, b) => repoIssueRank(b) - repoIssueRank(a))
    .map(({ dedupeGroup: _dedupeGroup, ...issue }) => attachFindingProof(issue, {
      files: files.map((file) => ({ path: file.path, content: file.content })),
      scanner: "ventureos-repo-scan",
    }));
}

function buildRepoSeverityBreakdown(issues: RepoScanIssue[]): SeverityBreakdown {
  return issues.reduce<SeverityBreakdown>(
    (breakdown, issue) => {
      breakdown[issue.severity] += 1;
      return breakdown;
    },
    { low: 0, medium: 0, high: 0, critical: 0 },
  );
}

function calibrateRepoIssue(issue: RepoScanIssue): RepoScanIssue {
  const confidenceScore = clamp(Math.round(issue.confidenceScore ?? 75));
  const severity =
    confidenceScore < 80 && issue.severity === "high"
      ? "medium"
      : confidenceScore < 86 && issue.severity === "critical"
        ? "high"
        : issue.severity;

  return {
    ...issue,
    severity,
    confidenceScore,
    blocking: issue.blocking && (severity === "critical" || severity === "high"),
  };
}

function repoIssueKey(issue: RepoScanIssue) {
  if (issue.dedupeGroup) return `${issue.source}:${issue.dedupeGroup}:${issue.filePath || issue.location?.line || "repo"}`;
  return `${issue.source}:${issue.id}:${issue.filePath || issue.location?.line || "repo"}`;
}

function repoIssueRank(issue: RepoScanIssue) {
  return repoSeverityRank(issue.severity) * 1000 + (issue.confidenceScore ?? 0);
}

function repoSeverityRank(severity: SecuritySeverity) {
  return severity === "critical" ? 4 : severity === "high" ? 3 : severity === "medium" ? 2 : 1;
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function codeSnapshotForFiles(files: NormalizedRepoFile[], combinedSource: string, sourceHash: string) {
  return {
    sourceHash,
    sourceLength: combinedSource.length,
    fileHashes: Object.fromEntries(files.slice(0, 500).map((file) => [file.lowerPath, hashValue(file.content)])),
  };
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

const failureDetectors: FailureDetector[] = [
  {
    id: "repo-missing-lockfile",
    severity: "high",
    confidenceScore: 95,
    dedupeGroup: "dependency-lockfile",
    category: "deployment",
    title: "Missing dependency lockfile",
    evidence: "No package-lock.json, pnpm-lock.yaml, or yarn.lock was found.",
    fixSuggestion: "Commit a package manager lockfile so CI/CD builds install deterministic dependency versions.",
    blocking: true,
    test: ({ files }) => hasPackageJson(files) && !summarizeStructure(files).hasLockfile,
  },
  {
    id: "repo-missing-ci",
    severity: "low",
    confidenceScore: 76,
    dedupeGroup: "ci-coverage",
    category: "deployment",
    title: "No CI workflow detected",
    evidence: "No common CI pipeline configuration was found for a repository with runtime code.",
    fixSuggestion: "Add a GitHub Actions workflow that runs install, type-check, lint, build, and VentureOS repo scanning before deployment.",
    blocking: false,
    test: ({ files }) => hasPackageJson(files) && hasRuntimeSurface(files) && !summarizeStructure(files).hasCi,
  },
  {
    id: "repo-missing-tests",
    severity: "medium",
    confidenceScore: 76,
    dedupeGroup: "test-coverage",
    category: "deployment",
    title: "No automated tests detected",
    evidence: "Runtime mutation or integration code was found, but no test/spec files were detected.",
    fixSuggestion: "Add unit or integration tests for critical API, auth, payment, and data mutation flows.",
    blocking: false,
    test: ({ files }) => hasPackageJson(files) && hasTestableRuntimeSurface(files) && summarizeStructure(files).testFiles === 0,
  },
  {
    id: "repo-missing-env-template",
    severity: "medium",
    confidenceScore: 84,
    dedupeGroup: "env-readiness",
    category: "deployment",
    title: "Missing environment variable template",
    evidence: "Sensitive environment variables are used, but no .env.example file was found.",
    fixSuggestion: "Add .env.example with required variable names and no secret values so deployments fail less often.",
    blocking: false,
    test: ({ files }) => usesSensitiveEnv(files) && !summarizeStructure(files).hasEnvExample,
  },
  {
    id: "repo-serverless-localhost",
    severity: "high",
    confidenceScore: 92,
    dedupeGroup: "localhost-runtime",
    category: "deployment",
    title: "Production code depends on localhost",
    evidence: "Detected localhost URLs in repository source.",
    fixSuggestion: "Replace localhost URLs with environment-driven production URLs and block localhost in production.",
    blocking: true,
    test: ({ files }) => productionCodeFiles(files).some(hasHardcodedLocalhostRuntime),
    filePath: ({ files }) => productionCodeFiles(files).find(hasHardcodedLocalhostRuntime)?.path,
  },
  {
    id: "repo-serverless-file-writes",
    severity: "high",
    confidenceScore: 90,
    dedupeGroup: "serverless-file-write",
    category: "deployment",
    title: "Serverless route writes to local filesystem",
    evidence: "Detected fs.writeFile/writeFileSync in API/server code.",
    fixSuggestion: "Move durable writes to Blob storage, database records, or an external object store instead of local serverless disk.",
    blocking: true,
    test: ({ files }) => productionCodeFiles(files).some((file) => /(app\/api|pages\/api|server|route\.ts)/.test(file.lowerPath) && /fs\.(writeFile|writeFileSync|appendFile|mkdirSync)/.test(file.content)),
    filePath: ({ files }) => productionCodeFiles(files).find((file) => /(app\/api|pages\/api|server|route\.ts)/.test(file.lowerPath) && /fs\.(writeFile|writeFileSync|appendFile|mkdirSync)/.test(file.content))?.path,
  },
  {
    id: "repo-missing-health-route",
    severity: "low",
    confidenceScore: 75,
    dedupeGroup: "health-route",
    category: "api",
    title: "Missing health endpoint",
    evidence: "Multiple API routes were detected, but no health route was found.",
    fixSuggestion: "Add /api/health so CI/CD and hosting platforms can verify deployments before promotion.",
    blocking: false,
    test: ({ files, paths }) => hasPackageJson(files) && summarizeStructure(files).apiRoutes >= 3 && !hasHealthRoute(paths),
  },
  {
    id: "repo-migrations-missing",
    severity: "high",
    confidenceScore: 90,
    dedupeGroup: "db-migrations",
    category: "db",
    title: "Database schema has no migrations",
    evidence: "Prisma schema detected without migration files.",
    fixSuggestion: "Generate and commit database migrations, then run them in CI/CD before deployment.",
    blocking: true,
    test: ({ files }) => hasPrismaModelsWithoutMigrations(files),
  },
];
