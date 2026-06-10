import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse, withStep } from "@/lib/diagnostics";
import { intelligenceAggregationService } from "@/lib/services/intelligenceAggregation";
import { apiUsageHeaders, intelligenceMonetizationService, MonetizationError } from "@/lib/services/intelligenceMonetization";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const traceId = createTrace("benchmarks.modules.GET");
  try {
    const trust = await withStep("benchmarks.modules.GET", traceId, "compile api key trust", () =>
      compileTrust(request, { mode: "apiKey", endpoint: "/benchmarks/modules", scope: "intelligence:read" }), 5_000);
    const metering = trust.metering;
    if (!metering) throw new Error("TRUST_POLICY_INVALID");
    const benchmarks = await withStep(
      "benchmarks.modules.GET",
      traceId,
      "aggregate module benchmarks",
      () => intelligenceAggregationService.moduleBenchmarks(),
      15_000,
    );
    await intelligenceMonetizationService.recordUsage({ context: metering, method: request.method, statusCode: 200, metadata: { resultCount: benchmarks.results.length } });
    return NextResponse.json({ traceId, ...benchmarks }, { headers: apiUsageHeaders(metering) });
  } catch (error) {
    return errorResponse("benchmarks.modules.GET", traceId, error, error instanceof MonetizationError ? error.status : 500);
  }
}
