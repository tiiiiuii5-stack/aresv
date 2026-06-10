import Stripe from "stripe";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { recordStripeCheckoutSessionPayment } from "@/lib/appraisal/paymentFulfillment";
import { createTrace, trace, traceError, withStep } from "@/lib/diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const traceId = createTrace("stripe.webhook.POST");
  const body = await request.text();
  const headerStore = await headers();
  const signature = headerStore.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ ok: false, traceId, error: "Missing Stripe signature." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, signature, webhookSecret());
  } catch (error) {
    traceError("stripe.webhook.POST", "signature verification failed", error, { traceId });
    return NextResponse.json({
      ok: false,
      traceId,
      error: error instanceof Error ? `Webhook Error: ${error.message}` : "Webhook signature verification failed.",
    }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const payment = await withStep("stripe.webhook.POST", traceId, "record paid appraisal checkout", () =>
        recordStripeCheckoutSessionPayment({ session, traceId, eventId: event.id }), 15_000);

      trace("stripe.webhook.POST", "paid appraisal checkout recorded", {
        traceId,
        eventId: event.id,
        paymentId: payment.id,
        fulfillmentStatus: payment.fulfillmentStatus,
      });

      return NextResponse.json({
        ok: true,
        traceId,
        eventId: event.id,
        paymentId: payment.id,
        fulfillmentStatus: payment.fulfillmentStatus,
      });
    }

    trace("stripe.webhook.POST", "ignored stripe event", { traceId, eventId: event.id, type: event.type });
    return NextResponse.json({ ok: true, traceId, ignored: true, type: event.type });
  } catch (error) {
    traceError("stripe.webhook.POST", "webhook processing failed", error, { traceId, eventId: event.id, type: event.type });
    return NextResponse.json({
      ok: false,
      traceId,
      error: error instanceof Error ? error.message : "Stripe webhook processing failed.",
    }, { status: statusForWebhookError(error) });
  }
}

function stripe() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Missing required env var: STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
}

function webhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("Missing required env var: STRIPE_WEBHOOK_SECRET");
  return secret;
}

function statusForWebhookError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|DATABASE_UNAVAILABLE|Database/i.test(message)) return 503;
  if (/PAYMENT_VALIDATION_FAILED|PAYMENT_AMOUNT_MISMATCH|PAYMENT_CURRENCY_MISMATCH|STRIPE_SESSION_ID_REQUIRED/i.test(message)) return 422;
  return 500;
}
