import { NextRequest } from "next/server";

import { loadProductFunnelMetrics } from "@/lib/analytics/product-funnel-store";
import { loadWaitlistLeadMetrics } from "@/lib/analytics/waitlist-lead-store";
import { createTrace } from "@/lib/diagnostics";
import { jsonResponse, secureErrorResponse } from "@/lib/security/backendSecurity";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const traceId = createTrace("funnel.metrics.GET");
  try {
    await compileTrust(request, { mode: "publicRead", reason: "aggregate public funnel readiness metrics" });
    const [metrics, leads] = await Promise.all([
      loadProductFunnelMetrics(),
      loadWaitlistLeadMetrics(),
    ]);
    const previewStarted = metrics.uniqueReal.previewStarted;
    const previewCompleted = metrics.uniqueReal.previewCompleted;
    const checkoutStarted = metrics.uniqueReal.checkoutStarted;
    const reportGenerated = metrics.uniqueReal.reportGenerated;
    const paidIntent = metrics.uniqueReal.paidIntent;
    const previewToCheckoutPath = metrics.uniqueReal.previewToCheckoutPath;
    const capturedLeads = leads.total;
    const demandProven = previewStarted >= 10 || capturedLeads >= 3;

    return jsonResponse({
      ok: true,
      traceId,
      metrics,
      leads,
      proof: {
        customerDemand: {
          proven: demandProven,
          previewStarted,
          previewCompleted,
          capturedLeads,
          leadStoreAvailable: leads.available,
          uniqueVisitors: previewStarted,
          requirement: "At least 10 unique real preview visitors or 3 captured real lead emails from production traffic. Synthetic tests and obvious bots do not count.",
        },
        conversionFunnel: {
          proven: previewToCheckoutPath > 0,
          previewToCheckoutRate: previewStarted > 0 ? roundRate(previewToCheckoutPath / previewStarted) : 0,
          paidIntent,
          checkoutStarted,
          reportGenerated,
          previewToCheckoutPath,
          rateBasis: "unique real visitors who started preview and later started checkout divided by unique real preview starters",
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
