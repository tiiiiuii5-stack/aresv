import { NextRequest, NextResponse } from "next/server";

import { createTrace, traceError } from "@/lib/diagnostics";
import { verifyEvidencePacket, verifyStoredEventObject } from "@/lib/evidence/evidenceEvents";
import { SecurityError } from "@/lib/security/errors";
import { readJsonBody } from "@/lib/security/sanitize";
import { compileTrust, stripClientIdentity } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VerifyRequest = {
  packet?: unknown;
  event?: unknown;
  receipt?: unknown;
  canonicalEvent?: unknown;
};

export async function POST(request: NextRequest) {
  const traceId = createTrace("verify.POST");
  try {
    await compileTrust(request, { mode: "publicNonPersistent", reason: "offline evidence object verification" });
    const body = stripClientIdentity(await readJsonBody<VerifyRequest>(request, { maxBytes: 2_000_000 }));

    if (body.packet) {
      const verification = verifyEvidencePacket(body.packet);
      return NextResponse.json({ ok: true, traceId, type: "audit_packet", verification }, { status: verification.ok ? 200 : 422 });
    }

    const event = body.event || {
      canonicalEvent: body.canonicalEvent,
      receipt: body.receipt,
    };
    const verification = verifyStoredEventObject(event);
    if (!verification.eventId) {
      return NextResponse.json({ ok: false, traceId, error: "packet or evidence event/receipt is required." }, { status: 400 });
    }

    return NextResponse.json({ ok: true, traceId, type: "evidence_event", verification }, { status: verification.ok ? 200 : 422 });
  } catch (error) {
    traceError("verify.POST", "evidence object verification failed", error, { traceId });
    const status = error instanceof SecurityError ? error.status : 500;
    return NextResponse.json(
      {
        ok: false,
        traceId,
        error: status >= 500 ? "Failed to verify submitted evidence object." : error instanceof Error ? error.message : String(error),
      },
      { status },
    );
  }
}
