import { NextRequest } from "next/server";

import { createTrace } from "@/lib/diagnostics";
import { monitorContract } from "@/lib/diligence/api-contracts";
import { buildDueDiligenceWorkspace } from "@/lib/diligence/due-diligence-engine";
import { enforceRateLimit, jsonResponse, secureErrorResponse } from "@/lib/security/backendSecurity";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rateLimit = { name: "monitor-api-read", limit: 80, windowMs: 60_000 };

export async function GET(request: NextRequest, { params }: { params: Promise<{ vendor: string }> }) {
  const traceId = createTrace("monitor-api.GET");
  try {
    await compileTrust(request, { mode: "publicRead", reason: "vendor evidence drift API" });
    const limit = await enforceRateLimit(request, rateLimit);
    const { vendor } = await params;
    const cleanVendor = decodeURIComponent(vendor || "");
    const workspace = await buildDueDiligenceWorkspace({ query: cleanVendor, limit: 16, deterministic: true });
    const contract = monitorContract(workspace, cleanVendor);
    if (!contract) {
      return jsonResponse({ ok: false, traceId, error: "Vendor monitoring record not found." }, { status: 404, headers: limit.headers });
    }
    return jsonResponse({ ok: true, traceId, ...contract }, { headers: limit.headers });
  } catch (error) {
    return secureErrorResponse("monitor-api.GET", traceId, error, { fallbackStatus: 400 });
  }
}
