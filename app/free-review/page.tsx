"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Code2, FileText, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { InstitutionalPageShell } from "@/components/institutional/institutional-shell";
import { BuyerJourneyStrip } from "@/components/buyer-journey-strip";
import { StickyConversionBar } from "@/components/sticky-conversion-bar";
import { Button } from "@/components/ui/button";
import { buttonClassName } from "@/components/ui/button";

type ReviewIssue = {
  id?: string;
  title?: string;
  severity?: string;
  category?: string;
  evidence?: string;
  fixSuggestion?: string;
};

type ReviewResult = {
  ok?: boolean;
  inputLimit?: number;
  inputTruncated?: boolean;
  securityScore?: number;
  failureScore?: number;
  productionReadinessScore?: number;
  riskLevel?: string;
  issues?: ReviewIssue[];
  recommendations?: string[];
  launchVerdict?: {
    verdict?: string;
    blockers?: string[];
    warnings?: string[];
  };
  repositorySource?: {
    canonicalUrl?: string;
    owner?: string;
    repo?: string;
    ref?: string;
    filesLoaded?: number;
    totalFilesDiscovered?: number;
    truncated?: boolean;
    warnings?: string[];
  } | null;
};

const starterCode = `// app/api/projects/[id]/route.ts
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json();
  await prisma.project.update({
    where: { id: params.id },
    data: { name: body.name }
  });
  return Response.json({ ok: true });
}

// components/delete-button.tsx
"use client";
export function DeleteButton({ projectId }: { projectId: string }) {
  return <button onClick={() => fetch('/api/projects/' + projectId, { method: 'DELETE' })}>Delete</button>;
}`;

export default function FreeReviewPage() {
  const [code, setCode] = useState(starterCode);
  const [repoUrl, setRepoUrl] = useState("");
  const [framework, setFramework] = useState("nextjs");
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState("");
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const viewTracked = useRef(false);

  const topIssues = useMemo(() => (result?.issues || []).slice(0, 3), [result]);
  const readiness = Number(result?.productionReadinessScore || 0);
  const state = readiness >= 85 ? "READY" : readiness >= 65 ? "RISKY" : "BLOCKED";
  const repoReady = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+/i.test(repoUrl.trim()) || /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoUrl.trim());
  const sourceReady = repoReady || code.trim().length >= 40;
  const paidUrl = `/appraisal-intake?offer=buyer-ready${repoUrl.trim() ? `&repo=${encodeURIComponent(repoUrl.trim())}` : ""}&framework=${encodeURIComponent(framework)}`;
  const instantUrl = `/appraisal-intake?offer=instant${repoUrl.trim() ? `&repo=${encodeURIComponent(repoUrl.trim())}` : ""}&framework=${encodeURIComponent(framework)}`;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const incomingRepo = params.get("repo");
    if (incomingRepo && !repoUrl) setRepoUrl(incomingRepo);
  }, [repoUrl]);

  useEffect(() => {
    if (viewTracked.current) return;
    viewTracked.current = true;
    void trackProductEvent("free_review.view", {
      source: "free_review",
      framework,
      counts: { starterCodeLoaded: true },
    });
  }, [framework]);

  async function runReviewScan() {
    if (!sourceReady) {
      setError("Enter a public GitHub repository URL or paste at least 40 characters of code.");
      return;
    }
    setScanBusy(true);
    setError("");
    setMessage("");
    try {
      await trackProductEvent("free_review.scan_started", {
        source: "free_review",
        framework,
        repositoryUrl: repoUrl,
        counts: {
          hasRepositoryUrl: repoReady,
          hasPastedCode: code.trim().length >= 40,
          pastedCharacters: code.trim().length,
        },
      });
      const response = await fetch("/api/public-demo-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appCode: code, repositoryUrl: repoUrl, framework, modules: ["appraisal", "auth", "stripe", "prisma"] }),
      });
      const payload = await response.json().catch(() => ({})) as ReviewResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Free review scan failed.");
      setResult(payload);
      setMessage("Free review scan complete. This preview does not issue a Signed Verification Badge.");
      await trackProductEvent("free_review.scan_completed", {
        source: "free_review",
        framework,
        repositoryUrl: repoUrl,
        riskLevel: payload.riskLevel,
        counts: {
          readinessScore: Number(payload.productionReadinessScore || 0),
          issueCount: Array.isArray(payload.issues) ? payload.issues.length : 0,
          inputTruncated: Boolean(payload.inputTruncated),
          repositoryFilesLoaded: payload.repositorySource?.filesLoaded || 0,
          repositoryTruncated: Boolean(payload.repositorySource?.truncated),
        },
      });
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Free review scan failed.");
      await trackProductEvent("free_review.scan_failed", {
        source: "free_review",
        framework,
        repositoryUrl: repoUrl,
        metadata: { reason: scanError instanceof Error ? scanError.message.slice(0, 120) : "unknown" },
      });
    } finally {
      setScanBusy(false);
    }
  }

  async function sendFeedback(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedbackBusy(true);
    setError("");
    setMessage("");
    try {
      const summary = [
        "Free review feedback",
        `score=${readiness || "not_scanned"}`,
        `state=${result ? state : "not_scanned"}`,
        feedback.trim(),
      ].filter(Boolean).join(" | ").slice(0, 500);

      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: "free-reviewer", useCase: summary }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not submit feedback.");
      setMessage("Feedback submitted. You are on the reviewer list.");
      setFeedback("");
      await trackProductEvent("free_review.feedback_submitted", {
        source: "free_review",
        framework,
        counts: { hadScanResult: Boolean(result), readinessScore: readiness || 0 },
      });
    } catch (feedbackError) {
      setError(feedbackError instanceof Error ? feedbackError.message : "Could not submit feedback.");
    } finally {
      setFeedbackBusy(false);
    }
  }

  return (
    <InstitutionalPageShell
      purposeLabel="Free Review"
      maxWidth="max-w-6xl"
      actions={[
        { label: "Paid Options", href: "/software-appraisal", variant: "outline" },
        { label: "Sample", href: "/sample-appraisal", variant: "outline" },
        { label: "Upgrade", href: "/software-appraisal", variant: "default" },
      ]}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Free Review" },
      ]}
    >
        <BuyerJourneyStrip current="choose" />

        <section className="grid gap-5 py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Free limited software review</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-normal text-white sm:text-5xl">
              Check whether a software asset has obvious launch risk.
            </h1>
            <p className="mt-4 max-w-2xl text-base font-semibold leading-8 text-slate-300">
              Paste a public GitHub URL or a small code sample. The free review runs a real limited scan and shows top risks. It is free to test, capped in scope, and does not issue a Signed Verification Badge.
            </p>
          </div>

          <aside className="rounded-lg border border-slate-800 bg-slate-950 p-5">
            <div className="relative overflow-hidden rounded-lg border border-emerald-300/25 bg-slate-900/70 p-4">
              <div className="absolute inset-x-0 top-8 h-px bg-emerald-300/50 shadow-[0_0_24px_rgba(52,211,153,0.65)]" />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[10px] font-black uppercase text-slate-500">VOS Free Review</p>
                  <p className="mt-3 text-3xl font-black text-emerald-100">$0</p>
                  <p className="mt-1 text-xs font-bold text-slate-400">Limited evidence scan</p>
                </div>
                <div className="grid h-14 w-14 place-items-center rounded-lg border border-emerald-300/30 bg-emerald-300/10">
                  <ShieldCheck className="h-7 w-7 text-emerald-200" />
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2">
                {["Repo", "Code", "Risk"].map((item) => (
                  <div key={item} className="rounded-md border border-slate-800 bg-slate-950/70 p-2 text-center">
                    <p className="font-mono text-[10px] font-black text-slate-400">{item}</p>
                  </div>
                ))}
              </div>
            </div>
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
              <ShieldCheck className="h-4 w-4" />
              Boundaries
            </p>
            <div className="mt-4 grid gap-3 text-sm font-semibold leading-6 text-slate-300">
              <p className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-200" />Accepts public GitHub repos or pasted code.</p>
              <p className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-200" />Short samples work best for the free preview.</p>
              <p className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />No Signed Verification Badge, buyer-ready report, or full repository coverage.</p>
            </div>
            <Link
              href={paidUrl}
              onClick={() => void trackProductEvent("free_review.paid_cta_clicked", {
                source: "free_review_boundary_card",
                framework,
                repositoryUrl: repoUrl,
                counts: { hadScanResult: Boolean(result), readinessScore: readiness || 0 },
              })}
              className={buttonClassName({ variant: "outline", className: "mt-5 w-full" })}
            >
              Buyer-Ready Verified Report
            </Link>
          </aside>
        </section>

        <section className="mb-5 grid gap-4 lg:grid-cols-3">
          <OfferCell
          title="Free Limited Review"
            price="$0"
            description="Public repo or small pasted sample. Shows top risks and launch blockers. No Signed Verification Badge."
            actionLabel="Run Free Review"
            href="#source-input"
          />
          <OfferCell
            title="Verified System Report"
            price="Free"
            description="Automated verified report, readiness score, evidence scope, and Signed Verification Badge."
            actionLabel="Start $49 Report"
            href={instantUrl}
          />
          <OfferCell
            title="Buyer-Ready Verified Report"
            price="Free"
            description="Deeper buyer-facing report with fix plan, unknowns, evidence limits, and Signed Verification Badge."
            actionLabel="Start $199 Report"
            href={paidUrl}
            primary
          />
        </section>

        <section className="mb-5 grid gap-3 md:grid-cols-4">
          <SignalCard icon={<Code2 className="h-4 w-4" />} label="Input" value="Repo or code" />
          <SignalCard icon={<ShieldCheck className="h-4 w-4" />} label="Output" value="Top launch risks" />
          <SignalCard icon={<FileText className="h-4 w-4" />} label="Upgrade" value="Free report" />
          <SignalCard icon={<CheckCircle2 className="h-4 w-4" />} label="Payment" value="Not required" />
        </section>

        <section id="source-input" className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  <Code2 className="h-4 w-4" />
                  Source input
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">Run a free review scan.</h2>
              </div>
              <div className="flex gap-2">
                <select
                  value={framework}
                  onChange={(event) => setFramework(event.target.value)}
                  className="h-10 rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm font-bold text-white outline-none focus:border-emerald-300"
                  aria-label="Framework"
                >
                  <option value="nextjs">Next.js</option>
                  <option value="react">React</option>
                  <option value="node">Node.js</option>
                  <option value="express">Express</option>
                </select>
                <Button type="button" onClick={runReviewScan} disabled={scanBusy}>
                  {scanBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Scan
                </Button>
              </div>
            </div>
            <label className="mt-4 block">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Public GitHub repository URL</span>
              <input
                value={repoUrl}
                onChange={(event) => setRepoUrl(event.target.value)}
                type="url"
                placeholder="https://github.com/company/app"
                className="mt-2 h-11 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-white outline-none focus:border-emerald-300"
              />
              <span className="mt-2 block text-xs font-semibold leading-5 text-slate-500">
                Public repos only. Private repos need the GitHub App, upload, or paste flow.
              </span>
            </label>
            <textarea
              value={code}
              onChange={(event) => setCode(event.target.value.slice(0, 6_000))}
              className="mt-4 min-h-[360px] w-full resize-y rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100 outline-none focus:border-emerald-300"
              aria-label="Code to scan"
            />
            <p className="mt-2 text-xs font-semibold text-slate-500">
              Paste a small code sample only if you do not have a public repo. Full reports review a broader evidence package.
            </p>
          </div>

          <aside className="rounded-lg border border-slate-800 bg-slate-950 p-5">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
              <FileText className="h-4 w-4" />
              Review result
            </p>
            {result ? (
              <div className="mt-4">
                {result.repositorySource ? (
                  <div className="mb-3 rounded-lg border border-cyan-300/25 bg-cyan-300/10 p-3 text-sm font-semibold leading-6 text-cyan-50">
                    Scanned {result.repositorySource.filesLoaded || 0} of {result.repositorySource.totalFilesDiscovered || 0} discovered repo files from {result.repositorySource.owner}/{result.repositorySource.repo}.
                    {result.repositorySource.truncated ? " Free review coverage was capped." : ""}
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="Readiness" value={`${readiness}/100`} />
                  <Metric label="State" value={state} />
                  <Metric label="Security" value={`${Number(result.securityScore || 0)}`} />
                  <Metric label="Risk" value={String(result.riskLevel || "unknown").toUpperCase()} />
                </div>
                {result.inputTruncated ? (
                  <p className="mt-3 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm font-semibold text-amber-50">
                    Input was truncated for the free review limit.
                  </p>
                ) : null}
                <div className="mt-4 grid gap-2">
                  {topIssues.length ? topIssues.map((issue) => (
                    <div key={`${issue.severity}:${issue.title}`} className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-100">{issue.severity || "issue"}</p>
                      <p className="mt-1 text-sm font-black text-white">{issue.title || "Untitled issue"}</p>
                      <p className="mt-2 text-xs font-semibold leading-5 text-amber-50">{issue.evidence || issue.fixSuggestion || "Evidence returned by free review scan."}</p>
                    </div>
                  )) : (
                    <p className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-sm font-semibold text-slate-300">No top issues returned in this limited scan.</p>
                  )}
                </div>
                <div className="mt-4 rounded-lg border border-emerald-300/30 bg-emerald-300/10 p-3">
                  <p className="text-sm font-black text-emerald-50">Want the professional version?</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-emerald-100">
                    Move from preview to a verified report when a buyer, customer, or auditor needs evidence.
                  </p>
                </div>
                <Link
                  href={paidUrl}
                  onClick={() => void trackProductEvent("free_review.paid_cta_clicked", {
                    source: "free_review_result_card",
                    framework,
                    repositoryUrl: repoUrl,
                    riskLevel: result.riskLevel,
                    counts: { hadScanResult: true, readinessScore: readiness, issueCount: topIssues.length },
                  })}
                  className={buttonClassName({ className: "mt-3 w-full" })}
                >
                  Generate Buyer-Ready Report <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <p className="mt-4 text-sm font-semibold leading-6 text-slate-400">
                The free review result appears here after the scan. It is a preview for feedback, not a buyer-ready signed report.
              </p>
            )}
          </aside>
        </section>

        <section className="mt-5 rounded-lg border border-slate-800 bg-slate-950 p-5">
          <form className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_180px]" onSubmit={sendFeedback}>
            <label>
              <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Email</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                required
                placeholder="reviewer@example.com"
                className="mt-2 h-11 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-white outline-none focus:border-emerald-300"
              />
            </label>
            <label>
              <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Feedback</span>
              <input
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                required
                placeholder="What was useful, confusing, or worth paying for?"
                className="mt-2 h-11 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-white outline-none focus:border-emerald-300"
              />
            </label>
            <div className="flex items-end">
              <Button type="submit" className="w-full" disabled={feedbackBusy}>
                {feedbackBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Send
              </Button>
            </div>
          </form>
          {message ? <p className="mt-3 rounded-lg border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm font-semibold text-emerald-100">{message}</p> : null}
          {error ? <p className="mt-3 rounded-lg border border-red-300/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-100">{error}</p> : null}
        </section>
        <StickyConversionBar
          eyebrow="Free first step"
          title="Run the preview, then generate a buyer-ready passport."
          primaryLabel="Start Free Review"
          primaryHref="#source-input"
          secondaryLabel="Upgrade"
          secondaryHref="/software-appraisal"
          source="free_review_sticky"
        />
    </InstitutionalPageShell>
  );
}

async function trackProductEvent(
  event: string,
  payload: {
    source: string;
    framework?: string;
    riskLevel?: unknown;
    repositoryUrl?: string;
    counts?: Record<string, number | boolean>;
    metadata?: Record<string, unknown>;
  },
) {
  try {
    await fetch("/api/product-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, ...payload }),
      keepalive: true,
    });
  } catch {
    // Product telemetry must never block the review flow.
  }
}

function SignalCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <article className="rounded-lg border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-emerald-300/25 bg-emerald-300/10 text-emerald-200">
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</span>
          <span className="mt-1 block truncate text-sm font-black text-white">{value}</span>
        </span>
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-black text-white">{value}</p>
    </div>
  );
}

function OfferCell({
  title,
  price,
  description,
  actionLabel,
  href,
  primary = false,
}: {
  title: string;
  price: string;
  description: string;
  actionLabel: string;
  href: string;
  primary?: boolean;
}) {
  return (
    <article className={["rounded-lg border p-4", primary ? "border-emerald-300/40 bg-emerald-300/10" : "border-slate-800 bg-slate-950"].join(" ")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
            <FileText className="h-4 w-4" />
            Public price
          </p>
          <h2 className="mt-2 text-xl font-black text-white">{title}</h2>
        </div>
        <p className="text-2xl font-black text-emerald-100">{price}</p>
      </div>
      <p className="mt-3 min-h-[72px] text-sm font-semibold leading-6 text-slate-300">{description}</p>
      <Link href={href} className={buttonClassName({ variant: primary ? "default" : "outline", className: "mt-4 w-full" })}>
        {actionLabel}
      </Link>
    </article>
  );
}
