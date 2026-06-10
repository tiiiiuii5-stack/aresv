import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse, withStep } from "@/lib/diagnostics";
import { apiUsageHeaders, intelligenceMonetizationService, MonetizationError } from "@/lib/services/intelligenceMonetization";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const traceId = createTrace("intelligence.usage.GET");
  try {
    const trust = await withStep("intelligence.usage.GET", traceId, "compile api key trust", () =>
      compileTrust(request, { mode: "apiKey", endpoint: "/api/intelligence/usage", scope: "intelligence:read" }), 5_000);
    const metering = trust.metering;
    if (!metering) throw new Error("TRUST_POLICY_INVALID");
    const usage = await withStep("intelligence.usage.GET", traceId, "load api usage stats", () =>
      intelligenceMonetizationService.getUsageStats(metering.userId), 15_000);
    await intelligenceMonetizationService.recordUsage({ context: metering, method: request.method, statusCode: 200, metadata: { endpoint: "usage" } });
    return NextResponse.json({ ok: true, traceId, usage }, { headers: apiUsageHeaders(metering) });
  } catch (error) {
    return errorResponse("intelligence.usage.GET", traceId, error, error instanceof MonetizationError ? error.status : 500);
  }
}
