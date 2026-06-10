import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse, trace, withStep } from "@/lib/diagnostics";
import { rbacService } from "@/lib/services/rbac";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug?: string[] }> };

export async function GET(request: NextRequest, context: Context) {
  const traceId = createTrace("rbac.GET");
  try {
    await compileTrust(request, { mode: "admin" });

    const slug = (await context.params).slug || [];
    const url = new URL(request.url);
    trace("rbac.GET", "route parsed", { traceId, slug: slug.join("/") });
    if (slug.length === 1 && slug[0] === "teams") {
      const teams = await withStep("rbac.GET", traceId, "list teams", () => rbacService.listTeams(String(url.searchParams.get("userId") || "")), 15_000);
      return NextResponse.json({ ok: true, traceId, teams });
    }
    if (slug.length === 1 && slug[0] === "check") {
      const result = await withStep("rbac.GET", traceId, "check permission", () => rbacService.checkPermission({
        userId: String(url.searchParams.get("userId") || ""),
        teamId: String(url.searchParams.get("teamId") || ""),
        permission: String(url.searchParams.get("permission") || ""),
      }), 15_000);
      return NextResponse.json({ ok: true, traceId, ...result });
    }
    return NextResponse.json({ ok: false, traceId, error: "Backend route not found." }, { status: 404 });
  } catch (error) {
    return errorResponse("rbac.GET", traceId, error, statusFor(error));
  }
}

export async function POST(request: NextRequest, context: Context) {
  const traceId = createTrace("rbac.POST");
  try {
    const { session } = await compileTrust(request, { mode: "admin" });

    const slug = (await context.params).slug || [];
    const body = await request.json().catch(() => ({}));
    trace("rbac.POST", "payload parsed", { traceId, action: slug.join("/"), adminUserId: session.userId, userId: body?.userId, teamId: body?.teamId });
    if (slug.length === 1 && slug[0] === "teams") {
      const team = await withStep("rbac.POST", traceId, "create team", () => rbacService.createTeam({ ...body, actorId: session.userId, traceId }), 15_000);
      return NextResponse.json({ ok: true, traceId, team }, { status: 201 });
    }
    if (slug.length === 1 && slug[0] === "members") {
      const member = await withStep("rbac.POST", traceId, "upsert member", () => rbacService.addMember({ ...body, actorId: session.userId, traceId }), 15_000);
      return NextResponse.json({ ok: true, traceId, member }, { status: 201 });
    }
    return NextResponse.json({ ok: false, traceId, error: "Backend route not found." }, { status: 404 });
  } catch (error) {
    return errorResponse("rbac.POST", traceId, error, statusFor(error));
  }
}

function statusFor(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  if (/required|invalid|permission/i.test(message)) return 400;
  return 500;
}
