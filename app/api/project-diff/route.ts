import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse, withStep } from "@/lib/diagnostics";
import { compareHistoricalScans } from "@/lib/evolution/diffEngine";
import { loadProjectScanSnapshots } from "@/lib/evolution/projectHistory";
import { verifyRecommendedFixes } from "@/lib/evolution/verificationEngine";
import { resolveWorkspaceProjectIdForUser } from "@/lib/services/projectWorkspace";
import { compileTrust, readCompiledJson } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const traceId = createTrace("project-diff.POST");
  try {
    const { session } = await compileTrust(request, { mode: "session" });
    const body = await readCompiledJson(request);
    const requestedProjectId = String(body.projectId || "").trim();
    if (!requestedProjectId) {
      return NextResponse.json({ ok: false, traceId, error: "projectId is required." }, { status: 400 });
    }

    const projectId = await withStep("project-diff.POST", traceId, "verify project ownership", () =>
      resolveWorkspaceProjectIdForUser(requestedProjectId, session.userId), 10_000);
    if (!projectId) {
      return NextResponse.json({ ok: false, traceId, error: "Project not found." }, { status: 404 });
    }

    const snapshots = await withStep("project-diff.POST", traceId, "load project scan snapshots", () => loadProjectScanSnapshots(projectId, 24), 10_000);
    const diff = compareHistoricalScans({ projectId, snapshots });
    const verification = verifyRecommendedFixes({
      previousScan: diff.previousScan,
      currentScan: diff.currentScan,
    });

    return NextResponse.json({
      ok: true,
      traceId,
      projectId,
      currentReadiness: diff.currentReadiness,
      previousReadiness: diff.previousReadiness,
      delta: diff.delta,
      issuesFixed: diff.issuesFixed,
      issuesIntroduced: diff.issuesIntroduced,
      issuesUnchanged: diff.issuesUnchanged,
      recurringIssues: diff.recurringIssues,
      severityChanges: diff.severityChanges,
      verifiedFixes: verification.verifiedFixes,
      partialFixes: verification.partialFixes,
      failedFixes: verification.failedFixes,
      trend: diff.trend,
      confidence: diff.confidence,
      readinessImpact: diff.readinessImpact,
      improvementMetrics: diff.improvementMetrics,
      topContributingFindings: diff.topContributingFindings,
      historySnapshots: diff.historySnapshots,
      telemetry: {
        persisted: false,
        dataset: "historical_scan_diff",
        mode: "read-only",
      },
    });
  } catch (error) {
    return errorResponse("project-diff.POST", traceId, error, statusForProjectDiffError(error));
  }
}

function statusForProjectDiffError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  if (message === "PROJECT_NOT_FOUND") return 404;
  if (/projectId|required/i.test(message)) return 400;
  return 500;
}
