import { randomUUID } from "node:crypto";

import Stripe from "stripe";

import { auditLogService } from "@/lib/services/auditLog";
import { founderEntitlementForUser } from "@/lib/services/founderEntitlement";
import { dbOrThrow, required, sanitizeMetadata, type JsonObject } from "@/lib/services/platformSupport";

export type BillingTier = "STARTER" | "PRO" | "TEAM" | "ENTERPRISE";
export type BillingCycle = "monthly" | "annual";
export type BillingStatus = "ACTIVE" | "PAST_DUE" | "CANCELLED" | "TRIALING";

export const TIER_LIMITS: Record<BillingTier, { builds: number | null; projects: number | null; label: string; price: string }> = {
  STARTER: { builds: null, projects: null, label: "Starter", price: "Free" },
  PRO: { builds: null, projects: null, label: "Pro", price: "Free" },
  TEAM: { builds: null, projects: null, label: "Team", price: "Free" },
  ENTERPRISE: { builds: null, projects: null, label: "Enterprise", price: "Custom" },
};

const TIER_PRICES: Record<Exclude<BillingTier, "STARTER" | "ENTERPRISE">, Record<BillingCycle, { unitAmount: number; label: string; interval: "month" | "year" }>> = {
  PRO: {
    monthly: { unitAmount: 0, label: "Pro", interval: "month" },
    annual: { unitAmount: 0, label: "Pro Annual", interval: "year" },
  },
  TEAM: {
    monthly: { unitAmount: 0, label: "Team", interval: "month" },
    annual: { unitAmount: 0, label: "Team Annual", interval: "year" },
  },
};

type SubscriptionRow = {
  id: string;
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  tier: BillingTier;
  status: BillingStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
};

export class BillingService {
  async upsertAccount(input: { userId: string; teamId?: string | null; plan?: string; status?: string; customerRef?: string | null; subscriptionRef?: string | null; metadata?: JsonObject; traceId?: string }) {
    const db = dbOrThrow();
    const rows = await db.$queryRawUnsafe(
      `INSERT INTO "billing_accounts" ("id", "userId", "teamId", "plan", "status", "customerRef", "subscriptionRef", "metadata", "updatedAt")
       VALUES ($8, $1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
       ON CONFLICT ("userId", "teamId") DO UPDATE SET "plan" = EXCLUDED."plan", "status" = EXCLUDED."status", "customerRef" = EXCLUDED."customerRef", "subscriptionRef" = EXCLUDED."subscriptionRef", "metadata" = EXCLUDED."metadata", "updatedAt" = NOW()
       RETURNING *`,
      required(input.userId, "userId"),
      input.teamId || null,
      input.plan || "free",
      input.status || "active",
      input.customerRef || null,
      input.subscriptionRef || null,
      JSON.stringify(sanitizeMetadata(input.metadata || {})),
      randomUUID(),
    );
    await auditLogService.record({ actorId: input.userId, teamId: input.teamId || null, action: "billing.account.upsert", resource: "billing_account", traceId: input.traceId, metadata: { plan: input.plan || "free" } });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async getAccount(userId: string, teamId?: string | null) {
    const db = dbOrThrow();
    const rows = await db.$queryRawUnsafe(`SELECT * FROM "billing_accounts" WHERE "userId" = $1 AND ($2::text IS NULL OR "teamId" = $2) ORDER BY "createdAt" DESC LIMIT 1`, required(userId, "userId"), teamId || null);
    return Array.isArray(rows) ? rows[0] || null : rows;
  }

  async recordUsage(input: { userId: string; teamId?: string | null; metric: string; amount?: number; metadata?: JsonObject; traceId?: string }) {
    const db = dbOrThrow();
    const account = await this.upsertAccount({ userId: input.userId, teamId: input.teamId || null, traceId: input.traceId });
    const metric = required(input.metric, "metric");
    const amount = Math.max(Number(input.amount || 1), 0);
    const rows = await db.$queryRawUnsafe(
      `UPDATE "billing_accounts"
       SET "usage" = jsonb_set(COALESCE("usage", '{}'::jsonb), ARRAY[$2], to_jsonb(COALESCE(("usage" ->> $2)::numeric, 0) + $3::numeric), true),
           "updatedAt" = NOW()
       WHERE "id" = $1
       RETURNING *`,
      (account as { id: string }).id,
      metric,
      amount,
    );
    await this.recordUsageEvent(input.userId, `billing.${metric}`, { amount, ...(input.metadata || {}) });
    await auditLogService.record({ actorId: input.userId, teamId: input.teamId || null, action: "billing.usage.record", resource: "billing_account", resourceId: (account as { id: string }).id, traceId: input.traceId, metadata: sanitizeMetadata({ metric, amount, ...(input.metadata || {}) }) });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async createCheckoutSession(input: { userId: string; teamId?: string | null; tier: string; billingCycle?: string; origin: string; successPath?: string; cancelPath?: string; traceId?: string }) {
    const tier = normalizeTier(input.tier);
    if (tier === "STARTER") throw new Error("Starter is free and does not require checkout.");
    if (tier === "ENTERPRISE") throw new Error("Enterprise is custom and requires sales contact.");
    const billingCycle = normalizeBillingCycle(input.billingCycle);
    const user = await ensureUser(input.userId);
    const stripe = getStripe();
    const origin = required(input.origin, "origin").replace(/\/$/, "");
    const customerId = await this.ensureStripeCustomerForUser(user, input.teamId || null, input.traceId, stripe);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ ...checkoutLineItemForTier(tier, billingCycle), quantity: 1 }],
      success_url: `${origin}${input.successPath || "/account"}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${input.cancelPath || "/pricing"}?checkout=cancelled`,
      client_reference_id: user.id,
      metadata: stripeMetadata({
        userId: user.id,
        teamId: input.teamId || "",
        tier,
        billingCycle,
        traceId: input.traceId || "",
      }),
      subscription_data: {
        metadata: stripeMetadata({
          userId: user.id,
          teamId: input.teamId || "",
          tier,
          billingCycle,
        }),
      },
    });

    await auditLogService.record({
      actorId: user.id,
      teamId: input.teamId || null,
      action: "billing.checkout.create",
      resource: "stripe_checkout_session",
      resourceId: session.id,
      traceId: input.traceId,
      metadata: { tier, billingCycle, unitAmount: TIER_PRICES[tier][billingCycle].unitAmount },
    });

    return { sessionId: session.id, url: session.url, tier, billingCycle };
  }

  async createPortalSession(input: { userId: string; origin: string; traceId?: string }) {
    const user = await ensureUser(input.userId);
    const customerId = await this.getKnownStripeCustomerId(user.id);
    if (!customerId) throw new Error("No Stripe customer exists for this user.");
    const origin = required(input.origin, "origin").replace(/\/$/, "");
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/account`,
    });
    await auditLogService.record({ actorId: user.id, action: "billing.portal.create", resource: "stripe_portal_session", resourceId: session.id, traceId: input.traceId });
    return { url: session.url };
  }

  private async ensureStripeCustomerForUser(user: { id: string; email: string }, teamId?: string | null, traceId?: string, stripe = getStripe()) {
    const existingCustomerId = await this.getKnownStripeCustomerId(user.id);
    if (existingCustomerId) return existingCustomerId;

    const customer = await stripe.customers.create({
      email: user.email,
      metadata: stripeMetadata({
        userId: user.id,
        teamId: teamId || "",
        traceId: traceId || "",
      }),
    });

    await this.upsertAccount({
      userId: user.id,
      teamId: teamId || null,
      customerRef: customer.id,
      traceId,
    });

    return customer.id;
  }

  private async getKnownStripeCustomerId(userId: string) {
    const subscription = await this.getSubscription(userId);
    if (subscription?.stripeCustomerId) return subscription.stripeCustomerId;

    const db = dbOrThrow();
    const rows = await db.$queryRawUnsafe<Array<{ customerRef: string | null }>>(
      `SELECT "customerRef"
       FROM "billing_accounts"
       WHERE "userId" = $1 AND "customerRef" IS NOT NULL
       ORDER BY "updatedAt" DESC
       LIMIT 1`,
      required(userId, "userId"),
    );
    return Array.isArray(rows) ? rows[0]?.customerRef || null : null;
  }

  async handleStripeWebhook(input: { payload: string; signature: string | null; traceId?: string }) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error("Missing required env var: STRIPE_WEBHOOK_SECRET");
    const event = getStripe().webhooks.constructEvent(input.payload, input.signature || "", secret);

    if (event.type === "checkout.session.completed") {
      await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, input.traceId);
    }

    if (event.type === "invoice.paid") {
      await this.handleInvoicePaid(event.data.object as Stripe.Invoice, input.traceId);
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      await this.upsertSubscriptionFromStripe(event.data.object as Stripe.Subscription, input.traceId);
    }

    await auditLogService.record({
      actorId: "stripe",
      action: "billing.webhook.received",
      resource: "stripe_event",
      resourceId: event.id,
      traceId: input.traceId,
      metadata: { type: event.type },
    });

    return { received: true, type: event.type, eventId: event.id };
  }

  async getStatus(userId: string) {
    const user = await ensureUser(userId || "anonymous");
    const founder = await founderEntitlementForUser(user.id);
    if (founder.active) {
      const usage = await this.getMonthlyUsage(user.id);
      return {
        userId: user.id,
        tier: "ENTERPRISE" as const,
        status: "ACTIVE" as const,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        usage,
        limits: TIER_LIMITS.ENTERPRISE,
        entitlement: {
          kind: "founder",
          email: founder.email,
          reason: founder.reason,
        },
        blocked: {
          builds: false,
          projects: false,
        },
      };
    }
    const subscription = await this.getSubscription(user.id);
    const tier = subscription?.status === "CANCELLED" ? "STARTER" : subscription?.tier || "STARTER";
    const limits = TIER_LIMITS[tier];
    const usage = await this.getMonthlyUsage(user.id);
    return {
      userId: user.id,
      tier,
      status: subscription?.status || "ACTIVE",
      currentPeriodEnd: subscription?.currentPeriodEnd || null,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd || false,
      usage,
      limits,
      blocked: {
        builds: limits.builds !== null && usage.builds >= limits.builds,
        projects: limits.projects !== null && usage.projects >= limits.projects,
      },
    };
  }

  async assertBuildAllowed(userId: string) {
    const status = await this.getStatus(userId);
    if (status.blocked.builds) {
      return {
        allowed: false,
        status,
        error: `${status.tier === "STARTER" ? "Free" : status.tier} plan build limit reached. Upgrade to continue.`,
      };
    }
    return { allowed: true, status };
  }

  async recordBuild(userId: string, metadata: JsonObject = {}) {
    await this.recordUsageEvent(userId, "build.created", metadata);
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session, traceId?: string) {
    const userId = String(session.metadata?.userId || session.client_reference_id || "");
    const subscriptionId = typeof session.subscription === "string" ? session.subscription : "";
    if (!userId || !subscriptionId) return;
    const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
    await this.upsertSubscriptionFromStripe(subscription, traceId, userId, normalizeTier(String(session.metadata?.tier || "PRO")));
  }

  private async handleInvoicePaid(invoice: Stripe.Invoice, traceId?: string) {
    const subscriptionId = getInvoiceSubscriptionId(invoice);
    if (!subscriptionId) return;
    const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
    await this.upsertSubscriptionFromStripe(subscription, traceId);
  }

  private async upsertSubscriptionFromStripe(subscription: Stripe.Subscription, traceId?: string, fallbackUserId?: string, fallbackTier?: BillingTier) {
    const userId = String(subscription.metadata?.userId || fallbackUserId || "");
    if (!userId) return;
    const user = await ensureUser(userId);
    const tier = fallbackTier || normalizeTier(String(subscription.metadata?.tier || tierFromPrice(subscription.items.data[0]?.price.id)));
    const status = normalizeStripeStatus(subscription.status);
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const periodStart = dateFromUnix(getNumber(subscription, "current_period_start") || Math.floor(Date.now() / 1000));
    const periodEnd = dateFromUnix(getNumber(subscription, "current_period_end") || Math.floor(Date.now() / 1000));
    const db = dbOrThrow();
    const rows = await db.$queryRawUnsafe(
      `INSERT INTO "subscriptions" ("id", "userId", "stripeCustomerId", "stripeSubscriptionId", "tier", "status", "currentPeriodStart", "currentPeriodEnd", "cancelAtPeriodEnd", "updatedAt")
       VALUES ($1, $2, $3, $4, $5::"Tier", $6::"SubscriptionStatus", $7, $8, $9, NOW())
       ON CONFLICT ("userId") DO UPDATE SET
         "stripeCustomerId" = EXCLUDED."stripeCustomerId",
         "stripeSubscriptionId" = EXCLUDED."stripeSubscriptionId",
         "tier" = EXCLUDED."tier",
         "status" = EXCLUDED."status",
         "currentPeriodStart" = EXCLUDED."currentPeriodStart",
         "currentPeriodEnd" = EXCLUDED."currentPeriodEnd",
         "cancelAtPeriodEnd" = EXCLUDED."cancelAtPeriodEnd",
         "updatedAt" = NOW()
       RETURNING *`,
      randomUUID(),
      user.id,
      customerId,
      subscription.id,
      tier,
      status,
      periodStart,
      periodEnd,
      Boolean(subscription.cancel_at_period_end),
    );
    await this.upsertAccount({ userId: user.id, plan: tier.toLowerCase(), status: status.toLowerCase(), customerRef: customerId, subscriptionRef: subscription.id, traceId });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  private async getSubscription(userId: string): Promise<SubscriptionRow | null> {
    const db = dbOrThrow();
    const rows = await db.$queryRawUnsafe(`SELECT * FROM "subscriptions" WHERE "userId" = $1 LIMIT 1`, required(userId, "userId"));
    return Array.isArray(rows) ? rows[0] || null : rows as SubscriptionRow | null;
  }

  private async getMonthlyUsage(userId: string) {
    const db = dbOrThrow();
    const since = new Date();
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);
    const buildRows = await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "usage_events" WHERE "userId" = $1 AND "event" = 'build.created' AND "createdAt" >= $2`, userId, since);
    const projectRows = await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "projects" WHERE "userId" = $1`, userId);
    return {
      builds: Number(Array.isArray(buildRows) ? buildRows[0]?.count || 0 : 0),
      projects: Number(Array.isArray(projectRows) ? projectRows[0]?.count || 0 : 0),
      periodStart: since.toISOString(),
    };
  }

  private async recordUsageEvent(userId: string, event: string, metadata: JsonObject = {}) {
    const db = dbOrThrow();
    await db.$executeRawUnsafe(
      `INSERT INTO "usage_events" ("id", "userId", "event", "metadata", "createdAt") VALUES ($1, $2, $3, $4::jsonb, NOW())`,
      randomUUID(),
      userId,
      event,
      JSON.stringify(sanitizeMetadata(metadata)),
    );
  }
}

export const billingService = new BillingService();

async function ensureUser(userIdOrEmail: string) {
  const db = dbOrThrow();
  const clean = required(userIdOrEmail, "userId");
  const email = clean.includes("@") ? clean : `${clean}@ventureos.local`;
  const rows = await db.$queryRawUnsafe(
    `INSERT INTO "users" ("id", "email", "plan")
     VALUES ($1, $2, 'free')
     ON CONFLICT ("id") DO UPDATE SET "email" = "users"."email"
     RETURNING "id", "email"`,
    clean,
    email,
  );
  return Array.isArray(rows) ? rows[0] as { id: string; email: string } : rows as { id: string; email: string };
}

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing required env var: STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
}

function normalizeTier(tier: string): BillingTier {
  const clean = tier.trim().toUpperCase();
  if (clean === "FREE") return "STARTER";
  if (clean === "STARTER" || clean === "PRO" || clean === "TEAM" || clean === "ENTERPRISE") return clean;
  throw new Error("Unsupported billing tier.");
}

function normalizeBillingCycle(value: unknown): BillingCycle {
  return String(value || "").trim().toLowerCase() === "annual" ? "annual" : "monthly";
}

function checkoutLineItemForTier(tier: Exclude<BillingTier, "STARTER" | "ENTERPRISE">, billingCycle: BillingCycle): Stripe.Checkout.SessionCreateParams.LineItem {
  const price = TIER_PRICES[tier][billingCycle];
  return {
    price_data: {
      currency: "usd",
      unit_amount: price.unitAmount,
      recurring: { interval: price.interval },
      product_data: {
        name: `VentureOS ${price.label}`,
        description: tier === "PRO" ? "Private scans, exportable reports, and API access." : "Team projects, scheduled scans, RBAC, and audit history.",
      },
    },
  };
}

function tierFromPrice(priceId?: string): BillingTier {
  if (!priceId) return "PRO";
  if (priceId === process.env.STRIPE_PRICE_TEAM || priceId === process.env.STRIPE_TEAM_PRICE_ID) return "TEAM";
  if (priceId === process.env.STRIPE_PRICE_ENTERPRISE || priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) return "ENTERPRISE";
  return "PRO";
}

function normalizeStripeStatus(status: Stripe.Subscription.Status): BillingStatus {
  if (status === "trialing") return "TRIALING";
  if (status === "past_due" || status === "unpaid") return "PAST_DUE";
  if (status === "canceled" || status === "incomplete_expired") return "CANCELLED";
  return "ACTIVE";
}

function stripeMetadata(input: Record<string, string | number | null>) {
  return sanitizeMetadata(input) as Stripe.MetadataParam;
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice) {
  const data = invoice as unknown as { subscription?: string | { id?: string } | null };
  if (typeof data.subscription === "string") return data.subscription;
  return data.subscription?.id || null;
}

function getNumber(source: unknown, key: string) {
  const value = source && typeof source === "object" ? (source as Record<string, unknown>)[key] : null;
  return typeof value === "number" ? value : null;
}

function dateFromUnix(seconds: number) {
  return new Date(seconds * 1000);
}
