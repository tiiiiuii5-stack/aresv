import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse, withStep } from "@/lib/diagnostics";
import { loadPrivateSoftwareAppraisal } from "@/lib/appraisal/appraisalEngine";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const traceId = createTrace("appraisals.id.GET");
  try {
    const { session } = await compileTrust(request, { mode: "session" });
    const { id } = await context.params;
    const appraisal = await withStep("appraisals.id.GET", traceId, "load private software appraisal", () =>
      loadPrivateSoftwareAppraisal(decodeURIComponent(id || ""), session.userId), 10_000);

    if (!appraisal) {
      return NextResponse.json({ ok: false, traceId, error: "Appraisal not found." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      traceId,
      appraisal,
    });
  } catch (error) {
    return errorResponse("appraisals.id.GET", traceId, error, statusForAppraisalError(error));
  }
}

function statusForAppraisalError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  return 500;
}

