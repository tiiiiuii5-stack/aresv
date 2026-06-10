// Integration module: Ecommerce-Stripe
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export async function POST(request: NextRequest) {
  const stripe = new Stripe(requiredEnv("STRIPE_SECRET_KEY"));
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
  const event = stripe.webhooks.constructEvent(await request.text(), signature, requiredEnv("STRIPE_WEBHOOK_SECRET"));
  if (event.type === "payment_intent.succeeded") {
    const payment = event.data.object as Stripe.PaymentIntent;
    return NextResponse.json({ ok: true, orderStatus: "paid", paymentId: payment.id });
  }
  return NextResponse.json({ ok: true, ignored: event.type });
}

function requiredEnv(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}
