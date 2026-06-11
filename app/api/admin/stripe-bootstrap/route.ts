import Stripe from "stripe";
import { NextResponse } from "next/server";

import { canonicalAppUrl } from "@/lib/appraisal/app-url";
import { APPRAISAL_OFFERS } from "@/lib/appraisal/offers";
import { loadStripeRuntimeConfig, saveStripeRuntimeConfig, stripeConfigHealth } from "@/lib/appraisal/stripe-runtime-config";
import { createTrace, errorResponse } from "@/lib/diagnostics";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRODUCT_NAME = "VentureOS Software Decision Reports";
const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = ["checkout.session.completed"];

export async function GET(request: Request) {
  const traceId = createTrace("admin.stripe-bootstrap.GET");
  try {
    await compileTrust(request, { mode: "admin" });
    const config = await loadStripeRuntimeConfig();
    return NextResponse.json({
      ok: true,
      traceId,
      stripe: stripeConfigHealth(config),
      secretStored: Boolean(config.webhookSecret),
    });
  } catch (error) {
    return errorResponse("admin.stripe-bootstrap.GET", traceId, error, 401);
  }
}

export async function POST(request: Request) {
  const traceId = createTrace("admin.stripe-bootstrap.POST");
  try {
    await compileTrust(request, { mode: "admin" });
    const client = stripe();
    const existingConfig = await loadStripeRuntimeConfig();
    const product = await findOrCreateProduct(client);
    const instantPriceId = existingConfig.instantPriceId || await findOrCreatePrice(client, product.id, "instant", APPRAISAL_OFFERS[0].unitAmount);
    const buyerReadyPriceId = existingConfig.buyerReadyPriceId || await findOrCreatePrice(client, product.id, "buyer-ready", APPRAISAL_OFFERS[1].unitAmount);
    const webhookSecret = existingConfig.webhookSecret || await createWebhookEndpoint(client);
    const config = await saveStripeRuntimeConfig({
      instantPriceId,
      buyerReadyPriceId,
      webhookSecret,
    });

    return NextResponse.json({
      ok: true,
      traceId,
      productId: product.id,
      stripe: stripeConfigHealth(config),
      priceIds: {
        instant: maskStripeId(instantPriceId),
        buyerReady: maskStripeId(buyerReadyPriceId),
      },
      webhookSecretStored: Boolean(config.webhookSecret),
    }, { status: 201 });
  } catch (error) {
    return errorResponse("admin.stripe-bootstrap.POST", traceId, error, statusForBootstrapError(error));
  }
}

async function findOrCreateProduct(client: Stripe) {
  const products = await client.products.search({
    query: "metadata['ventureos_product']:'appraisal_reports'",
    limit: 1,
  });
  const existing = products.data[0];
  if (existing) return existing;
  return client.products.create({
    name: PRODUCT_NAME,
    metadata: { ventureos_product: "appraisal_reports" },
  });
}

async function findOrCreatePrice(client: Stripe, productId: string, offerId: string, unitAmount: number) {
  const lookupKey = `ventureos_appraisal_${offerId.replace(/[^a-z0-9_]/gi, "_")}`;
  const prices = await client.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const existing = prices.data[0];
  if (existing) return existing.id;
  const price = await client.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: unitAmount,
    lookup_key: lookupKey,
    metadata: {
      ventureos_product: "appraisal_reports",
      offerId,
    },
  });
  return price.id;
}

async function createWebhookEndpoint(client: Stripe) {
  const url = `${canonicalAppUrl().replace(/\/+$/, "")}/api/stripe/webhook`;
  const endpoint = await client.webhookEndpoints.create({
    url,
    enabled_events: WEBHOOK_EVENTS,
    metadata: { ventureos_product: "appraisal_reports" },
  });
  if (!endpoint.secret) throw new Error("STRIPE_WEBHOOK_SECRET_NOT_RETURNED");
  return endpoint.secret;
}

function stripe() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Missing required env var: STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
}

function maskStripeId(value: string | null) {
  if (!value) return null;
  return `${value.slice(0, 10)}...${value.slice(-4)}`;
}

function statusForBootstrapError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/UNAUTHORIZED/.test(message)) return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  if (/STRIPE_SECRET_KEY|Stripe|KV_REST_API_TOKEN/i.test(message)) return 503;
  return 500;
}
