import { NextRequest, NextResponse } from "next/server";

import { createTrace, traceError } from "@/lib/diagnostics";
import { recordEvidenceEvent } from "@/lib/evidence/evidenceEvents";
import { SecurityError } from "@/lib/security/errors";
import { readJsonBody } from "@/lib/security/sanitize";
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

type EvidenceEventRequest = {
  projectId?: unknown;
  project_id?: unknown;
  eventType?: unknown;
  source?: unknown;
  subject?: unknown;
  result?: unknown;
  artifacts?: unknown;
  controls?: unknown;
  metadata?: unknown;
  idempotencyKey?: unknown;
};

export async function POST(request: NextRequest) {
  const traceId = createTrace("evidence.events.POST");
  let metering: MonetizationContext | null = null;

  try {
    const trust = await compileTrust(request, { mode: "apiKey", endpoint: "/api/evidence/events", scope: "evidence:write" });
    metering = trust.metering || null;
    if (!metering) throw new Error("TRUST_POLICY_INVALID");

    const body = stripClientIdentity(await readJsonBody<EvidenceEventRequest>(request, { maxBytes: 64_000 }));
    const projectId = await resolveWorkspaceProjectIdForUser(body.projectId || body.project_id, metering.userId);
    delete body.project_id;

    const result = await recordEvidenceEvent({
      body,
      metering,
      projectId,
      userAgent: request.headers.get("user-agent"),
    });

    await intelligenceMonetizationService.recordUsage({
      context: metering,
      method: request.method,
      statusCode: result.duplicate ? 200 : 201,
      metadata: {
        eventId: result.stored.receipt.eventId,
        eventType: result.stored.canonicalEvent.eventType,
        duplicate: result.duplicate,
        projectLinked: Boolean(projectId),
      },
    });

    return NextResponse.json(
      {
        ok: true,
        traceId,
        duplicate: result.duplicate,
        event: {
          id: result.stored.receipt.eventId,
          hash: result.stored.receipt.eventHash,
          type: result.stored.canonicalEvent.eventType,
          status: result.stored.canonicalEvent.result.status,
          storedAt: result.stored.createdAt,
        },
        receipt: result.stored.receipt,
        controlMappings: result.stored.controlMappings,
      },
      { status: result.duplicate ? 200 : 201, headers: apiUsageHeaders(metering) },
    );
  } catch (error) {
    traceError("evidence.events.POST", "evidence ingestion failed", error, { traceId });
    const status = statusFor(error);
    if (metering) {
      await intelligenceMonetizationService
        .recordUsage({
          context: metering,
          method: request.method,
          statusCode: status,
          metadata: { error: error instanceof Error ? error.message : String(error) },
        })
        .catch((usageError) => traceError("evidence.events.POST", "usage logging failed", usageError, { traceId }));
    }

    return NextResponse.json(
      {
        ok: false,
        traceId,
        error: publicMessage(error),
        code: errorCode(error),
        details: error instanceof MonetizationError ? error.details : undefined,
      },
      { status, headers: metering ? apiUsageHeaders(metering) : undefined },
    );
  }
}

function statusFor(error: unknown) {
  if (error instanceof MonetizationError) return error.status;
  if (error instanceof SecurityError) return error.status;
  const message = error instanceof Error ? error.message : String(error);
  if (message === "PROJECT_NOT_FOUND") return 404;
  if (/FORBIDDEN/.test(message)) return 403;
  if (message === "EVIDENCE_DEDUP_CONFLICT") return 409;
  if (
    /EVIDENCE_|UNKNOWN_FIELD|HASH_COMMITMENT_INVALID|projectId|eventType|source|artifact|digest|required|invalid|json|Content-Type/i.test(message)
  ) {
    return 400;
  }
  return 500;
}

function errorCode(error: unknown) {
  if (error instanceof SecurityError) return error.code;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(":") ? message.split(":")[0] : message;
}

function publicMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "EVIDENCE_SIGNING_KEY_REQUIRED" || message === "CERTIFICATE_SIGNING_KEY_REQUIRED") {
    return "Evidence signing is not configured.";
  }
  if (statusFor(error) >= 500) return "Failed to ingest evidence event.";
  return message;
}
