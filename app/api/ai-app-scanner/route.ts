import { NextRequest, NextResponse } from "next/server";

import { createTrace, traceError, withStep } from "@/lib/diagnostics";
import {
  enforceRateLimit,
  jsonResponse,
  mergeHeaders,
  RATE_LIMITS,
  readJsonBody,
  sanitizeRepoFiles,
  secureErrorResponse,
  type RateLimitResult,
} from "@/lib/security/backendSecurity";
import { scanAIApp, type AIAppScannerMetadata } from "@/lib/scanner/aiAppScanner";
import { apiUsageHeaders, intelligenceMonetizationService, MonetizationError, type MonetizationContext } from "@/lib/services/intelligenceMonetization";
import { resolveWorkspaceProjectIdForUser } from "@/lib/services/projectWorkspace";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ScannerBody = {
  files?: unknown[];
  metadata?: AIAppScannerMetadata;
  projectId?: string;
  project_id?: string;
};

export async function POST(request: NextRequest) {
  const traceId = createTrace("ai-app-scanner.POST");
  let metering: MonetizationContext | null = null;
  let rateLimit: RateLimitResult | null = null;
  try {
    rateLimit = await enforceRateLimit(request, RATE_LIMITS.scanRepo);
    const trust = await withStep("ai-app-scanner.POST", traceId, "compile api key trust", () =>
      compileTrust(request, { mode: "apiKey", endpoint: "/api/ai-app-scanner", scope: "intelligence:scan" }), 5_000);
    metering = trust.metering || null;
    if (!metering) throw new Error("TRUST_POLICY_INVALID");

    const body = await readJsonBody<ScannerBody>(request, { maxBytes: 1_500_000 });
    const projectId = await resolveWorkspaceProjectIdForUser(body.projectId || body.project_id, metering.userId);
    const sanitizedFiles = sanitizeRepoFiles(body.files, { maxFiles: 750, maxFileBytes: 200_000, maxTotalBytes: 1_000_000 });
    if (sanitizedFiles.files.length === 0) {
      return NextResponse.json({ ok: false, traceId, error: "files must include at least one repository file." }, { status: 400 });
    }

    const result = await withStep("ai-app-scanner.POST", traceId, "run deterministic scanner", () =>
      scanAIApp({
        files: sanitizedFiles.files,
        metadata: normalizeMetadata(body.metadata),
      }), 10_000);

    await intelligenceMonetizationService.recordUsage({
      context: metering,
      method: request.method,
      statusCode: 200,
      metadata: {
        readinessScore: result.readinessScore,
        securityIssues: result.securityIssues.length,
        deploymentIssues: result.deploymentIssues.length,
        architectureIssues: result.architectureIssues.length,
        filesScanned: result.summary.filesScanned,
        inputTruncated: sanitizedFiles.truncated,
        promptInjectionSignals: sanitizedFiles.promptInjectionSignals,
        projectLinked: Boolean(projectId),
      },
    });

    return jsonResponse({
      ok: true,
      traceId,
      projectId,
      sandbox: { mode: "static-analysis-only", codeExecuted: false, networkAccess: false, mutations: false },
      inputTruncated: sanitizedFiles.truncated,
      securityWarnings: sanitizedFiles.promptInjectionSignals,
      ...result,
    }, { headers: mergeHeaders(apiUsageHeaders(metering), rateLimit.headers) });
  } catch (error) {
    traceError("ai-app-scanner.POST", "scan failed", error, { traceId });
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof MonetizationError
      ? error.status
      : message === "PROJECT_NOT_FOUND"
        ? 404
        : /FORBIDDEN/.test(message)
          ? 403
          : /files must|required|json|content-type/i.test(message)
            ? 400
            : 500;
    if (metering) {
      await intelligenceMonetizationService
        .recordUsage({ context: metering, method: request.method, statusCode: status, metadata: { error: message } })
        .catch((usageError) => traceError("ai-app-scanner.POST", "usage logging failed", usageError, { traceId }));
    }
    if (!(error instanceof MonetizationError)) {
      return secureErrorResponse("ai-app-scanner.POST", traceId, error, { fallbackStatus: status, headers: mergeHeaders(metering ? apiUsageHeaders(metering) : undefined, rateLimit?.headers) });
    }
    return NextResponse.json(
      { ok: false, traceId, error: message || "Failed to scan app.", details: error.details },
      { status, headers: mergeHeaders(metering ? apiUsageHeaders(metering) : undefined, rateLimit?.headers) },
    );
  }
}

function normalizeMetadata(value: unknown): AIAppScannerMetadata {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AIAppScannerMetadata : {};
}
