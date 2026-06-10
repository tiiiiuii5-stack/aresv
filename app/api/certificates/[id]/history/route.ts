import { NextRequest, NextResponse } from "next/server";

import { loadCertificateHistory } from "@/lib/certificates/certificateService";
import { createTrace, errorResponse, withStep } from "@/lib/diagnostics";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const traceId = createTrace("certificates.id.history.GET");
  try {
    await compileTrust(request, { mode: "publicRead", reason: "public certificate history" });
    const { id } = await context.params;
    const history = await withStep("certificates.id.history.GET", traceId, "load certificate history", () =>
      loadCertificateHistory(decodeURIComponent(id || "")), 10_000);

    return NextResponse.json({
      ok: true,
      traceId,
      history,
      count: history.length,
    });
  } catch (error) {
    return errorResponse("certificates.id.history.GET", traceId, error, 500);
  }
}
