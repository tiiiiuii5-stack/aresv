import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/guards";
import { requireSession, type AuthSession } from "@/lib/auth/session";
import { intelligenceMonetizationService, type MonetizationContext } from "@/lib/services/intelligenceMonetization";

export type TrustMode = "session" | "admin" | "apiKey" | "stripeWebhook" | "publicRead" | "publicNonPersistent";

export type TrustPolicy = {
  mode: TrustMode;
  endpoint?: string;
  scope?: string;
  reason?: string;
};

export type TrustContext = {
  mode: TrustMode;
  session: AuthSession;
  metering?: MonetizationContext;
  stages: {
    sessionLinked: true;
    clientIdentityStripped: true;
    permissionChecked: true;
    ownershipDeferred: true;
    executionCompiled: true;
  };
};

const SYSTEM_PUBLIC_SESSION: AuthSession = { userId: "public:read", role: "public", orgId: null };
const SYSTEM_WEBHOOK_SESSION: AuthSession = { userId: "stripe:webhook", role: "webhook", orgId: null };

export async function compileTrust(request: Request | null, policy: TrustPolicy): Promise<TrustContext> {
  const mode = policy.mode;

  if (mode === "session") {
    return compiled(mode, await requireSession());
  }

  if (mode === "admin") {
    const session = await requireSession();
    await requireAdmin(session);
    return compiled(mode, session);
  }

  if (mode === "apiKey") {
    if (!request || !policy.endpoint || !policy.scope) throw new Error("TRUST_POLICY_INVALID");
    const metering = await intelligenceMonetizationService.requireApiAccess(request, policy.endpoint, policy.scope);
    return compiled(mode, { userId: metering.userId, role: "api", orgId: metering.teamId }, metering);
  }

  if (mode === "stripeWebhook") {
    if (!request?.headers.get("stripe-signature")) throw new Error("STRIPE_SIGNATURE_REQUIRED");
    return compiled(mode, SYSTEM_WEBHOOK_SESSION);
  }

  if (mode === "publicRead" || mode === "publicNonPersistent") {
    return compiled(mode, SYSTEM_PUBLIC_SESSION);
  }

  throw new Error("TRUST_POLICY_INVALID");
}

export function stripClientIdentity(value: unknown): Record<string, unknown> {
  const body = value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
  delete body.userId;
  delete body.role;
  delete body.actorId;
  delete body.actorEmail;
  delete body.orgId;
  delete body.teamId;
  delete body.markedBy;
  delete body.customerRef;
  delete body.subscriptionRef;
  delete body.stripeCustomerId;
  delete body.stripeSubscriptionId;
  return body;
}

export async function readCompiledJson(request: Request): Promise<Record<string, unknown>> {
  return stripClientIdentity(await request.json().catch(() => ({})));
}

export function trustStatusFor(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  if (message === "STRIPE_SIGNATURE_REQUIRED") return 400;
  if (message === "TRUST_POLICY_INVALID") return 500;
  return 500;
}

export function trustErrorResponse(error: unknown, traceId?: string) {
  const message = error instanceof Error ? error.message : "Trust compilation failed.";
  return NextResponse.json({ ok: false, traceId, error: message }, { status: trustStatusFor(error) });
}

export async function requireCompiledAdmin(context: TrustContext) {
  await requireAdmin(context.session);
}

function compiled(mode: TrustMode, session: AuthSession, metering?: MonetizationContext): TrustContext {
  return {
    mode,
    session,
    metering,
    stages: {
      sessionLinked: true,
      clientIdentityStripped: true,
      permissionChecked: true,
      ownershipDeferred: true,
      executionCompiled: true,
    },
  };
}
