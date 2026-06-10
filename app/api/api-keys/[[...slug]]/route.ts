import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse, trace, withStep } from "@/lib/diagnostics";
import { apiKeyService } from "@/lib/services/apiKeys";
import { compileTrust, readCompiledJson } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug?: string[] }> };

export async function GET(request: NextRequest, context: Context) {
  const traceId = createTrace("api-keys.GET");
  try {
    const { session } = await compileTrust(request, { mode: "session" });
    const slug = (await context.params).slug || [];
    if (slug.length === 0) {
      const keys = await withStep("api-keys.GET", traceId, "list api keys", () => apiKeyService.list(session.userId), 15_000);
      return NextResponse.json({ ok: true, traceId, keys });
    }
    return NextResponse.json({ ok: false, traceId, error: "Backend route not found." }, { status: 404 });
  } catch (error) {
    return errorResponse("api-keys.GET", traceId, error, statusForApiKeyError(error));
  }
}

export async function POST(request: NextRequest, context: Context) {
    const traceId = createTrace("api-keys.POST");
  try {
    const { session } = await compileTrust(request, { mode: "session" });
    const slug = (await context.params).slug || [];
    const body = await readCompiledJson(request);
    trace("api-keys.POST", "payload parsed", { traceId, action: slug.join("/"), userId: session.userId, teamId: session.orgId, name: body?.name });
    if (slug.length === 0) {
      const result = await withStep("api-keys.POST", traceId, "create api key", () =>
        apiKeyService.create({
          userId: session.userId,
          teamId: session.orgId,
          name: String(body?.name || ""),
          scopes: Array.isArray(body?.scopes) ? body.scopes.map(String) : undefined,
          expiresAt: typeof body?.expiresAt === "string" ? body.expiresAt : null,
          traceId,
        }), 15_000);
      return NextResponse.json({ ok: true, traceId, ...result }, { status: 201 });
    }
    if (slug.length === 1 && slug[0] === "verify") {
      const result = await withStep("api-keys.POST", traceId, "verify api key", () =>
        apiKeyService.verify(String(body?.token || ""), body?.scope ? String(body.scope) : undefined, session.userId), 15_000);
      return NextResponse.json({ ok: true, traceId, ...result });
    }
    return NextResponse.json({ ok: false, traceId, error: "Backend route not found." }, { status: 404 });
  } catch (error) {
    return errorResponse("api-keys.POST", traceId, error, statusForApiKeyError(error));
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const traceId = createTrace("api-keys.DELETE");
  try {
    const { session } = await compileTrust(request, { mode: "session" });
    const slug = (await context.params).slug || [];
    if (slug.length !== 1) return NextResponse.json({ ok: false, traceId, error: "Backend route not found." }, { status: 404 });
    const revoked = await withStep("api-keys.DELETE", traceId, "revoke api key", () => apiKeyService.revoke(slug[0], session.userId, traceId), 15_000);
    return NextResponse.json({ ok: true, traceId, revoked });
  } catch (error) {
    return errorResponse("api-keys.DELETE", traceId, error, statusForApiKeyError(error));
  }
}

function statusForApiKeyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  if (message === "API_KEY_NOT_FOUND") return 404;
  if (/required/i.test(message)) return 400;
  return 500;
}
