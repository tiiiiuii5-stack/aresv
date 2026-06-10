import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse, withStep } from "@/lib/diagnostics";
import { getProjectWorkspace, resolveWorkspaceProjectIdForUser } from "@/lib/services/projectWorkspace";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: Context) {
  const traceId = createTrace("project-workspaces.GET");
  try {
    const { session } = await compileTrust(_request, { mode: "session" });
    const { id } = await context.params;
    const workspaceId = id === "legacy" ? id : await resolveWorkspaceProjectIdForUser(id, session.userId);
    if (!workspaceId) {
      return NextResponse.json({ ok: false, traceId, error: "Project workspace not found." }, { status: 404 });
    }
    const workspace = await withStep("project-workspaces.GET", traceId, "load workspace", () => getProjectWorkspace(workspaceId), 15_000);
    if (!workspace) {
      return NextResponse.json({ ok: false, traceId, error: "Project workspace not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, traceId, workspace });
  } catch (error) {
    return errorResponse("project-workspaces.GET", traceId, error, statusForWorkspaceError(error));
  }
}

function statusForWorkspaceError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  if (message === "PROJECT_NOT_FOUND") return 404;
  return 500;
}
