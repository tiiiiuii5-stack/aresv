import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse, withStep } from "@/lib/diagnostics";
import { intelligenceAggregationService } from "@/lib/services/intelligenceAggregation";
import { apiUsageHeaders, intelligenceMonetizationService, MonetizationError } from "@/lib/services/intelligenceMonetization";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const traceId = createTrace("insights.security-trends.GET");
  try {
    const trust = await withStep("insights.security-trends.GET", traceId, "compile api key trust", () =>
      compileTrust(request, { mode: "apiKey", endpoint: "/insights/security-trends", scope: "intelligence:read" }), 5_000);
    const metering = trust.metering;
    if (!metering) throw new Error("TRUST_POLICY_INVALID");
    const insights = await withStep(
      "insights.security-trends.GET",
      traceId,
      "aggregate security trends",
      () => intelligenceAggregationService.securityTrends(),
      15_000,
    );
    await intelligenceMonetizationService.recordUsage({ context: metering, method: request.method, statusCode: 200, metadata: { resultCount: insights.results.length } });
    return NextResponse.json({ traceId, ...insights }, { headers: apiUsageHeaders(metering) });
  } catch (error) {
    return errorResponse("insights.security-trends.GET", traceId, error, error instanceof MonetizationError ? error.status : 500);
  }
}
