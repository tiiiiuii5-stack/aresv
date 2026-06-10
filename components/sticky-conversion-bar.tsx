"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { buttonClassName } from "@/components/ui/button";

export function StickyConversionBar({
  eyebrow = "Software trust check",
  title = "Know what buyers will see before they ask.",
  primaryLabel = "Start Free Review",
  primaryHref = "/free-review",
  secondaryLabel = "View Sample",
  secondaryHref = "/sample-appraisal",
  source = "sticky_conversion",
}: {
  eyebrow?: string;
  title?: ReactNode;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  source?: string;
}) {
  return (
    <div className="print-hide fixed inset-x-0 bottom-0 z-50 border-t border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-surface))]/92 px-4 py-3 shadow-2xl shadow-black/25 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[rgb(var(--vos-verified))]">{eyebrow}</p>
          <p className="truncate text-sm font-black text-[rgb(var(--vos-text))]">{title}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <Link href={secondaryHref} onClick={() => void trackStickyClick(`${source}.secondary`)} className={buttonClassName({ variant: "outline", size: "sm", className: "min-h-11" })}>
            {secondaryLabel}
          </Link>
          <Link href={primaryHref} onClick={() => void trackStickyClick(`${source}.primary`)} className={buttonClassName({ size: "sm", className: "min-h-11" })}>
            {primaryLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}

async function trackStickyClick(event: string) {
  try {
    await fetch("/api/product-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, source: "sticky_conversion" }),
      keepalive: true,
    });
  } catch {
    // Conversion tracking must not block navigation.
  }
}
