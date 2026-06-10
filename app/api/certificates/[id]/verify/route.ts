import { NextRequest, NextResponse } from "next/server";

import { verifyStoredCertificate } from "@/lib/certificates/certificateService";
import { createTrace, errorResponse, withStep } from "@/lib/diagnostics";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const traceId = createTrace("certificates.id.verify.GET");
  try {
    await compileTrust(request, { mode: "publicRead", reason: "public certificate verification" });
    const { id } = await context.params;
    const verification = await withStep("certificates.id.verify.GET", traceId, "verify stored certificate", () =>
      verifyStoredCertificate(decodeURIComponent(id || "")), 10_000);

    return NextResponse.json({
      ok: true,
      traceId,
      verification,
    }, { status: verification.status === "UNKNOWN" ? 404 : 200 });
  } catch (error) {
    return errorResponse("certificates.id.verify.GET", traceId, error, 500);
  }
}
