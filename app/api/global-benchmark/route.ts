import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse, withStep } from "@/lib/diagnostics";
import { loadGlobalLatestScanSnapshots, loadProjectScanSnapshots } from "@/lib/evolution/projectHistory";
import { compareProjectAgainstStoredHistory } from "@/lib/intelligence/global-benchmark";
import { resolveWorkspaceProjectIdForUser } from "@/lib/services/projectWorkspace";
import { compileTrust, readCompiledJson } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const traceId = createTrace("global-benchmark.POST");
  try {
    const { session } = await compileTrust(request, { mode: "session" });
    const body = await readCompiledJson(request);
    const requestedProjectId = String(body.projectId || body.project_id || "").trim();
    if (!requestedProjectId) {
      return NextResponse.json({ ok: false, traceId, error: "projectId is required." }, { status: 400 });
    }

    const projectId = await withStep("global-benchmark.POST", traceId, "verify project ownership", () =>
      resolveWorkspaceProjectIdForUser(requestedProjectId, session.userId), 10_000);
    if (!projectId) {
      return NextResponse.json({ ok: false, traceId, error: "Project not found." }, { status: 404 });
    }

    const [projectSnapshots, storedHistorySnapshots] = await withStep("global-benchmark.POST", traceId, "load stored scan history", () =>
      Promise.all([loadProjectScanSnapshots(projectId, 24), loadGlobalLatestScanSnapshots(500)]), 15_000);

    const report = compareProjectAgainstStoredHistory({
      projectId,
      projectSnapshots,
      storedHistorySnapshots,
    });

    return NextResponse.json({
      ok: true,
      traceId,
      ...report,
      telemetry: {
        persisted: false,
        dataset: "stored_scan_history_comparison",
        mode: "read-only",
      },
    });
  } catch (error) {
    return errorResponse("global-benchmark.POST", traceId, error, statusForGlobalBenchmarkError(error));
  }
}

function statusForGlobalBenchmarkError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  if (message === "PROJECT_NOT_FOUND") return 404;
  if (/projectId|required/i.test(message)) return 400;
  return 500;
}
