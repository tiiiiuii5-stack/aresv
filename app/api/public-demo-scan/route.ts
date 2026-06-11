import { NextRequest } from "next/server";

import { createTrace } from "@/lib/diagnostics";
import { recordRequestProductFunnelEvent } from "@/lib/analytics/product-funnel-request";
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

const MAX_DEMO_CODE_LENGTH = 6_000_000;

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
        maxFiles: 2_000,
        maxFileBytes: 1_000_000,
        maxCharsPerFile: 1_000_000,
      })
      : null;

    const scanInput = sanitizeScanInput(
      { appCode: repositorySource?.code || body.appCode, framework: body.framework, modules: body.modules },
      { maxCodeLength: MAX_DEMO_CODE_LENGTH, maxModules: 8 },
    );
    if (scanInput.appCode.trim().length < 40) {
      return jsonResponse({ ok: false, traceId, error: "Paste at least 40 characters of code for the public demo scan." }, { status: 400, headers: rateLimit.headers });
    }
    await recordRequestProductFunnelEvent(request, {
      eventType: "preview_started",
      source: "public_demo_scan",
      framework: scanInput.framework || "nextjs",
      repositoryUrl,
      metadata: {
        surface: "public-demo-scan-api",
        inputSource: repositorySource ? "public_github_repository" : "pasted_code",
        filesLoaded: repositorySource?.filesLoaded || 0,
      },
    }).catch(() => false);
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
    const issuesForDecision = [...evidenceWarnings, ...result.issues];
    const recommendationsForDecision = [...evidenceCoverage.warnings, ...result.recommendations];
    const decision = buildTrustDecision({
      scores: adjustedScores,
      coverage: evidenceCoverage,
      issues: issuesForDecision,
      recommendations: recommendationsForDecision,
      repository: repositorySource ? {
        owner: repositorySource.owner,
        repo: repositorySource.repo,
        filesLoaded: repositorySource.filesLoaded,
        totalFilesDiscovered: repositorySource.totalFilesDiscovered,
      } : null,
      sbom,
    });
    await recordRequestProductFunnelEvent(request, {
      eventType: "preview_completed",
      source: "public_demo_scan",
      framework: scanInput.framework || "nextjs",
      riskLevel: adjustedScores.riskLevel,
      repositoryUrl,
      metadata: {
        surface: "public-demo-scan-api",
        decision: decision.answer,
        confidence: decision.confidence,
        coveragePercent: evidenceCoverage.coveragePercent,
        filesLoaded: repositorySource?.filesLoaded || 0,
        sbomComponents: sbom.componentCount,
      },
    }).catch(() => false);

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
      confidence: adjustedScores.confidence,
      coverageRatio: adjustedScores.coverageRatio,
      verdict: adjustedScores.verdict,
      decision,
      rawScores: adjustedScores.rawScores,
      launchReadinessScore: result.launchReadinessScore,
      riskLevel: adjustedScores.riskLevel,
      severityBreakdown: result.severityBreakdown,
      issues: issuesForDecision.slice(0, 5),
      recommendations: recommendationsForDecision.slice(0, 5),
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

type TrustDecisionAnswer = "BUY" | "INVESTIGATE" | "AVOID";

type TrustDecisionEvidenceItem = {
  kind: "OBSERVED" | "INFERRED" | "UNKNOWN";
  text: string;
  source: string;
};

type TrustDecisionInput = {
  scores: ReturnType<typeof applyEvidenceCoverageGate>;
  coverage: ReturnType<typeof assessEvidenceCoverage>;
  issues: Array<{ severity?: string; title?: string; evidence?: string; category?: string }>;
  recommendations: string[];
  repository: { owner: string; repo: string; filesLoaded: number; totalFilesDiscovered: number } | null;
  sbom: ReturnType<typeof generateSoftwareBillOfMaterials>;
};

function buildTrustDecision(input: TrustDecisionInput) {
  const answer = trustAnswerFor(input);
  const observed = observedDecisionEvidence(input);
  const inferred = inferredDecisionEvidence(input);
  const unknown = unknownDecisionEvidence(input);

  return {
    answer,
    headline: trustHeadlineFor(answer),
    summary: trustSummaryFor(answer, input),
    confidence: input.scores.confidence,
    coveragePercent: input.coverage.coveragePercent,
    coverageLabel: input.coverage.level.toUpperCase(),
    riskLevel: input.scores.riskLevel,
    primaryReasons: primaryReasonsFor(answer, observed, inferred, unknown),
    observed,
    inferred,
    unknown,
    nextActions: nextActionsFor(answer, input),
  };
}

function trustAnswerFor(input: TrustDecisionInput): TrustDecisionAnswer {
  const criticalOrHigh = input.issues.some((issue) => /critical|high/i.test(String(issue.severity || "")));
  if (input.scores.verdict === "HIGH_RISK" || input.scores.productionReadinessScore < 45) return "AVOID";
  if (criticalOrHigh && input.scores.confidence >= 55) return "AVOID";
  if (input.scores.verdict !== "FULL_REVIEW_READY") return "INVESTIGATE";
  if (input.scores.confidence < 75 || input.coverage.level !== "complete") return "INVESTIGATE";
  return input.scores.productionReadinessScore >= 80 ? "BUY" : "INVESTIGATE";
}

function observedDecisionEvidence(input: TrustDecisionInput): TrustDecisionEvidenceItem[] {
  const items: TrustDecisionEvidenceItem[] = [];
  if (input.repository) {
    items.push({
      kind: "OBSERVED",
      text: `Repository evidence was read from ${input.repository.filesLoaded} of ${input.repository.totalFilesDiscovered} discovered file(s).`,
      source: `${input.repository.owner}/${input.repository.repo}`,
    });
  } else {
    items.push({
      kind: "OBSERVED",
      text: `Submitted source sample contained ${input.coverage.inputLength.toLocaleString()} character(s).`,
      source: "submitted source",
    });
  }
  if (input.sbom.status !== "not_found") {
    items.push({
      kind: "OBSERVED",
      text: `SBOM evidence found ${input.sbom.componentCount} component(s) from ${input.sbom.manifestCount} manifest(s).`,
      source: input.sbom.format,
    });
  }
  if (input.issues.length > 0) {
    items.push({
      kind: "OBSERVED",
      text: `${input.issues.length} risk signal(s) were returned by preview analysis.`,
      source: "preview analysis",
    });
  }
  return items.slice(0, 4);
}

function inferredDecisionEvidence(input: TrustDecisionInput): TrustDecisionEvidenceItem[] {
  const items: TrustDecisionEvidenceItem[] = [
    {
      kind: "INFERRED",
      text: `Decision is based on ${input.scores.confidence}% confidence and ${input.coverage.level} evidence coverage.`,
      source: "coverage gate",
    },
    {
      kind: "INFERRED",
      text: `Displayed scores are capped at ${input.coverage.scoreCap}/100 because evidence is incomplete.`,
      source: "coverage-adjusted score",
    },
  ];
  if (input.scores.rawScores.productionReadinessScore > input.scores.productionReadinessScore) {
    items.push({
      kind: "INFERRED",
      text: `Raw readiness was ${input.scores.rawScores.productionReadinessScore}/100 before the evidence cap was applied.`,
      source: "raw scanner output",
    });
  }
  return items.slice(0, 4);
}

function unknownDecisionEvidence(input: TrustDecisionInput): TrustDecisionEvidenceItem[] {
  const items: TrustDecisionEvidenceItem[] = [];
  if (input.coverage.level !== "complete") {
    items.push({ kind: "UNKNOWN", text: "Full repository behavior cannot be determined from preview evidence.", source: "coverage boundary" });
  }
  if (input.sbom.status === "not_found") {
    items.push({ kind: "UNKNOWN", text: "Dependency inventory could not be built from submitted evidence.", source: "SBOM boundary" });
  } else if (input.sbom.completeness === "limited") {
    items.push({ kind: "UNKNOWN", text: "Exact transitive dependency versions require lockfile, build artifact, or CI-generated SBOM evidence.", source: "SBOM boundary" });
  }
  items.push(
    { kind: "UNKNOWN", text: "Production uptime, incident history, and live operational behavior were not measured.", source: "runtime boundary" },
    { kind: "UNKNOWN", text: "Legal ownership, revenue, and customer usage were not independently verified.", source: "business boundary" },
  );
  return items.slice(0, 5);
}

function primaryReasonsFor(
  answer: TrustDecisionAnswer,
  observed: TrustDecisionEvidenceItem[],
  inferred: TrustDecisionEvidenceItem[],
  unknown: TrustDecisionEvidenceItem[],
) {
  const reasons = [...observed.slice(0, 2), ...inferred.slice(0, 2)].map((item) => item.text);
  if (answer !== "BUY") reasons.push(unknown[0]?.text || "Material unknowns remain.");
  return reasons.filter(Boolean).slice(0, 5);
}

function nextActionsFor(answer: TrustDecisionAnswer, input: TrustDecisionInput) {
  if (answer === "BUY") {
    return [
      "Generate the full decision report before purchase or production use.",
      "Attach repository, SBOM, deployment, and ownership evidence.",
      "Monitor trust drift after dependency or deployment changes.",
    ];
  }
  if (answer === "AVOID") {
    return [
      "Do not buy, integrate, or present this software until blockers are resolved.",
      "Fix critical/high findings and rerun the decision preview.",
      "Use a full review only after evidence coverage improves.",
    ];
  }
  return [
    "Investigate unknowns before buying, integrating, or recommending this software.",
    "Run a full decision report with complete repo and lockfile evidence.",
    ...input.recommendations.slice(0, 2),
  ].filter(Boolean).slice(0, 4);
}

function trustHeadlineFor(answer: TrustDecisionAnswer) {
  if (answer === "BUY") return "Proceed, with normal diligence.";
  if (answer === "AVOID") return "Do not proceed yet.";
  return "Investigate before proceeding.";
}

function trustSummaryFor(answer: TrustDecisionAnswer, input: TrustDecisionInput) {
  if (answer === "BUY") return "The available evidence supports proceeding, but the decision remains limited to submitted and observed evidence.";
  if (answer === "AVOID") return "The current evidence indicates material risk. Treat this as a repair or rejection signal until blockers change.";
  return `The software has useful evidence, but ${input.coverage.level} coverage and ${input.scores.confidence}% confidence leave material unknowns.`;
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
