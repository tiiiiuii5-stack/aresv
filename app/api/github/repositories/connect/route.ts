import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse } from "@/lib/diagnostics";
import { connectGitHubRepository } from "@/lib/github/repositories";
import { compileTrust, readCompiledJson } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const traceId = createTrace("github.repositories.connect.POST");
  try {
    const { session } = await compileTrust(request, { mode: "session" });
    const body = await readCompiledJson(request);
    const installationId = String(body.installationId || "").trim();
    if (!installationId) return NextResponse.json({ ok: false, traceId, error: "installationId is required." }, { status: 400 });
    const result = await connectGitHubRepository({
      session,
      projectId: typeof body.projectId === "string" ? body.projectId : null,
      installationId,
      repositoryFullName: typeof body.repositoryFullName === "string" ? body.repositoryFullName : null,
      githubRepositoryId: typeof body.githubRepositoryId === "string" ? body.githubRepositoryId : null,
      autoScan: body.autoScan !== false,
    });
    return NextResponse.json({ ok: true, traceId, ...result }, { status: 201 });
  } catch (error) {
    return errorResponse("github.repositories.connect.POST", traceId, error, statusForGitHubRoute(error));
  }
}

function statusForGitHubRoute(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  if (/not found|PROJECT_NOT_FOUND/i.test(message)) return 404;
  if (/required|permissions|available/i.test(message)) return 400;
  if (/REDIS_URL/.test(message)) return 503;
  return 500;
}
