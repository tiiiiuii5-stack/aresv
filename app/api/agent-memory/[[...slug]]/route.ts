import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse, trace, withStep } from "@/lib/diagnostics";
import { agentMemoryService, type MemoryInput } from "@/lib/services/agentMemory";
import { resolveWorkspaceProjectIdForUser } from "@/lib/services/projectWorkspace";
import { compileTrust, readCompiledJson } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ slug?: string[] }>;
};

export async function POST(request: NextRequest, context: Context) {
  const traceId = createTrace("agent-memory.POST");
  try {
    const { session } = await compileTrust(request, { mode: "session" });
    const slug = (await context.params).slug || [];
    const action = slug[0] || "";
    const body = await readCompiledJson(request);
    const projectId = await resolveWorkspaceProjectIdForUser(body?.projectId, session.userId);
    trace("agent-memory.POST", "payload parsed", { traceId, action, userId: session.userId, projectId });

    if (slug.length === 1 && action === "store") {
      const memory = await withStep(
        "agent-memory.POST",
        traceId,
        "store memory",
        () =>
          agentMemoryService.store(
            {
              userId: session.userId,
              projectId,
              memoryType: String(body?.memoryType || "") as MemoryInput["memoryType"],
              content: String(body?.content || ""),
              metadata: asJsonObject(body?.metadata),
            },
            traceId,
          ),
        20_000,
      );
      return NextResponse.json({ ok: true, traceId, memory }, { status: 201 });
    }

    if (slug.length === 1 && action === "recall") {
      const memories = await withStep(
        "agent-memory.POST",
        traceId,
        "recall memories",
        () =>
          agentMemoryService.recall(
            session.userId,
            String(body?.query || ""),
            {
              projectId,
              limit: body?.limit ? Number(body.limit) : 5,
              threshold: body?.threshold ? Number(body.threshold) : undefined,
            },
            traceId,
          ),
        20_000,
      );
      return NextResponse.json({ ok: true, traceId, memories });
    }

    return NextResponse.json({ ok: false, traceId, error: "Backend route not found." }, { status: 404 });
  } catch (error) {
    return errorResponse("agent-memory.POST", traceId, error, statusFor(error));
  }
}

export async function GET(_request: NextRequest, context: Context) {
  const traceId = createTrace("agent-memory.GET");
  try {
    const { session } = await compileTrust(_request, { mode: "session" });
    const slug = (await context.params).slug || [];
    trace("agent-memory.GET", "route parsed", { traceId, slug: slug.join("/") });

    if (slug.length === 2 && slug[1] === "patterns") {
      assertMemoryPathUser(slug[0], session.userId);
      const patterns = await withStep("agent-memory.GET", traceId, "list patterns", () => agentMemoryService.getPatterns(session.userId, traceId), 15_000);
      return NextResponse.json({ ok: true, traceId, patterns });
    }

    if (slug.length === 2 && slug[1] === "decisions") {
      assertMemoryPathUser(slug[0], session.userId);
      const decisions = await withStep("agent-memory.GET", traceId, "list decisions", () => agentMemoryService.getDecisions(session.userId, traceId), 15_000);
      return NextResponse.json({ ok: true, traceId, decisions });
    }

    return NextResponse.json({ ok: false, traceId, error: "Backend route not found." }, { status: 404 });
  } catch (error) {
    return errorResponse("agent-memory.GET", traceId, error, statusFor(error));
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  const traceId = createTrace("agent-memory.DELETE");
  try {
    const { session } = await compileTrust(_request, { mode: "session" });
    const slug = (await context.params).slug || [];
    if (slug.length !== 1) {
      return NextResponse.json({ ok: false, traceId, error: "Backend route not found." }, { status: 404 });
    }
    const archived = await withStep("agent-memory.DELETE", traceId, "archive memory", () => agentMemoryService.softDelete(slug[0], session.userId, traceId), 15_000);
    return NextResponse.json({ ok: true, traceId, archived });
  } catch (error) {
    return errorResponse("agent-memory.DELETE", traceId, error, statusFor(error));
  }
}

function statusFor(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  if (message === "PROJECT_NOT_FOUND") return 404;
  if (/required|invalid/i.test(message)) return 400;
  return 500;
}

function assertMemoryPathUser(pathUserId: string, sessionUserId: string) {
  if (pathUserId && pathUserId !== "me" && pathUserId !== sessionUserId) {
    throw new Error("FORBIDDEN - NOT MEMORY OWNER");
  }
}

function asJsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
