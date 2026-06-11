import { createHash, randomUUID } from "node:crypto";

import { tryDatabase } from "@/lib/prisma";
import { buildActionableFixes, type ActionableFix } from "@/lib/intelligence/actionable-fix-engine";
import { collectExternalIntelligence, type ExternalIntelligenceReport } from "@/lib/intelligence/external-intelligence";
import type { FindingFileEvidence, FindingProofBundle, ReproducibleProof } from "@/lib/intelligence/finding-proof";
import { attachFindingProof } from "@/lib/intelligence/finding-proof";
import type { RegressionReport } from "@/lib/intelligence/regression-detection";
import type { ProductionReadinessScoreReport } from "@/lib/intelligence/readiness-score";
import type { LaunchVerdict } from "@/lib/intelligence/launch-verdict";
import { enrichFindingsWithEvidence, type EvidenceLocation } from "@/lib/services/evidenceEngine";
import { runPostScanFailurePipeline, summarizeFailureReport, type FailureReport } from "@/lib/services/failureAnalysisPipeline";
import { type FailureIntelligenceReport, type FailurePrediction } from "@/lib/services/failureIntelligence";
import { recordAppTelemetry, type RepairAttemptInput } from "@/lib/services/appTelemetry";
import { sanitizeMetadata } from "@/lib/services/platformSupport";
import { countCriticalFindings, recordScanHistory } from "@/lib/services/scanHistory";
import { ingestScanEvolutionLoop } from "@/lib/evolution/scanEvolutionLoop";
import { sbomExternalEvidenceSource, type SoftwareBillOfMaterialsEvidence } from "@/lib/sbom/software-bom";
import {
  apiDynamicPrefixMatchesRoute,
  apiPathMatchesRoute as sharedApiPathMatchesRoute,
  apiRouteFromFilePath,
  isDynamicApiExpression,
} from "@/lib/scanner/api-route-matcher";

export type AnalyzeAppInput = {
  projectId?: string | null;
  persist?: boolean;
  recordHistory?: boolean;
  appCode: string | Record<string, unknown> | unknown[];
  framework: string;
  modules: string[];
  appMetadata?: Record<string, unknown>;
  validationResults?: Record<string, unknown>;
  failureEvents?: unknown[];
  repairAttempts?: RepairAttemptInput[];
};

export type SecuritySeverity = "critical" | "high" | "medium" | "low";
export type SecurityCategory = "auth" | "api" | "db" | "deployment" | "frontend";
export type SeverityBreakdown = Record<SecuritySeverity, number>;

export type IntelligenceIssue = {
  id: string;
  severity: SecuritySeverity;
  category: SecurityCategory;
  title: string;
  evidence: string;
  fixSuggestion: string;
  filePath?: string;
  location?: EvidenceLocation;
  codeSnippet?: string;
  explanation?: string;
  confidenceScore?: number;
  fileEvidence?: FindingFileEvidence[];
  reasoning?: string;
  reproducibleProof?: ReproducibleProof;
  proof?: FindingProofBundle;
};

export type AnalyzeAppResult = {
  analysisId?: string;
  telemetry?: {
    snapshotId: string;
    analysisResultId: string;
    appCodeHash: string;
  } | null;
  securityScore: number;
  severityBreakdown: SeverityBreakdown;
  vulnerabilities: IntelligenceIssue[];
  issues: IntelligenceIssue[];
  recommendations: string[];
  riskLevel: SecuritySeverity;
  detectedVulnerabilities: IntelligenceIssue[];
  predictedFailurePoints: string[];
  predictedFailureScenarios: FailurePrediction[];
  failureIntelligence: FailureIntelligenceReport;
  failureReport: FailureReport;
  launchVerdict: LaunchVerdict;
  launchReadinessScore: ProductionReadinessScoreReport;
  failureScore: number;
  productionReadinessScore: number;
  actionableFixes: ActionableFix[];
  externalIntelligence: ExternalIntelligenceReport;
  regressionReport?: RegressionReport | null;
};

type Detector = {
  id: string;
  severity: SecuritySeverity;
  confidenceScore: number;
  dedupeGroup: string;
  category: SecurityCategory;
  title: string;
  evidence: string;
  fixSuggestion: string;
  test: (context: AnalysisContext) => boolean;
};

type AnalysisContext = {
  source: string;
  lower: string;
  framework: string;
  modules: string[];
};

type SourceSegment = {
  path: string;
  content: string;
  text: string;
};

type ScoredIssue = IntelligenceIssue & {
  dedupeGroup?: string;
};

const severityWeight = {
  critical: 28,
  high: 18,
  medium: 9,
  low: 4,
} satisfies Record<SecuritySeverity, number>;

export class VentureOSIntelligenceService {
  async analyze(input: AnalyzeAppInput): Promise<AnalyzeAppResult> {
    const source = normalizeCode(input.appCode);
    const sourceHash = hashSource(source);
    const context: AnalysisContext = {
      source,
      lower: source.toLowerCase(),
      framework: input.framework.trim().toLowerCase(),
      modules: input.modules.map((moduleName) => moduleName.trim().toLowerCase()).filter(Boolean),
    };

    if (!source.trim()) throw new Error("appCode is required.");
    if (!context.framework) throw new Error("framework is required.");

    const externalIntelligence = await collectExternalIntelligence({
      source,
      framework: context.framework,
      modules: context.modules,
    });
    const detectorIssues = securityDetectors.filter((detector) => detector.test(context)).map(toIssue);
    const externalIssues = externalIntelligence.findings.map((issue): ScoredIssue => ({
      ...issue,
      dedupeGroup: `external:${issue.id}`,
    }));
    const vulnerabilities = normalizeFindings(enrichFindingsWithEvidence([...detectorIssues, ...externalIssues], source), source);
    const actionableFixes = buildActionableFixes({
      issues: vulnerabilities,
      files: sourceSegments(source).map((segment) => ({ path: segment.path, content: segment.content })),
      framework: context.framework,
    });
    const severityBreakdown = buildSeverityBreakdown(vulnerabilities);
    const securityScore = scoreSecurity(vulnerabilities);
    const riskLevel = riskLevelFor(securityScore, severityBreakdown);
    const recommendations = [...new Set(vulnerabilities.map((issue) => issue.fixSuggestion))];
    const failureScore = 100 - securityScore;
    const productionReadinessScore = securityScore;
    const predictedFailurePoints = vulnerabilities.map((issue) => issue.title);
    const failurePipeline = runPostScanFailurePipeline({
      scanKind: input.persist === false ? "public_demo" : "app_analysis",
      findings: vulnerabilities,
      framework: context.framework,
      modules: context.modules,
      securityScore,
      severityBreakdown,
      source,
      validationResults: input.validationResults,
      failureEvents: input.failureEvents,
      legacyPredictedFailurePoints: predictedFailurePoints,
    });
    const { failureIntelligence, failureReport, predictedFailureScenarios } = failurePipeline;
    const launchVerdict = failureReport.launchVerdict;
    const externalIntelligenceSummary = summarizeExternalIntelligenceWithAppEvidence(externalIntelligence, input.appMetadata);

    const analysisId = randomUUID();
    const shouldPersist = input.persist !== false;
    const stored = shouldPersist
      ? await tryDatabase((db) =>
          db.$queryRawUnsafe<Array<{ id: string }>>(
            `INSERT INTO "app_analyses" ("id", "projectId", "framework", "modules", "appCodeHash", "securityScore", "failureScore", "readinessScore", "riskLevel", "issues", "recommendations", "metadata")
             VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb)
             RETURNING "id"`,
            analysisId,
            input.projectId || null,
            context.framework,
            JSON.stringify(context.modules),
            sourceHash,
            securityScore,
            failureScore,
            productionReadinessScore,
            riskLevel,
            JSON.stringify(vulnerabilities),
            JSON.stringify(recommendations),
            JSON.stringify(
              sanitizeMetadata({
                engine: "security-analysis",
                failureReport: summarizeFailureReport(failureReport),
                externalIntelligence: externalIntelligenceSummary,
                severityBreakdown,
                vulnerabilityCount: vulnerabilities.length,
                sourceLength: source.length,
                scanInput: scanInputMetadata(input.appMetadata, input.validationResults, source.length),
              }),
            ),
          ),
        )
      : null;

    const telemetry = shouldPersist
      ? await recordAppTelemetry({
          projectId: input.projectId || null,
          source,
          framework: context.framework,
          modules: context.modules,
          result: {
            analysisId: stored?.[0]?.id,
            securityScore,
            severityBreakdown,
            vulnerabilities,
            issues: vulnerabilities,
            recommendations,
            riskLevel,
            detectedVulnerabilities: vulnerabilities,
            predictedFailurePoints,
            predictedFailureScenarios,
            failureIntelligence,
            failureReport,
            launchVerdict,
            launchReadinessScore: failureReport.launchReadinessScore,
            failureScore,
            productionReadinessScore,
            actionableFixes,
            externalIntelligence,
          },
          appMetadata: input.appMetadata,
          validationResults: input.validationResults,
          failureEvents: input.failureEvents,
          repairAttempts: input.repairAttempts,
        })
      : null;

    const historyRecord = shouldPersist && input.recordHistory !== false
      ? await recordScanHistory({
        projectId: input.projectId || null,
        scanSource: "app_analysis",
        scanRefId: analysisId,
        readinessScore: productionReadinessScore,
        findingsCount: vulnerabilities.length,
        criticalFindingsCount: countCriticalFindings(vulnerabilities),
        riskLevel,
        framework: context.framework,
        findings: vulnerabilities,
        metadata: {
          analysisId: stored?.[0]?.id || analysisId,
          telemetryAnalysisResultId: telemetry?.analysisResultId,
          appCodeHash: sourceHash,
          sourceHash,
          failureReport: summarizeFailureReport(failureReport),
          externalIntelligence: externalIntelligenceSummary,
          sourceLength: source.length,
          scanInput: scanInputMetadata(input.appMetadata, input.validationResults, source.length),
          codeSnapshot: codeSnapshotForSource(source, sourceHash),
          moduleCount: context.modules.length,
        },
      })
      : null;

    if (shouldPersist) {
      await ingestScanEvolutionLoop({
        projectId: input.projectId || null,
        scanKind: input.persist === false ? "public_demo" : "app_analysis",
        scanRefId: stored?.[0]?.id || analysisId,
        framework: context.framework,
        modules: context.modules,
        readinessScore: productionReadinessScore,
        riskLevel,
        severityBreakdown,
        issues: vulnerabilities,
        failureReport,
        metadata: {
          analysisId: stored?.[0]?.id || analysisId,
          telemetryAnalysisResultId: telemetry?.analysisResultId,
          historyStored: Boolean(historyRecord?.stored),
          externalIntelligence: externalIntelligenceSummary,
        },
      }).catch(() => null);
    }

    return {
      analysisId: stored?.[0]?.id,
      telemetry,
      securityScore,
      severityBreakdown,
      vulnerabilities,
      issues: vulnerabilities,
      recommendations,
      riskLevel,
      detectedVulnerabilities: vulnerabilities,
      predictedFailurePoints,
      predictedFailureScenarios,
      failureIntelligence,
      failureReport,
      launchVerdict,
      launchReadinessScore: failureReport.launchReadinessScore,
      failureScore,
      productionReadinessScore,
      actionableFixes,
      externalIntelligence,
      regressionReport: historyRecord?.regressionReport || null,
    };
  }
}

export const ventureOSIntelligenceService = new VentureOSIntelligenceService();

function normalizeCode(appCode: AnalyzeAppInput["appCode"]) {
  return typeof appCode === "string" ? appCode : JSON.stringify(appCode, null, 2);
}

function hashSource(source: string) {
  return createHash("sha256").update(source).digest("hex");
}

function codeSnapshotForSource(source: string, sourceHash: string) {
  return {
    sourceHash,
    sourceLength: source.length,
    fileHashes: Object.fromEntries(sourceSegments(source).slice(0, 500).map((segment) => [normalizeSnapshotPath(segment.path), hashSource(segment.content)])),
  };
}

function summarizeExternalIntelligence(report: ExternalIntelligenceReport) {
  return {
    engine: report.engine,
    version: report.version,
    generatedAt: report.generatedAt,
    networkAccess: report.networkAccess,
    dependenciesChecked: report.dependenciesChecked.slice(0, 50),
    sources: report.sources,
    vulnerabilityCount: report.vulnerabilities.length,
    advisoryIds: report.vulnerabilities.map((item) => item.advisoryId).slice(0, 25),
    limitations: report.limitations.slice(0, 8),
  };
}

function summarizeExternalIntelligenceWithAppEvidence(report: ExternalIntelligenceReport, appMetadata: Record<string, unknown> | undefined) {
  const summary = summarizeExternalIntelligence(report);
  const sbom = sbomFromAppMetadata(appMetadata);
  return {
    ...summary,
    sources: sbom ? [...summary.sources, sbomExternalEvidenceSource(sbom)] : summary.sources,
  };
}

function scanInputMetadata(appMetadata: Record<string, unknown> | undefined, validationResults: Record<string, unknown> | undefined, sourceLength: number) {
  const metadata = appMetadata && typeof appMetadata === "object" ? appMetadata : {};
  const validation = validationResults && typeof validationResults === "object" ? validationResults : {};
  return sanitizeMetadata({
    source: stringValue(metadata.source) || "unknown",
    rawCodeStored: typeof metadata.rawCodeStored === "boolean" ? metadata.rawCodeStored : null,
    sourceLength,
    inputLength: numberFromUnknown(validation.inputLength) || sourceLength,
    inputTruncated: typeof metadata.truncated === "boolean" ? metadata.truncated : typeof validation.inputTruncated === "boolean" ? validation.inputTruncated : null,
    sandbox: metadata.sandbox,
    sbom: sbomFromAppMetadata(appMetadata),
  });
}

function sbomFromAppMetadata(appMetadata: Record<string, unknown> | undefined): SoftwareBillOfMaterialsEvidence | null {
  const value = appMetadata?.sbom;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<SoftwareBillOfMaterialsEvidence>;
  return record.engine === "ventureos-built-in-sbom" ? value as SoftwareBillOfMaterialsEvidence : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function numberFromUnknown(value: unknown) {
  const number = typeof value === "number" ? value : Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function toIssue(detector: Detector): ScoredIssue {
  return {
    id: detector.id,
    severity: detector.severity,
    category: detector.category,
    title: detector.title,
    evidence: detector.evidence,
    fixSuggestion: detector.fixSuggestion,
    confidenceScore: detector.confidenceScore,
    dedupeGroup: detector.dedupeGroup,
  };
}

function normalizeFindings(issues: ScoredIssue[], source: string): IntelligenceIssue[] {
  const calibrated = issues
    .map(calibrateIssue)
    .filter((issue) => (issue.confidenceScore ?? 0) >= 75);
  const bestByKey = new Map<string, ScoredIssue>();

  for (const issue of calibrated) {
    const key = findingDedupeKey(issue);
    const existing = bestByKey.get(key);
    if (!existing || issueRank(issue) > issueRank(existing)) {
      bestByKey.set(key, issue);
    }
  }

  return [...bestByKey.values()]
    .sort((a, b) => issueRank(b) - issueRank(a))
    .map(({ dedupeGroup: _dedupeGroup, ...issue }) => attachFindingProof(issue, {
      source,
      scanner: "ventureos-intelligence-analysis",
    }));
}

function calibrateIssue(issue: ScoredIssue): ScoredIssue {
  const confidence = Math.max(0, Math.min(100, Math.round(issue.confidenceScore ?? 75)));
  if (confidence >= 86) return { ...issue, confidenceScore: confidence };
  if (confidence >= 80 && issue.severity === "critical") return { ...issue, severity: "high", confidenceScore: confidence };
  if (confidence < 80 && issue.severity === "critical") return { ...issue, severity: "high", confidenceScore: confidence };
  if (confidence < 80 && issue.severity === "high") return { ...issue, severity: "medium", confidenceScore: confidence };
  return { ...issue, confidenceScore: confidence };
}

function findingDedupeKey(issue: ScoredIssue) {
  if (issue.dedupeGroup === "secret-exposure") return `${issue.dedupeGroup}:${issue.filePath || issue.category}`;
  if (issue.dedupeGroup === "missing-auth") return `${issue.dedupeGroup}:${issue.filePath || issue.category}`;
  if (issue.dedupeGroup?.startsWith("ai-")) return `${issue.dedupeGroup}:${issue.filePath || issue.category}`;
  const location = issue.filePath && issue.location ? `${issue.filePath}:${issue.location.line}` : "";
  return `${issue.dedupeGroup || issue.id}:${location || issue.filePath || issue.category}`;
}

function issueRank(issue: IntelligenceIssue) {
  return severityRank(issue.severity) * 1000 + (issue.confidenceScore ?? 0);
}

function severityRank(severity: SecuritySeverity) {
  return severity === "critical" ? 4 : severity === "high" ? 3 : severity === "medium" ? 2 : 1;
}

function buildSeverityBreakdown(issues: IntelligenceIssue[]): SeverityBreakdown {
  return issues.reduce<SeverityBreakdown>(
    (breakdown, issue) => {
      breakdown[issue.severity] += 1;
      return breakdown;
    },
    { low: 0, medium: 0, high: 0, critical: 0 },
  );
}

function scoreSecurity(issues: IntelligenceIssue[]) {
  const penalty = issues.reduce((sum, issue) => sum + severityWeight[issue.severity], 0);
  return clamp(100 - penalty);
}

function riskLevelFor(securityScore: number, breakdown: SeverityBreakdown): AnalyzeAppResult["riskLevel"] {
  if (breakdown.critical > 0 || securityScore < 45) return "critical";
  if (breakdown.high > 0 || securityScore < 70) return "high";
  if (breakdown.medium > 0 || securityScore < 88) return "medium";
  return "low";
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function sourceSegments(source: string): SourceSegment[] {
  const markerPattern = /^\/\/ FILE:\s+(.+)$/gm;
  const markers = [...source.matchAll(markerPattern)];
  if (markers.length === 0) return [{ path: "submitted-code", content: source, text: source }];

  return markers.map((marker, index) => {
    const markerEnd = (marker.index ?? 0) + marker[0].length;
    const nextMarkerStart = markers[index + 1]?.index ?? source.length;
    const content = source.slice(markerEnd, nextMarkerStart).replace(/^\r?\n/, "");
    const path = marker[1]?.trim() || "unknown-file";
    return {
      path,
      content,
      text: `${path}\n${content}`,
    };
  });
}

function normalizeSnapshotPath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\/+/, "").trim().toLowerCase();
}

function hasSegment(source: string, predicate: (segment: SourceSegment) => boolean) {
  return sourceSegments(source).some(predicate);
}

function isLikelyProductionSegment(segment: SourceSegment) {
  return !/(^|\/)(__tests__|tests?|spec|fixtures?|mocks?|docs?|examples?)\//i.test(segment.path) && !/\.(test|spec|stories)\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(segment.path);
}

function isRuntimeCodeSegment(segment: SourceSegment) {
  const path = normalizeSnapshotPath(segment.path);
  if (!isLikelyProductionSegment(segment)) return false;
  if (!/\.(tsx?|jsx?|mjs|cjs)$/i.test(path)) return false;
  if (/\.(d|config)\.ts$/i.test(path)) return false;
  if (/(^|\/)(sample-report|demo|fixture|fixtures|mock|mocks|examples?)\//i.test(path)) return false;
  if (/(^|\/)(package(?:-lock)?\.json|\.env(?:\..*)?|prisma\/schema\.prisma)$/i.test(path)) return false;
  return true;
}

function isApiRouteSegment(segment: SourceSegment) {
  const path = normalizeSnapshotPath(segment.path);
  return /(?:^|\/)(app\/api\/.+\/route|pages\/api\/.+)\.(tsx?|jsx?|mjs|cjs)$/i.test(path);
}

function apiRouteFromPath(path: string) {
  return apiRouteFromFilePath(path);
}

function apiPathMatchesRoute(routePath: string, apiPath: string) {
  return sharedApiPathMatchesRoute(routePath, apiPath);
}

function extractStaticApiFetches(source: string) {
  const executable = stripCommentsStringsAndRegex(source);
  return [...source.matchAll(/\bfetch\s*\(\s*(["'])(\/api\/[A-Za-z0-9_./\-[\]]+)["']/g)]
    .filter((match) => executable.slice(match.index ?? 0, (match.index ?? 0) + 5) === "fetch")
    .map((match) => ({
      path: match[2] || "",
      dynamicPrefix: isDynamicApiExpression(source, (match.index ?? 0) + match[0].length),
    }))
    .filter((item) => Boolean(item.path));
}

function hasPhantomApiCall(source: string) {
  const segments = sourceSegments(source);
  const routePaths = segments.map((segment) => apiRouteFromPath(segment.path)).filter((path): path is string => Boolean(path));
  if (routePaths.length === 0) return segments.some((segment) => isLikelyProductionSegment(segment) && extractStaticApiFetches(segment.content).length > 0);

  return segments.some((segment) =>
    isLikelyProductionSegment(segment) &&
    extractStaticApiFetches(segment.content).some((apiCall) =>
      !routePaths.some((routePath) =>
        apiCall.dynamicPrefix
          ? apiDynamicPrefixMatchesRoute(routePath, apiCall.path)
          : apiPathMatchesRoute(routePath, apiCall.path),
      ),
    ),
  );
}

function hasServerAuthImplementation(source: string) {
  return hasSegment(
    source,
    (segment) =>
      hasRouteHandler(segment.content) &&
      /(auth|login|signin|sign-in|signup|sign-up|session)/i.test(segment.text) &&
      /(bcrypt|argon2|jwt|jose|cookies\(|setCookie|prisma\.user|supabase\.auth|nextauth|clerk|auth0)/i.test(segment.content),
  );
}

function hasClientOnlyAuthFlow(source: string) {
  if (hasServerAuthImplementation(source)) return false;
  return hasSegment(
    source,
    (segment) =>
      isLikelyProductionSegment(segment) &&
      hasClientModule(segment.content) &&
      /(login|signin|sign in|auth|password|isAuthenticated|setIsAuthenticated)/i.test(segment.content) &&
      /(localStorage|sessionStorage)\.(getItem|setItem)\(\s*["'][^"']*(auth|token|user|session|loggedIn|isAuthenticated)[^"']*["']/i.test(segment.content) &&
      !/\bfetch\s*\(\s*["']\/api\/(auth|login|signin|sign-in|signup|sign-up|session)/i.test(segment.content),
  );
}

function hasUiOnlyProtection(source: string) {
  if (hasServerAuthImplementation(source)) return false;
  return hasSegment(
    source,
    (segment) =>
      isLikelyProductionSegment(segment) &&
      hasClientModule(segment.content) &&
      /(admin|dashboard|account|protected|private|billing|settings)/i.test(segment.text) &&
      /(localStorage|sessionStorage|getItem|isAuthenticated|user\?\.role|user\.role|role\s*===|roles?\.includes)/i.test(segment.content) &&
      /(router\.push\(["']\/?(login|signin|sign-in)|window\.location|return\s+null|return\s+<|if\s*\(\s*!?(isAuthenticated|user|session))/i.test(segment.content),
  );
}

function hasDatabaseImplementation(source: string) {
  return /(prisma\.|drizzle|createClient\(|supabase\.[\s\S]{0,120}\.(insert|update|upsert|delete|from\()|mongoose\.|mongodb|sql`|\$queryRaw)/i.test(source);
}

function hasClientOnlyPersistence(source: string) {
  if (hasDatabaseImplementation(source) || hasSegment(source, (segment) => hasRouteHandler(segment.content) && hasWriteOperation(segment.content))) return false;
  return hasSegment(
    source,
    (segment) =>
      isLikelyProductionSegment(segment) &&
      hasClientModule(segment.content) &&
      /(localStorage|sessionStorage)\.setItem\(/i.test(segment.content) &&
      /(save|submit|create|add|book|order|record|customer|project|task|database|persist|history)/i.test(segment.content) &&
      !/\bfetch\s*\(\s*["']\/api\//i.test(segment.content),
  );
}

function hasInlineNoOpAction(source: string) {
  return hasSegment(
    source,
    (segment) =>
      isLikelyProductionSegment(segment) &&
      (/<(?:button|form)[^>]+on(?:Click|Submit)\s*=\s*\{\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*(?:\{\s*(?:(?:event|e)\.preventDefault\(\);?\s*)?(?:(?:console\.log|alert)\([^;]*\);?\s*)?\}|(?:console\.log|alert)\([^)]*\)|undefined|null)\s*\}/i.test(segment.content) ||
        /on(?:Click|Submit)\s*=\s*\{[^}]{0,180}(TODO|coming soon|not implemented|placeholder|stub|noop|no-op)[^}]{0,180}\}/i.test(segment.content)),
  );
}

function hasUiOnlyFormSubmission(source: string) {
  return hasSegment(
    source,
    (segment) =>
      isLikelyProductionSegment(segment) &&
      hasClientModule(segment.content) &&
      /(<form[^>]+onSubmit|onSubmit\s*=)/i.test(segment.content) &&
      /preventDefault\(\)/i.test(segment.content) &&
      /(set[A-Z][A-Za-z0-9_]*\(|toast\.(success|info)\(|alert\()/i.test(segment.content) &&
      !/\b(fetch|axios)\s*(\.|\()/i.test(segment.content) &&
      !/use server|serverAction|action\s*=\s*\{/i.test(segment.content),
  );
}

function hasBrokenDeploymentAssumption(source: string) {
  return hasSegment(
    source,
    (segment) =>
      isRuntimeCodeSegment(segment) &&
      !isGeneratedCodeTemplateSegment(segment) &&
      ((hasProductionLocalhostDependency(segment.content) && /(fetch|axios|API|BASE_URL|BACKEND_URL|APP_URL|WEBHOOK|CALLBACK|PUBLIC_URL)/i.test(segment.content)) ||
        (/(app\/api|pages\/api|route\.(ts|js)|server)/i.test(segment.path) && /fs\.(writeFile|writeFileSync|appendFile|mkdirSync)/.test(segment.content))),
  );
}

function isGeneratedCodeTemplateSegment(segment: SourceSegment) {
  const path = normalizeSnapshotPath(segment.path);
  return /(^|\/)(lib\/execution-runtime\/|lib\/intelligence\/actionable-fix-engine|lib\/services\/(?:intelligenceanalysis|evidenceengine|reposcan)|lib\/scanner\/aiappscanner|components\/sample-|app\/sample-)/i.test(path);
}

function hasProductionLocalhostDependency(source: string) {
  if (!/https?:\/\/(localhost|127\.0\.0\.1)/i.test(source)) return false;
  if (/NODE_ENV[\s\S]{0,120}production|production[\s\S]{0,240}(localhost|127\.0\.0\.1)|(localhost|127\.0\.0\.1)[\s\S]{0,240}production/i.test(source)) return false;
  if (/VERCEL_URL[\s\S]{0,240}(localhost|127\.0\.0\.1)|(localhost|127\.0\.0\.1)[\s\S]{0,240}VERCEL_URL/i.test(source)) return false;
  if (/APP_URL[\s\S]{0,240}required|must use https outside localhost|cannot point to localhost/i.test(source)) return false;
  return true;
}

function hasConcreteSecret(source: string) {
  return [
    /sk_(live|test)_[A-Za-z0-9_\-.]{16,}/i,
    /whsec_[A-Za-z0-9_\-.]{16,}/i,
    /SUPABASE_SERVICE_ROLE_KEY\s*=\s*["']?[A-Za-z0-9._-]{20,}/i,
    /DATABASE_URL\s*=\s*["']?postgres:\/\/[^"'\s]+:[^"'\s]+@/i,
    /postgres:\/\/[^"'\s]+:[^"'\s]+@/i,
    /api[_-]?key\s*[:=]\s*["'][A-Za-z0-9_\-.]{28,}["']/i,
    /bearer\s+[A-Za-z0-9_\-.]{32,}/i,
  ].some((pattern) => pattern.test(source));
}

function hasClientSecretExposure(segment: SourceSegment) {
  const executable = stripCommentsStringsAndRegex(segment.content);
  if (/(?:process\.env\.)?NEXT_PUBLIC_([A-Z0-9_]*(SECRET|TOKEN|PRIVATE|SERVICE_ROLE)|(?:OPENAI|ANTHROPIC|GEMINI|RESEND|SENDGRID|TWILIO|DATABASE|STRIPE_SECRET|SUPABASE_SERVICE_ROLE|AUTH|JWT)[A-Z0-9_]*)/i.test(executable)) {
    return true;
  }
  return (
    hasClientModule(segment.content) &&
    /(process\.env\.(?!NEXT_PUBLIC_)[A-Z0-9_]*(SECRET|TOKEN|KEY)|sk_live_|sk_test_|whsec_|SUPABASE_SERVICE_ROLE_KEY)/i.test(executable)
  );
}

function hasClientModule(source: string) {
  return /(^|\n)\s*["']use client["']/.test(source);
}

function hasRouteHandler(source: string) {
  return /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/.test(source);
}

function hasMutatingRoute(source: string) {
  return /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\s*\(/.test(source);
}

function hasWriteOperation(source: string) {
  const executable = stripCommentsStringsAndRegex(source);
  return (
    /\b(?:prisma|db)\.[a-zA-Z0-9_]+\.(create|update|upsert|delete|deleteMany|updateMany)\s*\(/i.test(executable) ||
    /\b(?:setDoc|addDoc|deleteDoc)\s*\(/i.test(executable) ||
    /\bsupabase\.[\s\S]{0,160}\.(insert|update|upsert|delete)\s*\(/i.test(executable) ||
    /\$\s*(?:executeRaw|executeRawUnsafe|queryRawUnsafe)\s*\(\s*(?:`[^`]*\b(?:INSERT|UPDATE|DELETE|UPSERT)\b|["'][^"']*\b(?:INSERT|UPDATE|DELETE|UPSERT)\b)/i.test(source)
  );
}

function hasAuthGuard(source: string) {
  return /(compileTrust\s*\(|requireAuth|requireSession|getServerSession|auth\(|currentUser|verifyToken|verifyJwt|verifyIntelligenceBearer|verifyGitHubWebhookSignature|x-hub-signature|authorization|bearer|jwt|session|clerk|auth0|nextauth|supabase\.auth)/i.test(source);
}

function hasOwnershipOrRoleGuard(source: string) {
  return /(assertOwnership|assertOrgAccess|resolveWorkspaceProjectIdForUser|ownerId|userId|teamId|tenantId|organizationId|orgId|role|permission|rbac|requireRole|requireAdmin|hasRole|can\()/i.test(source);
}

function isAllowedAnonymousTelemetryWrite(source: string) {
  const executable = stripCommentsStringsAndRegex(source);
  return (
    /compileTrust\s*\([\s\S]{0,240}mode\s*:\s*["']publicNonPersistent["']/i.test(source) &&
    /\benforceRateLimit\s*\(/i.test(executable) &&
    /(allowedEvents\s*=\s*new\s+Set|allowedEvents\.has\s*\()/i.test(source) &&
    /\bINSERT\s+INTO\s+(?:\\?["'])?app_telemetry_events(?:\\?["'])?/i.test(source) &&
    /(repositoryHash|rawSourceStored\s*=\s*false|sanitizeMetadata)/i.test(source) &&
    !hasRequestControlledPrivilege(source)
  );
}

function hasAdminSurface(source: string) {
  const executable = stripCommentsStringsAndRegex(source);
  return /(^|\/)app\/api\/admin\//i.test(source) || /\/api\/admin/i.test(executable) || /\b(deleteUser|impersonate|banUser|setRole|grantPermission|updateRole)\b/i.test(executable);
}

function hasAdminEndpointSurface(segment: SourceSegment) {
  const path = normalizeSnapshotPath(segment.path);
  const executable = stripCommentsStringsAndRegex(segment.content);
  return /(^|\/)app\/api\/admin\//i.test(path) || /\b(deleteUser|impersonate|banUser|setRole|grantPermission|updateRole)\b/i.test(executable);
}

function hasStrongRoleGate(source: string) {
  return /(requireAdmin|requireRole\(["']admin|hasRole\(["']admin|role\s*===\s*["']admin|roles?\.includes\(["']admin|permission|rbac|can\()/i.test(source);
}

function hasRequestControlledPrivilege(source: string) {
  const sanitized = stripCommentsStringsAndRegex(source).replace(
    /\bdelete\s+(body|req\.body|requestBody|searchParams|params)\.(role|isAdmin|permissions?|ownerId|userId|actorId|orgId|teamId)\s*;?/gi,
    "",
  );
  return /(body|req\.body|requestBody|searchParams|params)\.(role|isAdmin|permissions?|ownerId|userId)|\b(role|isAdmin|permissions?)\s*=\s*(body|req\.body|requestBody|searchParams|params)/i.test(sanitized);
}

function hasWebhookSurface(source: string) {
  const executable = stripCommentsStringsAndRegex(source);
  return hasRouteHandler(source) && (/\bwebhook\b/i.test(source) || /stripe-signature|x-hub-signature|svix-signature|paypal-transmission-sig/i.test(executable));
}

function hasWebhookSignatureVerification(source: string) {
  return /(constructEvent|stripe-signature|webhook_secret|WEBHOOK_SECRET|verify\(.*signature|x-hub-signature|svix-id|svix-signature|paypal-transmission-sig)/i.test(source);
}

function hasRateLimitGuard(source: string) {
  return /(rateLimit|rate-limit|ratelimit|limiter|throttle|enforceRateLimit|RATE_LIMITS|upstash\/ratelimit)/i.test(source);
}

function hasSensitiveRateLimitSurface(source: string) {
  if (/(^|\/)app\/api\/health\/route\.(tsx?|jsx?|mjs|cjs)|\/api\/health\b/i.test(source)) return false;
  if (/(^|\/)app\/api\/billing\//i.test(source) && /compileTrust\s*\(/i.test(source)) return false;
  return hasRouteHandler(source) && /(^|[\/_\-\s.])(login|signup|password|generate|analyze|upload|checkout|payment|webhook|ai|openai|gemini|stripe|anthropic)([\/_\-\s.]|$)/i.test(source);
}

function hasEnvValidation(source: string) {
  return /(zod|safeParse|requiredEnv|envSchema|validateEnv|missing required env|serverEnv|env\.ts)/i.test(source);
}

function hasSensitiveEnvUsage(source: string) {
  return /process\.env\.(?!NEXT_PUBLIC_)(DATABASE_URL|[A-Z0-9_]*(SECRET|TOKEN|PRIVATE|SERVICE_ROLE|STRIPE|SUPABASE|OPENAI|GEMINI|ANTHROPIC|KEY)[A-Z0-9_]*)/i.test(source);
}

function hasDangerousExecution(source: string) {
  const executable = stripCommentsStringsAndRegex(source);
  const dynamicEval = /\beval\s*\(|new\s+Function\s*\(/.test(executable);
  const childProcessImport = /from\s+["']node:child_process["']|from\s+["']child_process["']|require\(\s*["'](?:node:)?child_process["']\s*\)/.test(source);
  const childProcessWithInput = childProcessImport && /\b(exec|execFile|spawn|fork)\s*\(/.test(executable) && /(request|body|input|prompt|code|command|args)/i.test(executable);
  return dynamicEval || childProcessWithInput;
}

function hasUnsafeSqlQuery(source: string) {
  return hasSegment(source, (segment) => {
    if (!isRuntimeCodeSegment(segment)) return false;
    return (
      /\$(?:queryRawUnsafe|executeRawUnsafe)\s*\(\s*`[^`]*\$\{/i.test(segment.content) ||
      /\$(?:queryRawUnsafe|executeRawUnsafe)\s*\(\s*["'][^"']*["']\s*\+/i.test(segment.content) ||
      /\b(?:query|execute)\s*\([^)]*\+[^)]*\)/i.test(segment.content)
    );
  });
}

function stripCommentsStringsAndRegex(source: string) {
  let output = "";
  let index = 0;
  let state: "code" | "single" | "double" | "template" | "lineComment" | "blockComment" | "regex" = "code";
  while (index < source.length) {
    const char = source[index] || "";
    const next = source[index + 1] || "";

    if (state === "lineComment") {
      if (char === "\n") {
        state = "code";
        output += "\n";
      } else {
        output += " ";
      }
      index += 1;
      continue;
    }

    if (state === "blockComment") {
      if (char === "*" && next === "/") {
        state = "code";
        output += "  ";
        index += 2;
      } else {
        output += char === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }

    if (state === "single" || state === "double" || state === "template" || state === "regex") {
      const terminator = state === "single" ? "'" : state === "double" ? "\"" : state === "template" ? "`" : "/";
      if (char === "\\") {
        output += "  ";
        index += 2;
        continue;
      }
      if (char === terminator) {
        state = "code";
        output += " ";
        index += 1;
        continue;
      }
      output += char === "\n" ? "\n" : " ";
      index += 1;
      continue;
    }

    if (char === "/" && next === "/") {
      state = "lineComment";
      output += "  ";
      index += 2;
      continue;
    }
    if (char === "/" && next === "*") {
      state = "blockComment";
      output += "  ";
      index += 2;
      continue;
    }
    if (char === "'") {
      state = "single";
      output += " ";
      index += 1;
      continue;
    }
    if (char === "\"") {
      state = "double";
      output += " ";
      index += 1;
      continue;
    }
    if (char === "`") {
      state = "template";
      output += " ";
      index += 1;
      continue;
    }
    if (char === "/" && looksLikeRegexStart(output)) {
      state = "regex";
      output += " ";
      index += 1;
      continue;
    }

    output += char;
    index += 1;
  }
  return output;
}

function looksLikeRegexStart(output: string) {
  const tail = output.slice(-40).trimEnd();
  if (!tail) return true;
  return /[=(:,!?\[{;]$|return$|=>$/i.test(tail);
}

const securityDetectors: Detector[] = [
  {
    id: "exposed-secret-literal",
    severity: "critical",
    confidenceScore: 96,
    dedupeGroup: "secret-exposure",
    category: "deployment",
    title: "Exposed API key or secret",
    evidence: "Detected secret-like token, webhook secret, database URL, or private service credential in application code.",
    test: ({ source }) => hasConcreteSecret(source),
    fixSuggestion: "Move secrets to server-only environment variables, remove them from generated files, and rotate any value that was exposed.",
  },
  {
    id: "frontend-secret-exposure",
    severity: "critical",
    confidenceScore: 90,
    dedupeGroup: "secret-exposure",
    category: "frontend",
    title: "Secret exposed to client bundle",
    evidence: "Detected server credentials referenced from client-side code or NEXT_PUBLIC secret naming.",
    test: ({ source }) =>
      hasSegment(
        source,
        (segment) => isLikelyProductionSegment(segment) && hasClientSecretExposure(segment),
      ),
    fixSuggestion: "Keep privileged credentials in API routes or server actions only, and expose only non-sensitive public keys to the browser.",
  },
  {
    id: "ai-fake-auth-flow",
    severity: "high",
    confidenceScore: 88,
    dedupeGroup: "ai-auth-illusion",
    category: "auth",
    title: "Fake client-only authentication flow",
    evidence: "Detected a client-side login/auth flow that stores auth state in browser storage without a matching server auth implementation.",
    test: ({ source }) => hasClientOnlyAuthFlow(source),
    fixSuggestion: "Move authentication to a server-backed session or identity provider, and verify the session on protected API routes and pages.",
  },
  {
    id: "ai-ui-only-protection",
    severity: "high",
    confidenceScore: 89,
    dedupeGroup: "ai-auth-illusion",
    category: "auth",
    title: "UI-only protected route",
    evidence: "Detected admin/private UI gating based on client state or browser storage without server-side authorization evidence.",
    test: ({ source }) => hasUiOnlyProtection(source),
    fixSuggestion: "Enforce access on the server with session and role checks; keep client guards only as a convenience layer.",
  },
  {
    id: "ai-phantom-api",
    severity: "high",
    confidenceScore: 90,
    dedupeGroup: "ai-missing-backend",
    category: "api",
    title: "Phantom API call",
    evidence: "Detected a static fetch to an API route that has no matching route handler in the submitted application files.",
    test: ({ source }) => hasPhantomApiCall(source),
    fixSuggestion: "Create the missing API route or point the client call at an existing backend endpoint with the same contract.",
  },
  {
    id: "ai-fake-persistence",
    severity: "medium",
    confidenceScore: 84,
    dedupeGroup: "ai-persistence-illusion",
    category: "db",
    title: "Client-only fake persistence",
    evidence: "Detected production create/save behavior persisted only through browser storage with no backend or database implementation.",
    test: ({ source }) => hasClientOnlyPersistence(source),
    fixSuggestion: "Persist records through an API route or server action backed by a database or durable storage service.",
  },
  {
    id: "ai-no-op-action",
    severity: "medium",
    confidenceScore: 86,
    dedupeGroup: "ai-no-op-action",
    category: "frontend",
    title: "No-op user action",
    evidence: "Detected a button or form action wired to an empty, placeholder, console-only, alert-only, or unimplemented handler.",
    test: ({ source }) => hasInlineNoOpAction(source),
    fixSuggestion: "Connect the action to real state, navigation, API behavior, or disable it with a visible explanation.",
  },
  {
    id: "ai-missing-backend-implementation",
    severity: "medium",
    confidenceScore: 82,
    dedupeGroup: "ai-missing-backend",
    category: "api",
    title: "Form submission has no backend implementation",
    evidence: "Detected a form submission that prevents default behavior and only updates client UI feedback without a server action or API call.",
    test: ({ source }) => hasUiOnlyFormSubmission(source),
    fixSuggestion: "Submit the form through a validated API route or server action and show success/error feedback from the backend response.",
  },
  {
    id: "ai-broken-deployment-assumption",
    severity: "high",
    confidenceScore: 90,
    dedupeGroup: "ai-deployment-assumption",
    category: "deployment",
    title: "Broken deployment assumption",
    evidence: "Detected hardcoded localhost runtime dependencies or serverless filesystem writes in production code.",
    test: ({ source }) => hasBrokenDeploymentAssumption(source),
    fixSuggestion: "Replace localhost dependencies with environment-driven production URLs and move durable writes to database or object storage.",
  },
  {
    id: "unsafe-sql-query",
    severity: "critical",
    confidenceScore: 94,
    dedupeGroup: "unsafe-db-query",
    category: "db",
    title: "Unsafe SQL query construction",
    evidence: "Detected raw SQL built with interpolation, concatenation, or unsafe raw query APIs.",
    test: ({ source }) => hasUnsafeSqlQuery(source),
    fixSuggestion: "Replace string-built SQL with Prisma model queries, parameterized queries, or `$queryRaw` tagged templates.",
  },
  {
    id: "missing-auth-middleware",
    severity: "medium",
    confidenceScore: 78,
    dedupeGroup: "missing-auth",
    category: "auth",
    title: "Sensitive route lacks an auth guard",
    evidence: "Detected a sensitive route surface without a session, bearer token, or identity verification guard.",
    test: ({ source }) =>
      hasSegment(
        source,
        (segment) => isApiRouteSegment(segment) && hasRouteHandler(segment.content) && /(account|profile|admin|billing|checkout|payment|user|team|project|private)/i.test(segment.text) && !hasAuthGuard(segment.content),
      ),
    fixSuggestion: "Add a route-level auth guard and require verified identity before sensitive reads or writes.",
  },
  {
    id: "insecure-mutating-api-route",
    severity: "high",
    confidenceScore: 86,
    dedupeGroup: "missing-auth",
    category: "api",
    title: "Insecure mutating API route",
    evidence: "Detected a mutating API handler with write behavior and no auth, ownership, or role guard.",
    test: ({ source }) =>
      hasSegment(
        source,
        (segment) =>
          isApiRouteSegment(segment) &&
          hasMutatingRoute(segment.content) &&
          hasWriteOperation(segment.content) &&
          !isAllowedAnonymousTelemetryWrite(segment.content) &&
          !(hasAuthGuard(segment.content) && hasOwnershipOrRoleGuard(segment.content)),
      ),
    fixSuggestion: "Require authentication and object-level authorization in every mutating route before applying writes.",
  },
  {
    id: "open-admin-endpoint",
    severity: "critical",
    confidenceScore: 92,
    dedupeGroup: "missing-auth",
    category: "auth",
    title: "Open admin endpoint",
    evidence: "Detected admin route or admin action without a strong role or permission gate.",
    test: ({ source }) => hasSegment(source, (segment) => isApiRouteSegment(segment) && hasAdminEndpointSurface(segment) && (hasMutatingRoute(segment.content) || hasWriteOperation(segment.content)) && !hasStrongRoleGate(segment.content)),
    fixSuggestion: "Protect admin endpoints with explicit admin/RBAC checks, audit logging, and object-level authorization.",
  },
  {
    id: "weak-authorization-pattern",
    severity: "high",
    confidenceScore: 84,
    dedupeGroup: "weak-auth",
    category: "auth",
    title: "Weak authorization pattern",
    evidence: "Detected authorization that trusts request body, query string, or email/domain checks instead of verified claims.",
    test: ({ source }) =>
      hasSegment(
        source,
        (segment) =>
          isRuntimeCodeSegment(segment) &&
          (hasRouteHandler(segment.content) || hasWriteOperation(segment.content) || hasAdminSurface(segment.text)) &&
          hasAuthGuard(segment.content) &&
          (hasRequestControlledPrivilege(segment.content) || (/email\.endsWith\(["'][^"']+["']\)/i.test(segment.content) && /(admin|role|permission|authorize|auth)/i.test(segment.content))),
      ),
    fixSuggestion: "Derive roles and ownership from verified server-side session claims, then check resource ownership in the database.",
  },
  {
    id: "webhook-without-signature-validation",
    severity: "high",
    confidenceScore: 84,
    dedupeGroup: "webhook-signature",
    category: "api",
    title: "Webhook without signature validation",
    evidence: "Webhook handler detected without cryptographic signature verification.",
    test: ({ source }) => hasSegment(source, (segment) => isApiRouteSegment(segment) && hasWebhookSurface(segment.text) && !hasWebhookSignatureVerification(segment.content)),
    fixSuggestion: "Verify provider webhook signatures against the raw request body before trusting event payloads.",
  },
  {
    id: "cors-wildcard",
    severity: "medium",
    confidenceScore: 96,
    dedupeGroup: "cors",
    category: "api",
    title: "Overly permissive CORS",
    evidence: "Detected wildcard CORS origin on API responses.",
    test: ({ source }) => hasSegment(source, (segment) => isRuntimeCodeSegment(segment) && /Access-Control-Allow-Origin["']?\s*[:,]\s*["']\*/i.test(segment.content)),
    fixSuggestion: "Restrict CORS origins to known production domains and avoid credentials with wildcard origins.",
  },
  {
    id: "missing-rate-limit",
    severity: "medium",
    confidenceScore: 76,
    dedupeGroup: "rate-limit",
    category: "api",
    title: "Missing rate limit on sensitive route",
    evidence: "Detected auth, login, AI generation, payment, upload, or webhook surface without rate limiting.",
    test: ({ source }) => hasSegment(source, (segment) => isApiRouteSegment(segment) && hasSensitiveRateLimitSurface(segment.text) && !hasRateLimitGuard(segment.content)),
    fixSuggestion: "Add per-user and per-IP rate limits to sensitive routes, especially auth, generation, upload, and payment endpoints.",
  },
  {
    id: "dangerous-code-execution",
    severity: "critical",
    confidenceScore: 94,
    dedupeGroup: "dangerous-execution",
    category: "api",
    title: "Dangerous dynamic code execution",
    evidence: "Detected dynamic code execution or child-process execution connected to request-controlled input.",
    test: ({ source }) => hasSegment(source, (segment) => isRuntimeCodeSegment(segment) && hasDangerousExecution(segment.content)),
    fixSuggestion: "Remove dynamic execution or run untrusted generated code only inside an isolated sandbox with strict resource limits.",
  },
  {
    id: "missing-env-validation",
    severity: "low",
    confidenceScore: 76,
    dedupeGroup: "env-validation",
    category: "deployment",
    title: "Missing environment validation",
    evidence: "Sensitive environment variables are referenced without detected fail-fast validation.",
    test: ({ source }) => hasSegment(source, (segment) => !hasClientModule(segment.content) && hasSensitiveEnvUsage(segment.content)) && !hasEnvValidation(source),
    fixSuggestion: "Validate required environment variables at startup and fail deployment when required security config is absent.",
  },
];
