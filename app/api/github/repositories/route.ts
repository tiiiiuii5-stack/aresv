import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse } from "@/lib/diagnostics";
import {
  listConnectedGitHubRepositories,
  listGitHubInstallations,
  listInstallableGitHubRepositories,
} from "@/lib/github/repositories";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const traceId = createTrace("github.repositories.GET");
  try {
    const { session } = await compileTrust(request, { mode: "session" });
    const installationId = request.nextUrl.searchParams.get("installationId");
    const [installations, connected] = await Promise.all([
      listGitHubInstallations(session.userId),
      listConnectedGitHubRepositories(session.userId),
    ]);
    const available = installationId ? await listInstallableGitHubRepositories(session.userId, installationId) : [];
    return NextResponse.json({ ok: true, traceId, installations, connected, available });
  } catch (error) {
    return errorResponse("github.repositories.GET", traceId, error, statusForGitHubRoute(error));
  }
}

function statusForGitHubRoute(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  if (/not found/i.test(message)) return 404;
  if (/required|permissions/i.test(message)) return 400;
  return 500;
}
