import { NextRequest } from "next/server";

import { createTrace } from "@/lib/diagnostics";
import { updateTrustTimeline } from "@/lib/passport/passport-engine";
import { enforceRateLimit, jsonResponse, secureErrorResponse } from "@/lib/security/backendSecurity";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rateLimit = { name: "passport-timeline", limit: 80, windowMs: 60_000 };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTrace("passport.timeline.GET");
  try {
    await compileTrust(request, { mode: "publicRead", reason: "software passport timeline lookup" });
    const limit = await enforceRateLimit(request, rateLimit);
    const { id } = await params;
    const timeline = await updateTrustTimeline(decodeURIComponent(id || ""));
    return jsonResponse({ ok: true, traceId, timeline, count: timeline.length }, { headers: limit.headers });
  } catch (error) {
    return secureErrorResponse("passport.timeline.GET", traceId, error, { fallbackStatus: statusFor(error) });
  }
}

function statusFor(error: unknown) {
  return error instanceof Error && error.message === "PASSPORT_NOT_FOUND" ? 404 : 400;
}
