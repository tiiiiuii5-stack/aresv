import { NextRequest, NextResponse } from "next/server";

import { buildBadgeSvg } from "@/lib/appraisal/badge";
import { loadPublicSoftwareAppraisal } from "@/lib/appraisal/appraisalEngine";
import { createTrace, errorResponse, withStep } from "@/lib/diagnostics";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const traceId = createTrace("appraisals.badge.GET");
  try {
    await compileTrust(request, { mode: "publicRead", reason: "public appraisal badge" });
    const { id } = await context.params;
    const appraisal = await withStep("appraisals.badge.GET", traceId, "load public software appraisal", () =>
      loadPublicSoftwareAppraisal(decodeURIComponent(id || "")), 10_000);

    if (!appraisal) {
      return new NextResponse("Appraisal not found.", { status: 404 });
    }

    const svg = buildBadgeSvg({
      appName: appraisal.appName,
      grade: appraisal.grade,
      verdict: appraisal.launchVerdict,
      state: appraisal.badgeState,
      score: appraisal.readinessScore,
    });

    return new NextResponse(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse("appraisals.badge.GET", traceId, error, 500);
  }
}

