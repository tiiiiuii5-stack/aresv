import { NextRequest } from "next/server";

import { createTrace } from "@/lib/diagnostics";
import { buildBuyerGradePassportReport } from "@/lib/passport/buyer-report";
import { enforceRateLimit, jsonResponse, secureErrorResponse } from "@/lib/security/backendSecurity";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rateLimit = { name: "passport-buyer-report", limit: 60, windowMs: 60_000 };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTrace("passport.report.GET");
  try {
    await compileTrust(request, { mode: "publicRead", reason: "buyer-grade passport report" });
    const limit = await enforceRateLimit(request, rateLimit);
    const { id } = await params;
    const report = await buildBuyerGradePassportReport(decodeURIComponent(id || ""));
    return jsonResponse({ ok: true, traceId, report }, { headers: limit.headers });
  } catch (error) {
    return secureErrorResponse("passport.report.GET", traceId, error, { fallbackStatus: error instanceof Error && error.message === "PASSPORT_NOT_FOUND" ? 404 : 400 });
  }
}
