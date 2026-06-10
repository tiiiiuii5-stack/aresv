import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";

import { canonicalAppUrl } from "@/lib/appraisal/app-url";
import { appraisalOfferFor, stripePriceIdForAppraisalOffer } from "@/lib/appraisal/offers";
import { createTrace, errorResponse, trace, traceError, withStep } from "@/lib/diagnostics";
import { enforceRateLimit } from "@/lib/security/backendSecurity";
import { compileTrust, readCompiledJson } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const checkoutRateLimit = { name: "appraisal-checkout", limit: 12, windowMs: 60 * 60_000 };

export async function POST(request: NextRequest) {
  const traceId = createTrace("appraisal-checkout.POST");
  try {
    await compileTrust(request, { mode: "publicNonPersistent", reason: "paid appraisal checkout creation" });
    await enforceRateLimit(request, checkoutRateLimit);
    const body = await readCompiledJson(request);
    const offer = appraisalOfferFor(body.offer || body.offerId);
    const email = cleanEmail(body.email);
    if (!email) {
      return NextResponse.json({ ok: false, traceId, error: "A valid email is required for checkout." }, { status: 400 });
    }

    const origin = canonicalAppUrl();
    const priceId = stripePriceIdForAppraisalOffer(offer);
    trace("appraisal-checkout.POST", "using canonical checkout redirect origin", { traceId, origin, offerId: offer.id, priceConfigured: Boolean(priceId) });
    const session = await withStep("appraisal-checkout.POST", traceId, "create stripe checkout session", () =>
      createCheckoutSession({
        offerId: offer.id,
        offerName: offer.name,
        offerDescription: offer.description,
        unitAmount: offer.unitAmount,
        priceId,
        email,
        origin,
        traceId,
      }), 15_000);

    return NextResponse.json({
      ok: true,
      traceId,
      offer,
      checkout: { sessionId: session.id, url: session.url },
      url: session.url,
    }, { status: 201 });
  } catch (error) {
    const unavailableMessage = checkoutUnavailableMessage(error);
    if (unavailableMessage) {
      traceError("appraisal-checkout.POST", "checkout unavailable", error, { traceId });
      return NextResponse.json({ ok: false, traceId, error: unavailableMessage }, { status: 503 });
    }
    return errorResponse("appraisal-checkout.POST", traceId, error, statusForCheckoutError(error));
  }
}

async function createCheckoutSession(input: {
  offerId: string;
  offerName: string;
  offerDescription: string;
  unitAmount: number;
  priceId: string | null;
  email: string;
  origin: string;
  traceId: string;
}) {
  const origin = input.origin.replace(/\/+$/, "");
  return stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: input.email,
    allow_promotion_codes: true,
    line_items: [
      input.priceId
        ? { price: input.priceId, quantity: 1 }
        : {
            price_data: {
              currency: "usd",
              unit_amount: input.unitAmount,
              product_data: {
                name: input.offerName,
                description: input.offerDescription,
              },
            },
            quantity: 1,
          },
    ],
    success_url: `${origin}/appraisal-intake?checkout=success&offer=${encodeURIComponent(input.offerId)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/appraisal-intake?checkout=cancelled&offer=${encodeURIComponent(input.offerId)}`,
    metadata: {
      product: "ventureos_appraisal",
      offerId: input.offerId,
      expectedAmount: String(input.unitAmount),
      expectedCurrency: "usd",
      expectedPriceId: input.priceId || "inline",
      traceId: input.traceId,
    },
  });
}

function stripe() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Missing required env var: STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
}

function cleanEmail(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.slice(0, 180) : "";
}

function statusForCheckoutError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/STRIPE_SECRET_KEY|Stripe|APP_URL|NEXT_PUBLIC_APP_URL|allowlisted/i.test(message)) return 503;
  if (/rate/i.test(message)) return 429;
  if (/email|required|checkout/i.test(message)) return 400;
  return 500;
}

function checkoutUnavailableMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/STRIPE_SECRET_KEY|Stripe/i.test(message)) {
    return "Paid checkout is temporarily unavailable. The free preview still works, but paid certificates require Stripe checkout to be enabled.";
  }
  if (/APP_URL|NEXT_PUBLIC_APP_URL|allowlisted/i.test(message)) {
    return "Paid checkout is temporarily unavailable because checkout redirects are not configured for this environment.";
  }
  return "";
}
