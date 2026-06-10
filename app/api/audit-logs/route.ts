import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse, trace, withStep } from "@/lib/diagnostics";
import { auditLogService } from "@/lib/services/auditLog";
import { compileTrust, readCompiledJson } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const traceId = createTrace("audit-logs.GET");
  try {
    await compileTrust(request, { mode: "admin" });

    const url = new URL(request.url);
    const logs = await withStep("audit-logs.GET", traceId, "list audit logs", () => auditLogService.list({
      actorId: url.searchParams.get("actorId") || undefined,
      teamId: url.searchParams.get("teamId") || undefined,
      projectId: url.searchParams.get("projectId") || undefined,
      action: url.searchParams.get("action") || undefined,
      limit: Number(url.searchParams.get("limit") || 50),
    }), 15_000);
    return NextResponse.json({ ok: true, traceId, logs });
  } catch (error) {
    return errorResponse("audit-logs.GET", traceId, error, statusForAdminError(error));
  }
}

export async function POST(request: NextRequest) {
  const traceId = createTrace("audit-logs.POST");
  try {
    const { session } = await compileTrust(request, { mode: "admin" });

    const body = await readCompiledJson(request);
    trace("audit-logs.POST", "payload parsed", { traceId, action: body?.action, resource: body?.resource });
    const log = await withStep("audit-logs.POST", traceId, "record audit log", () =>
      auditLogService.record({
        actorId: session.userId,
        actorEmail: session.userId.includes("@") ? session.userId : null,
        projectId: optionalString(body?.projectId),
        action: String(body?.action || ""),
        resource: String(body?.resource || ""),
        resourceId: optionalString(body?.resourceId),
        outcome: body?.outcome === "failure" ? "failure" : "success",
        ipAddress: optionalString(body?.ipAddress),
        userAgent: optionalString(body?.userAgent),
        metadata: asJsonObject(body?.metadata),
        traceId: typeof body?.traceId === "string" && body.traceId.trim() ? body.traceId : traceId,
      }), 15_000);
    return NextResponse.json({ ok: true, traceId, log }, { status: 201 });
  } catch (error) {
    return errorResponse("audit-logs.POST", traceId, error, statusForAdminError(error));
  }
}

function statusForAdminError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  if (/required/i.test(message)) return 400;
  return 500;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asJsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
