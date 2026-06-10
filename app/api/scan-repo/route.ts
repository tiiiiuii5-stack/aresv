import { NextRequest, NextResponse } from "next/server";

import { createTrace, traceError, withStep } from "@/lib/diagnostics";
import {
  enforceRateLimit,
  jsonResponse,
  mergeHeaders,
  RATE_LIMITS,
  readJsonBody,
  sanitizeRepoFiles,
  sanitizeRepositoryReference,
  secureErrorResponse,
  type RateLimitResult,
} from "@/lib/security/backendSecurity";
import { apiUsageHeaders, intelligenceMonetizationService, MonetizationError, type MonetizationContext } from "@/lib/services/intelligenceMonetization";
import { recordProjectRepositoryLink, resolveWorkspaceProjectIdForUser } from "@/lib/services/projectWorkspace";
import { repoScanService } from "@/lib/services/repoScan";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const traceId = createTrace("intelligence.scan-repo.POST");
  let metering: MonetizationContext | null = null;
  let rateLimit: RateLimitResult | null = null;
  try {
    rateLimit = await enforceRateLimit(request, RATE_LIMITS.scanRepo);
    const trust = await withStep("intelligence.scan-repo.POST", traceId, "compile api key trust", () =>
      compileTrust(request, { mode: "apiKey", endpoint: "/api/scan-repo", scope: "intelligence:scan" }), 5_000);
    metering = trust.metering || null;
    if (!metering) throw new Error("TRUST_POLICY_INVALID");
    const body = await readJsonBody<{
      repository?: string;
      framework?: string;
      modules?: unknown[];
      files?: unknown[];
      blockThreshold?: number;
      scanMode?: string;
      previousAssurance?: unknown;
      projectId?: string;
      project_id?: string;
      branch?: string;
    }>(request, { maxBytes: scanModeFromRequest(request) === "deep" ? 8_000_000 : 1_500_000 });
    const projectId = await resolveWorkspaceProjectIdForUser(body.projectId || body.project_id, metering.userId);

    const scanMode = scanModeFromValue(body.scanMode, scanModeFromRequest(request));
    const sanitizedFiles = sanitizeRepoFiles(body.files, scanMode === "deep"
      ? { maxFiles: 2_500, maxFileBytes: 500_000, maxTotalBytes: 6_000_000 }
      : { maxFiles: 750, maxFileBytes: 200_000, maxTotalBytes: 1_000_000 });
    const repository = sanitizeRepositoryReference(body.repository);
    const result = await withStep("intelligence.scan-repo.POST", traceId, "scan repository", () =>
      repoScanService.scan({
        projectId,
        repository,
        framework: typeof body.framework === "string" ? body.framework.slice(0, 40) : undefined,
        modules: Array.isArray(body.modules) ? body.modules.map(String) : [],
        files: sanitizedFiles.files,
        blockThreshold: body.blockThreshold,
        scanMode,
        previousAssurance: body.previousAssurance,
      }), 30_000);

    await recordProjectRepositoryLink({
      projectId,
      repository,
      branch: typeof body.branch === "string" ? body.branch : null,
      metadata: {
        filesScanned: result.summary.filesScanned,
        framework: result.summary.framework,
        riskScore: result.riskScore,
      },
    });

    await intelligenceMonetizationService.recordUsage({
      context: metering,
      method: request.method,
      statusCode: 200,
      metadata: {
        status: result.status,
        scanMode,
        riskScore: result.riskScore,
        filesScanned: result.summary.filesScanned,
        blockingIssues: result.summary.blockingIssues,
        inputTruncated: sanitizedFiles.truncated,
        promptInjectionSignals: sanitizedFiles.promptInjectionSignals,
        projectLinked: Boolean(projectId),
      },
    });

    return jsonResponse({
      ok: true,
      traceId,
      securityWarnings: sanitizedFiles.promptInjectionSignals,
      sandbox: { mode: "static-analysis-only", codeExecuted: false, networkAccess: false },
      inputTruncated: sanitizedFiles.truncated,
      projectId,
      ...result,
    }, { status: result.pass ? 200 : 422, headers: mergeHeaders(apiUsageHeaders(metering), rateLimit.headers) });
  } catch (error) {
    traceError("intelligence.scan-repo.POST", "scan failed", error, { traceId });
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof MonetizationError
      ? error.status
      : message === "PROJECT_NOT_FOUND"
        ? 404
        : /FORBIDDEN/.test(message)
          ? 403
          : /files must|required/i.test(message)
            ? 400
            : 500;
    if (metering) {
      await intelligenceMonetizationService
        .recordUsage({ context: metering, method: request.method, statusCode: status, metadata: { error: message } })
        .catch((usageError) => traceError("intelligence.scan-repo.POST", "usage logging failed", usageError, { traceId }));
    }
    if (!(error instanceof MonetizationError)) {
      return secureErrorResponse("intelligence.scan-repo.POST", traceId, error, { fallbackStatus: status, headers: mergeHeaders(metering ? apiUsageHeaders(metering) : undefined, rateLimit?.headers) });
    }
    return NextResponse.json(
      { ok: false, traceId, error: message || "Failed to scan repository.", details: error instanceof MonetizationError ? error.details : undefined },
      { status, headers: mergeHeaders(metering ? apiUsageHeaders(metering) : undefined, rateLimit?.headers) },
    );
  }
}

function scanModeFromRequest(request: NextRequest) {
  return scanModeFromValue(request.headers.get("x-ventureos-scan-mode"), "quick");
}

function scanModeFromValue(value: unknown, fallback: "quick" | "deep") {
  return String(value || "").trim().toLowerCase() === "deep" ? "deep" : fallback;
}
