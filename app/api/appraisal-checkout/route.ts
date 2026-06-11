import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { canonicalAppUrl } from "@/lib/appraisal/app-url";
import { appraisalOfferFor, stripePriceIdForAppraisalOffer } from "@/lib/appraisal/offers";
import { createTrace, errorResponse, trace } from "@/lib/diagnostics";
import { enforceRateLimit } from "@/lib/security/backendSecurity";
import { compileTrust, readCompiledJson } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const checkoutRateLimit = { name: "appraisal-checkout", limit: 12, windowMs: 60 * 60_000 };

export async function POST(request: NextRequest) {
  const traceId = createTrace("appraisal-checkout.POST");
  try {
    await compileTrust(request, { mode: "publicNonPersistent", reason: "paid appraisal checkout" });
    await enforceRateLimit(request, checkoutRateLimit);
    const body = await readCompiledJson(request);
    const offer = appraisalOfferFor(body.offer || body.offerId);
    const origin = canonicalAppUrl().replace(/\/+$/, "");
    const params = new URLSearchParams({ offer: offer.id });
    const repo = cleanText(body.repoUrl || body.repositoryUrl || body.repository, 260);
    const framework = cleanText(body.framework, 40);
    if (repo) params.set("repo", repo);
    if (framework) params.set("framework", framework);

    if (offer.unitAmount <= 0) {
      params.set("checkout", "success");
      const url = `${origin}/appraisal-intake?${params.toString()}`;

      trace("appraisal-checkout.POST", "zero-dollar appraisal access issued", {
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
    }

    const priceId = await stripePriceIdForAppraisalOffer(offer);
    params.set("checkout", "success");
    params.set("session_id", "{CHECKOUT_SESSION_ID}");
    const successUrl = `${origin}/appraisal-intake?${params.toString()}`.replace(
      "session_id=%7BCHECKOUT_SESSION_ID%7D",
      "session_id={CHECKOUT_SESSION_ID}",
    );

    params.set("checkout", "cancelled");
    params.delete("session_id");
    const cancelUrl = `${origin}/appraisal-intake?${params.toString()}`;

    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      customer_email: cleanEmail(body.email) || undefined,
      line_items: [
        priceId
          ? { price: priceId, quantity: 1 }
          : {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: offer.unitAmount,
              product_data: {
                name: offer.name,
                description: offer.description.slice(0, 900),
              },
            },
          },
      ],
      metadata: {
        product: "ventureos_appraisal",
        offerId: offer.id,
        expectedPriceId: priceId || "inline",
        source: "appraisal_checkout",
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    trace("appraisal-checkout.POST", "stripe checkout created", {
      traceId,
      offerId: offer.id,
      sessionId: session.id.slice(0, 12),
      unitAmount: offer.unitAmount,
      priceConfigured: Boolean(priceId),
    });

    return NextResponse.json({
      ok: true,
      traceId,
      offer,
      free: false,
      checkout: { sessionId: session.id, url: session.url },
      url: session.url,
    }, { status: 201 });
  } catch (error) {
    return errorResponse("appraisal-checkout.POST", traceId, error, statusForCheckoutError(error));
  }
}

function stripe() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Missing required env var: STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
}

function cleanText(value: unknown, maxLength: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanEmail(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.slice(0, 180) : "";
}

function statusForCheckoutError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/STRIPE_SECRET_KEY|Stripe|APP_URL|NEXT_PUBLIC_APP_URL|allowlisted/i.test(message)) return 503;
  if (/rate/i.test(message)) return 429;
  return 400;
}
