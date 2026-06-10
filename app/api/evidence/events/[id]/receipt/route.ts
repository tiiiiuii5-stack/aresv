import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse, withStep } from "@/lib/diagnostics";
import { loadEvidenceReceipt } from "@/lib/evidence/evidenceEvents";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const traceId = createTrace("evidence.events.id.receipt.GET");
  try {
    await compileTrust(request, { mode: "publicRead", reason: "public evidence receipt lookup" });
    const { id } = await context.params;
    const stored = await withStep("evidence.events.id.receipt.GET", traceId, "load evidence receipt", () =>
      loadEvidenceReceipt(decodeURIComponent(id || "")), 10_000);

    if (!stored) {
      return NextResponse.json({ ok: false, traceId, error: "Evidence receipt not found." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      traceId,
      event: {
        id: stored.receipt.eventId,
        type: stored.canonicalEvent.eventType,
        status: stored.canonicalEvent.result.status,
        storedAt: stored.createdAt,
      },
      receipt: stored.receipt,
      canonicalEvent: stored.canonicalEvent,
      controlMappings: stored.controlMappings,
    });
  } catch (error) {
    return errorResponse("evidence.events.id.receipt.GET", traceId, error, 500);
  }
}
