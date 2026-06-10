import { NextRequest, NextResponse } from "next/server";

import { createTrace, traceError, withStep } from "@/lib/diagnostics";
import { runEvolutionLoop } from "@/lib/evolution/evolutionEngine";
import { recordEvolutionMemory } from "@/lib/evolution/evolutionMemory";
import {
  enforceRateLimit,
  jsonResponse,
  mergeHeaders,
  RATE_LIMITS,
  readJsonBody,
  sanitizeRepoFiles,
  sanitizeScanInput,
  secureErrorResponse,
  type RateLimitResult,
} from "@/lib/security/backendSecurity";
import {
  apiUsageHeaders,
  intelligenceMonetizationService,
  MonetizationError,
  type MonetizationContext,
} from "@/lib/services/intelligenceMonetization";
import { resolveWorkspaceProjectIdForUser } from "@/lib/services/projectWorkspace";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EvolutionLoopBody = {
  source?: unknown;
  appCode?: unknown;
  framework?: unknown;
  modules?: unknown;
  files?: unknown;
  events?: unknown;
  projectId?: string;
  project_id?: string;
};

export async function POST(request: NextRequest) {
  const traceId = createTrace("intelligence.evolution-loop.POST");
  let metering: MonetizationContext | null = null;
  let rateLimit: RateLimitResult | null = null;

  try {
    rateLimit = await enforceRateLimit(request, RATE_LIMITS.analyzeApp);
    const trust = await withStep("intelligence.evolution-loop.POST", traceId, "compile api key trust", () =>
      compileTrust(request, { mode: "apiKey", endpoint: "/api/evolution-loop", scope: "intelligence:analyze" }), 5_000);
    metering = trust.metering || null;
    if (!metering) throw new Error("TRUST_POLICY_INVALID");

    const body = await readJsonBody<EvolutionLoopBody>(request, { maxBytes: 1_500_000 });
    const projectId = await resolveWorkspaceProjectIdForUser(body.projectId || body.project_id, metering.userId);
    const sanitizedFiles = sanitizeRepoFiles(body.files, { maxFiles: 750, maxFileBytes: 200_000, maxTotalBytes: 1_000_000 });
    const sanitizedScan = sanitizeScanInput(
      {
        appCode: body.source || body.appCode || "",
        framework: body.framework,
        modules: body.modules,
      },
      { maxCodeLength: 1_000_000, maxModules: 30 },
    );

    if (sanitizedFiles.files.length === 0 && !sanitizedScan.appCode.trim()) {
      throw new Error("source or files are required.");
    }

    const source = sanitizedFiles.files.length ? filesToSource(sanitizedFiles.files) : sanitizedScan.appCode;
    const report = await withStep("intelligence.evolution-loop.POST", traceId, "run evolution loop", () =>
      runEvolutionLoop({
        source,
        files: sanitizedFiles.files.length ? sanitizedFiles.files : undefined,
        framework: sanitizedScan.framework,
        modules: sanitizedScan.modules,
        events: Array.isArray(body.events) ? body.events : [],
        projectId,
        applyMode: "snapshot-only",
      }), 30_000);

    const memoryStored = await recordEvolutionMemory({
      projectId,
      framework: sanitizedScan.framework,
      report,
    });

    await intelligenceMonetizationService.recordUsage({
      context: metering,
      method: request.method,
      statusCode: 200,
      metadata: {
        systemState: report.systemState,
        systemVerdict: report.systemVerdict,
        readinessScore: report.productionReadiness.score,
        confirmedFailures: report.failureDetection.confirmedFailures.length,
        patchCandidates: report.patchPlan.candidates.length,
        approvedPatches: report.patchGate.approvedPatches.length,
        memoryStored,
        inputTruncated: sanitizedScan.inputTruncated || sanitizedFiles.truncated,
        promptInjectionSignals: unique([...sanitizedScan.promptInjectionSignals, ...sanitizedFiles.promptInjectionSignals]),
        projectLinked: Boolean(projectId),
      },
    });

    return jsonResponse(
      {
        ok: true,
        traceId,
        projectId,
        sandbox: sanitizedScan.sandbox,
        inputTruncated: sanitizedScan.inputTruncated || sanitizedFiles.truncated,
        securityWarnings: unique([...sanitizedScan.promptInjectionSignals, ...sanitizedFiles.promptInjectionSignals]),
        evolution: {
          ...report,
          learnMemory: {
            ...report.learnMemory,
            stored: memoryStored,
            storage: memoryStored ? "app_telemetry_events" : report.learnMemory.storage,
          },
        },
      },
      { status: 200, headers: mergeHeaders(apiUsageHeaders(metering), rateLimit.headers) },
    );
  } catch (error) {
    traceError("intelligence.evolution-loop.POST", "evolution loop failed", error, { traceId });
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof MonetizationError
      ? error.status
      : message === "PROJECT_NOT_FOUND"
        ? 404
        : /FORBIDDEN/.test(message)
          ? 403
          : /source or files|required|too large|json|content-type/i.test(message)
            ? 400
            : 500;

    if (metering) {
      await intelligenceMonetizationService
        .recordUsage({ context: metering, method: request.method, statusCode: status, metadata: { error: message } })
        .catch((usageError) => traceError("intelligence.evolution-loop.POST", "usage logging failed", usageError, { traceId }));
    }

    if (!(error instanceof MonetizationError)) {
      return secureErrorResponse("intelligence.evolution-loop.POST", traceId, error, {
        fallbackStatus: status,
        headers: mergeHeaders(metering ? apiUsageHeaders(metering) : undefined, rateLimit?.headers),
      });
    }

    return NextResponse.json(
      { ok: false, traceId, error: message || "Failed to run evolution loop.", details: error.details },
      { status, headers: mergeHeaders(metering ? apiUsageHeaders(metering) : undefined, rateLimit?.headers) },
    );
  }
}

function filesToSource(files: Array<{ path: string; content: string }>) {
  return files.map((file) => `// FILE: ${file.path}\n${file.content}`).join("\n\n");
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}
