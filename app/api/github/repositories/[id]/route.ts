import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse } from "@/lib/diagnostics";
import { disconnectGitHubRepository } from "@/lib/github/repositories";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: NextRequest, context: Context) {
  const traceId = createTrace("github.repositories.id.DELETE");
  try {
    const { session } = await compileTrust(request, { mode: "session" });
    const { id } = await context.params;
    const repository = await disconnectGitHubRepository(session.userId, id);
    return NextResponse.json({ ok: true, traceId, repository });
  } catch (error) {
    return errorResponse("github.repositories.id.DELETE", traceId, error, statusForGitHubRoute(error));
  }
}

function statusForGitHubRoute(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  if (/not found/i.test(message)) return 404;
  return 500;
}
