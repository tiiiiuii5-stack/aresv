"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, FileText, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { VentureOSFooter } from "@/components/institutional/institutional-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonClassName } from "@/components/ui/button";

const reviewChecks = [
  {
    title: "Decision first",
    detail: "Start with BUY, INVESTIGATE, or AVOID before looking at any score.",
  },
  {
    title: "Evidence classes",
    detail: "Separate observed facts, reasonable inferences, and unknowns buyers still need to resolve.",
  },
  {
    title: "Trust rationale",
    detail: "Explain why the decision exists with coverage, confidence, risks, and next actions.",
  },
];

const nextSteps = [
  "Paste a public GitHub repo or app URL.",
  "Get a free decision preview.",
  "Use the full report when a buyer, investor, or operator needs the evidence memo.",
];

export default function HomePage() {
  const [target, setTarget] = useState("");
  const viewTracked = useRef(false);

  useEffect(() => {
    if (viewTracked.current) return;
    viewTracked.current = true;
    void trackHomeEvent("homepage.view", { metadata: { surface: "homepage" } });
  }, []);

  return (
    <main className="vos-page min-h-screen">
      <section className="vos-hero-bg min-h-screen px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 text-sm font-black text-[rgb(var(--vos-text))]">
            <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-lg border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-primary))] text-[rgb(var(--vos-primary-text))] before:content-['V']" />
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

        <div className="grid min-h-[calc(100vh-6rem)] items-center gap-10 py-16 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel))]/85 px-3 py-2 text-xs font-black uppercase text-[rgb(var(--vos-text-muted))]">
              <ShieldCheck className="h-4 w-4 text-[rgb(var(--vos-verified))]" />
              Bloomberg Terminal for software trust
            </div>
            <h1 className="mt-6 max-w-4xl text-4xl font-black leading-[1.02] tracking-normal text-[rgb(var(--vos-text))] sm:text-5xl lg:text-6xl">
              Decide whether to trust software before you buy, integrate, or deploy it.
            </h1>
            <p className="mt-6 max-w-2xl text-lg font-semibold leading-8 text-[rgb(var(--vos-text-muted))]">
              VentureOS turns a repository, SaaS product, package, API, or company into a decision: BUY, INVESTIGATE, or AVOID, backed by observed evidence, inferences, unknowns, confidence, and coverage.
            </p>

            <form
              action="/t"
              method="get"
              className="mt-8 max-w-3xl rounded-xl border border-[rgb(var(--vos-primary))]/60 bg-[rgb(var(--vos-panel))]/95 p-4 shadow-2xl shadow-[rgb(var(--vos-primary))]/15 ring-1 ring-[rgb(var(--vos-primary))]/25"
            >
              <input type="hidden" name="e" value="homepage.free_review_clicked" />
              <input type="hidden" name="source" value="homepage_form" />
              <input type="hidden" name="to" value="/free-review" />
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <label className="text-sm font-black uppercase tracking-normal text-[rgb(var(--vos-text))]" htmlFor="software-target">
                  Paste your public GitHub repo
                </label>
                <span className="rounded-full border border-[rgb(var(--vos-verified))]/50 bg-[rgb(var(--vos-verified-bg))]/70 px-3 py-1 text-xs font-black text-[rgb(var(--vos-verified))]">
                  Free preview
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_210px]">
                <div className="flex min-w-0 items-center gap-3 rounded-lg border border-[rgb(var(--vos-border-strong))] bg-[rgb(var(--vos-panel-raised))] px-4 shadow-inner shadow-black/20">
                  <FileText className="h-5 w-5 shrink-0 text-[rgb(var(--vos-primary))]" />
                  <input
                    id="software-target"
                    name="repo"
                    value={target}
                    onChange={(event) => setTarget(event.target.value)}
                    placeholder="https://github.com/username/repo"
                    className="h-16 min-w-0 flex-1 border-0 bg-transparent text-base font-bold text-[rgb(var(--vos-text))] outline-none placeholder:text-[rgb(var(--vos-text-subtle))]"
                  />
                </div>
                <button type="submit" className={buttonClassName({ size: "lg", className: "h-16 w-full text-base" })}>
                Get Decision <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-3 text-sm font-semibold text-[rgb(var(--vos-text-muted))]">
                Preview is free. Full decision reports are the buyer-ready evidence memo.
              </p>
            </form>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link href={trackingHref("homepage.sample_clicked", "/sample-appraisal", "homepage_secondary_cta")} className={buttonClassName({ variant: "outline", size: "lg", className: "min-h-14 w-full text-base sm:w-auto" })}>
                See sample report
              </Link>
              <Link href={trackingHref("homepage.pricing_clicked", "/pricing", "homepage_secondary_cta")} className={buttonClassName({ variant: "outline", size: "lg", className: "min-h-14 w-full text-base sm:w-auto" })}>
                View pricing
              </Link>
            </div>

          <div className="mt-6 grid gap-2 text-sm font-bold text-[rgb(var(--vos-text-muted))] sm:grid-cols-3">
            <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[rgb(var(--vos-verified))]" />Observed</p>
            <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[rgb(var(--vos-verified))]" />Inferred</p>
            <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[rgb(var(--vos-verified))]" />Unknown</p>
          </div>
          </div>

          <aside className="vos-buyer-card p-5">
            <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--vos-border))] pb-4">
              <div>
                <p className="vos-label">What happens next</p>
                <h2 className="mt-2 vos-card-title">Simple decision path</h2>
              </div>
              <span className="vos-badge vos-badge-ready">3 steps</span>
            </div>
            <div className="mt-5 grid gap-3">
              {nextSteps.map((step, index) => (
                <div key={step} className="flex gap-3 rounded-lg border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] p-4">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[rgb(var(--vos-primary))] text-sm font-black text-[rgb(var(--vos-primary-text))]">{index + 1}</span>
                  <p className="text-sm font-bold leading-6 text-[rgb(var(--vos-text-muted))]">{step}</p>
                </div>
              ))}
              </div>
            <Link href={trackingHref("homepage.pricing_clicked", "/pricing", "homepage_next_steps")} className={buttonClassName({ variant: "outline", className: "mt-5 w-full" })}>
              See report options
            </Link>
          </aside>
        </div>

        <section className="mx-auto grid w-full max-w-5xl gap-4 sm:grid-cols-3">
          {reviewChecks.map((item) => (
            <article key={item.title} className="vos-buyer-card p-5">
              <ShieldCheck className="h-5 w-5 text-[rgb(var(--vos-verified))]" />
              <h2 className="mt-4 text-lg font-black text-[rgb(var(--vos-text))]">{item.title}</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">{item.detail}</p>
            </article>
          ))}
        </section>
        </div>
      </section>

      <VentureOSFooter />
    </main>
  );
}

function trackingHref(event: string, to: string, source: string) {
  const params = new URLSearchParams({ e: event, to, source });
  return `/t?${params.toString()}`;
}

async function trackHomeEvent(
  event: "homepage.view" | "homepage.free_review_clicked" | "homepage.sample_clicked" | "homepage.pricing_clicked",
  input: { repositoryUrl?: string; metadata?: Record<string, unknown> } = {},
) {
  try {
    await fetch("/api/product-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        source: "homepage",
        repositoryUrl: input.repositoryUrl,
        metadata: input.metadata || {},
      }),
      keepalive: true,
    });
  } catch {
    // Demand tracking must never block navigation.
  }
}
