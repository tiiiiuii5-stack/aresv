"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Code2, FileText, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { InstitutionalPageShell } from "@/components/institutional/institutional-shell";
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
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const viewTracked = useRef(false);

  const topIssues = useMemo(() => (result?.issues || []).slice(0, 3), [result]);
  const readiness = Number(result?.productionReadinessScore || 0);
  const qualityScore = result ? clampScore(result.failureScore ? 100 - Number(result.failureScore) : readiness) : 0;
  const safetyScore = result ? clampScore(result.securityScore || readiness) : 0;
  const buyerScore = result ? clampScore(Math.round((readiness + qualityScore + safetyScore) / 3)) : 0;
  const state = readiness >= 85 ? "READY" : readiness >= 65 ? "RISKY" : "BLOCKED";
  const verdict = verdictFor(readiness, result?.riskLevel);
  const decision = decisionFor(state);
  const primaryFixes = useMemo(() => {
    const fixes = [
      ...(result?.launchVerdict?.blockers || []),
      ...(result?.launchVerdict?.warnings || []),
      ...(result?.recommendations || []),
      ...topIssues.map((issue) => issue.fixSuggestion || issue.title || "").filter(Boolean),
    ];
    return [...new Set(fixes.map((item) => safeText(item)).filter(Boolean))].slice(0, 4);
  }, [result, topIssues]);
  const repoReady = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+/i.test(repoUrl.trim()) || /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoUrl.trim());
  const sourceReady = repoReady || code.trim().length >= 40;
  const paidUrl = `/appraisal-intake?offer=buyer-ready${repoUrl.trim() ? `&repo=${encodeURIComponent(repoUrl.trim())}` : ""}&framework=${encodeURIComponent(framework)}`;

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
      setMessage("Buyer verdict ready.");
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

  return (
    <InstitutionalPageShell
      purposeLabel="Free Review"
      maxWidth="max-w-6xl"
      actions={[
        { label: "Sample", href: "/sample-appraisal", variant: "outline" },
        { label: "Pricing", href: "/pricing", variant: "outline" },
        { label: "Buyer Report", href: paidUrl, variant: "default" },
      ]}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Free Review" },
      ]}
    >
        <section className="py-8">
          <p className="text-xs font-black uppercase tracking-normal text-emerald-300">Free software verdict</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-normal text-white sm:text-5xl">
            Run the scan. Get the buyer answer.
          </h1>
          <p className="mt-4 max-w-2xl text-base font-semibold leading-8 text-slate-300">
            One input. One verdict. VentureOS shows quality, safety, buyer readiness, top risks, and what to fix next.
          </p>
        </section>

        <section id="source-input" className="rounded-xl border border-emerald-300/30 bg-slate-950 p-5 shadow-2xl shadow-emerald-950/20">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-normal text-emerald-300">
                  <Code2 className="h-4 w-4" />
                  Paste software
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">Public GitHub repo or code sample</h2>
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
                  {scanBusy ? "Scanning" : "Get Verdict"}
                </Button>
              </div>
            </div>
            <label className="mt-4 block">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Public GitHub repository URL</span>
              <input
                value={repoUrl}
                onChange={(event) => setRepoUrl(event.target.value)}
                type="url"
                placeholder="https://github.com/username/repo"
                className="mt-2 h-11 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-white outline-none focus:border-emerald-300"
              />
              <span className="mt-2 block text-xs font-semibold leading-5 text-slate-500">
                Public GitHub repos produce the strongest free verdict.
              </span>
            </label>
            <textarea
              value={code}
              onChange={(event) => setCode(event.target.value.slice(0, 6_000))}
              className="mt-4 min-h-[360px] w-full resize-y rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100 outline-none focus:border-emerald-300"
              aria-label="Code to scan"
            />
            <p className="mt-2 text-xs font-semibold text-slate-500">
              No repo? Paste a small code sample here.
            </p>
        </section>

        {message ? <p className="mt-4 rounded-lg border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm font-semibold text-emerald-100">{message}</p> : null}
        {error ? <p className="mt-4 rounded-lg border border-red-300/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-100">{error}</p> : null}

        <section className="mt-5 rounded-xl border border-slate-800 bg-slate-950 p-5">
          <div className="flex flex-col gap-3 border-b border-slate-800 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-normal text-slate-500">
                <FileText className="h-4 w-4" />
                Buyer verdict
              </p>
              <h2 className="mt-2 text-3xl font-black text-white">{result ? verdict.title : "Waiting for scan"}</h2>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-400">
                {result ? verdict.detail : "Run the free scan to generate the verdict, scorecard, risks, and recommended next step."}
              </p>
            </div>
            <span className={["rounded-full border px-4 py-2 text-sm font-black", result ? verdict.className : "border-slate-700 bg-slate-900 text-slate-300"].join(" ")}>
              {result ? state : "NOT SCANNED"}
            </span>
          </div>

          {result ? (
            <div className="mt-5 grid gap-5">
              <div className="grid gap-3 md:grid-cols-4">
                <ScoreMeter label="Buyer Readiness" value={buyerScore} />
                <ScoreMeter label="Quality" value={qualityScore} />
                <ScoreMeter label="Safety" value={safetyScore} />
                <ScoreMeter label="Launch Risk" value={riskLabel(result.riskLevel)} text />
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                  <p className="text-xs font-black uppercase tracking-normal text-slate-500">Decision</p>
                  <h3 className="mt-2 text-2xl font-black text-white">{decision.title}</h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">{decision.detail}</p>
                  {result.repositorySource ? (
                    <p className="mt-3 rounded-lg border border-cyan-300/25 bg-cyan-300/10 p-3 text-sm font-semibold leading-6 text-cyan-50">
                      Evidence read: {result.repositorySource.filesLoaded || 0} of {result.repositorySource.totalFilesDiscovered || 0} repo files from {result.repositorySource.owner}/{result.repositorySource.repo}.
                    </p>
                  ) : null}
                  {result.inputTruncated ? (
                    <p className="mt-3 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm font-semibold text-amber-50">
                      Free scan coverage was capped. Use Buyer-Ready Report for broader evidence.
                    </p>
                  ) : null}
                </div>

                <div className="rounded-lg border border-emerald-300/30 bg-emerald-300/10 p-4">
                  <p className="text-xs font-black uppercase tracking-normal text-emerald-200">Recommended next step</p>
                  <p className="mt-2 text-lg font-black text-white">{decision.cta}</p>
                  <Link
                    href={paidUrl}
                    onClick={() => void trackProductEvent("free_review.paid_cta_clicked", {
                      source: "free_review_verdict",
                      framework,
                      repositoryUrl: repoUrl,
                      riskLevel: result.riskLevel,
                      counts: { hadScanResult: true, readinessScore: readiness, issueCount: topIssues.length },
                    })}
                    className={buttonClassName({ className: "mt-4 w-full" })}
                  >
                    Generate Buyer Report <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <FindingPanel title="Top risks" empty="No major risks returned in this limited scan.">
                  {topIssues.map((issue) => (
                    <Finding key={`${issue.severity}:${issue.title}`} eyebrow={issue.severity || issue.category || "issue"} title={issue.title || "Untitled risk"} detail={issue.evidence || issue.fixSuggestion || "Evidence returned by free review scan."} />
                  ))}
                </FindingPanel>

                <FindingPanel title="Fix next" empty="No specific fixes returned in this limited scan.">
                  {primaryFixes.map((fix) => (
                    <Finding key={fix} eyebrow="recommended" title={fix} detail="Complete this before sharing the software with a serious buyer or production reviewer." />
                  ))}
                </FindingPanel>
              </div>
            </div>
          ) : (
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {["Buyer verdict", "Quality / Safety scores", "Top risks + fixes"].map((item) => (
                <div key={item} className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                  <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                  <p className="mt-3 text-sm font-black text-white">{item}</p>
                </div>
              ))}
            </div>
          )}
        </section>
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

function ScoreMeter({ label, value, text = false }: { label: string; value: number | string; text?: boolean }) {
  const numeric = typeof value === "number" ? value : 0;
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      <p className="text-xs font-black uppercase tracking-normal text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-black text-white">{text ? value : `${numeric}/100`}</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-emerald-300" style={{ width: text ? "100%" : `${numeric}%` }} />
      </div>
    </div>
  );
}

function FindingPanel({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const hasChildren = Boolean(children) && (!Array.isArray(children) || children.length > 0);
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      <p className="text-xs font-black uppercase tracking-normal text-slate-500">{title}</p>
      <div className="mt-3 grid gap-3">
        {hasChildren ? children : <p className="text-sm font-semibold text-slate-300">{empty}</p>}
      </div>
    </div>
  );
}

function Finding({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3">
      <p className="text-xs font-black uppercase tracking-normal text-amber-100">{eyebrow}</p>
      <p className="mt-1 text-sm font-black text-white">{title}</p>
      <p className="mt-2 text-xs font-semibold leading-5 text-amber-50">{detail}</p>
    </div>
  );
}

function clampScore(value: number) {
  const number = Math.round(Number(value || 0));
  return Math.max(0, Math.min(100, Number.isFinite(number) ? number : 0));
}

function verdictFor(score: number, riskLevel: unknown) {
  const risk = String(riskLevel || "").toLowerCase();
  if (score >= 85 && !/high|critical/.test(risk)) {
    return {
      title: "Looks buyer-ready for first review.",
      detail: "The free scan found enough positive signals for a serious conversation, subject to normal internal diligence.",
      className: "border-emerald-300/40 bg-emerald-300/10 text-emerald-100",
    };
  }
  if (score >= 65) {
    return {
      title: "Promising, but needs cleanup before buyer review.",
      detail: "The software has useful signals, but the scan found risks or unknowns that should be fixed before sharing broadly.",
      className: "border-amber-300/40 bg-amber-300/10 text-amber-100",
    };
  }
  return {
    title: "Do not present this as buyer-ready yet.",
    detail: "The free scan found enough risk that you should fix fundamentals before using this in a buyer, customer, or production review.",
    className: "border-red-300/40 bg-red-500/10 text-red-100",
  };
}

function decisionFor(state: string) {
  if (state === "READY") {
    return {
      title: "Proceed to signed report.",
      detail: "Use the paid report when you need a shareable artifact with stronger evidence boundaries and buyer-facing language.",
      cta: "Generate the buyer-ready report.",
    };
  }
  if (state === "RISKY") {
    return {
      title: "Fix the top issues, then rescan.",
      detail: "This is not a rejection. It means the software needs targeted cleanup before it will read as credible to a buyer.",
      cta: "Create the report after cleanup.",
    };
  }
  return {
    title: "Block buyer sharing for now.",
    detail: "Treat this as an internal repair list. Do not lead with a public trust claim until the high-risk findings are addressed.",
    cta: "Use the report as a fix plan.",
  };
}

function riskLabel(value: unknown) {
  return String(value || "unknown").replace(/[_-]+/g, " ").toUpperCase();
}

function safeText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
