import { NextRequest, NextResponse } from "next/server";

import { verifySubmittedCertificate } from "@/lib/certificates/certificateService";
import type { VentureOSCertificatePayload } from "@/lib/certificates/types";
import { createTrace, errorResponse, withStep } from "@/lib/diagnostics";
import { compileTrust, readCompiledJson } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const traceId = createTrace("certificates.verify.POST");
  try {
    await compileTrust(request, { mode: "publicNonPersistent", reason: "submitted certificate verification" });
    const body = await readCompiledJson(request);
    const payload = body.payload;
    const signature = String(body.signature || "").trim();
    const signingKeyId = String(body.signingKeyId || body.signing_key_id || "").trim();
    if (!isCertificatePayload(payload) || !signature || !signingKeyId) {
      return NextResponse.json({ ok: false, traceId, error: "payload, signature, and signingKeyId are required." }, { status: 400 });
    }

    const verification = await withStep("certificates.verify.POST", traceId, "verify submitted certificate", () =>
      verifySubmittedCertificate({ payload, signature, signingKeyId }), 10_000);

    return NextResponse.json({
      ok: true,
      traceId,
      verification,
    });
  } catch (error) {
    return errorResponse("certificates.verify.POST", traceId, error, 500);
  }
}

function isCertificatePayload(value: unknown): value is VentureOSCertificatePayload {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as VentureOSCertificatePayload).issuer === "VentureOS" &&
      typeof (value as VentureOSCertificatePayload).certificateId === "string" &&
      typeof (value as VentureOSCertificatePayload).issuedAt === "string" &&
      Boolean((value as VentureOSCertificatePayload).softwareAsset) &&
      Boolean((value as VentureOSCertificatePayload).appraisal) &&
      Boolean((value as VentureOSCertificatePayload).evidenceCommitment),
  );
}
