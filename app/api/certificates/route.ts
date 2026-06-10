import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse, withStep } from "@/lib/diagnostics";
import { issueCertificateForAppraisal, loadLatestPublicCertificateForAppraisal } from "@/lib/certificates/certificateService";
import { compileTrust, readCompiledJson } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const traceId = createTrace("certificates.GET");
  try {
    await compileTrust(request, { mode: "publicRead", reason: "public certificate lookup" });
    const appraisalId =
      request.nextUrl.searchParams.get("appraisalId") ||
      request.nextUrl.searchParams.get("publicId") ||
      request.nextUrl.searchParams.get("appraisal_id") ||
      "";
    if (!appraisalId.trim()) {
      return NextResponse.json({ ok: false, traceId, error: "appraisalId or publicId is required." }, { status: 400 });
    }

    const certificate = await withStep("certificates.GET", traceId, "load latest public certificate", () =>
      loadLatestPublicCertificateForAppraisal(appraisalId), 10_000);

    return NextResponse.json({
      ok: true,
      traceId,
      certificate,
    });
  } catch (error) {
    return errorResponse("certificates.GET", traceId, error, statusForCertificateError(error));
  }
}

export async function POST(request: NextRequest) {
  const traceId = createTrace("certificates.POST");
  try {
    const { session } = await compileTrust(request, { mode: "session" });
    const body = await readCompiledJson(request);
    const appraisalId = String(body.appraisalId || body.publicId || body.appraisal_id || "").trim();
    if (!appraisalId) {
      return NextResponse.json({ ok: false, traceId, error: "appraisalId is required." }, { status: 400 });
    }

    const certificate = await withStep("certificates.POST", traceId, "issue signed certificate", () =>
      issueCertificateForAppraisal({ appraisalIdOrPublicId: appraisalId, userId: session.userId }), 15_000);

    return NextResponse.json({
      ok: true,
      traceId,
      certificate,
    }, { status: 201 });
  } catch (error) {
    return errorResponse("certificates.POST", traceId, error, statusForCertificateError(error));
  }
}

function statusForCertificateError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  if (message === "APPRAISAL_NOT_FOUND") return 404;
  if (message === "DATABASE_UNAVAILABLE" || message === "CERTIFICATE_SIGNING_KEY_REQUIRED") return 503;
  if (/required|invalid/i.test(message)) return 400;
  return 500;
}
