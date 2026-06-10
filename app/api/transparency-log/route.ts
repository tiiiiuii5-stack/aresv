import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse, withStep } from "@/lib/diagnostics";
import { resolveWorkspaceProjectIdForUser } from "@/lib/services/projectWorkspace";
import { buildProjectTransparencyLog, buildPublicTransparencyLog } from "@/lib/transparency/transparencyLog";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const traceId = createTrace("transparency-log.GET");
  try {
    const certificateId = request.nextUrl.searchParams.get("certificateId") || request.nextUrl.searchParams.get("certificate_id") || "";
    const requestedProjectId = request.nextUrl.searchParams.get("projectId") || request.nextUrl.searchParams.get("project_id") || "";
    const limit = Number(request.nextUrl.searchParams.get("limit") || "");

    if (requestedProjectId.trim()) {
      const { session } = await compileTrust(request, { mode: "session" });
      const projectId = await withStep("transparency-log.GET", traceId, "verify project ownership", () =>
        resolveWorkspaceProjectIdForUser(requestedProjectId, session.userId), 10_000);
      if (!projectId) {
        return NextResponse.json({ ok: false, traceId, error: "Project not found." }, { status: 404 });
      }
      const log = await withStep("transparency-log.GET", traceId, "build project transparency log", () =>
        buildProjectTransparencyLog({ projectId, limit }), 10_000);
      return NextResponse.json({ ok: true, traceId, log });
    }

    await compileTrust(request, { mode: "publicRead", reason: "public transparency log lookup" });
    const log = await withStep("transparency-log.GET", traceId, "build public transparency log", () =>
      buildPublicTransparencyLog({ certificateId, limit }), 10_000);
    return NextResponse.json({ ok: true, traceId, log }, { status: certificateId && log.entryCount === 0 ? 404 : 200 });
  } catch (error) {
    return errorResponse("transparency-log.GET", traceId, error, statusForTransparencyLogError(error));
  }
}

function statusForTransparencyLogError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  if (/required|invalid/i.test(message)) return 400;
  return 500;
}
