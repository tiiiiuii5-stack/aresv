import { NextRequest } from "next/server";

import { createTrace } from "@/lib/diagnostics";
import { passportContract } from "@/lib/diligence/api-contracts";
import { buildDueDiligenceWorkspace } from "@/lib/diligence/due-diligence-engine";
import { loadPassport } from "@/lib/passport/passport-engine";
import { enforceRateLimit, jsonResponse, secureErrorResponse } from "@/lib/security/backendSecurity";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rateLimit = { name: "passport-read", limit: 80, windowMs: 60_000 };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTrace("passport.GET");
  try {
    await compileTrust(request, { mode: "publicRead", reason: "software passport lookup" });
    const limit = await enforceRateLimit(request, rateLimit);
    const { id } = await params;
    const contract = request.nextUrl.searchParams.get("contract") || request.nextUrl.searchParams.get("format");
    if (contract === "trust-v1" || contract === "passport-v2") {
      const cleanId = decodeURIComponent(id || "");
      const workspace = await buildDueDiligenceWorkspace({ query: cleanId, limit: 16, deterministic: true });
      const passport = passportContract(workspace, cleanId);
      if (!passport) return jsonResponse({ ok: false, traceId, error: "Passport trust contract not found." }, { status: 404, headers: limit.headers });
      return jsonResponse({ ok: true, traceId, ...passport }, { headers: limit.headers });
    }
    const passport = await loadPassport(decodeURIComponent(id || ""));
    if (!passport) return jsonResponse({ ok: false, traceId, error: "Passport not found." }, { status: 404, headers: limit.headers });
    return jsonResponse({ ok: true, traceId, ...passport }, { headers: limit.headers });
  } catch (error) {
    return secureErrorResponse("passport.GET", traceId, error, { fallbackStatus: 400 });
  }
}
