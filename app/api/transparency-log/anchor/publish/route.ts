import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse, withStep } from "@/lib/diagnostics";
import { publishExternalAnchor, type ExternalAnchorTarget } from "@/lib/transparency/externalAnchorPublisher";
import { buildPublicAnchorManifest } from "@/lib/transparency/transparencyLog";
import { compileTrust, readCompiledJson } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedTargets = new Set<ExternalAnchorTarget>(["github_commit", "external_witness", "sigstore_rekor", "timestamp_authority", "blockchain_anchor"]);

export async function POST(request: NextRequest) {
  const traceId = createTrace("transparency-log.anchor.publish.POST");
  try {
    await compileTrust(request, { mode: "admin" });
    const body = await readCompiledJson(request);
    const certificateId = String(body.certificateId || body.certificate_id || "").trim();
    const limit = Number(body.limit || "");
    const targets = targetList(body.targets);

    const manifest = await withStep("transparency-log.anchor.publish.POST", traceId, "build public anchor manifest", () =>
      buildPublicAnchorManifest({ certificateId, limit, baseUrl: request.nextUrl.origin }), 10_000);
    const publication = await withStep("transparency-log.anchor.publish.POST", traceId, "publish external anchor", () =>
      publishExternalAnchor({ manifest, targets }), 20_000);

    return NextResponse.json({
      ok: true,
      traceId,
      manifest,
      publication,
    });
  } catch (error) {
    return errorResponse("transparency-log.anchor.publish.POST", traceId, error, statusForPublishError(error));
  }
}

function targetList(value: unknown): ExternalAnchorTarget[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => String(item || "").trim())
    .filter((item): item is ExternalAnchorTarget => allowedTargets.has(item as ExternalAnchorTarget));
}

function statusForPublishError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  if (/required|invalid/i.test(message)) return 400;
  return 500;
}
