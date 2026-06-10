import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse, withStep } from "@/lib/diagnostics";
import { resolveWorkspaceProjectIdForUser } from "@/lib/services/projectWorkspace";
import { buildSoftwareTrustLedgerReport, listSoftwareTrustLedgerSnapshots } from "@/lib/trust-ledger/trustLedgerService";
import { compileTrust, readCompiledJson } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const traceId = createTrace("trust-ledger.GET");
  try {
    const { session } = await compileTrust(request, { mode: "session" });
    const requestedProjectId = request.nextUrl.searchParams.get("projectId") || request.nextUrl.searchParams.get("project_id") || "";
    if (!requestedProjectId.trim()) {
      return NextResponse.json({ ok: false, traceId, error: "projectId is required." }, { status: 400 });
    }

    const projectId = await withStep("trust-ledger.GET", traceId, "verify project ownership", () =>
      resolveWorkspaceProjectIdForUser(requestedProjectId, session.userId), 10_000);
    if (!projectId) {
      return NextResponse.json({ ok: false, traceId, error: "Project not found." }, { status: 404 });
    }

    const snapshots = await withStep("trust-ledger.GET", traceId, "load trust ledger snapshots", () =>
      listSoftwareTrustLedgerSnapshots({ projectId, userId: session.userId }), 10_000);

    return NextResponse.json({
      ok: true,
      traceId,
      projectId,
      snapshots,
      latest: snapshots[0] || null,
    });
  } catch (error) {
    return errorResponse("trust-ledger.GET", traceId, error, statusForTrustLedgerError(error));
  }
}

export async function POST(request: NextRequest) {
  const traceId = createTrace("trust-ledger.POST");
  try {
    const { session } = await compileTrust(request, { mode: "session" });
    const body = await readCompiledJson(request);
    const requestedProjectId = String(body.projectId || body.project_id || "").trim();
    if (!requestedProjectId) {
      return NextResponse.json({ ok: false, traceId, error: "projectId is required." }, { status: 400 });
    }

    const persist = body.persist === false ? false : true;
    const projectId = await withStep("trust-ledger.POST", traceId, "verify project ownership", () =>
      resolveWorkspaceProjectIdForUser(requestedProjectId, session.userId), 10_000);
    if (!projectId) {
      return NextResponse.json({ ok: false, traceId, error: "Project not found." }, { status: 404 });
    }

    const ledger = await withStep("trust-ledger.POST", traceId, "compile software trust ledger", () =>
      buildSoftwareTrustLedgerReport({ projectId, userId: session.userId, persist }), 15_000);

    return NextResponse.json({
      ok: true,
      traceId,
      projectId,
      ledger,
    });
  } catch (error) {
    return errorResponse("trust-ledger.POST", traceId, error, statusForTrustLedgerError(error));
  }
}

function statusForTrustLedgerError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  if (message === "PROJECT_NOT_FOUND") return 404;
  if (/projectId|required/i.test(message)) return 400;
  return 500;
}

