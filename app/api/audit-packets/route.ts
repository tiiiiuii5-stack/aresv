import { NextRequest, NextResponse } from "next/server";

import { createTrace, traceError, withStep } from "@/lib/diagnostics";
import { buildAuditPacket, loadEvidenceEventsForPacket } from "@/lib/evidence/evidenceEvents";
import { SecurityError } from "@/lib/security/errors";
import { readJsonBody } from "@/lib/security/sanitize";
import { enforceRateLimit, mergeHeaders, RATE_LIMITS, type RateLimitResult } from "@/lib/security/backendSecurity";
import {
  apiUsageHeaders,
  intelligenceMonetizationService,
  MonetizationError,
  type MonetizationContext,
} from "@/lib/services/intelligenceMonetization";
import { resolveWorkspaceProjectIdForUser } from "@/lib/services/projectWorkspace";
import { compileTrust, stripClientIdentity } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AuditPacketRequest = {
  projectId?: unknown;
  project_id?: unknown;
  repository?: unknown;
  since?: unknown;
  until?: unknown;
  limit?: unknown;
};

export async function POST(request: NextRequest) {
  const traceId = createTrace("audit-packets.POST");
  let metering: MonetizationContext | null = null;
  let rateLimit: RateLimitResult | null = null;

  try {
    rateLimit = await enforceRateLimit(request, RATE_LIMITS.auditPackets);
    const trust = await compileTrust(request, { mode: "apiKey", endpoint: "/api/audit-packets", scope: "evidence:read" });
    metering = trust.metering || null;
    if (!metering) throw new Error("TRUST_POLICY_INVALID");
    const currentMetering = metering;

    const body = stripClientIdentity(await readJsonBody<AuditPacketRequest>(request, { maxBytes: 16_000 }));
    const projectId = await resolveWorkspaceProjectIdForUser(body.projectId || body.project_id, currentMetering.userId);
    const repository = cleanRepository(body.repository);
    const since = cleanDate(body.since);
    const until = cleanDate(body.until);
    const limit = cleanLimit(body.limit);

    const events = await withStep("audit-packets.POST", traceId, "load evidence events", () =>
      loadEvidenceEventsForPacket({
        userId: currentMetering.userId,
        projectId,
        repository,
        since,
        until,
        limit,
      }), 10_000);

    const packet = buildAuditPacket({
      events,
      generatedBy: currentMetering.userId,
      projectId,
      repository,
      periodStart: since,
      periodEnd: until,
    });

    await intelligenceMonetizationService.recordUsage({
      context: currentMetering,
      method: request.method,
      statusCode: 200,
      metadata: {
        packetHash: packet.verification.packetHash,
        evidenceEventCount: packet.summary.evidenceEventCount,
        projectLinked: Boolean(projectId),
      },
    });

    return NextResponse.json({ ok: true, traceId, packet }, { status: 200, headers: mergeHeaders(apiUsageHeaders(currentMetering), rateLimit.headers) });
  } catch (error) {
    traceError("audit-packets.POST", "audit packet generation failed", error, { traceId });
    const status = statusFor(error);
    if (metering) {
      await intelligenceMonetizationService
        .recordUsage({
          context: metering,
          method: request.method,
          statusCode: status,
          metadata: { error: error instanceof Error ? error.message : String(error) },
        })
        .catch((usageError) => traceError("audit-packets.POST", "usage logging failed", usageError, { traceId }));
    }
    return NextResponse.json(
      {
        ok: false,
        traceId,
        error: publicMessage(error),
        details: error instanceof MonetizationError ? error.details : undefined,
      },
      { status, headers: mergeHeaders(metering ? apiUsageHeaders(metering) : undefined, rateLimit?.headers) },
    );
  }
}

function cleanRepository(value: unknown) {
  const raw = String(value || "").trim().replace(/^https:\/\/github\.com\//i, "").replace(/\.git$/i, "");
  if (!raw) return null;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(raw)) throw new Error("repository must be owner/repo.");
  return raw.toLowerCase();
}

function cleanDate(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error("since/until must be valid ISO dates.");
  return date.toISOString();
}

function cleanLimit(value: unknown) {
  const parsed = Number(value || 100);
  if (!Number.isFinite(parsed)) return 100;
  return Math.max(1, Math.min(500, Math.round(parsed)));
}

function statusFor(error: unknown) {
  if (error instanceof MonetizationError) return error.status;
  if (error instanceof SecurityError) return error.status;
  const message = error instanceof Error ? error.message : String(error);
  if (message === "PROJECT_NOT_FOUND") return 404;
  if (/FORBIDDEN/.test(message)) return 403;
  if (/repository|since|until|date|json|Content-Type/i.test(message)) return 400;
  return 500;
}

function publicMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return statusFor(error) >= 500 ? "Failed to generate audit packet." : message;
}
