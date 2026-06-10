import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse, withStep } from "@/lib/diagnostics";
import { buildClosedLoopReport } from "@/lib/evolution/closedLoopEngine";
import { loadProjectScanSnapshots } from "@/lib/evolution/projectHistory";
import { resolveWorkspaceProjectIdForUser } from "@/lib/services/projectWorkspace";
import { compileTrust, readCompiledJson } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const traceId = createTrace("closed-loop.POST");
  try {
    const { session } = await compileTrust(request, { mode: "session" });
    const body = await readCompiledJson(request);
    const requestedProjectId = String(body.projectId || body.project_id || "").trim();
    if (!requestedProjectId) {
      return NextResponse.json({ ok: false, traceId, error: "projectId is required." }, { status: 400 });
    }

    const projectId = await withStep("closed-loop.POST", traceId, "verify project ownership", () =>
      resolveWorkspaceProjectIdForUser(requestedProjectId, session.userId), 10_000);
    if (!projectId) {
      return NextResponse.json({ ok: false, traceId, error: "Project not found." }, { status: 404 });
    }

    const snapshots = await withStep("closed-loop.POST", traceId, "load project scan snapshots", () => loadProjectScanSnapshots(projectId, 24), 10_000);
    const report = buildClosedLoopReport({ projectId, snapshots });

    return NextResponse.json({
      ok: true,
      traceId,
      ...report,
      telemetry: {
        persisted: false,
        dataset: "closed_loop_improvement",
        mode: "read-only",
      },
    });
  } catch (error) {
    return errorResponse("closed-loop.POST", traceId, error, statusForClosedLoopError(error));
  }
}

function statusForClosedLoopError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  if (message === "PROJECT_NOT_FOUND") return 404;
  if (/projectId|required/i.test(message)) return 400;
  return 500;
}
