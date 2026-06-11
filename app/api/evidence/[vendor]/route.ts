import { NextRequest } from "next/server";

import { createTrace } from "@/lib/diagnostics";
import { buildWorkspaceForVendor, evidenceForVendor } from "@/lib/diligence/api-contracts";
import { enforceRateLimit, jsonResponse, secureErrorResponse } from "@/lib/security/backendSecurity";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rateLimit = { name: "evidence-vendor-api-read", limit: 80, windowMs: 60_000 };

export async function GET(request: NextRequest, { params }: { params: Promise<{ vendor: string }> }) {
  const traceId = createTrace("evidence-vendor-api.GET");
  try {
    await compileTrust(request, { mode: "publicRead", reason: "vendor evidence lookup" });
    const limit = await enforceRateLimit(request, rateLimit);
    const { vendor } = await params;
    const cleanVendor = decodeURIComponent(vendor || "");
    const workspace = await buildWorkspaceForVendor(cleanVendor);
    const result = evidenceForVendor(workspace, cleanVendor);
    if (!result.passport) {
      return jsonResponse({ ok: false, traceId, error: "Vendor evidence not found." }, { status: 404, headers: limit.headers });
    }
    return jsonResponse(
      {
        ok: true,
        traceId,
        apiVersion: "evidence-v1",
        vendor: result.passport,
        count: result.evidence.length,
        evidence: result.evidence,
        snapshot: workspace.snapshot,
      },
      { headers: limit.headers },
    );
  } catch (error) {
    return secureErrorResponse("evidence-vendor-api.GET", traceId, error, { fallbackStatus: 400 });
  }
}
