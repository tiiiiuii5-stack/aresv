import { createHash, randomUUID } from "node:crypto";

import { NextRequest } from "next/server";

import { createTrace } from "@/lib/diagnostics";
import { recordProductFunnelEvent } from "@/lib/analytics/product-funnel-store";
import { tryDatabase } from "@/lib/prisma";
import { enforceRateLimit, jsonResponse, readJsonBody, secureErrorResponse } from "@/lib/security/backendSecurity";
import { sanitizeMetadata } from "@/lib/services/platformSupport";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const productEventRateLimit = { name: "product-events", limit: 120, windowMs: 60_000 };

const allowedEvents = new Set([
  "preview_started",
  "preview_completed",
  "checkout_started",
  "report_generated",
  "report_opened",
  "free_review.view",
  "free_review.scan_started",
  "free_review.scan_completed",
  "free_review.scan_failed",
  "free_review.upgrade_shown",
  "free_review.feedback_submitted",
  "free_review.paid_cta_clicked",
  "appraisal_intake.view",
  "appraisal_intake.preview_started",
  "appraisal_intake.preview_completed",
  "appraisal_intake.preview_failed",
  "appraisal_intake.checkout_started",
  "appraisal_intake.checkout_clicked",
  "appraisal_intake.checkout_failed",
  "appraisal_intake.certificate_started",
  "appraisal_intake.certificate_completed",
  "appraisal_intake.certificate_failed",
]);

type ProductEventBody = {
  event?: unknown;
  source?: unknown;
  framework?: unknown;
  riskLevel?: unknown;
  severity?: unknown;
  counts?: unknown;
  metadata?: unknown;
  repositoryUrl?: unknown;
};

export async function POST(request: NextRequest) {
  const traceId = createTrace("product-events.POST");
  try {
    await compileTrust(request, { mode: "publicNonPersistent", reason: "anonymous product funnel telemetry" });
    const rateLimit = await enforceRateLimit(request, productEventRateLimit);
    const body = await readJsonBody<ProductEventBody>(request, { maxBytes: 8_000 });
    const eventType = cleanIdentifier(body.event, 80);
    if (!allowedEvents.has(eventType)) {
      return jsonResponse({ ok: false, traceId, error: "Unsupported product event." }, { status: 400, headers: rateLimit.headers });
    }

    const metadata = metadataForEvent(body, request);
    const framework = cleanOptionalIdentifier(body.framework, 40);
    const riskLevel = cleanOptionalIdentifier(body.riskLevel, 40);
    const severity = cleanOptionalIdentifier(body.severity, 40);
    const stored = await tryDatabase(async (db) => {
      await db.$executeRawUnsafe(
        `INSERT INTO "app_telemetry_events" ("id", "projectId", "snapshotId", "analysisResultId", "eventType", "dataset", "framework", "riskLevel", "severity", "counts", "metadata")
         VALUES ($1, NULL, NULL, NULL, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
        randomUUID(),
        eventType,
        "product_funnel",
        framework,
        riskLevel,
        severity,
        JSON.stringify(countsForEvent(body.counts)),
        JSON.stringify(metadata),
      );
      return true;
    });
    const kvStored = await recordProductFunnelEvent({
      eventType,
      source: String(metadata.source || "unknown"),
      framework,
      riskLevel,
      hasRepositoryUrl: Boolean(metadata.hasRepositoryUrl),
      metadata,
    }).catch(() => false);

    console.log(JSON.stringify({
      level: "info",
      source: "ventureos",
      action: "product_funnel.event",
      eventType,
      stored: Boolean(stored),
      kvStored: Boolean(kvStored),
      sourcePage: metadata.source,
      hasRepositoryUrl: Boolean(metadata.hasRepositoryUrl),
      framework,
      riskLevel,
      timestamp: new Date().toISOString(),
    }));

    return jsonResponse({ ok: true, traceId, stored: Boolean(stored || kvStored), dbStored: Boolean(stored), kvStored: Boolean(kvStored) }, { headers: rateLimit.headers });
  } catch (error) {
    return secureErrorResponse("product-events.POST", traceId, error, { fallbackStatus: 400 });
  }
}

function metadataForEvent(body: ProductEventBody, request: NextRequest) {
  const metadata = sanitizeMetadata(body.metadata || {});
  const repositoryUrl = String(body.repositoryUrl || "").trim();
  if (repositoryUrl) {
    metadata.repositoryHash = hashValue(repositoryUrl);
    metadata.hasRepositoryUrl = true;
  }
  metadata.source = cleanIdentifier(body.source, 60) || "unknown";
  metadata.userAgentHash = hashValue(request.headers.get("user-agent") || "");
  metadata.rawSourceStored = false;
  return metadata;
}

function countsForEvent(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, number | boolean> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const cleanKey = cleanIdentifier(key, 40);
    if (!cleanKey) continue;
    if (typeof item === "boolean") output[cleanKey] = item;
    else {
      const number = Number(item);
      if (Number.isFinite(number)) output[cleanKey] = Math.round(number);
    }
  }
  return output;
}

function cleanIdentifier(value: unknown, maxLength: number) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, maxLength);
}

function cleanOptionalIdentifier(value: unknown, maxLength: number) {
  const clean = cleanIdentifier(value, maxLength);
  return clean || null;
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}
