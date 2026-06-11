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
    const realEvents = metrics.realEvents || {};
    const previewStarted = eventCount(realEvents, "preview_started") + eventCount(realEvents, "free_review.scan_started");
    const previewCompleted = eventCount(realEvents, "preview_completed") + eventCount(realEvents, "free_review.scan_completed");
    const checkoutStarted = eventCount(realEvents, "checkout_started") + eventCount(realEvents, "appraisal_intake.checkout_started") + eventCount(realEvents, "appraisal_intake.checkout_clicked");
    const reportGenerated = eventCount(realEvents, "report_generated") + eventCount(realEvents, "appraisal_intake.certificate_completed");
    const paidIntent = eventCount(realEvents, "free_review.paid_cta_clicked") + checkoutStarted;

    return jsonResponse({
      ok: true,
      traceId,
      metrics,
      proof: {
        customerDemand: {
          proven: previewStarted >= 10,
          previewStarted,
          previewCompleted,
          requirement: "At least 10 real preview starts from production traffic. Synthetic contract-test events do not count.",
        },
        conversionFunnel: {
          proven: checkoutStarted > 0 && previewStarted > 0,
          previewToCheckoutRate: previewStarted > 0 ? roundRate(checkoutStarted / previewStarted) : 0,
          paidIntent,
          checkoutStarted,
          reportGenerated,
          requirement: "At least one real checkout start and measurable real preview-to-checkout path. Synthetic contract-test events do not count.",
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return secureErrorResponse("funnel.metrics.GET", traceId, error, { fallbackStatus: 500 });
  }
}

function eventCount(events: Record<string, number>, key: string) {
  return Math.max(0, Math.round(Number(events[key] || 0)));
}

function roundRate(value: number) {
  return Math.round(value * 10_000) / 100;
}
