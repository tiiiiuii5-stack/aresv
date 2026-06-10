import { NextRequest, NextResponse } from "next/server";

import { buildCertificateBadgeSvg } from "@/lib/certificates/badge";
import { loadPublicCertificate, verifyStoredCertificate } from "@/lib/certificates/certificateService";
import { createTrace, errorResponse, withStep } from "@/lib/diagnostics";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const traceId = createTrace("certificates.id.badge.GET");
  try {
    await compileTrust(request, { mode: "publicRead", reason: "public signed certificate badge" });
    const { id } = await context.params;
    const certificateId = decodeURIComponent(id || "");
    const certificate = await withStep("certificates.id.badge.GET", traceId, "load public certificate", () =>
      loadPublicCertificate(certificateId), 10_000);
    const verification = certificate
      ? await withStep("certificates.id.badge.GET", traceId, "verify public certificate", () => verifyStoredCertificate(certificateId), 10_000)
      : null;
    const svg = buildCertificateBadgeSvg({
      status: verification?.valid && certificate ? certificate.status : "INVALID",
      payload: certificate?.payload || null,
    });

    return new NextResponse(svg, {
      status: certificate ? 200 : 404,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse("certificates.id.badge.GET", traceId, error, 500);
  }
}
