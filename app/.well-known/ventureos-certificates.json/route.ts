import { NextRequest, NextResponse } from "next/server";

import { listPublicSigningKeys } from "@/lib/certificates/certificateService";
import { createTrace, errorResponse, withStep } from "@/lib/diagnostics";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const traceId = createTrace("certificates.well-known.GET");
  try {
    await compileTrust(request, { mode: "publicRead", reason: "public certificate signing keys" });
    const keys = await withStep("certificates.well-known.GET", traceId, "list public signing keys", () => listPublicSigningKeys(), 10_000);
    return NextResponse.json({
      ok: true,
      issuer: "VentureOS",
      algorithms: ["Ed25519"],
      keys,
    }, {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    return errorResponse("certificates.well-known.GET", traceId, error, 500);
  }
}
