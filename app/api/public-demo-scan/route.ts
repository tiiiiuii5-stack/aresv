import { NextRequest } from "next/server";

import { createTrace } from "@/lib/diagnostics";
import {
  enforceRateLimit,
  jsonResponse,
  RATE_LIMITS,
  readJsonBody,
  sanitizeScanInput,
  secureErrorResponse,
} from "@/lib/security/backendSecurity";
import { loadPublicGitHubRepositorySource } from "@/lib/repositories/public-github-source";
import { applyEvidenceCoverageGate, assessEvidenceCoverage } from "@/lib/scanner/evidence-coverage-gate";
import { ventureOSIntelligenceService } from "@/lib/services/intelligenceAnalysis";
import { generateSoftwareBillOfMaterials } from "@/lib/sbom/software-bom";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DEMO_CODE_LENGTH = 120_000;

export async function GET() {
  return jsonResponse({
    ok: true,
    endpoint: "public-demo-scan",
    method: "POST",
    status: "ready",
    message: "Submit source code or a public GitHub repository URL with POST to run a free demo scan.",
  });
}

export async function POST(request: NextRequest) {
  const traceId = createTrace("public-demo-scan.POST");
  try {
    await compileTrust(request, { mode: "publicNonPersistent" });
    const rateLimit = await enforceRateLimit(request, RATE_LIMITS.publicDemoScan);
    const body = await readJsonBody<{
      appCode?: unknown;
      framework?: unknown;
      modules?: unknown;
      repositoryUrl?: unknown;
      repoUrl?: unknown;
      repository?: unknown;
    }>(request, { maxBytes: 180_000 });
    const repositoryUrl = cleanText(body.repositoryUrl || body.repoUrl || body.repository, 260);
    const repositorySource = repositoryUrl
      ? await loadPublicGitHubRepositorySource({
        repositoryUrl,
        maxChars: MAX_DEMO_CODE_LENGTH,
        maxFiles: 120,
        maxFileBytes: 180_000,
        maxCharsPerFile: 900,
      })
      : null;

    const scanInput = sanitizeScanInput(
      { appCode: repositorySource?.code || body.appCode, framework: body.framework, modules: body.modules },
      { maxCodeLength: MAX_DEMO_CODE_LENGTH, maxModules: 8 },
    );
    if (scanInput.appCode.trim().length < 40) {
      return jsonResponse({ ok: false, traceId, error: "Paste at least 40 characters of code for the public demo scan." }, { status: 400, headers: rateLimit.headers });
    }
    const sbom = generateSoftwareBillOfMaterials({
      sourceCode: scanInput.appCode,
      appName: repositorySource ? `${repositorySource.owner}/${repositorySource.repo}` : "Submitted Source",
      repositoryUrl: repositorySource?.canonicalUrl || repositoryUrl || undefined,
    });

    const result = await ventureOSIntelligenceService.analyze({
      persist: false,
      recordHistory: false,
      appCode: scanInput.appCode,
      framework: scanInput.framework || "nextjs",
      modules: scanInput.modules,
      appMetadata: {
        source: "public_demo",
        rawCodeStored: false,
        truncated: scanInput.inputTruncated,
        inputSource: repositorySource ? "public_github_repository" : "pasted_code",
        repositoryHash: repositorySource ? hashText(repositorySource.canonicalUrl) : null,
        repositoryFilesLoaded: repositorySource?.filesLoaded || null,
        sbom,
        promptInjectionSignals: scanInput.promptInjectionSignals,
        sandbox: scanInput.sandbox,
      },
    });
    const evidenceCoverage = assessEvidenceCoverage({
      inputSource: repositorySource ? "public_github_repository" : "pasted_code",
      inputLength: scanInput.appCode.length,
      inputLimit: MAX_DEMO_CODE_LENGTH,
      inputTruncated: scanInput.inputTruncated,
      repository: repositorySource ? {
        filesLoaded: repositorySource.filesLoaded,
        totalFilesDiscovered: repositorySource.totalFilesDiscovered,
        truncated: repositorySource.truncated,
      } : null,
    });
    const adjustedScores = applyEvidenceCoverageGate({
      securityScore: result.securityScore,
      failureScore: result.failureScore,
      productionReadinessScore: result.productionReadinessScore,
      riskLevel: result.riskLevel,
    }, evidenceCoverage);
    const evidenceWarnings = evidenceCoverage.warnings.map((warning) => ({
      title: "Evidence coverage limit",
      severity: evidenceCoverage.level === "thin" ? "high" : "medium",
      category: "evidence",
      evidence: warning,
      fixSuggestion: "Use the paid report flow, GitHub App connection, upload, or CI-generated SBOM to increase coverage.",
    }));

    return jsonResponse({
      ok: true,
      traceId,
      demo: true,
      rawCodeStored: false,
      inputLimit: MAX_DEMO_CODE_LENGTH,
      inputTruncated: scanInput.inputTruncated || Boolean(repositorySource?.truncated),
      repositorySource: repositorySource ? {
        source: repositorySource.source,
        owner: repositorySource.owner,
        repo: repositorySource.repo,
        ref: repositorySource.ref,
        canonicalUrl: repositorySource.canonicalUrl,
        filesLoaded: repositorySource.filesLoaded,
        totalFilesDiscovered: repositorySource.totalFilesDiscovered,
        truncated: repositorySource.truncated,
        warnings: repositorySource.warnings,
      } : null,
      securityWarnings: scanInput.promptInjectionSignals,
      evidenceCoverage,
      sbom: sbomResponse(sbom),
      sandbox: scanInput.sandbox,
      securityScore: adjustedScores.securityScore,
      failureScore: adjustedScores.failureScore,
      productionReadinessScore: adjustedScores.productionReadinessScore,
      rawScores: adjustedScores.rawScores,
      launchReadinessScore: result.launchReadinessScore,
      riskLevel: adjustedScores.riskLevel,
      severityBreakdown: result.severityBreakdown,
      issues: [...evidenceWarnings, ...result.issues].slice(0, 5),
      recommendations: [...evidenceCoverage.warnings, ...result.recommendations].slice(0, 5),
      externalIntelligence: {
        engine: result.externalIntelligence.engine,
        networkAccess: result.externalIntelligence.networkAccess,
        dependenciesChecked: result.externalIntelligence.dependenciesChecked.slice(0, 12),
        sources: result.externalIntelligence.sources,
        vulnerabilityCount: result.externalIntelligence.vulnerabilities.length,
        vulnerabilities: result.externalIntelligence.vulnerabilities.slice(0, 5),
        limitations: result.externalIntelligence.limitations.slice(0, 5),
      },
      predictedFailurePoints: result.predictedFailurePoints.slice(0, 5),
      predictedFailureScenarios: result.predictedFailureScenarios.slice(0, 5),
      failureIntelligence: {
        ...result.failureIntelligence,
        topPredictions: result.failureIntelligence.topPredictions.slice(0, 5),
      },
      failureReport: {
        ...result.failureReport,
        predictedFailureScenarios: result.failureReport.predictedFailureScenarios.slice(0, 5),
        failureIntelligence: {
          ...result.failureReport.failureIntelligence,
          topPredictions: result.failureReport.failureIntelligence.topPredictions.slice(0, 5),
        },
        launchVerdict: {
          ...result.failureReport.launchVerdict,
          evidence: result.failureReport.launchVerdict.evidence.slice(0, 5),
          blockers: result.failureReport.launchVerdict.blockers.slice(0, 5),
          warnings: result.failureReport.launchVerdict.warnings.slice(0, 5),
        },
      },
      launchVerdict: {
        ...result.launchVerdict,
        evidence: result.launchVerdict.evidence.slice(0, 5),
        blockers: result.launchVerdict.blockers.slice(0, 5),
        warnings: result.launchVerdict.warnings.slice(0, 5),
      },
      regressionReport: result.regressionReport,
      sampleReportUrl: "/sample-report",
    }, { headers: rateLimit.headers });
  } catch (error) {
    const safeMessage = safePublicDemoError(error);
    if (safeMessage) {
      return jsonResponse({ ok: false, traceId, error: safeMessage }, { status: 400 });
    }
    return secureErrorResponse("public-demo-scan.POST", traceId, error, { fallbackStatus: 400 });
  }
}

function cleanText(value: unknown, maxLength: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(16);
}

function sbomResponse(sbom: ReturnType<typeof generateSoftwareBillOfMaterials>) {
  return {
    engine: sbom.engine,
    format: sbom.format,
    specVersion: sbom.specVersion,
    generatedAt: sbom.generatedAt,
    bomHash: sbom.bomHash,
    status: sbom.status,
    completeness: sbom.completeness,
    manifestCount: sbom.manifestCount,
    componentCount: sbom.componentCount,
    directDependencyCount: sbom.directDependencyCount,
    devDependencyCount: sbom.devDependencyCount,
    packageManagers: sbom.packageManagers,
    riskFlags: sbom.riskFlags,
    limitations: sbom.limitations,
    componentsPreview: sbom.componentsPreview,
  };
}

function safePublicDemoError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /Only public GitHub repository URLs are supported|public GitHub repository could not be read|private repository|No supported source files|Paste at least 40 characters/i.test(message)
  ) {
    return message;
  }
  return "";
}
