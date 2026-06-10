import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse, trace, withStep } from "@/lib/diagnostics";
import { billingService } from "@/lib/services/billing";
import { compileTrust, readCompiledJson } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug?: string[] }> };

export async function GET(request: NextRequest, context: Context) {
  const traceId = createTrace("billing.GET");
  try {
    const { session } = await compileTrust(request, { mode: "session" });
    const slug = (await context.params).slug || [];
    const userId = session.userId;
    const teamId = session.orgId;
    if (slug.length === 1 && slug[0] === "status") {
      const status = await withStep("billing.GET", traceId, "get billing status", () => billingService.getStatus(userId), 15_000);
      return NextResponse.json({ ok: true, traceId, ...status });
    }
    const account = await withStep("billing.GET", traceId, "get billing account", () => billingService.getAccount(userId, teamId), 15_000);
    return NextResponse.json({ ok: true, traceId, account });
  } catch (error) {
    return errorResponse("billing.GET", traceId, error, statusForBillingError(error));
  }
}

export async function POST(request: NextRequest, context: Context) {
  const traceId = createTrace("billing.POST");
  try {
    const slug = (await context.params).slug || [];
    if (slug.length === 1 && slug[0] === "webhook") {
      await compileTrust(request, { mode: "stripeWebhook" });
      const payload = await request.text();
      const result = await withStep("billing.POST", traceId, "handle stripe webhook", () => billingService.handleStripeWebhook({ payload, signature: request.headers.get("stripe-signature"), traceId }), 15_000);
      return NextResponse.json({ ok: true, traceId, result });
    }

    const { session } = await compileTrust(request, { mode: "session" });
    const body = await readCompiledJson(request);
    const userId = session.userId;
    const teamId = session.orgId;
    trace("billing.POST", "payload parsed", { traceId, action: slug.join("/"), userId, teamId, tier: body?.tier || body?.plan });
    if (slug.length === 1 && slug[0] === "checkout") {
      const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
      const checkout = await withStep("billing.POST", traceId, "create checkout session", () =>
        billingService.createCheckoutSession({
          userId,
          teamId,
          tier: String(body?.tier || body?.plan || ""),
          billingCycle: String(body?.billingCycle || ""),
          origin,
          traceId,
        }), 15_000);
      return NextResponse.json({ ok: true, traceId, checkout, url: checkout.url }, { status: 201 });
    }

    if (slug.length === 1 && slug[0] === "portal") {
      const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
      const portal = await withStep("billing.POST", traceId, "create billing portal session", () =>
        billingService.createPortalSession({
          userId,
          origin,
          traceId,
        }), 15_000);
      return NextResponse.json({ ok: true, traceId, portal, url: portal.url }, { status: 201 });
    }

    if (slug.length === 1 && slug[0] === "usage") {
      const account = await withStep("billing.POST", traceId, "record billing usage", () =>
        billingService.recordUsage({
          userId,
          teamId,
          metric: String(body?.metric || ""),
          amount: typeof body?.amount === "number" ? body.amount : Number(body?.amount || 1),
          metadata: metadataObject(body?.metadata),
          traceId,
        }), 15_000);
      return NextResponse.json({ ok: true, traceId, account }, { status: 201 });
    }
    if (slug.length === 0) {
      const account = await withStep("billing.POST", traceId, "upsert billing account", () => billingService.upsertAccount({ ...body, userId, teamId, traceId }), 15_000);
      return NextResponse.json({ ok: true, traceId, account }, { status: 201 });
    }
    return NextResponse.json({ ok: false, traceId, error: "Backend route not found." }, { status: 404 });
  } catch (error) {
    return errorResponse("billing.POST", traceId, error, statusForBillingError(error));
  }
}

function statusForBillingError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  if (/required/i.test(message)) return 400;
  return 500;
}

function metadataObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
