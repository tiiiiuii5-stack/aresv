"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, FileText, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { VentureOSFooter } from "@/components/institutional/institutional-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonClassName } from "@/components/ui/button";

const reviewChecks = [
  {
    title: "Launch blockers",
    detail: "Find obvious risks before a buyer, customer, or teammate does.",
  },
  {
    title: "Safety signals",
    detail: "Check authentication, data handling, secrets, and dependency exposure.",
  },
  {
    title: "Buyer summary",
    detail: "Get plain-English status, limitations, and next steps.",
  },
];

const nextSteps = [
  "Paste a public GitHub repo or app URL.",
  "Run the free review.",
  "Upgrade only if you need a signed buyer report.",
];

export default function HomePage() {
  const [target, setTarget] = useState("");

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

        <div className="grid min-h-[calc(100vh-6rem)] items-center gap-10 py-16 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel))]/85 px-3 py-2 text-xs font-black uppercase text-[rgb(var(--vos-text-muted))]">
              <ShieldCheck className="h-4 w-4 text-[rgb(var(--vos-verified))]" />
              Free software trust check
            </div>
            <h1 className="mt-6 max-w-4xl text-4xl font-black leading-[1.02] tracking-normal text-[rgb(var(--vos-text))] sm:text-5xl lg:text-6xl">
              Free buyer-grade software verdict.
            </h1>
            <p className="mt-6 max-w-2xl text-lg font-semibold leading-8 text-[rgb(var(--vos-text-muted))]">
              VentureOS gives founders and buyers a clear first-pass review of software quality, safety, and launch risk.
            </p>

            <form
              action="/free-review"
              method="get"
              className="mt-8 max-w-3xl rounded-xl border border-[rgb(var(--vos-primary))]/60 bg-[rgb(var(--vos-panel))]/95 p-4 shadow-2xl shadow-[rgb(var(--vos-primary))]/15 ring-1 ring-[rgb(var(--vos-primary))]/25"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <label className="text-sm font-black uppercase tracking-normal text-[rgb(var(--vos-text))]" htmlFor="software-target">
                  Paste your public GitHub repo
                </label>
                <span className="rounded-full border border-[rgb(var(--vos-verified))]/50 bg-[rgb(var(--vos-verified-bg))]/70 px-3 py-1 text-xs font-black text-[rgb(var(--vos-verified))]">
                  Free review
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
                  Start Free Review <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-3 text-sm font-semibold text-[rgb(var(--vos-text-muted))]">
                No payment required. Public repos work best.
              </p>
            </form>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link href="/sample-appraisal" className={buttonClassName({ variant: "outline", size: "lg", className: "min-h-14 w-full text-base sm:w-auto" })}>
                See sample report
              </Link>
              <Link href="/pricing" className={buttonClassName({ variant: "outline", size: "lg", className: "min-h-14 w-full text-base sm:w-auto" })}>
                View pricing
              </Link>
            </div>

          <div className="mt-6 grid gap-2 text-sm font-bold text-[rgb(var(--vos-text-muted))] sm:grid-cols-3">
            <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[rgb(var(--vos-verified))]" />Quality</p>
            <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[rgb(var(--vos-verified))]" />Safety</p>
            <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[rgb(var(--vos-verified))]" />Buyer readiness</p>
          </div>
          </div>

          <aside className="vos-buyer-card p-5">
            <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--vos-border))] pb-4">
              <div>
                <p className="vos-label">What happens next</p>
                <h2 className="mt-2 vos-card-title">Simple flow</h2>
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
            <Link href="/tutorial" className={buttonClassName({ variant: "outline", className: "mt-5 w-full" })}>
              Open tutorial
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
