import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse, withStep } from "@/lib/diagnostics";
import { buildPublicAnchorManifest } from "@/lib/transparency/transparencyLog";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const traceId = createTrace("transparency-anchor.well-known.GET");
  try {
    await compileTrust(request, { mode: "publicRead", reason: "public transparency anchor manifest" });
    const certificateId = request.nextUrl.searchParams.get("certificateId") || request.nextUrl.searchParams.get("certificate_id") || "";
    const manifest = await withStep("transparency-anchor.well-known.GET", traceId, "build public anchor manifest", () =>
      buildPublicAnchorManifest({ certificateId, baseUrl: request.nextUrl.origin }), 10_000);
    return NextResponse.json(manifest, {
      headers: {
        "Cache-Control": "public, max-age=120, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    return errorResponse("transparency-anchor.well-known.GET", traceId, error, 500);
  }
}
