import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse, trace, withStep } from "@/lib/diagnostics";
import { scheduledJobService } from "@/lib/services/scheduledJobs";
import { resolveWorkspaceProjectIdForUser } from "@/lib/services/projectWorkspace";
import { compileTrust, readCompiledJson, requireCompiledAdmin } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug?: string[] }> };

export async function GET(_request: NextRequest) {
  const traceId = createTrace("scheduled-jobs.GET");
  try {
    const { session } = await compileTrust(_request, { mode: "session" });
    const jobs = await withStep("scheduled-jobs.GET", traceId, "list scheduled jobs", () => scheduledJobService.list(session.userId), 15_000);
    return NextResponse.json({ ok: true, traceId, jobs });
  } catch (error) {
    return errorResponse("scheduled-jobs.GET", traceId, error, statusForScheduledError(error));
  }
}

export async function POST(request: NextRequest, context: Context) {
  const traceId = createTrace("scheduled-jobs.POST");
  try {
    const trust = await compileTrust(request, { mode: "session" });
    const { session } = trust;
    const slug = (await context.params).slug || [];
    const body = await readCompiledJson(request);
    trace("scheduled-jobs.POST", "payload parsed", { traceId, action: slug.join("/"), userId: session.userId, jobType: body?.jobType });
    if (slug.length === 1 && slug[0] === "run-due") {
      await requireCompiledAdmin(trust);
      const results = await withStep("scheduled-jobs.POST", traceId, "run due jobs", () => scheduledJobService.runDue(Number(body?.limit || 10), traceId), 15_000);
      return NextResponse.json({ ok: true, traceId, results });
    }
    if (slug.length === 0) {
      const projectId = await resolveWorkspaceProjectIdForUser(body?.projectId || body?.project_id, session.userId);
      const job = await withStep("scheduled-jobs.POST", traceId, "create scheduled job", () =>
        scheduledJobService.create({
          name: String(body?.name || ""),
          jobType: String(body?.jobType || ""),
          schedule: String(body?.schedule || ""),
          payload: asJsonObject(body?.payload),
          userId: session.userId,
          teamId: session.orgId,
          projectId,
          traceId,
        }), 15_000);
      return NextResponse.json({ ok: true, traceId, job }, { status: 201 });
    }
    return NextResponse.json({ ok: false, traceId, error: "Backend route not found." }, { status: 404 });
  } catch (error) {
    return errorResponse("scheduled-jobs.POST", traceId, error, statusForScheduledError(error));
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  const traceId = createTrace("scheduled-jobs.DELETE");
  try {
    const { session } = await compileTrust(_request, { mode: "session" });
    const slug = (await context.params).slug || [];
    if (slug.length !== 1) return NextResponse.json({ ok: false, traceId, error: "Backend route not found." }, { status: 404 });
    const paused = await withStep("scheduled-jobs.DELETE", traceId, "pause scheduled job", () => scheduledJobService.pause(slug[0], session.userId, traceId), 15_000);
    return NextResponse.json({ ok: true, traceId, paused });
  } catch (error) {
    return errorResponse("scheduled-jobs.DELETE", traceId, error, statusForScheduledError(error));
  }
}

function statusForScheduledError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  if (message === "PROJECT_NOT_FOUND") return 404;
  if (/required|schedule/i.test(message)) return 400;
  return 500;
}

function asJsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
