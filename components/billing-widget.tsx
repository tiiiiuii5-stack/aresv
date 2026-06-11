"use client";

import Link from "next/link";
import { CreditCard } from "lucide-react";
import type { Subscription } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface BillingWidgetProps {
  subscription?: Subscription | null;
  scansUsed?: number;
  scansAllowed?: number;
  reportsGenerated?: number;
}

export function BillingWidget({
  subscription,
  scansUsed = 0,
  scansAllowed = 20,
  reportsGenerated = 0,
}: BillingWidgetProps) {
  const tier = subscription?.tier || "STARTER";
  const status = subscription?.status || "ACTIVE";
  const renewalDate = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
    : "N/A";
  const usagePercent = Math.round((scansUsed / scansAllowed) * 100);
  const isNearLimit = usagePercent >= 80;

  const tierLabel: Record<string, string> = {
    STARTER: "Starter",
    PROFESSIONAL: "Professional",
    ENTERPRISE: "Enterprise",
  };

  return (
    <div className="vos-panel p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="vos-label flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Billing
          </p>
          <h3 className="mt-2 vos-h3">Your Plan</h3>
        </div>
        <Badge variant="outline">{status}</Badge>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-[rgb(var(--vos-text))]">
              {tierLabel[tier] || tier}
            </p>
            <span className="text-xs font-semibold text-[rgb(var(--vos-text-muted))]">
              Renews {renewalDate}
            </span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-[rgb(var(--vos-text-muted))]">
              Free scans used
            </p>
            <p className="text-sm font-bold text-[rgb(var(--vos-text))]">
              {scansUsed} / {scansAllowed}
            </p>
          </div>
          <div className={`h-2 w-full rounded-full ${
            isNearLimit
              ? "bg-red-500/30"
              : "bg-emerald-500/30"
          }`}>
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isNearLimit ? "bg-red-500" : "bg-emerald-500"
              }`}
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          {isNearLimit && (
            <p className="mt-2 text-xs font-semibold text-red-300">
              You're near your scan limit. Upgrade to continue.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-3">
          <p className="text-xs font-semibold text-[rgb(var(--vos-text-muted))]">
            Reports generated: <span className="text-[rgb(var(--vos-text))]">{reportsGenerated}</span>
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Link href="/pricing" className="flex-1">
          <Button variant="default" className="w-full">
            Upgrade Plan
          </Button>
        </Link>
        <Link href="/account/billing" className="flex-1">
          <Button variant="outline" className="w-full">
            Manage
          </Button>
        </Link>
      </div>
    </div>
  );
}
