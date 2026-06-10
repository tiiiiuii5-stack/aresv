import { NextRequest } from "next/server";

import { createTrace } from "@/lib/diagnostics";
import { generateEvidence } from "@/lib/passport/passport-engine";
import { enforceRateLimit, jsonResponse, secureErrorResponse } from "@/lib/security/backendSecurity";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rateLimit = { name: "passport-evidence", limit: 80, windowMs: 60_000 };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTrace("passport.evidence.GET");
  try {
    await compileTrust(request, { mode: "publicRead", reason: "software passport evidence lookup" });
    const limit = await enforceRateLimit(request, rateLimit);
    const { id } = await params;
    const evidence = await generateEvidence(decodeURIComponent(id || ""));
    return jsonResponse({ ok: true, traceId, evidence, count: evidence.length }, { headers: limit.headers });
  } catch (error) {
    return secureErrorResponse("passport.evidence.GET", traceId, error, { fallbackStatus: statusFor(error) });
  }
}

function statusFor(error: unknown) {
  return error instanceof Error && error.message === "PASSPORT_NOT_FOUND" ? 404 : 400;
}
