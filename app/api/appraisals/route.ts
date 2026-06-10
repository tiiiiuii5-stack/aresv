import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse, withStep } from "@/lib/diagnostics";
import { createSoftwareAppraisal, listSoftwareAppraisals } from "@/lib/appraisal/appraisalEngine";
import { issueCertificateForAppraisal } from "@/lib/certificates/certificateService";
import { resolveWorkspaceProjectIdForUser } from "@/lib/services/projectWorkspace";
import { compileTrust, readCompiledJson } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const traceId = createTrace("appraisals.GET");
  try {
    const { session } = await compileTrust(request, { mode: "session" });
    const requestedProjectId = request.nextUrl.searchParams.get("projectId") || request.nextUrl.searchParams.get("project_id") || "";
    const projectId = requestedProjectId
      ? await withStep("appraisals.GET", traceId, "verify project ownership", () =>
          resolveWorkspaceProjectIdForUser(requestedProjectId, session.userId), 10_000)
      : null;

    const appraisals = await withStep("appraisals.GET", traceId, "load software appraisals", () =>
      listSoftwareAppraisals({ userId: session.userId, projectId }), 10_000);

    return NextResponse.json({
      ok: true,
      traceId,
      appraisals,
      count: appraisals.length,
    });
  } catch (error) {
    return errorResponse("appraisals.GET", traceId, error, statusForAppraisalError(error));
  }
}

export async function POST(request: NextRequest) {
  const traceId = createTrace("appraisals.POST");
  try {
    const { session } = await compileTrust(request, { mode: "session" });
    const body = await readCompiledJson(request);
    const requestedProjectId = String(body.projectId || body.project_id || "").trim();
    if (!requestedProjectId) {
      return NextResponse.json({ ok: false, traceId, error: "projectId is required." }, { status: 400 });
    }

    const projectId = await withStep("appraisals.POST", traceId, "verify project ownership", () =>
      resolveWorkspaceProjectIdForUser(requestedProjectId, session.userId), 10_000);
    if (!projectId) {
      return NextResponse.json({ ok: false, traceId, error: "Project not found." }, { status: 404 });
    }

    const appraisal = await withStep("appraisals.POST", traceId, "create software appraisal", () =>
      createSoftwareAppraisal({ projectId, userId: session.userId }), 15_000);
    const certificateResult = await withStep("appraisals.POST", traceId, "issue signed certificate if available", async () => {
      try {
        const certificate = await issueCertificateForAppraisal({ appraisalIdOrPublicId: appraisal.id, userId: session.userId });
        return { certificate, warning: null as string | null };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          certificate: null,
          warning: message === "CERTIFICATE_SIGNING_KEY_REQUIRED" ? "Certificate signing keys are not configured." : "Signed certificate was not issued.",
        };
      }
    }, 15_000);

    return NextResponse.json({
      ok: true,
      traceId,
      appraisal,
      certificate: certificateResult.certificate,
      certificateWarning: certificateResult.warning,
    }, { status: 201 });
  } catch (error) {
    return errorResponse("appraisals.POST", traceId, error, statusForAppraisalError(error));
  }
}

function statusForAppraisalError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  if (message === "PROJECT_NOT_FOUND") return 404;
  if (message === "PROJECT_WORKSPACE_REQUIRED" || /projectId|required/i.test(message)) return 400;
  if (message === "DATABASE_UNAVAILABLE") return 503;
  return 500;
}
