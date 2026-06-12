import { NextRequest, NextResponse } from "next/server";

import { cleanProductFunnelIdentifier, recordRequestProductFunnelEvent } from "@/lib/analytics/product-funnel-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedRedirectEvents = new Set([
  "homepage.free_review_clicked",
  "homepage.sample_clicked",
  "homepage.pricing_clicked",
  "free_review.paid_cta_clicked",
  "appraisal_intake.checkout_clicked",
]);

const copiedParams = new Set(["repo", "framework", "offer", "sample", "campaign", "ref", "utm_source", "utm_campaign"]);
const sampleRepoUrl = "https://github.com/tiiiiuii5-stack/aresv.git";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const eventType = cleanProductFunnelIdentifier(url.searchParams.get("e"), 80);
  const source = cleanProductFunnelIdentifier(url.searchParams.get("source") || "tracked_redirect", 60);
  const framework = cleanProductFunnelIdentifier(url.searchParams.get("framework"), 40) || null;
  const destination = destinationFor(request, eventType);
  const repositoryUrl = String(url.searchParams.get("repo") || url.searchParams.get("repositoryUrl") || destination.searchParams.get("repo") || "").trim();

  if (allowedRedirectEvents.has(eventType)) {
    await recordRequestProductFunnelEvent(request, {
      eventType,
      source,
      framework,
      repositoryUrl,
      metadata: {
        surface: "tracked_redirect",
        redirectTo: destination.pathname,
      },
    }).catch(() => false);
  }

  return NextResponse.redirect(destination, { status: 302 });
}

function destinationFor(request: NextRequest, eventType: string) {
  const url = new URL(request.url);
  const rawTo = url.searchParams.get("to") || "/";
  const cleanTo = safeInternalPath(rawTo);
  const destination = new URL(cleanTo, url.origin);

  for (const key of copiedParams) {
    const value = url.searchParams.get(key);
    if (value && !destination.searchParams.has(key)) destination.searchParams.set(key, value);
  }
  if (
    eventType === "homepage.free_review_clicked" &&
    destination.pathname === "/free-review" &&
    !destination.searchParams.get("repo")
  ) {
    destination.searchParams.set("repo", sampleRepoUrl);
    destination.searchParams.set("framework", destination.searchParams.get("framework") || "nextjs");
    destination.searchParams.set("sample", "1");
  }

  return destination;
}

function safeInternalPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.startsWith("/api/")) return "/";
  return value.slice(0, 600);
}
