import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";

import { isProductFunnelBotRequest, recordRequestProductFunnelEvent } from "@/lib/analytics/product-funnel-request";
import { recordWaitlistLead } from "@/lib/analytics/waitlist-lead-store";
import { createTrace } from "@/lib/diagnostics";
import { tryDatabase } from "@/lib/prisma";
import {
  enforceRateLimit,
  hashForLog,
  jsonResponse,
  RATE_LIMITS,
  readJsonBody,
  sanitizePublicText,
  secureErrorResponse,
} from "@/lib/security/backendSecurity";
import { compileTrust, stripClientIdentity } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const traceId = createTrace("waitlist.POST");
  try {
    await compileTrust(request, { mode: "publicNonPersistent" });
    const rateLimit = await enforceRateLimit(request, RATE_LIMITS.waitlist);
    const body = stripClientIdentity(await readJsonBody<{
      email?: unknown;
      role?: unknown;
      useCase?: unknown;
      source?: unknown;
      campaign?: unknown;
      ref?: unknown;
      utmSource?: unknown;
      utm_source?: unknown;
      synthetic?: unknown;
    }>(request, { maxBytes: 8_000 }));

    const email = sanitizePublicText(body.email, 160).toLowerCase();
    if (!emailPattern.test(email)) {
      return jsonResponse({ ok: false, traceId, error: "Enter a valid email address." }, { status: 400, headers: rateLimit.headers });
    }

    const role = sanitizePublicText(body.role, 80) || "builder";
    const useCase = sanitizePublicText(body.useCase, 500);
    const source = sanitizePublicText(body.source, 80) || "conversion_trust_sections";
    const campaign = sanitizePublicText(body.campaign, 80);
    const ref = sanitizePublicText(body.ref, 80);
    const utmSource = sanitizePublicText(body.utmSource || body.utm_source, 80);
    const userAgent = request.headers.get("user-agent")?.slice(0, 240) || "";
    const userAgentHash = userAgent ? hashForLog(userAgent) : null;
    const synthetic = Boolean(body.synthetic) || isProductFunnelBotRequest(request) || /(^|[_.:-])(test|synthetic|qa|smoke)([_.:-]|$)/i.test(`${campaign}:${ref}:${utmSource}`);

    const stored = synthetic ? false : await tryDatabase((db) =>
      db.$executeRawUnsafe(
        `INSERT INTO "usage_events" ("id", "event", "metadata", "createdAt")
         VALUES ($1, $2, $3::jsonb, NOW())`,
        randomUUID(),
        "waitlist.joined",
        JSON.stringify({
          email,
          role,
          useCase,
          userId: null,
          source,
          campaign,
          ref,
          utmSource,
          userAgentHash,
        }),
      ),
    );
    const kvLead = synthetic ? { stored: false, provider: "synthetic" as const, id: null } : await recordWaitlistLead({
      email,
      role,
      useCase,
      source,
      campaign,
      ref,
      utmSource,
      userAgentHash,
    });

    await recordRequestProductFunnelEvent(request, {
      eventType: "waitlist.joined",
      source: "waitlist",
      metadata: {
        surface: "waitlist-api",
        source,
        role,
        campaign,
        ref,
        utmSource,
        synthetic,
        leadStored: Boolean(stored || kvLead.stored),
      },
    }).catch(() => false);

    if (!stored && !kvLead.stored) {
      if (synthetic) {
        return jsonResponse({ ok: true, traceId, stored: false, synthetic: true }, { headers: rateLimit.headers });
      }
      return jsonResponse({ ok: false, traceId, error: "Waitlist storage is unavailable. Please try again later." }, { status: 503, headers: rateLimit.headers });
    }

    return jsonResponse({
      ok: true,
      traceId,
      stored: true,
      provider: stored && kvLead.stored ? "postgres+upstash-kv" : stored ? "postgres" : kvLead.provider,
    }, { headers: rateLimit.headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return secureErrorResponse("waitlist.POST", traceId, error, { fallbackStatus: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
