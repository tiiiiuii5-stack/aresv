import { NextRequest } from "next/server";

import { createTrace } from "@/lib/diagnostics";
import { issuePassportCertificate } from "@/lib/passport/passport-engine";
import { enforceRateLimit, jsonResponse, readJsonBody, secureErrorResponse } from "@/lib/security/backendSecurity";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rateLimit = { name: "passport-certificate", limit: 20, windowMs: 60_000 };

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTrace("passport.certificate.POST");
  try {
    await compileTrust(request, { mode: "publicNonPersistent", reason: "software passport certificate issuance" });
    const limit = await enforceRateLimit(request, rateLimit);
    const body: { type?: unknown } = await readJsonBody<{ type?: unknown }>(request, { maxBytes: 2_000 }).catch(() => ({}));
    const { id } = await params;
    const passport = await issuePassportCertificate(decodeURIComponent(id || ""), body.type);
    return jsonResponse({ ok: true, traceId, ...passport }, { status: 201, headers: limit.headers });
  } catch (error) {
    return secureErrorResponse("passport.certificate.POST", traceId, error, { fallbackStatus: statusFor(error) });
  }
}

function statusFor(error: unknown) {
  if (!(error instanceof Error)) return 400;
  if (error.message === "PASSPORT_NOT_FOUND") return 404;
  if (error.message === "CERTIFICATE_THRESHOLD_NOT_MET") return 409;
  return 400;
}
