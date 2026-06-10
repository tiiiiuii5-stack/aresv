import { NextRequest, NextResponse } from "next/server";

import { createTrace, trace, traceError, withStep } from "@/lib/diagnostics";
import {
  enforceRateLimit,
  jsonResponse,
  mergeHeaders,
  RATE_LIMITS,
  readJsonBody,
  sanitizeScanInput,
  secureErrorResponse,
  type RateLimitResult,
} from "@/lib/security/backendSecurity";
import { ventureOSIntelligenceService } from "@/lib/services/intelligenceAnalysis";
import { apiUsageHeaders, intelligenceMonetizationService, MonetizationError, type MonetizationContext } from "@/lib/services/intelligenceMonetization";
import { resolveWorkspaceProjectIdForUser } from "@/lib/services/projectWorkspace";
import { compileTrust } from "@/lib/trust/compiler";

export async function POST(request: NextRequest) {
  const traceId = createTrace("intelligence.analyze");
  let metering: MonetizationContext | null = null;
  let rateLimit: RateLimitResult | null = null;
  try {
    rateLimit = await enforceRateLimit(request, RATE_LIMITS.analyzeApp);
    const trust = await withStep("intelligence.analyze", traceId, "compile api key trust", () =>
      compileTrust(request, { mode: "apiKey", endpoint: "/api/analyze-app", scope: "intelligence:analyze" }), 5_000);
    metering = trust.metering || null;
    if (!metering) throw new Error("TRUST_POLICY_INVALID");
    const body = await readJsonBody<{
      appCode?: string | Record<string, unknown> | unknown[];
      framework?: string;
      modules?: unknown[];
      appMetadata?: Record<string, unknown>;
      validationResults?: Record<string, unknown>;
      failureEvents?: unknown[];
      repairAttempts?: unknown[];
      projectId?: string;
      project_id?: string;
    }>(request, { maxBytes: 300_000 });
    const projectId = await resolveWorkspaceProjectIdForUser(body.projectId || body.project_id, metering.userId);

    const scanInput = sanitizeScanInput(
      { appCode: body.appCode ?? "", framework: body.framework ?? "", modules: body.modules ?? [] },
      { maxCodeLength: 250_000, maxModules: 24 },
    );

    trace("intelligence.analyze", "payload parsed", {
      traceId,
      apiKeyId: metering.apiKeyId,
      tier: metering.tier,
      framework: scanInput.framework,
      modules: scanInput.modules.length,
      inputTruncated: scanInput.inputTruncated,
      promptInjectionSignals: scanInput.promptInjectionSignals,
    });

    const result = await withStep(
      "intelligence.analyze",
      traceId,
      "run production risk intelligence",
      () =>
        ventureOSIntelligenceService.analyze({
          projectId,
          appCode: scanInput.appCode,
          framework: scanInput.framework,
          modules: scanInput.modules,
          appMetadata: {
            ...(body.appMetadata && typeof body.appMetadata === "object" ? body.appMetadata : {}),
            security: {
              inputTruncated: scanInput.inputTruncated,
              promptInjectionSignals: scanInput.promptInjectionSignals,
              sandbox: scanInput.sandbox,
            },
          },
          validationResults: body.validationResults && typeof body.validationResults === "object" ? body.validationResults : {},
          failureEvents: Array.isArray(body.failureEvents) ? body.failureEvents : [],
          repairAttempts: Array.isArray(body.repairAttempts)
            ? body.repairAttempts.map((attempt, index) => {
                const item = attempt && typeof attempt === "object" ? (attempt as Record<string, unknown>) : {};
                return {
                  attemptNumber: typeof item.attemptNumber === "number" ? item.attemptNumber : index + 1,
                  strategy: typeof item.strategy === "string" ? item.strategy : "unspecified",
                  status: typeof item.status === "string" ? item.status : "unknown",
                  beforeScore: typeof item.beforeScore === "number" ? item.beforeScore : undefined,
                  afterScore: typeof item.afterScore === "number" ? item.afterScore : undefined,
                  issuesBefore: Array.isArray(item.issuesBefore) ? item.issuesBefore : [],
                  issuesAfter: Array.isArray(item.issuesAfter) ? item.issuesAfter : [],
                  changes: Array.isArray(item.changes) ? item.changes : [],
                  metadata: item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata) ? (item.metadata as Record<string, unknown>) : {},
                };
              })
            : [],
        }),
      20_000,
    );

    await intelligenceMonetizationService.recordUsage({
      context: metering,
      method: request.method,
      statusCode: 200,
      metadata: { framework: scanInput.framework, modules: scanInput.modules.length, riskLevel: result.riskLevel, projectLinked: Boolean(projectId) },
    });

    return jsonResponse({
      ok: true,
      traceId,
      securityWarnings: scanInput.promptInjectionSignals,
      sandbox: scanInput.sandbox,
      securityScore: result.securityScore,
      failureScore: result.failureScore,
      productionReadinessScore: result.productionReadinessScore,
      riskLevel: result.riskLevel,
      severityBreakdown: result.severityBreakdown,
      vulnerabilities: result.vulnerabilities,
      issues: result.issues,
      recommendations: result.recommendations,
      predictedFailurePoints: result.predictedFailurePoints,
      predictedFailureScenarios: result.predictedFailureScenarios,
      failureIntelligence: result.failureIntelligence,
      failureReport: result.failureReport,
      externalIntelligence: result.externalIntelligence,
      actionableFixes: result.actionableFixes,
      launchVerdict: result.launchVerdict,
      launchReadinessScore: result.launchReadinessScore,
      regressionReport: result.regressionReport,
      detectedVulnerabilities: result.detectedVulnerabilities,
      analysisId: result.analysisId,
      telemetry: result.telemetry,
      projectId,
    }, { headers: mergeHeaders(apiUsageHeaders(metering), rateLimit.headers) });
  } catch (error) {
    traceError("intelligence.analyze", "analysis failed", error, { traceId });
    const message = error instanceof Error ? error.message : "Failed to analyze app.";
    const status = error instanceof MonetizationError
      ? error.status
      : message === "PROJECT_NOT_FOUND"
        ? 404
        : /FORBIDDEN/.test(message)
          ? 403
          : /token|jwt|scope|authorization|bearer|api key/i.test(message)
            ? 401
            : 400;
    if (metering) {
      await intelligenceMonetizationService
        .recordUsage({ context: metering, method: request.method, statusCode: status, metadata: { error: message } })
        .catch((usageError) => traceError("intelligence.analyze", "usage logging failed", usageError, { traceId }));
    }
    if (!(error instanceof MonetizationError)) {
      return secureErrorResponse("intelligence.analyze", traceId, error, { fallbackStatus: status, headers: mergeHeaders(metering ? apiUsageHeaders(metering) : undefined, rateLimit?.headers) });
    }
    return NextResponse.json(
      { ok: false, traceId, error: message, details: error instanceof MonetizationError ? error.details : undefined },
      { status, headers: mergeHeaders(metering ? apiUsageHeaders(metering) : undefined, rateLimit?.headers) },
    );
  }
}
