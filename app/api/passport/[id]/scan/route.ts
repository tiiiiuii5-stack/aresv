import { NextRequest } from "next/server";

import { createTrace } from "@/lib/diagnostics";
import { runScanner } from "@/lib/passport/passport-engine";
import { enforceRateLimit, jsonResponse, secureErrorResponse } from "@/lib/security/backendSecurity";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rateLimit = { name: "passport-scan", limit: 20, windowMs: 60_000 };

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTrace("passport.scan.POST");
  try {
    await compileTrust(request, { mode: "publicNonPersistent", reason: "software passport scan" });
    const limit = await enforceRateLimit(request, rateLimit);
    const { id } = await params;
    const passport = await runScanner(decodeURIComponent(id || ""));
    return jsonResponse({ ok: true, traceId, ...passport }, { headers: limit.headers });
  } catch (error) {
    return secureErrorResponse("passport.scan.POST", traceId, error, { fallbackStatus: statusFor(error) });
  }
}

function statusFor(error: unknown) {
  return error instanceof Error && error.message === "PASSPORT_NOT_FOUND" ? 404 : 400;
}
