"use client";

import Link from "next/link";
import { CheckCircle2, FileText, ShieldCheck } from "lucide-react";

const steps = [
  {
    label: "Choose Report Type",
    detail: "$49 verified or $199 buyer-ready",
    href: "/software-appraisal",
    icon: ShieldCheck,
  },
  {
    label: "Provide Evidence",
    detail: "Repository, files, or source code",
    href: "/appraisal-intake?offer=buyer-ready",
    icon: CheckCircle2,
  },
  {
    label: "Review & Pay",
    detail: "Confirm scope and launch access",
    href: "/appraisal-intake?offer=buyer-ready",
    icon: FileText,
  },
  {
    label: "Get Report",
    detail: "Share report and badge",
    href: "/sample-appraisal",
    icon: ShieldCheck,
  },
] as const;

export function BuyerJourneyStrip({ current }: { current: "choose" | "evidence" | "review-pay" | "report" }) {
  return (
    <nav aria-label="Verified report progress" className="vos-panel grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, index) => {
        const active = stepKey(step.label) === current;
        const Icon = step.icon;
        return (
          <Link
            key={step.label}
            href={step.href}
            aria-current={active ? "step" : undefined}
            className={[
              "flex min-h-20 items-center gap-3 rounded-lg border p-3 transition",
              active ? "border-[rgb(var(--vos-primary))] bg-[rgb(var(--vos-verified-bg))]/30" : "border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))]",
            ].join(" ")}
            title={step.detail}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel))]">
              <Icon className="h-4 w-4 text-[rgb(var(--vos-verified))]" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-black text-[rgb(var(--vos-text))]">
                {index + 1}. {step.label}
              </span>
              <span className="mt-0.5 block text-xs font-semibold text-[rgb(var(--vos-text-muted))]">{step.detail}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function stepKey(label: string) {
  if (label === "Provide Evidence") return "evidence";
  if (label === "Review & Pay") return "review-pay";
  if (label === "Get Report") return "report";
  return "choose";
}
