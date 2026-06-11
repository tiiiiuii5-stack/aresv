"use client";

import { Check, FileText, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";

import { InstitutionalMetricCard, InstitutionalPageHero, InstitutionalPageShell, InstitutionalPanel } from "@/components/institutional/institutional-shell";
import { StickyConversionBar } from "@/components/sticky-conversion-bar";

const plans = [
  {
    tier: "STARTER",
    name: "Free Preview",
    priceMonthly: "Free",
    priceAnnual: "Free",
    features: ["Public repo or code sample", "Quick buyer verdict", "Top risks preview", "No payment required"],
    signal: "Check risk in minutes",
    action: "Start free scan",
    href: "/free-review",
    tone: "muted",
  },
  {
    tier: "PRO",
    name: "Software Decision Report",
    priceMonthly: "$9",
    priceAnnual: "$9",
    features: ["Risk summary", "Engineering maturity", "Safety signals", "Decision recommendation"],
    signal: "For one buy/ship/use decision",
    action: "Unlock $9 report",
    href: "/appraisal-intake?offer=instant",
    tone: "verified",
  },
  {
    tier: "TEAM",
    name: "Buyer-Ready Report",
    priceMonthly: "$19",
    priceAnnual: "$19",
    features: ["Full risk breakdown", "Fix plan", "Evidence limits", "Assessment confidence", "Signed Evidence Receipt"],
    signal: "For buyers, audits, and client review",
    action: "Unlock $19 report",
    href: "/appraisal-intake?offer=buyer-ready",
    tone: "verified",
  },
  {
    tier: "ENTERPRISE",
    name: "Enterprise",
    priceMonthly: "Custom",
    priceAnnual: "Custom",
    features: ["Custom volume", "SSO/SAML", "Compliance exports", "Priority security review", "Dedicated support"],
    signal: "Enterprise governance",
    action: "Contact",
    href: "mailto:sales@ventureos.ai?subject=VentureOS%20Enterprise",
    tone: "unknown",
  },
] as const;

type Plan = {
  tier: "STARTER" | "PRO" | "TEAM" | "ENTERPRISE";
  name: string;
  priceMonthly: string;
  priceAnnual: string;
  features: readonly string[];
  signal: string;
  action: string;
  href?: string;
  tone: "muted" | "verified" | "unknown";
};

const pricingPlans: readonly Plan[] = plans;
export function PricingCheckout() {
  const [annual, setAnnual] = useState(false);
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout(tier: string) {
    if (tier === "STARTER") return;
    if (tier === "ENTERPRISE") return;

    setLoadingTier(tier);
    setError(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, billingCycle: annual ? "annual" : "monthly" }),
      });
      const payload = await response.json();
      const url = payload?.url || payload?.checkout?.url;
      if (!response.ok || !url) throw new Error(payload?.error || "Checkout could not be started.");
      window.open(url, "_self", "noopener,noreferrer");
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Checkout could not be started.");
    } finally {
      setLoadingTier(null);
    }
  }

  return (
      <InstitutionalPageShell
      purposeLabel="Software Decision Reports"
      actions={[
        { label: "Start Free Preview", href: "/free-review", variant: "default" },
      ]}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Free Review", href: "/free-review" },
        { label: "Plan & Settings" },
      ]}
    >
      <div className="grid gap-5">
        <InstitutionalPageHero
          eyebrow="Software Decision Reports"
          title="Pay for the answer, not the platform."
          description="Run a free preview, then unlock a low-friction decision report when you need a shareable risk summary before buying, shipping, or integrating software."
          aside={
            <div className="grid gap-3">
              <InstitutionalMetricCard label="Public scan" value="Free" detail="Limited evidence review" />
              <InstitutionalMetricCard label="First paid report" value="$9" detail="Decision report" status="verified" />
            </div>
          }
          actions={
            <>
              <div className="flex items-center gap-2 vos-cell p-1">
                <button type="button" onClick={() => setAnnual(false)} className={`nav ${annual ? "" : "nav-active"}`}>
                  Monthly
                </button>
                <button type="button" onClick={() => setAnnual(true)} className={`nav ${annual ? "nav-active" : ""}`}>
                  Annual
                </button>
              </div>
              <span className="vos-badge vos-badge-muted">No subscription required</span>
            </>
          }
        />

        <section className="grid gap-3 md:grid-cols-3">
          <TrustPill icon={<Check className="h-4 w-4" />} label="Free first" value="Risk preview before payment" />
          <TrustPill icon={<ShieldCheck className="h-4 w-4" />} label="Paid artifact" value="$9 or $19 decision report" />
          <TrustPill icon={<FileText className="h-4 w-4" />} label="Clear path" value="Preview -> pay -> report" />
        </section>

        <section className="vos-panel grid gap-4 p-5 md:grid-cols-3">
          <TrustQuote title="Founder" quote="Use the free scan to find launch blockers before showing a buyer." />
          <TrustQuote title="Acquirer" quote="An evidence review turns diligence from opinion into observed facts, inferences, and limitations." />
          <TrustQuote title="Auditor" quote="The useful part is not the score. It is the boundary between observed and unknown." />
        </section>

        {error ? <div className="vos-cell px-4 py-3 text-sm font-semibold text-[rgb(var(--vos-danger))]">{error}</div> : null}

        <section className="grid gap-4 lg:grid-cols-4">
          {pricingPlans.map((plan) => (
            <InstitutionalPanel key={plan.tier} className={["group flex min-h-[430px] flex-col overflow-hidden", plan.tier === "PRO" ? "ring-1 ring-emerald-400/35" : ""].join(" ")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="grid h-10 w-10 place-items-center rounded-lg border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] text-[rgb(var(--vos-verified))]">
                    {planIcon(plan.tier)}
                  </div>
                  <p className="mt-4 vos-label">{plan.name}</p>
                  <h2 className="mt-2 vos-card-title">{plan.signal}</h2>
                </div>
                {plan.tier === "PRO" ? <span className="vos-badge vos-badge-ready">Popular</span> : null}
              </div>
              <div>
                <div className="mt-5 min-h-[52px]">
                  <p className="text-3xl font-black text-[rgb(var(--vos-text))]">{annual ? plan.priceAnnual : plan.priceMonthly}</p>
                </div>
              </div>

              <ul className="mt-6 flex flex-1 flex-col gap-4 vos-body">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-3">
                    <Check className={plan.tone === "muted" ? "mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--vos-unknown))]" : "mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--vos-verified))]"} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              {plan.href ? (
                <Link href={plan.href} className={plan.tier === "STARTER" ? "mt-8 action primary" : "mt-8 action"}>
                  {plan.action}
                </Link>
              ) : plan.tier === "ENTERPRISE" ? (
                <a href="mailto:sales@ventureos.ai?subject=VentureOS%20Enterprise" className="mt-8 action">
                  {plan.action}
                </a>
              ) : (
                <button type="button" onClick={() => startCheckout(plan.tier)} disabled={loadingTier !== null} className="mt-8 action primary disabled:cursor-not-allowed disabled:opacity-60">
                  {loadingTier === plan.tier ? <Loader2 className="h-4 w-4 animate-spin" /> : plan.action}
                </button>
              )}
            </InstitutionalPanel>
          ))}
        </section>

        <footer className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/free-review" className="action primary">
            Start with a free scan
          </Link>
          <a href="mailto:sales@ventureos.ai?subject=VentureOS%20Enterprise" className="action">
            Contact sales
          </a>
        </footer>
      </div>
      <StickyConversionBar primaryHref="/free-review" secondaryHref="/sample-appraisal" source="pricing_sticky" />
    </InstitutionalPageShell>
  );
}

function planIcon(tier: Plan["tier"]) {
  if (tier === "PRO") return <Sparkles className="h-5 w-5" />;
  if (tier === "TEAM") return <ShieldCheck className="h-5 w-5" />;
  return <FileText className="h-5 w-5" />;
}

function TrustPill({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <article className="vos-cell flex items-center gap-3 p-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-emerald-400/30 bg-emerald-400/10 text-emerald-200">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block vos-label">{label}</span>
        <span className="mt-1 block truncate text-sm font-bold text-[rgb(var(--vos-text))]">{value}</span>
      </span>
    </article>
  );
}

function TrustQuote({ title, quote }: { title: string; quote: string }) {
  return (
    <article className="vos-cell p-4">
      <p className="vos-label">{title} lens</p>
      <p className="mt-3 text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">&quot;{quote}&quot;</p>
    </article>
  );
}
