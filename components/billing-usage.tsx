"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { hasServerSession } from "@/lib/client-session";

type BillingStatus = {
  tier: "STARTER" | "PRO" | "TEAM" | "ENTERPRISE";
  usage: { builds: number; projects: number };
  limits: { builds: number | null; projects: number | null; label: string };
};

export function BillingUsage({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<BillingStatus | null>(null);

  useEffect(() => {
    let active = true;
    hasServerSession()
      .then((authenticated) => authenticated ? fetch("/api/billing/status", { cache: "no-store" }) : null)
      .then((response) => response?.json())
      .then((data) => {
        if (active && data?.ok) setStatus(data as BillingStatus);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const builds = status?.usage.builds ?? 0;
  const limit = status?.limits.builds;
  const percentage = limit ? Math.min(100, Math.round((builds / limit) * 100)) : 18;
  const label = limit ? `${builds} of ${limit} builds used` : `${builds} builds used`;

  return (
    <div className={compact ? "min-w-[190px]" : "vos-cell p-4"}>
      <div className="flex items-center justify-between gap-3">
        <p className="vos-label">{status?.limits.label || "Starter"}</p>
        <Link href="/pricing" className="text-xs font-semibold text-[rgb(var(--vos-verified))]">
          Upgrade
        </Link>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[rgb(var(--vos-unknown-bg))]">
        <div className="h-full rounded-full bg-[rgb(var(--vos-verified))]" style={{ width: `${percentage}%` }} />
      </div>
      <p className="mt-2 text-xs text-[rgb(var(--vos-text-muted))]">{label}</p>
    </div>
  );
}
