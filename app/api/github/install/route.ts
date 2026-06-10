import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse } from "@/lib/diagnostics";
import { createGitHubOAuthState } from "@/lib/github/auth";
import { getGitHubAppConfig, isGitHubAppConfigured } from "@/lib/github/config";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/backendSecurity";
import { resolveWorkspaceProjectIdForUser } from "@/lib/services/projectWorkspace";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "ventureos_github_state";
const REQUIRED_VARIABLES = [
  "GITHUB_APP_ID",
  "GITHUB_APP_CLIENT_ID",
  "GITHUB_APP_CLIENT_SECRET",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_WEBHOOK_SECRET",
  "GITHUB_APP_SLUG",
] as const;

export async function GET(request: NextRequest) {
  const traceId = createTrace("github.install.GET");
  try {
    await enforceRateLimit(request, RATE_LIMITS.githubInstall);
    if (!isGitHubAppConfigured()) {
      const appUrl = new URL(request.url).origin.replace(/\/+$/, "");
      return NextResponse.json({
        ok: false,
        traceId,
        error: "GitHub App integration is not configured yet.",
        configured: false,
        missingVariables: REQUIRED_VARIABLES.filter((name) => !process.env[name]?.trim()),
        setup: {
          webhookUrl: `${appUrl}/api/github/webhook`,
          callbackUrl: `${appUrl}/api/github/callback`,
          requiredEvents: ["push", "pull_request", "installation"],
          requiredPermissions: {
            contents: "read",
            metadata: "read",
            pullRequests: "write",
            commitStatuses: "write",
          },
        },
      }, { status: 503 });
    }

    const { session } = await compileTrust(request, { mode: "session" });
    const config = getGitHubAppConfig();
    const projectIdParam = request.nextUrl.searchParams.get("projectId");
    const projectId = projectIdParam ? await resolveWorkspaceProjectIdForUser(projectIdParam, session.userId) : null;
    if (projectIdParam && !projectId) return NextResponse.json({ ok: false, traceId, error: "Project not found." }, { status: 404 });

    const mode = request.nextUrl.searchParams.get("mode") === "oauth" ? "oauth" : "install";
    const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
    const state = createGitHubOAuthState({
      userId: session.userId,
      projectId,
      returnTo,
      mode,
    });

    const redirectUrl = mode === "oauth"
      ? new URL(`${config.webBaseUrl}/login/oauth/authorize`)
      : new URL(`${config.webBaseUrl}/apps/${encodeURIComponent(config.appSlug)}/installations/new`);
    if (mode === "oauth") redirectUrl.searchParams.set("client_id", config.clientId);
    redirectUrl.searchParams.set("state", state);

    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 10 * 60,
      path: "/api/github",
    });
    return response;
  } catch (error) {
    return errorResponse("github.install.GET", traceId, error, statusForGitHubRoute(error));
  }
}

function safeReturnTo(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/projects";
}

function statusForGitHubRoute(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/rate|too many/i.test(message)) return 429;
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  if (/Project not found|PROJECT_NOT_FOUND/.test(message)) return 404;
  if (/required|invalid/i.test(message)) return 400;
  return 500;
}
