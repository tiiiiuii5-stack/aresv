import { NextRequest } from "next/server";

import { createTrace } from "@/lib/diagnostics";
import { createPassport } from "@/lib/passport/passport-engine";
import { enforceRateLimit, jsonResponse, readJsonBody, secureErrorResponse } from "@/lib/security/backendSecurity";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rateLimit = { name: "passport-create", limit: 20, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  const traceId = createTrace("passport.create.POST");
  try {
    await compileTrust(request, { mode: "publicNonPersistent", reason: "software passport creation" });
    const limit = await enforceRateLimit(request, rateLimit);
    const body = await readJsonBody<{ source: unknown; sourceType?: unknown; name?: unknown; owner?: unknown }>(request, { maxBytes: 8_000 });
    const passport = await createPassport(body);
    return jsonResponse({ ok: true, traceId, ...passport }, { status: 201, headers: limit.headers });
  } catch (error) {
    return secureErrorResponse("passport.create.POST", traceId, error, { fallbackStatus: 400 });
  }
}
