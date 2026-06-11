import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";

import { createTrace } from "@/lib/diagnostics";
import {
  cleanProductFunnelIdentifier,
  isProductFunnelBotRequest,
  productFunnelMetadataForRequest,
  recordRequestProductFunnelEvent,
} from "@/lib/analytics/product-funnel-request";
import { tryDatabase } from "@/lib/prisma";
import { enforceRateLimit, jsonResponse, readJsonBody, secureErrorResponse } from "@/lib/security/backendSecurity";
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
  "free_review.share_clicked",
  "free_review.feedback_submitted",
  "free_review.paid_cta_clicked",
  "waitlist.joined",
  "homepage.view",
  "homepage.free_review_clicked",
  "homepage.sample_clicked",
  "homepage.pricing_clicked",
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

    const metadata = productFunnelMetadataForRequest(request, {
      eventType,
      source: cleanIdentifier(body.source, 60) || "unknown",
      repositoryUrl: String(body.repositoryUrl || "").trim(),
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata as Record<string, unknown> : {},
    });
    metadata.synthetic = Boolean(metadata.synthetic || isSyntheticEvent(metadata.source, body.counts, body.metadata));
    const bot = isProductFunnelBotRequest(request);
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
    const kvStored = await recordRequestProductFunnelEvent(request, {
      eventType,
      source: String(metadata.source || "unknown"),
      framework,
      riskLevel,
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
      bot,
      framework,
      riskLevel,
      timestamp: new Date().toISOString(),
    }));

    return jsonResponse({ ok: true, traceId, stored: Boolean(stored || kvStored), dbStored: Boolean(stored), kvStored: Boolean(kvStored) }, { headers: rateLimit.headers });
  } catch (error) {
    return secureErrorResponse("product-events.POST", traceId, error, { fallbackStatus: 400 });
  }
}

function isSyntheticEvent(source: unknown, counts: unknown, metadata: unknown) {
  const sourceText = String(source || "").toLowerCase();
  if (/(^|[_.:-])(test|contract|synthetic|qa|smoke)([_.:-]|$)/.test(sourceText)) return true;
  return Boolean(flagValue(counts, "contractTest") || flagValue(counts, "synthetic") || flagValue(metadata, "synthetic"));
}

function flagValue(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Boolean((value as Record<string, unknown>)[key]);
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
  return cleanProductFunnelIdentifier(value, maxLength);
}

function cleanOptionalIdentifier(value: unknown, maxLength: number) {
  const clean = cleanIdentifier(value, maxLength);
  return clean || null;
}
