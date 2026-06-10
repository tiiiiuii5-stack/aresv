import { NextRequest } from "next/server";

import { createTrace } from "@/lib/diagnostics";
import { listPassports } from "@/lib/passport/passport-engine";
import { enforceRateLimit, jsonResponse, secureErrorResponse } from "@/lib/security/backendSecurity";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rateLimit = { name: "passport-registry", limit: 60, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const traceId = createTrace("registry.GET");
  try {
    await compileTrust(request, { mode: "publicRead", reason: "software passport registry" });
    const limit = await enforceRateLimit(request, rateLimit);
    const query = request.nextUrl.searchParams.get("q") || "";
    const limitParam = Number(request.nextUrl.searchParams.get("limit") || 24);
    const passports = await listPassports({ query, limit: limitParam });
    return jsonResponse({ ok: true, traceId, query, count: passports.length, passports }, { headers: limit.headers });
  } catch (error) {
    return secureErrorResponse("registry.GET", traceId, error, { fallbackStatus: 400 });
  }
}
