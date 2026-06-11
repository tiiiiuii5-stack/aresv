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
    const previewStarted = eventCount(metrics.events, "preview_started") + eventCount(metrics.events, "free_review.scan_started");
    const previewCompleted = eventCount(metrics.events, "preview_completed") + eventCount(metrics.events, "free_review.scan_completed");
    const checkoutStarted = eventCount(metrics.events, "checkout_started") + eventCount(metrics.events, "appraisal_intake.checkout_started") + eventCount(metrics.events, "appraisal_intake.checkout_clicked");
    const reportGenerated = eventCount(metrics.events, "report_generated") + eventCount(metrics.events, "appraisal_intake.certificate_completed");
    const paidIntent = eventCount(metrics.events, "free_review.paid_cta_clicked") + checkoutStarted;

    return jsonResponse({
      ok: true,
      traceId,
      metrics,
      proof: {
        customerDemand: {
          proven: previewStarted >= 10,
          previewStarted,
          previewCompleted,
          requirement: "At least 10 preview starts from production traffic.",
        },
        conversionFunnel: {
          proven: checkoutStarted > 0 && previewStarted > 0,
          previewToCheckoutRate: previewStarted > 0 ? roundRate(checkoutStarted / previewStarted) : 0,
          paidIntent,
          checkoutStarted,
          reportGenerated,
          requirement: "At least one checkout start and measurable preview-to-checkout path.",
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
