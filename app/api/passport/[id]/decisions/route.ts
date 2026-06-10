import { NextRequest } from "next/server";

import { createTrace } from "@/lib/diagnostics";
import { loadPassportDecisionSummary, recordPassportDecision } from "@/lib/passport/decision-log";
import { enforceRateLimit, jsonResponse, readJsonBody, secureErrorResponse } from "@/lib/security/backendSecurity";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const readRateLimit = { name: "passport-decisions-read", limit: 80, windowMs: 60_000 };
const writeRateLimit = { name: "passport-decisions-write", limit: 30, windowMs: 60_000 };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTrace("passport.decisions.GET");
  try {
    await compileTrust(request, { mode: "publicRead", reason: "software decision log lookup" });
    const rateLimit = await enforceRateLimit(request, readRateLimit);
    const { id } = await params;
    const summary = await loadPassportDecisionSummary(decodeURIComponent(id || ""));
    return jsonResponse({ ok: true, traceId, ...summary }, { headers: rateLimit.headers });
  } catch (error) {
    return secureErrorResponse("passport.decisions.GET", traceId, error, { fallbackStatus: 400 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTrace("passport.decisions.POST");
  try {
    await compileTrust(request, { mode: "publicNonPersistent", reason: "software decision recording" });
    const rateLimit = await enforceRateLimit(request, writeRateLimit);
    const { id } = await params;
    const body = await readJsonBody<{ decision?: unknown; actor?: unknown; context?: unknown; reason?: unknown }>(request, { maxBytes: 6_000 });
    const result = await recordPassportDecision({
      passportId: decodeURIComponent(id || ""),
      decision: body.decision,
      actor: body.actor,
      context: body.context,
      reason: body.reason,
    });
    return jsonResponse({ ok: true, traceId, decision: result.record, summary: result.summary }, { status: 201, headers: rateLimit.headers });
  } catch (error) {
    return secureErrorResponse("passport.decisions.POST", traceId, error, { fallbackStatus: statusFor(error) });
  }
}

function statusFor(error: unknown) {
  if (!(error instanceof Error)) return 400;
  if (error.message === "PASSPORT_NOT_FOUND") return 404;
  if (/REQUIRED/.test(error.message)) return 400;
  return 400;
}
