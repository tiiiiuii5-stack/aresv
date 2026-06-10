import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse, withStep } from "@/lib/diagnostics";
import { resolveWorkspaceProjectIdForUser } from "@/lib/services/projectWorkspace";
import { buildConsistencyProof } from "@/lib/transparency/merkleTree";
import { buildProjectTransparencyLog, buildPublicTransparencyLog } from "@/lib/transparency/transparencyLog";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const traceId = createTrace("transparency-log.consistency.GET");
  try {
    const certificateId = request.nextUrl.searchParams.get("certificateId") || request.nextUrl.searchParams.get("certificate_id") || "";
    const requestedProjectId = request.nextUrl.searchParams.get("projectId") || request.nextUrl.searchParams.get("project_id") || "";
    const previousSize = Number(request.nextUrl.searchParams.get("previousSize") || request.nextUrl.searchParams.get("previous_size") || "0");
    const limit = Number(request.nextUrl.searchParams.get("limit") || "");

    if (requestedProjectId.trim()) {
      const { session } = await compileTrust(request, { mode: "session" });
      const projectId = await withStep("transparency-log.consistency.GET", traceId, "verify project ownership", () =>
        resolveWorkspaceProjectIdForUser(requestedProjectId, session.userId), 10_000);
      if (!projectId) return NextResponse.json({ ok: false, traceId, error: "Project not found." }, { status: 404 });
      const log = await withStep("transparency-log.consistency.GET", traceId, "build project transparency log", () =>
        buildProjectTransparencyLog({ projectId, limit }), 10_000);
      const proof = buildConsistencyProof({ entries: log.entries, previousTreeSize: previousSize });
      return NextResponse.json({ ok: true, traceId, proof });
    }

    await compileTrust(request, { mode: "publicRead", reason: "public transparency consistency proof" });
    const log = await withStep("transparency-log.consistency.GET", traceId, "build public transparency log", () =>
      buildPublicTransparencyLog({ certificateId, limit }), 10_000);
    const proof = buildConsistencyProof({ entries: log.entries, previousTreeSize: previousSize });
    return NextResponse.json({ ok: true, traceId, proof }, { status: certificateId && log.entryCount === 0 ? 404 : 200 });
  } catch (error) {
    return errorResponse("transparency-log.consistency.GET", traceId, error, statusForConsistencyError(error));
  }
}

function statusForConsistencyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  if (/NOT_FOUND/.test(message)) return 404;
  if (/required|invalid/i.test(message)) return 400;
  return 500;
}
