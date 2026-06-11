import { NextRequest, NextResponse } from "next/server";

import { canonicalAppUrl } from "@/lib/appraisal/app-url";
import { appraisalOfferFor } from "@/lib/appraisal/offers";
import { createTrace, errorResponse, trace } from "@/lib/diagnostics";
import { enforceRateLimit } from "@/lib/security/backendSecurity";
import { compileTrust, readCompiledJson } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const checkoutRateLimit = { name: "appraisal-checkout", limit: 12, windowMs: 60 * 60_000 };

export async function POST(request: NextRequest) {
  const traceId = createTrace("appraisal-checkout.POST");
  try {
    await compileTrust(request, { mode: "publicNonPersistent", reason: "free appraisal access" });
    await enforceRateLimit(request, checkoutRateLimit);
    const body = await readCompiledJson(request);
    const offer = appraisalOfferFor(body.offer || body.offerId);
    const origin = canonicalAppUrl().replace(/\/+$/, "");
    const url = `${origin}/appraisal-intake?offer=${encodeURIComponent(offer.id)}`;

    trace("appraisal-checkout.POST", "free appraisal access issued", {
      traceId,
      offerId: offer.id,
    });

    return NextResponse.json({
      ok: true,
      traceId,
      offer,
      free: true,
      checkout: { sessionId: null, url },
      url,
    }, { status: 200 });
  } catch (error) {
    return errorResponse("appraisal-checkout.POST", traceId, error, statusForCheckoutError(error));
  }
}

function statusForCheckoutError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/APP_URL|NEXT_PUBLIC_APP_URL|allowlisted/i.test(message)) return 503;
  if (/rate/i.test(message)) return 429;
  return 400;
}
