import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse } from "@/lib/diagnostics";
import { exchangeGitHubOAuthCode, verifyGitHubOAuthState } from "@/lib/github/auth";
import { githubClient } from "@/lib/github/client";
import { recordGitHubInstallation } from "@/lib/github/repositories";
import { auditLogService } from "@/lib/services/auditLog";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "ventureos_github_state";

export async function GET(request: NextRequest) {
  const traceId = createTrace("github.callback.GET");
  try {
    const { session } = await compileTrust(request, { mode: "session" });
    const state = request.nextUrl.searchParams.get("state") || "";
    const cookieState = request.cookies.get(STATE_COOKIE)?.value || "";
    if (!state || state !== cookieState) throw new Error("Invalid GitHub OAuth state.");
    const statePayload = verifyGitHubOAuthState(state, session.userId);

    const installationId = request.nextUrl.searchParams.get("installation_id");
    const code = request.nextUrl.searchParams.get("code");
    const oauth = code ? await exchangeGitHubOAuthCode(code) : null;

    if (installationId) {
      const installation = await githubClient.getInstallation(installationId);
      const row = await recordGitHubInstallation({ session, installation, oauth });
      await auditLogService.record({
        actorId: session.userId,
        projectId: statePayload.projectId || null,
        action: "github.installation.connected",
        resource: "github_installation",
        resourceId: row?.id || installationId,
        traceId,
        metadata: {
          installationId,
          accountLogin: installation.account.login,
          repositorySelection: installation.repository_selection,
        },
      }).catch(() => undefined);
    } else if (!oauth) {
      throw new Error("GitHub callback did not include an installation or OAuth code.");
    }

    const response = NextResponse.redirect(new URL(statePayload.returnTo || "/projects", request.nextUrl.origin));
    response.cookies.set(STATE_COOKIE, "", { maxAge: 0, path: "/api/github" });
    return response;
  } catch (error) {
    return errorResponse("github.callback.GET", traceId, error, statusForGitHubRoute(error));
  }
}

function statusForGitHubRoute(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  if (/not found/i.test(message)) return 404;
  if (/required|invalid|expired|callback/i.test(message)) return 400;
  return 500;
}
