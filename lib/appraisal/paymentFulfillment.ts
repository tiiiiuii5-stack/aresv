import { createHash, randomUUID } from "node:crypto";

import type Stripe from "stripe";

import {
  assertPaidAppraisalTransition,
  type PaidAppraisalLifecycleEvent,
  lifecycleStateFromPaymentFields,
  paymentFieldsForLifecycleState,
} from "@/lib/appraisal/appraisalLifecycleStateMachine";
import { appraisalOfferFor, stripePriceIdForAppraisalOffer } from "@/lib/appraisal/offers";
import { controlPlane, type ControlPlaneEventName } from "@/lib/control-plane";
import { tryDatabase } from "@/lib/prisma";
import { auditLogService } from "@/lib/services/auditLog";
import { sanitizeMetadata } from "@/lib/services/platformSupport";
import { createTransparencyEventCommitment } from "@/lib/transparency/eventCommitment";

type PaymentRow = {
  id: string;
  stripeSessionId: string;
  status: string;
  fulfillmentStatus: string;
  userId: string;
  projectId: string | null;
  appraisalId: string | null;
  certificateId: string | null;
};

export type PaidAppraisalPaymentInput = {
  sessionId: string;
  userId?: string | null;
  ownerEmail?: string | null;
  customerEmail?: string | null;
  orgId?: string | null;
  projectId?: string | null;
  offerId: string;
  amount: number;
  currency: string;
  stripePaymentId?: string | null;
  stripeCustomerId?: string | null;
  metadata?: Record<string, unknown>;
  traceId?: string | null;
};

export async function recordPaidAppraisalPayment(input: PaidAppraisalPaymentInput) {
  const cleanSessionId = cleanStripeId(input.sessionId, "cs_");
  if (!cleanSessionId) throw new Error("STRIPE_SESSION_ID_REQUIRED");

  const offer = appraisalOfferFor(input.offerId);
  const amount = Math.max(0, Math.round(Number(input.amount || 0)));
  const currency = cleanCurrency(input.currency);
  if (amount !== offer.unitAmount) throw new Error("PAYMENT_AMOUNT_MISMATCH");
  if (currency !== "usd") throw new Error("PAYMENT_CURRENCY_MISMATCH");

  const userId = cleanIdentifier(input.userId, 120) || checkoutUserId(cleanSessionId);
  const ownerEmail = cleanEmail(input.ownerEmail) || checkoutOwnerEmail(cleanSessionId);
  const customerEmail = cleanEmail(input.customerEmail);
  const now = new Date();
  const metadata = sanitizeMetadata({
    product: "ventureos_appraisal",
    offerId: offer.id,
    source: "stripe_checkout",
    stripePaymentId: input.stripePaymentId || null,
    stripeCustomerId: input.stripeCustomerId || null,
    customerEmailHash: customerEmail ? hashValue(customerEmail) : null,
    ...sanitizeMetadata(input.metadata || {}),
  });
  const transparencyCommitment = createTransparencyEventCommitment({
    type: "PAYMENT_RECEIVED",
    stripeSessionId: cleanSessionId,
    userId,
    projectId: input.projectId || null,
    offerId: offer.id,
    amount,
    currency,
  }, now.toISOString());
  const paidFields = paymentFieldsForLifecycleState("AWAITING_INTAKE");

  const row = await tryDatabase(async (db) => {
    await db.$executeRawUnsafe(
      `INSERT INTO "users" ("id", "email", "plan")
       VALUES ($1, $2, 'founder')
       ON CONFLICT ("id") DO NOTHING`,
      userId,
      ownerEmail,
    );

    const existingRows = await db.$queryRawUnsafe<PaymentRow[]>(
      `SELECT "id", "stripeSessionId", "status", "fulfillmentStatus", "userId", "projectId", "appraisalId", "certificateId"
       FROM "payments"
       WHERE "stripeSessionId" = $1
       LIMIT 1`,
      cleanSessionId,
    );
    const existing = existingRows[0] || null;
    const nextLifecycleState = existing
      ? assertPaidAppraisalTransition({
          current: lifecycleStateFromPaymentFields(existing),
          event: "payment.received",
        })
      : "AWAITING_INTAKE";
    const nextFields = paymentFieldsForLifecycleState(nextLifecycleState);

    const rows = await db.$queryRawUnsafe<PaymentRow[]>(
      `INSERT INTO "payments" (
          "id", "stripeSessionId", "stripePaymentId", "stripeCustomerId", "userId", "orgId", "projectId", "offerId",
          "status", "fulfillmentStatus", "amount", "currency", "customerEmail", "metadata", "paidAt"
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $14, $15, $9, $10, $11, $12::jsonb, $13)
       ON CONFLICT ("stripeSessionId") DO UPDATE SET
          "stripePaymentId" = COALESCE(EXCLUDED."stripePaymentId", "payments"."stripePaymentId"),
          "stripeCustomerId" = COALESCE(EXCLUDED."stripeCustomerId", "payments"."stripeCustomerId"),
          "status" = EXCLUDED."status",
          "fulfillmentStatus" = CASE
            WHEN "payments"."fulfillmentStatus" = 'fulfilled' THEN 'fulfilled'
            ELSE EXCLUDED."fulfillmentStatus"
          END,
          "amount" = EXCLUDED."amount",
          "currency" = EXCLUDED."currency",
          "customerEmail" = COALESCE(EXCLUDED."customerEmail", "payments"."customerEmail"),
          "metadata" = "payments"."metadata" || EXCLUDED."metadata",
          "paidAt" = COALESCE("payments"."paidAt", EXCLUDED."paidAt"),
          "updatedAt" = CURRENT_TIMESTAMP
       RETURNING "id", "stripeSessionId", "status", "fulfillmentStatus", "userId", "projectId", "appraisalId", "certificateId"`,
      randomUUID(),
      cleanSessionId,
      cleanStripeId(input.stripePaymentId, "pi_") || cleanStripeId(input.stripePaymentId, "py_") || null,
      cleanStripeId(input.stripeCustomerId, "cus_") || null,
      userId,
      cleanIdentifier(input.orgId, 120) || null,
      cleanIdentifier(input.projectId, 160) || null,
      offer.id,
      amount,
      currency,
      customerEmail || null,
      JSON.stringify({ ...metadata, lifecycleState: nextLifecycleState, transparencyCommitment }),
      now,
      existing ? nextFields.status : paidFields.status,
      existing ? nextFields.fulfillmentStatus : paidFields.fulfillmentStatus,
    );
    return rows[0] || null;
  });

  if (!row) throw new Error("DATABASE_UNAVAILABLE");

  await auditLogService.record({
    actorId: row.userId,
    actorEmail: customerEmail || ownerEmail,
    projectId: row.projectId,
    action: "payment.received",
    resource: "payment",
    resourceId: row.id,
    traceId: input.traceId || null,
    metadata: {
      stripeSessionId: cleanSessionId,
      offerId: offer.id,
      amount,
      currency,
      fulfillmentStatus: row.fulfillmentStatus,
      transparencyCommitment,
    },
  });

  await dispatchPaymentControlPlane({
    paymentId: row.id,
    event: "STRIPE_PAID",
    userId: row.userId,
    projectId: row.projectId,
    traceId: input.traceId || null,
    context: {
      stripeSessionId: cleanSessionId,
      offerId: offer.id,
      amount,
      currency,
      source: "stripe_checkout",
    },
  });

  return row;
}

export async function recordStripeCheckoutSessionPayment(input: {
  session: Stripe.Checkout.Session;
  traceId?: string | null;
  eventId?: string | null;
}) {
  const session = input.session;
  const offer = appraisalOfferFor(session.metadata?.offerId);
  const price = firstLineItemPrice(session);
  const expectedPriceId = await stripePriceIdForAppraisalOffer(offer) || cleanMetadataValue(session.metadata?.expectedPriceId, "inline");
  const amountTotal = numberOrNull(session.amount_total);
  const currency = String(session.currency || price?.currency || "").toLowerCase();
  const failures: string[] = [];

  if (session.mode !== "payment") failures.push("mode");
  if (session.payment_status !== "paid") failures.push("payment_status");
  if (session.metadata?.product !== "ventureos_appraisal") failures.push("product");
  if (String(session.metadata?.offerId || "") !== offer.id) failures.push("offer");
  if (amountTotal !== offer.unitAmount) failures.push("amount_total");
  if (currency !== "usd") failures.push("currency");
  if (expectedPriceId && expectedPriceId !== "inline" && price?.id !== expectedPriceId) failures.push("price_id");
  if (!session.customer_details?.email && !session.customer_email) failures.push("customer_email");
  if (failures.length) throw new Error(`PAYMENT_VALIDATION_FAILED: ${failures.join(",")}`);

  return recordPaidAppraisalPayment({
    sessionId: session.id,
    userId: cleanMetadataValue(session.metadata?.userId) || null,
    ownerEmail: checkoutOwnerEmail(session.id),
    customerEmail: session.customer_details?.email || session.customer_email || null,
    orgId: cleanMetadataValue(session.metadata?.orgId) || null,
    projectId: cleanMetadataValue(session.metadata?.projectId) || null,
    offerId: offer.id,
    amount: amountTotal ?? 0,
    currency,
    stripePaymentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
    stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
    traceId: input.traceId || null,
    metadata: {
      stripeEventId: input.eventId || null,
      priceId: price?.id || null,
      expectedPriceId,
    },
  });
}

export async function markPaidAppraisalPaymentFulfilled(input: {
  sessionId: string;
  userId: string;
  projectId: string;
  appraisalId: string;
  appraisalPublicId?: string | null;
  certificateId?: string | null;
  traceId?: string | null;
}) {
  const cleanSessionId = cleanStripeId(input.sessionId, "cs_");
  if (!cleanSessionId) throw new Error("STRIPE_SESSION_ID_REQUIRED");

  const row = await tryDatabase(async (db) => {
    const existingRows = await db.$queryRawUnsafe<PaymentRow[]>(
      `SELECT "id", "stripeSessionId", "status", "fulfillmentStatus", "userId", "projectId", "appraisalId", "certificateId"
       FROM "payments"
       WHERE "stripeSessionId" = $1
       LIMIT 1`,
      cleanSessionId,
    );
    const existing = existingRows[0];
    if (!existing) return null;
    const nextLifecycleState = assertPaidAppraisalTransition({
      current: lifecycleStateFromPaymentFields(existing),
      event: "fulfillment.completed",
    });
    const nextFields = paymentFieldsForLifecycleState(nextLifecycleState);
    const rows = await db.$queryRawUnsafe<PaymentRow[]>(
      `UPDATE "payments"
       SET "status" = $6,
           "fulfillmentStatus" = $7,
           "projectId" = $2,
           "appraisalId" = $3,
           "certificateId" = $4,
           "fulfilledAt" = COALESCE("fulfilledAt", CURRENT_TIMESTAMP),
           "updatedAt" = CURRENT_TIMESTAMP,
           "metadata" = "metadata" || $5::jsonb
       WHERE "stripeSessionId" = $1
       RETURNING "id", "stripeSessionId", "status", "fulfillmentStatus", "userId", "projectId", "appraisalId", "certificateId"`,
      cleanSessionId,
      cleanIdentifier(input.projectId, 160),
      cleanIdentifier(input.appraisalId, 160),
      cleanIdentifier(input.certificateId, 160) || null,
      JSON.stringify(sanitizeMetadata({
        fulfilledBy: "appraisal_intake",
        lifecycleState: nextLifecycleState,
        appraisalPublicId: input.appraisalPublicId || null,
      })),
      nextFields.status,
      nextFields.fulfillmentStatus,
    );
    return rows[0] || null;
  });

  if (!row) return null;

  await auditLogService.record({
    actorId: input.userId,
    projectId: input.projectId,
    action: "payment.fulfilled",
    resource: "payment",
    resourceId: row.id,
    traceId: input.traceId || null,
    metadata: {
      stripeSessionId: cleanSessionId,
      appraisalId: input.appraisalId,
      appraisalPublicId: input.appraisalPublicId || null,
      certificateId: input.certificateId || null,
    },
  });

  await dispatchPaymentControlPlane({
    paymentId: row.id,
    event: "LOCKED",
    userId: input.userId,
    projectId: input.projectId,
    traceId: input.traceId || null,
    context: {
      stripeSessionId: cleanSessionId,
      appraisalId: input.appraisalId,
      appraisalPublicId: input.appraisalPublicId || null,
      certificateId: input.certificateId || null,
      source: "appraisal_fulfillment",
    },
  });

  return row;
}

export async function transitionPaidAppraisalPayment(input: {
  sessionId: string;
  event: Parameters<typeof assertPaidAppraisalTransition>[0]["event"];
  traceId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const cleanSessionId = cleanStripeId(input.sessionId, "cs_");
  if (!cleanSessionId) throw new Error("STRIPE_SESSION_ID_REQUIRED");

  const row = await tryDatabase(async (db) => {
    const existingRows = await db.$queryRawUnsafe<PaymentRow[]>(
      `SELECT "id", "stripeSessionId", "status", "fulfillmentStatus", "userId", "projectId", "appraisalId", "certificateId"
       FROM "payments"
       WHERE "stripeSessionId" = $1
       LIMIT 1`,
      cleanSessionId,
    );
    const existing = existingRows[0];
    if (!existing) return null;

    const nextLifecycleState = assertPaidAppraisalTransition({
      current: lifecycleStateFromPaymentFields(existing),
      event: input.event,
    });
    const nextFields = paymentFieldsForLifecycleState(nextLifecycleState);

    const rows = await db.$queryRawUnsafe<PaymentRow[]>(
      `UPDATE "payments"
       SET "status" = $2,
           "fulfillmentStatus" = $3,
           "metadata" = "metadata" || $4::jsonb,
           "updatedAt" = CURRENT_TIMESTAMP
       WHERE "stripeSessionId" = $1
       RETURNING "id", "stripeSessionId", "status", "fulfillmentStatus", "userId", "projectId", "appraisalId", "certificateId"`,
      cleanSessionId,
      nextFields.status,
      nextFields.fulfillmentStatus,
      JSON.stringify(sanitizeMetadata({
        lifecycleEvent: input.event,
        lifecycleState: nextLifecycleState,
        ...(input.metadata || {}),
      })),
    );
    return rows[0] || null;
  });

  if (row) {
    await auditLogService.record({
      actorId: row.userId,
      projectId: row.projectId,
      action: input.event,
      resource: "payment",
      resourceId: row.id,
      traceId: input.traceId || null,
      metadata: {
        stripeSessionId: cleanSessionId,
        status: row.status,
        fulfillmentStatus: row.fulfillmentStatus,
        ...(input.metadata || {}),
      },
    });

    const controlPlaneEvent = controlPlaneEventForPaidAppraisal(input.event);
    if (controlPlaneEvent) {
      await dispatchPaymentControlPlane({
        paymentId: row.id,
        event: controlPlaneEvent,
        userId: row.userId,
        projectId: row.projectId,
        traceId: input.traceId || null,
        context: {
          stripeSessionId: cleanSessionId,
          status: row.status,
          fulfillmentStatus: row.fulfillmentStatus,
          ...(input.metadata || {}),
        },
      });
    }
  }

  return row;
}

function controlPlaneEventForPaidAppraisal(event: PaidAppraisalLifecycleEvent): ControlPlaneEventName | null {
  switch (event) {
    case "payment.received":
      return "STRIPE_PAID";
    case "intake.received":
      return "INTAKE_RECEIVED";
    case "scan.started":
      return "SCAN_STARTED";
    case "scan.completed":
      return "SCAN_COMPLETED";
    case "appraisal.completed":
      return "APPRAISAL_CREATED";
    case "certificate.issued":
      return "CERTIFICATE_ISSUED";
    case "fulfillment.completed":
      return "LOCKED";
    case "failure.recorded":
      return "FAILED";
    case "checkout.cancelled":
      return "CANCELLED";
    case "payment.refunded":
      return "REFUNDED";
    default:
      return null;
  }
}

async function dispatchPaymentControlPlane(input: {
  paymentId: string;
  event: ControlPlaneEventName;
  userId?: string | null;
  projectId?: string | null;
  traceId?: string | null;
  context?: Record<string, unknown>;
}) {
  try {
    await controlPlane.dispatch({
      name: input.event,
      entityKind: "payment",
      entityId: input.paymentId,
      actorId: input.userId || null,
      projectId: input.projectId || null,
      traceId: input.traceId || null,
      context: {
        userId: input.userId || null,
        projectId: input.projectId || null,
        ...(input.context || {}),
      },
    });
  } catch (error) {
    console.warn(`[control-plane] payment dispatch failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function checkoutUserId(sessionId: string) {
  return `stripe-checkout-${sessionId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 72)}`;
}

export function checkoutOwnerEmail(sessionId: string) {
  return `checkout-${hashValue(sessionId).slice(0, 24)}@ventureos.local`;
}

function firstLineItemPrice(session: Stripe.Checkout.Session) {
  const lineItems = (session as Stripe.Checkout.Session & { line_items?: { data?: Array<{ price?: unknown }> } }).line_items?.data || [];
  const price = lineItems[0]?.price;
  if (!price || typeof price !== "object") return null;
  const record = price as { id?: unknown; unit_amount?: unknown; currency?: unknown };
  return {
    id: typeof record.id === "string" ? record.id : "",
    unitAmount: numberOrNull(record.unit_amount),
    currency: typeof record.currency === "string" ? record.currency.toLowerCase() : "",
  };
}

function cleanStripeId(value: unknown, prefix?: string) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  if (prefix && !clean.startsWith(prefix)) return "";
  return /^[a-zA-Z0-9_:-]+$/.test(clean) ? clean.slice(0, 220) : "";
}

function cleanIdentifier(value: unknown, maxLength: number) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_.:@/-]/g, "-")
    .slice(0, maxLength);
}

function cleanCurrency(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z]/g, "").slice(0, 12) || "usd";
}

function cleanEmail(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.slice(0, 180) : "";
}

function cleanMetadataValue(value: unknown, fallback = "") {
  const clean = String(value || "").trim();
  return clean || fallback;
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
