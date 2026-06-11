import { createHash } from "node:crypto";

import type { NextRequest } from "next/server";

import { recordProductFunnelEvent } from "@/lib/analytics/product-funnel-store";
import { sanitizeMetadata } from "@/lib/services/platformSupport";

export type RequestProductFunnelEventInput = {
  eventType: string;
  source: string;
  framework?: string | null;
  riskLevel?: string | null;
  repositoryUrl?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordRequestProductFunnelEvent(
  request: NextRequest,
  input: RequestProductFunnelEventInput,
) {
  const metadata = productFunnelMetadataForRequest(request, input);
  return recordProductFunnelEvent({
    eventType: input.eventType,
    source: String(metadata.source || input.source || "unknown"),
    framework: cleanOptionalIdentifier(input.framework, 40),
    riskLevel: cleanOptionalIdentifier(input.riskLevel, 40),
    hasRepositoryUrl: Boolean(metadata.hasRepositoryUrl),
    visitorHash: visitorHashForProductFunnelRequest(request),
    bot: isProductFunnelBotRequest(request),
    metadata,
  });
}

export function productFunnelMetadataForRequest(
  request: NextRequest,
  input: RequestProductFunnelEventInput,
) {
  const metadata = sanitizeMetadata(input.metadata || {});
  const repositoryUrl = String(input.repositoryUrl || "").trim();
  if (repositoryUrl) {
    metadata.repositoryHash = hashValue(repositoryUrl);
    metadata.hasRepositoryUrl = true;
  }
  metadata.source = cleanIdentifier(input.source, 60) || "unknown";
  metadata.synthetic = isSyntheticEvent(metadata.source, metadata);
  metadata.bot = isProductFunnelBotRequest(request);
  metadata.userAgentHash = hashValue(request.headers.get("user-agent") || "");
  metadata.rawSourceStored = false;
  return metadata;
}

export function isProductFunnelBotRequest(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") || "";
  if (!userAgent.trim()) return true;
  return /bot|crawler|spider|scraper|curl|wget|python|node-fetch|httpclient|headlesschrome|playwright|lighthouse|uptimerobot|pingdom|vercel|synthetic|smoke|monitor/i.test(userAgent);
}

export function visitorHashForProductFunnelRequest(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") || "unknown";
  const forwardedFor = request.headers.get("x-forwarded-for") || "";
  const ip = forwardedFor.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-vercel-forwarded-for") ||
    "unknown";
  const salt = process.env.ANALYTICS_HASH_SALT || process.env.SESSION_SECRET || process.env.ADMIN_SESSION_SECRET || process.env.NEXTAUTH_SECRET || "ventureos-funnel-proof";
  return createHash("sha256").update(`${salt}:${ip}:${userAgent}`).digest("hex").slice(0, 32);
}

export function cleanProductFunnelIdentifier(value: unknown, maxLength: number) {
  return cleanIdentifier(value, maxLength);
}

function isSyntheticEvent(source: unknown, metadata: unknown) {
  const sourceText = String(source || "").toLowerCase();
  if (/(^|[_.:-])(test|contract|synthetic|qa|smoke)([_.:-]|$)/.test(sourceText)) return true;
  return Boolean(
    flagValue(metadata, "synthetic") ||
    flagValue(metadata, "syntheticEvent") ||
    flagValue(metadata, "contractTest") ||
    flagValue(metadata, "testEvent")
  );
}

function flagValue(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Boolean((value as Record<string, unknown>)[key]);
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
