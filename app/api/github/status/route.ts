import { NextRequest, NextResponse } from "next/server";

import { createTrace } from "@/lib/diagnostics";
import { isGitHubAppConfigured } from "@/lib/github/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requiredVariables = [
  "GITHUB_APP_ID",
  "GITHUB_APP_CLIENT_ID",
  "GITHUB_APP_CLIENT_SECRET",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_WEBHOOK_SECRET",
  "GITHUB_APP_SLUG",
] as const;

export async function GET(request: NextRequest) {
  const traceId = createTrace("github.status.GET");
  const configuredVariables = requiredVariables.filter((name) => Boolean(process.env[name]?.trim()));
  const missingVariables = requiredVariables.filter((name) => !process.env[name]?.trim());
  const appUrl = new URL(request.url).origin.replace(/\/+$/, "");

  return NextResponse.json({
    ok: true,
    traceId,
    configured: isGitHubAppConfigured(),
    configuredCount: configuredVariables.length,
    requiredCount: requiredVariables.length,
    missingVariables,
    installUrl: `${appUrl}/api/github/install`,
    webhookUrl: `${appUrl}/api/github/webhook`,
    requiredEvents: ["push", "pull_request", "installation"],
  });
}
