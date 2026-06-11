import { NextRequest } from "next/server";

import { loadProductFunnelMetrics } from "@/lib/analytics/product-funnel-store";
import { createTrace } from "@/lib/diagnostics";
import { jsonResponse, secureErrorResponse } from "@/lib/security/backendSecurity";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const traceId = createTrace("funnel.metrics.GET");
  try {
    await compileTrust(request, { mode: "publicRead", reason: "aggregate public funnel readiness metrics" });
    const metrics = await loadProductFunnelMetrics();
    const previewStarted = metrics.uniqueReal.previewStarted;
    const previewCompleted = metrics.uniqueReal.previewCompleted;
    const checkoutStarted = metrics.uniqueReal.checkoutStarted;
    const reportGenerated = metrics.uniqueReal.reportGenerated;
    const paidIntent = metrics.uniqueReal.paidIntent;
    const previewToCheckoutPath = metrics.uniqueReal.previewToCheckoutPath;

    return jsonResponse({
      ok: true,
      traceId,
      metrics,
      proof: {
        customerDemand: {
          proven: previewStarted >= 10,
          previewStarted,
          previewCompleted,
          uniqueVisitors: previewStarted,
          requirement: "At least 10 unique real preview visitors from production traffic. Synthetic tests and obvious bots do not count.",
        },
        conversionFunnel: {
          proven: previewToCheckoutPath > 0,
          previewToCheckoutRate: previewStarted > 0 ? roundRate(checkoutStarted / previewStarted) : 0,
          paidIntent,
          checkoutStarted,
          reportGenerated,
          previewToCheckoutPath,
          requirement: "At least one unique real visitor must start a preview and then start checkout. Synthetic tests and obvious bots do not count.",
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return secureErrorResponse("funnel.metrics.GET", traceId, error, { fallbackStatus: 500 });
  }
}

function roundRate(value: number) {
  return Math.round(value * 10_000) / 100;
}
