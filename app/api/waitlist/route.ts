import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";

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
    }>(request, { maxBytes: 8_000 }));

    const email = sanitizePublicText(body.email, 160).toLowerCase();
    if (!emailPattern.test(email)) {
      return jsonResponse({ ok: false, traceId, error: "Enter a valid email address." }, { status: 400, headers: rateLimit.headers });
    }

    const role = "builder";
    const useCase = sanitizePublicText(body.useCase, 500);
    const userAgent = request.headers.get("user-agent")?.slice(0, 240) || "";

    const stored = await tryDatabase((db) =>
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
          source: "conversion_trust_sections",
          userAgentHash: userAgent ? hashForLog(userAgent) : null,
        }),
      ),
    );

    if (!stored) {
      return jsonResponse({ ok: false, traceId, error: "Waitlist storage is unavailable. Please try again later." }, { status: 503, headers: rateLimit.headers });
    }

    return jsonResponse({ ok: true, traceId, stored: true }, { headers: rateLimit.headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return secureErrorResponse("waitlist.POST", traceId, error, { fallbackStatus: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
