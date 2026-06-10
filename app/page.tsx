"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, FileText, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";

import { VentureOSFooter } from "@/components/institutional/institutional-shell";
import { BuyerJourneyStrip } from "@/components/buyer-journey-strip";
import { GitHubConnectPanel } from "@/components/github-connect-panel";
import { StickyConversionBar } from "@/components/sticky-conversion-bar";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonClassName } from "@/components/ui/button";

const investigationSteps = [
  { label: "Know who owns it", icon: FileText },
  { label: "See what was checked", icon: CheckCircle2 },
  { label: "Spot buyer blockers", icon: ShieldCheck },
  { label: "Find safety gaps", icon: ShieldCheck },
  { label: "Understand launch risk", icon: CheckCircle2 },
  { label: "Share verification", icon: FileText },
];

const buyerSignals = [
  {
    title: "Clear status",
    detail: "Trusted, risky, or blocked with plain-language reasons.",
    icon: CheckCircle2,
  },
  {
    title: "Evidence boundaries",
    detail: "Shows what was observed, inferred, and not verified.",
    icon: ShieldCheck,
  },
  {
    title: "Low friction review",
    detail: "Start with a URL, repo, or source sample. No payment step.",
    icon: Sparkles,
  },
];

const trustBuilders = [
  "Evidence-scoped reports",
  "Signed Verification Badge",
  "Buyer-readable limitations",
  "Public registry record",
];

export default function HomePage() {
  const [target, setTarget] = useState("");
  const query = target.trim();
  const passportHref = query
    ? `/free-review?${new URLSearchParams({ repo: query }).toString()}`
    : "/free-review";

  return (
    <main className="vos-page min-h-screen">
      <section className="vos-hero-bg min-h-screen px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 text-sm font-black text-[rgb(var(--vos-text))]">
            <span className="grid h-10 w-10 place-items-center rounded-lg border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-primary))] text-[rgb(var(--vos-primary-text))]">
              V
            </span>
            <span>
              <span className="block">VentureOS</span>
              <span className="block text-xs font-bold text-[rgb(var(--vos-text-subtle))]">Software Passport Network</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/registry" className={buttonClassName({ variant: "outline", size: "sm" })}>
              Registry
            </Link>
          </div>
        </div>

        <div className="grid min-h-[calc(100vh-6rem)] items-center gap-10 py-16 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel))]/85 px-3 py-2 text-xs font-black uppercase text-[rgb(var(--vos-text-muted))]">
              <ShieldCheck className="h-4 w-4 text-[rgb(var(--vos-verified))]" />
              Software trust records for buyers and builders
            </div>
            <h1 className="mt-6 max-w-4xl text-4xl font-black leading-[1.02] tracking-normal text-[rgb(var(--vos-text))] sm:text-5xl lg:text-6xl">
              Decide if software is safe to buy, ship, or trust.
            </h1>
            <p className="mt-6 max-w-2xl text-lg font-semibold leading-8 text-[rgb(var(--vos-text-muted))]">
              VentureOS turns repositories, code, and product evidence into a clear Software Passport with trust status, risks, limitations, and signed verification.
            </p>

          <form action="/free-review" className="mt-8 grid max-w-3xl gap-3 rounded-lg border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel))]/95 p-3 shadow-2xl shadow-black/20 sm:grid-cols-[minmax(0,1fr)_190px]">
            <label className="sr-only" htmlFor="software-target">Software target</label>
            <div className="flex min-w-0 items-center gap-3 rounded-lg border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] px-4">
              <FileText className="h-5 w-5 shrink-0 text-[rgb(var(--vos-text-subtle))]" />
              <input
                id="software-target"
                name="repo"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                placeholder="Paste your GitHub repo or app URL"
                className="h-14 min-w-0 flex-1 border-0 bg-transparent text-sm font-bold text-[rgb(var(--vos-text))] outline-none placeholder:text-[rgb(var(--vos-text-subtle))]"
              />
            </div>
            <Link href={passportHref} className={buttonClassName({ size: "lg", className: "h-14 w-full" })}>
              Start Free Review <ArrowRight className="h-4 w-4" />
            </Link>
          </form>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/free-review" className={buttonClassName({ size: "lg", className: "min-h-14 w-full text-base sm:w-auto" })}>
                Start Free Review <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/sample-appraisal" className={buttonClassName({ variant: "outline", size: "lg", className: "min-h-14 w-full text-base sm:w-auto" })}>
                See Buyer Sample
              </Link>
              <a href="mailto:sales@ventureos.ai?subject=VentureOS%20buyer%20demo" className={buttonClassName({ variant: "outline", size: "lg", className: "min-h-14 w-full text-base sm:w-auto" })}>
                Book Demo
              </a>
            </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {buyerSignals.map((signal) => {
              const Icon = signal.icon;
              return (
                <article key={signal.title} className="vos-buyer-card p-4">
                  <Icon className="h-5 w-5 text-[rgb(var(--vos-verified))]" />
                  <h2 className="mt-3 text-base font-black text-[rgb(var(--vos-text))]">{signal.title}</h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">{signal.detail}</p>
                </article>
              );
            })}
          </div>

          <div className="mt-6 grid gap-2 sm:grid-cols-4">
            {trustBuilders.map((item) => (
              <div key={item} className="flex min-h-11 items-center gap-2 rounded-lg border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel))]/85 px-3">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[rgb(var(--vos-verified))]" />
                <span className="text-xs font-black text-[rgb(var(--vos-text-muted))]">{item}</span>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            <Link href="/tutorial" className={buttonClassName({ variant: "outline", size: "sm" })}>
              Tutorial
            </Link>
            <Link href="/software-immigration" className={buttonClassName({ variant: "outline", size: "sm" })}>
              Software Immigration Terminal
            </Link>
            <Link href="/api/github/install" className={buttonClassName({ variant: "outline", size: "sm" })}>
              Connect GitHub
            </Link>
            <Link href="/sample-appraisal" className={buttonClassName({ variant: "outline", size: "sm" })}>
              View Sample Passport
            </Link>
          </div>

          <div className="mx-auto mt-6 max-w-3xl">
            <GitHubConnectPanel compact />
          </div>
          </div>

          <aside className="vos-buyer-card p-5">
            <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--vos-border))] pb-4">
              <div>
                <p className="vos-label">Buyer View</p>
                <h2 className="mt-2 vos-card-title">Passport Preview</h2>
              </div>
              <span className="vos-badge vos-badge-ready">Free</span>
            </div>
            <div className="mt-5 grid gap-3">
              <PreviewMetric label="Trust status" value="Reviewable" />
              <PreviewMetric label="Quality" value="89" />
              <PreviewMetric label="Safety" value="86" />
            </div>
            <div className="mt-5 rounded-lg border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] p-4">
              <p className="flex items-center gap-2 text-sm font-black text-[rgb(var(--vos-text))]">
                <ShieldCheck className="h-4 w-4 text-[rgb(var(--vos-verified))]" />
                What buyers get
              </p>
              <div className="mt-4 grid gap-3">
                {["Verified evidence summary", "Plain-English risk reasons", "Signed Verification Badge", "Unknowns clearly called out"].map((item) => (
                  <p key={item} className="flex gap-2 text-sm font-semibold text-[rgb(var(--vos-text-muted))]">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--vos-verified))]" />
                    {item}
                  </p>
                ))}
              </div>
            </div>
            <Link href="/sample-appraisal" className={buttonClassName({ variant: "outline", className: "mt-5 w-full" })}>
              View Sample Passport
            </Link>
          </aside>
        </div>

        <section className="mx-auto grid w-full max-w-5xl gap-2 border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel))]/90 p-3">
          <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--vos-border))] pb-3">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-[rgb(var(--vos-verified))]" />
              <p className="text-xs font-black uppercase tracking-normal text-[rgb(var(--vos-text-muted))]">What your review checks</p>
            </div>
            <p className="text-xs font-black uppercase tracking-normal text-[rgb(var(--vos-text-subtle))]">Buyer-readable</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {investigationSteps.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.label} className="flex items-center gap-2 rounded-md border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] px-3 py-2">
                  <Icon className="h-4 w-4 shrink-0 text-[rgb(var(--vos-verified))]" />
                  <p className="text-xs font-bold text-[rgb(var(--vos-text-muted))]">{step.label}</p>
                </div>
              );
            })}
          </div>
        </section>
        <div className="mx-auto mt-5 w-full max-w-5xl">
          <BuyerJourneyStrip current="choose" />
        </div>
        </div>
      </section>

      <VentureOSFooter />
      <StickyConversionBar primaryHref="/free-review" secondaryHref="/sample-appraisal" source="home_sticky" />
    </main>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] p-4">
      <span className="text-sm font-bold text-[rgb(var(--vos-text-muted))]">{label}</span>
      <span className="font-mono text-xl font-black text-[rgb(var(--vos-verified))]">{value}</span>
    </div>
  );
}
