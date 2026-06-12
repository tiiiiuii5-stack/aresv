"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, FileText, Loader2, ShieldCheck } from "lucide-react";
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

const sampleRepoUrl = "https://github.com/tiiiiuii5-stack/aresv.git";

export default function HomePage() {
  const [target, setTarget] = useState("");
  const [primaryEmail, setPrimaryEmail] = useState("");
  const [startBusy, setStartBusy] = useState(false);
  const [startError, setStartError] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadBusy, setLeadBusy] = useState(false);
  const [leadMessage, setLeadMessage] = useState("");
  const [leadError, setLeadError] = useState("");
  const viewTracked = useRef(false);

  useEffect(() => {
    if (viewTracked.current) return;
    viewTracked.current = true;
    void trackHomeEvent("homepage.view", { metadata: { surface: "homepage" } });
  }, []);

  async function startReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTarget = target.trim();
    const cleanEmail = primaryEmail.trim().toLowerCase();
    setStartBusy(true);
    setStartError("");
    try {
      if (cleanEmail) {
        const response = await fetch("/api/waitlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: cleanEmail,
            role: "founder-or-buyer",
            source: "homepage_primary_review",
            useCase: cleanTarget
              ? `Started review for ${cleanTarget}`
              : `Started sample review for ${sampleRepoUrl}`,
            ...campaignMetadataFromLocation(),
          }),
        });
        const payload = await response.json().catch(() => ({})) as { error?: string };
        if (!response.ok) throw new Error(payload.error || "Could not save email before starting the review.");
      }

      const reviewUrl = new URL("/t", window.location.origin);
      reviewUrl.searchParams.set("e", "homepage.free_review_clicked");
      reviewUrl.searchParams.set("source", cleanTarget ? "homepage_form" : "homepage_sample_form");
      reviewUrl.searchParams.set("to", "/free-review");
      reviewUrl.searchParams.set("framework", "nextjs");
      if (cleanTarget) reviewUrl.searchParams.set("repo", cleanTarget);
      copyCampaignParamsToUrl(reviewUrl);
      window.location.assign(reviewUrl.toString());
    } catch (error) {
      setStartError(error instanceof Error ? error.message : "Could not start this review.");
      setStartBusy(false);
    }
  }

  async function saveHomepageLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLeadBusy(true);
    setLeadMessage("");
    setLeadError("");
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: leadEmail,
          role: "founder-or-buyer",
          source: "homepage_hero",
          useCase: target.trim()
            ? `Send report path for ${target.trim()}`
            : "Send VentureOS report path",
          ...campaignMetadataFromLocation(),
        }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not save this request.");
      setLeadMessage("Saved. We can send the report path and review options.");
      setLeadEmail("");
    } catch (error) {
      setLeadError(error instanceof Error ? error.message : "Could not save this request.");
    } finally {
      setLeadBusy(false);
    }
  }

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
            <Link href="/request-report" className={buttonClassName({ variant: "outline", size: "sm" })}>
              Request Report
            </Link>
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
              onSubmit={startReview}
              className="mt-8 max-w-3xl rounded-xl border border-[rgb(var(--vos-primary))]/60 bg-[rgb(var(--vos-panel))]/95 p-4 shadow-2xl shadow-[rgb(var(--vos-primary))]/15 ring-1 ring-[rgb(var(--vos-primary))]/25"
            >
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
                    value={target}
                    onChange={(event) => setTarget(event.target.value)}
                    placeholder="https://github.com/username/repo"
                    className="h-16 min-w-0 flex-1 border-0 bg-transparent text-base font-bold text-[rgb(var(--vos-text))] outline-none placeholder:text-[rgb(var(--vos-text-subtle))]"
                  />
                </div>
                <button type="submit" disabled={startBusy} className={buttonClassName({ size: "lg", className: "h-16 w-full text-base" })}>
                  {startBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {startBusy ? "Starting" : "Get Decision"}
                </button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_210px]">
                <label className="block">
                  <span className="sr-only">Email for report path</span>
                  <input
                    value={primaryEmail}
                    onChange={(event) => setPrimaryEmail(event.target.value)}
                    type="email"
                    placeholder="Optional: email to save the result path"
                    className="h-12 w-full rounded-lg border border-[rgb(var(--vos-border-strong))] bg-[rgb(var(--vos-panel-raised))] px-4 text-sm font-bold text-[rgb(var(--vos-text))] outline-none placeholder:text-[rgb(var(--vos-text-subtle))] focus:border-[rgb(var(--vos-primary))]"
                  />
                </label>
                <Link
                  href={trackingHref("homepage.free_review_clicked", "/free-review", "homepage_sample_repo", { repo: sampleRepoUrl, framework: "nextjs", sample: "1" })}
                  className={buttonClassName({ variant: "outline", className: "h-12 w-full" })}
                >
                  Try sample
                </Link>
              </div>
              <p className="mt-3 text-sm font-semibold text-[rgb(var(--vos-text-muted))]">
                Preview is free. Add an email only if you want to save the result path.
              </p>
              {startError ? <p className="mt-2 rounded-lg border border-[rgb(var(--vos-danger))]/30 bg-[rgb(var(--vos-danger))]/10 px-3 py-2 text-xs font-bold leading-5 text-[rgb(var(--vos-danger))]">{startError}</p> : null}
            </form>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link href={trackingHref("homepage.pricing_clicked", "/request-report", "homepage_report_request")} className={buttonClassName({ size: "lg", className: "min-h-14 w-full text-base sm:w-auto" })}>
                Request report path
              </Link>
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
            <form onSubmit={saveHomepageLead} className="mt-4 rounded-lg border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] p-4">
              <p className="flex items-center gap-2 text-xs font-black uppercase text-[rgb(var(--vos-verified))]">
                <FileText className="h-4 w-4" />
                Send me the path
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">
                Not ready to scan? Leave an email and get the report path or human review option.
              </p>
              <label className="mt-3 block">
                <span className="sr-only">Email address</span>
                <input
                  value={leadEmail}
                  onChange={(event) => setLeadEmail(event.target.value)}
                  type="email"
                  required
                  placeholder="you@company.com"
                  className="h-11 w-full rounded-lg border border-[rgb(var(--vos-border-strong))] bg-[rgb(var(--vos-panel))] px-3 text-sm font-semibold text-[rgb(var(--vos-text))] outline-none placeholder:text-[rgb(var(--vos-text-subtle))] focus:border-[rgb(var(--vos-primary))]"
                />
              </label>
              <button type="submit" disabled={leadBusy} className={buttonClassName({ variant: "outline", size: "sm", className: "mt-3 w-full" })}>
                {leadBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {leadBusy ? "Saving" : "Send details"}
              </button>
              {leadMessage ? <p className="mt-2 text-xs font-bold leading-5 text-[rgb(var(--vos-verified))]">{leadMessage}</p> : null}
              {leadError ? <p className="mt-2 text-xs font-bold leading-5 text-[rgb(var(--vos-danger))]">{leadError}</p> : null}
            </form>
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

function campaignMetadataFromLocation() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return {
    campaign: cleanCampaignParam(params.get("campaign") || params.get("utm_campaign")),
    ref: cleanCampaignParam(params.get("ref")),
    utmSource: cleanCampaignParam(params.get("utm_source")),
  };
}

function cleanCampaignParam(value: unknown) {
  return String(value || "").trim().replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 80);
}

function copyCampaignParamsToUrl(url: URL) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  for (const key of ["campaign", "ref", "utm_source", "utm_campaign"]) {
    const value = cleanCampaignParam(params.get(key));
    if (value) url.searchParams.set(key, value);
  }
}

function trackingHref(event: string, to: string, source: string, extra?: Record<string, string>) {
  const params = new URLSearchParams({ e: event, to, source });
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value);
    }
  }
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
