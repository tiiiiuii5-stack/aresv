"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Code2, FileText, Loader2, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { InstitutionalPageShell } from "@/components/institutional/institutional-shell";
import { Button } from "@/components/ui/button";

type ReviewIssue = {
  id?: string;
  title?: string;
  severity?: string;
  category?: string;
  evidence?: string;
  fixSuggestion?: string;
};

type TrustDecisionItem = {
  kind?: "OBSERVED" | "INFERRED" | "UNKNOWN";
  text?: string;
  source?: string;
};

type ReviewResult = {
  ok?: boolean;
  inputLimit?: number;
  inputTruncated?: boolean;
  rawScores?: {
    securityScore?: number;
    failureScore?: number;
    productionReadinessScore?: number;
    riskLevel?: string;
  };
  evidenceCoverage?: {
    level?: string;
    confidence?: number;
    coverageRatio?: number | null;
    coveragePercent?: number | null;
    filesLoaded?: number | null;
    totalFilesDiscovered?: number | null;
    scoreCap?: number;
    scoreCapped?: boolean;
    warnings?: string[];
  };
  securityScore?: number;
  failureScore?: number;
  productionReadinessScore?: number;
  decision?: {
    answer?: "BUY" | "INVESTIGATE" | "AVOID";
    headline?: string;
    summary?: string;
    confidence?: number;
    coveragePercent?: number | null;
    coverageLabel?: string;
    riskLevel?: string;
    primaryReasons?: string[];
    observed?: TrustDecisionItem[];
    inferred?: TrustDecisionItem[];
    unknown?: TrustDecisionItem[];
    nextActions?: string[];
  };
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
  sbom?: {
    status?: string;
    completeness?: string;
    bomHash?: string;
    manifestCount?: number;
    componentCount?: number;
    directDependencyCount?: number;
    devDependencyCount?: number;
    packageManagers?: string[];
    riskFlags?: string[];
    componentsPreview?: Array<{ name?: string; version?: string; scope?: string }>;
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
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [error, setError] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadRole, setLeadRole] = useState("Founder / owner");
  const [sampleMode] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("sample") === "1");
  const [leadBusy, setLeadBusy] = useState(false);
  const [leadMessage, setLeadMessage] = useState("");
  const [leadError, setLeadError] = useState("");
  const [message, setMessage] = useState("");
  const viewTracked = useRef(false);
  const autoScanStarted = useRef(false);
  const upgradeShownTracked = useRef("");

  const topIssues = useMemo(() => (result?.issues || []).slice(0, 3), [result]);
  const readiness = Number(result?.productionReadinessScore || 0);
  const qualityScore = result ? clampScore(result.failureScore ? 100 - Number(result.failureScore) : readiness) : 0;
  const safetyScore = result ? clampScore(result.securityScore || readiness) : 0;
  const buyerScore = result ? clampScore(Math.round((readiness + qualityScore + safetyScore) / 3)) : 0;
  const state = readiness >= 85 ? "READY" : readiness >= 65 ? "RISKY" : "BLOCKED";
  const verdict = verdictFor(readiness, result?.riskLevel);
  const decision = decisionFor(state);
  const trustDecision = result?.decision;
  const trustDecisionTone = decisionToneFor(trustDecision?.answer);
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
  const trackedPaidUrl = trackingHref("appraisal_intake.checkout_clicked", paidUrl, "free_review");
  const shareableRepoUrl = repoReady ? repoUrl.trim() : "";

  const recordLeadInterest = useCallback(async ({
    source,
    useCase,
    clearOnSuccess = false,
  }: {
    source: string;
    useCase: string;
    clearOnSuccess?: boolean;
  }) => {
    const cleanLeadEmail = leadEmail.trim().toLowerCase();
    if (!cleanLeadEmail) return false;
    const response = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: cleanLeadEmail,
        role: leadRole,
        source,
        useCase,
        ...campaignMetadataFromLocation(),
      }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(payload.error || "Could not save this request.");
    if (clearOnSuccess) setLeadEmail("");
    return true;
  }, [leadEmail, leadRole]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const incomingRepo = params.get("repo");
    if (!incomingRepo || repoUrl) return;
    const timeout = window.setTimeout(() => setRepoUrl(incomingRepo), 0);
    return () => window.clearTimeout(timeout);
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

  useEffect(() => {
    if (!result) return;
    const key = `${result.productionReadinessScore || 0}:${result.riskLevel || "unknown"}:${repoUrl || "code"}`;
    if (upgradeShownTracked.current === key) return;
    upgradeShownTracked.current = key;
    void trackProductEvent("free_review.upgrade_shown", {
      source: "free_review_verdict",
      framework,
      repositoryUrl: repoUrl,
      riskLevel: result.riskLevel,
      counts: {
        readinessScore: Number(result.productionReadinessScore || 0),
        buyerScore,
        issueCount: topIssues.length,
        hasRepositorySource: Boolean(result.repositorySource),
      },
    });
  }, [buyerScore, framework, repoUrl, result, topIssues.length]);

  const runReviewScan = useCallback(async () => {
    if (!sourceReady) {
      setError("Enter a public GitHub repository URL or paste at least 40 characters of code.");
      return;
    }
    setScanBusy(true);
    setError("");
    setMessage("");
    setResult(null);
    try {
      await trackProductEvent("free_review.scan_started", {
        source: "free_review",
        framework,
        repositoryUrl: repoUrl,
        metadata: campaignMetadataFromLocation(),
        counts: {
          hasRepositoryUrl: repoReady,
          hasPastedCode: code.trim().length >= 40,
          pastedCharacters: code.trim().length,
        },
      });
      if (leadEmail.trim()) {
        void recordLeadInterest({
          source: "free_review_scan_start",
          useCase: [
            `Started free review`,
            `Repo: ${repoUrl || "pasted code"}`,
            `Framework: ${framework}`,
          ].join(" | "),
          clearOnSuccess: false,
        }).then((stored) => {
          if (stored) setLeadMessage("Saved. We can send the review path after the scan.");
        }).catch((leadSaveError) => {
          setLeadError(leadSaveError instanceof Error ? leadSaveError.message : "Could not save this request.");
        });
      }
      setMessage("Analyzing code structure...");
      const response = await fetch("/api/public-demo-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appCode: code,
          repositoryUrl: repoUrl,
          framework,
          modules: ["appraisal", "auth", "stripe", "prisma"],
          ...campaignMetadataFromLocation(),
        }),
      });
      const payload = await response.json().catch(() => ({})) as ReviewResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Free review scan failed.");
      setResult(payload);
      setMessage("Decision ready.");
      await trackProductEvent("free_review.scan_completed", {
        source: "free_review",
        framework,
        repositoryUrl: repoUrl,
        riskLevel: payload.riskLevel,
        metadata: campaignMetadataFromLocation(),
        counts: {
          readinessScore: Number(payload.productionReadinessScore || 0),
          issueCount: Array.isArray(payload.issues) ? payload.issues.length : 0,
          inputTruncated: Boolean(payload.inputTruncated),
          repositoryFilesLoaded: payload.repositorySource?.filesLoaded || 0,
          repositoryTruncated: Boolean(payload.repositorySource?.truncated),
        },
      });
    } catch (scanError) {
      const errorMsg = scanError instanceof Error ? scanError.message : "Free review scan failed.";
      setError(errorMsg);
      await trackProductEvent("free_review.scan_failed", {
        source: "free_review",
        framework,
        repositoryUrl: repoUrl,
        metadata: { ...campaignMetadataFromLocation(), reason: errorMsg.slice(0, 120) },
      });
    } finally {
      setScanBusy(false);
    }
  }, [code, framework, leadEmail, recordLeadInterest, repoReady, repoUrl, sourceReady]);

  useEffect(() => {
    if (autoScanStarted.current || scanBusy || result || !repoReady) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.get("repo")) return;
    autoScanStarted.current = true;
    const samplePreview = params.get("sample") === "1";
    const timeout = window.setTimeout(() => {
      setMessage(samplePreview ? "Starting a sample decision preview. Paste your own repo above when ready." : "Repo received. Starting the free decision preview...");
      void runReviewScan();
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [repoReady, result, runReviewScan, scanBusy]);

  function handleRetry() {
    setError("");
    setMessage("");
    void runReviewScan();
  }

  const startBuyerReportCheckout = useCallback(async () => {
    if (!result || checkoutBusy) return;
    setCheckoutBusy(true);
    setCheckoutError("");
    try {
      await trackProductEvent("free_review.paid_cta_clicked", {
        source: "free_review_verdict",
        framework,
        repositoryUrl: repoUrl,
        riskLevel: result.riskLevel,
        counts: { hadScanResult: true, readinessScore: readiness, issueCount: topIssues.length },
      });
      const response = await fetch("/api/appraisal-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offer: "buyer-ready",
          repoUrl,
          framework,
          ...campaignMetadataFromLocation(),
        }),
      });
      const payload = await response.json().catch(() => ({})) as { url?: string; error?: string };
      if (!response.ok || typeof payload.url !== "string") {
        throw new Error(payload.error || "Checkout could not be started.");
      }
      window.location.assign(payload.url);
    } catch (checkoutStartError) {
      setCheckoutError(checkoutStartError instanceof Error ? checkoutStartError.message : "Checkout could not be started.");
    } finally {
      setCheckoutBusy(false);
    }
  }, [checkoutBusy, framework, readiness, repoUrl, result, topIssues.length]);

  const copyShareLink = useCallback(async () => {
    if (!shareableRepoUrl) return;
    const shareUrl = new URL("/free-review", window.location.origin);
    shareUrl.searchParams.set("repo", shareableRepoUrl);
    shareUrl.searchParams.set("framework", framework);
    copyCampaignParamsToUrl(shareUrl);
    try {
      await navigator.clipboard.writeText(shareUrl.toString());
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2200);
    } catch {
      setCheckoutError(`Copy failed. Use this link: ${shareUrl.toString()}`);
    }
    await trackProductEvent("free_review.share_clicked", {
      source: "free_review_result",
      framework,
      repositoryUrl: shareableRepoUrl,
      riskLevel: result?.riskLevel,
      metadata: campaignMetadataFromLocation(),
      counts: {
        hadScanResult: Boolean(result),
      },
    });
  }, [framework, result, shareableRepoUrl]);

  const saveVerdictLead = useCallback(async () => {
    if (!result || leadBusy) return;
    const cleanLeadEmail = leadEmail.trim().toLowerCase();
    if (!cleanLeadEmail) {
      setLeadError("Enter an email to save this decision.");
      return;
    }
    setLeadBusy(true);
    setLeadMessage("");
    setLeadError("");
    try {
      await recordLeadInterest({
        source: "free_review_verdict",
        useCase: [
          `Decision: ${result.decision?.answer || "INVESTIGATE"}`,
          `Repo: ${repoUrl || "pasted code"}`,
          `Framework: ${framework}`,
          `Coverage: ${coverageLabelFor(result.decision, result)}`,
          `Risk: ${riskLabel(result.riskLevel)}`,
        ].join(" | "),
        clearOnSuccess: true,
      });
      await trackProductEvent("free_review.feedback_submitted", {
        source: "free_review_verdict",
        framework,
        repositoryUrl: repoUrl,
        riskLevel: result.riskLevel,
        metadata: campaignMetadataFromLocation(),
        counts: {
          hadScanResult: true,
          leadCaptured: true,
          readinessScore: Number(result.productionReadinessScore || 0),
          issueCount: Array.isArray(result.issues) ? result.issues.length : 0,
        },
      });
      setLeadMessage("Saved. We will use this to follow up with the full report path or a human-assisted review.");
    } catch (saveError) {
      setLeadError(saveError instanceof Error ? saveError.message : "Could not save this verdict.");
    } finally {
      setLeadBusy(false);
    }
  }, [framework, leadBusy, leadEmail, recordLeadInterest, repoUrl, result]);

  return (
    <InstitutionalPageShell
      purposeLabel="Free Review"
      maxWidth="max-w-6xl"
      actions={[
        { label: "Sample", href: "/sample-appraisal", variant: "outline" },
        { label: "Pricing", href: "/pricing", variant: "outline" },
        { label: "Buyer Report", href: trackedPaidUrl, variant: "default" },
      ]}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Free Review" },
      ]}
    >
        <section className="py-8">
          <p className="text-xs font-black uppercase tracking-normal text-emerald-300">Software trust terminal</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-normal text-white sm:text-5xl">
            Paste software. Get a decision.
          </h1>
          <p className="mt-4 max-w-2xl text-base font-semibold leading-8 text-slate-300">
            VentureOS turns a repo, SaaS product, package, or code sample into BUY, INVESTIGATE, or AVOID with observed evidence, reasonable inferences, unknowns, and next actions. Repo links from the homepage start automatically.
          </p>
          {sampleMode ? (
            <div className="mt-5 max-w-2xl rounded-xl border border-cyan-300/30 bg-cyan-300/10 p-4 text-sm font-semibold leading-6 text-cyan-50">
              Sample preview is running from a public VentureOS repo so you can see the output immediately. Replace the repository URL below to review your own software.
            </div>
          ) : null}
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
            <div className="mt-4 grid gap-3 rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-3 sm:grid-cols-[minmax(0,1fr)_180px]">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-normal text-emerald-100">Optional: email me the result path</span>
                <input
                  value={leadEmail}
                  onChange={(event) => setLeadEmail(event.target.value)}
                  type="email"
                  placeholder="you@company.com"
                  className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm font-semibold text-white outline-none placeholder:text-emerald-50/35 focus:border-emerald-300"
                />
              </label>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-normal text-emerald-100">Role</span>
                <select
                  value={leadRole}
                  onChange={(event) => setLeadRole(event.target.value)}
                  className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm font-semibold text-white outline-none focus:border-emerald-300"
                >
                  <option>Founder / owner</option>
                  <option>Buyer / investor</option>
                  <option>Security reviewer</option>
                  <option>Operator / engineering lead</option>
                </select>
              </label>
              {leadMessage ? <p className="sm:col-span-2 text-xs font-bold leading-5 text-emerald-100">{leadMessage}</p> : null}
              {leadError ? <p className="sm:col-span-2 text-xs font-bold leading-5 text-red-100">{leadError}</p> : null}
            </div>
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
        {error ? (
          <div className="mt-4 rounded-lg border border-red-300/30 bg-red-500/10 px-3 py-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-red-100">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              disabled={scanBusy}
              className="ml-3"
            >
              Retry
            </Button>
          </div>
        ) : null}

        <section className="mt-5 rounded-xl border border-slate-800 bg-slate-950 p-5">
          <div className="flex flex-col gap-3 border-b border-slate-800 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-normal text-slate-500">
                <FileText className="h-4 w-4" />
                Software decision
              </p>
              <h2 className="mt-2 text-3xl font-black text-white">
                {result ? `Decision: ${trustDecision?.answer || "INVESTIGATE"}` : scanBusy ? "Generating..." : "Waiting for scan"}
              </h2>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-400">
                {result ? trustDecision?.headline || verdict.title : scanBusy ? "Analyzing the evidence boundary, risk signals, and unknowns..." : "Run the free scan to generate a decision, evidence summary, unknowns, and recommended next step."}
              </p>
            </div>
            <span className={["rounded-full border px-4 py-2 text-sm font-black",
              result ? trustDecisionTone.className : scanBusy ? "border-slate-700 bg-slate-900 text-slate-300 animate-pulse" : "border-slate-700 bg-slate-900 text-slate-300"
            ].join(" ")}>
              {result ? trustDecision?.answer || state : scanBusy ? "SCANNING..." : "NOT SCANNED"}
            </span>
          </div>

          {scanBusy && !result ? (
            <div className="mt-5 grid gap-5 animate-pulse">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="h-32 rounded-lg bg-slate-800/50" />
                <div className="h-32 rounded-lg bg-slate-800/50" />
                <div className="h-32 rounded-lg bg-slate-800/50" />
                <div className="h-32 rounded-lg bg-slate-800/50" />
              </div>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="h-48 rounded-lg bg-slate-800/50" />
                <div className="h-48 rounded-lg bg-slate-800/50" />
              </div>
            </div>
          ) : null}

          {result ? (
            <div className="mt-5 grid gap-5">
              <DecisionMemoPanel decision={trustDecision} fallbackDetail={verdict.detail} toneClassName={trustDecisionTone.panelClassName} />

              <section className="rounded-lg border border-emerald-300/30 bg-emerald-300/10 p-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
                  <div>
                    <p className="text-xs font-black uppercase tracking-normal text-emerald-100">Save this decision</p>
                    <h3 className="mt-2 text-2xl font-black text-white">Send the verdict path to yourself</h3>
                    <p className="mt-2 text-sm font-semibold leading-6 text-emerald-50/80">
                      Use this if you want the full report path, a buyer-ready review, or a human-assisted check. This is the demand signal VentureOS tracks for real users.
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px]">
                    <input
                      value={leadEmail}
                      onChange={(event) => setLeadEmail(event.target.value)}
                      type="email"
                      placeholder="you@company.com"
                      className="h-11 rounded-lg border border-white/10 bg-black/30 px-3 text-sm font-semibold text-white outline-none placeholder:text-emerald-50/35 focus:border-emerald-300"
                    />
                    <select
                      value={leadRole}
                      onChange={(event) => setLeadRole(event.target.value)}
                      className="h-11 rounded-lg border border-white/10 bg-black/30 px-3 text-sm font-semibold text-white outline-none focus:border-emerald-300"
                      aria-label="Role"
                    >
                      <option>Founder / owner</option>
                      <option>Buyer / investor</option>
                      <option>Security reviewer</option>
                      <option>Operator / engineering lead</option>
                    </select>
                    <Button type="button" onClick={saveVerdictLead} disabled={leadBusy || !leadEmail.trim()} className="sm:col-span-2">
                      {leadBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {leadBusy ? "Saving" : "Send me this decision"}
                    </Button>
                    {leadMessage ? <p className="sm:col-span-2 text-xs font-bold leading-5 text-emerald-100">{leadMessage}</p> : null}
                    {leadError ? <p className="sm:col-span-2 text-xs font-bold leading-5 text-red-100">{leadError}</p> : null}
                  </div>
                </div>
              </section>

              <div>
                <p className="mb-3 text-xs font-black uppercase tracking-normal text-slate-500">Reference metrics</p>
                <div className="grid gap-3 md:grid-cols-4">
                  <ScoreMeter label="Confidence" value={Number(trustDecision?.confidence ?? result.evidenceCoverage?.confidence ?? 0)} />
                  <ScoreMeter label="Coverage" value={coverageLabelFor(trustDecision, result)} text />
                  <ScoreMeter label="Readiness" value={buyerScore} />
                  <ScoreMeter label="Risk" value={riskLabel(result.riskLevel)} text />
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                  <p className="text-xs font-black uppercase tracking-normal text-slate-500">Why this decision exists</p>
                  <h3 className="mt-2 text-2xl font-black text-white">{trustDecision?.headline || decision.title}</h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">{trustDecision?.summary || decision.detail}</p>
                  {result.evidenceCoverage ? (
                    <div className="mt-3 rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm font-semibold leading-6 text-amber-50">
                      <p className="font-black uppercase">Confidence: {Number(trustDecision?.confidence ?? result.evidenceCoverage.confidence ?? 0)}%</p>
                      <p className="mt-1">
                        Coverage is {String(result.evidenceCoverage.level || "limited")}
                        {typeof result.evidenceCoverage.coveragePercent === "number" ? ` (${result.evidenceCoverage.coveragePercent}% of discovered files)` : ""}
                        {coverageCapText(result.evidenceCoverage)}
                      </p>
                      {result.rawScores?.productionReadinessScore && result.rawScores.productionReadinessScore > readiness ? (
                        <p className="mt-1 text-xs text-amber-100/85">
                          Raw scanner readiness was {result.rawScores.productionReadinessScore}/100 before evidence coverage was applied.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
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
                  <p className="mt-2 text-lg font-black text-white">{trustDecision?.nextActions?.[0] || decision.cta}</p>
                  <Button
                    type="button"
                    onClick={startBuyerReportCheckout}
                    disabled={checkoutBusy}
                    className="mt-4 w-full"
                  >
                    {checkoutBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    {checkoutBusy ? "Starting checkout" : "Generate Buyer Report"}
                  </Button>
                  {checkoutError ? (
                    <p className="mt-3 rounded-lg border border-red-300/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-100">
                      {checkoutError}
                    </p>
                  ) : null}
                  <Link
                    href={trackingHref("appraisal_intake.checkout_clicked", paidUrl, "free_review_verdict_fallback")}
                    className="mt-3 inline-flex text-sm font-black text-emerald-100 underline decoration-emerald-300/50 underline-offset-4 hover:text-white"
                  >
                    Open the evidence form instead
                  </Link>
                  {shareableRepoUrl ? (
                    <div className="mt-4 rounded-lg border border-white/10 bg-slate-950/50 p-3">
                      <p className="text-xs font-black uppercase tracking-normal text-emerald-100">Bring a reviewer in</p>
                      <p className="mt-1 text-sm font-semibold leading-6 text-emerald-50/80">
                        Share the same repo preview with a buyer, teammate, or founder who needs to make the decision.
                      </p>
                      <Button type="button" variant="outline" size="sm" onClick={copyShareLink} className="mt-3 w-full">
                        {shareCopied ? "Copied" : "Copy review link"}
                      </Button>
                    </div>
                  ) : null}
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
              <DependencyHealthPanel sbom={result.sbom} />
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

function campaignMetadataFromLocation() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return {
    campaign: cleanCampaignParam(params.get("campaign") || params.get("utm_campaign")),
    ref: cleanCampaignParam(params.get("ref")),
    utmSource: cleanCampaignParam(params.get("utm_source")),
  };
}

function copyCampaignParamsToUrl(url: URL) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  for (const key of ["campaign", "ref", "utm_source", "utm_campaign"]) {
    const value = cleanCampaignParam(params.get(key));
    if (value) url.searchParams.set(key, value);
  }
}

function cleanCampaignParam(value: unknown) {
  return String(value || "").trim().replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 80);
}

function trackingHref(event: string, to: string, source: string) {
  const params = new URLSearchParams({ e: event, to, source });
  return `/t?${params.toString()}`;
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

function DecisionMemoPanel({
  decision,
  fallbackDetail,
  toneClassName,
}: {
  decision?: ReviewResult["decision"];
  fallbackDetail: string;
  toneClassName: string;
}) {
  const reasons = decision?.primaryReasons?.length ? decision.primaryReasons : [fallbackDetail];
  return (
    <section className={["rounded-lg border p-5", toneClassName].join(" ")}>
      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div>
          <p className="text-xs font-black uppercase tracking-normal opacity-80">Decision output</p>
          <p className="mt-2 text-5xl font-black tracking-normal text-white">{decision?.answer || "INVESTIGATE"}</p>
          <p className="mt-3 text-sm font-semibold leading-6 text-white/80">{decision?.summary || fallbackDetail}</p>
        </div>
        <div className="grid gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-normal text-white/60">Why</p>
            <div className="mt-2 grid gap-2">
              {reasons.slice(0, 5).map((reason) => (
                <p key={reason} className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold leading-6 text-white/85">{reason}</p>
              ))}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <EvidenceBucket title="Observed" items={decision?.observed} empty="No direct evidence returned." />
            <EvidenceBucket title="Inferred" items={decision?.inferred} empty="No inference returned." />
            <EvidenceBucket title="Unknown" items={decision?.unknown} empty="No unknowns returned." />
          </div>
        </div>
      </div>
    </section>
  );
}

function EvidenceBucket({ title, items, empty }: { title: string; items?: TrustDecisionItem[]; empty: string }) {
  const visibleItems = Array.isArray(items) ? items.filter((item) => item.text).slice(0, 3) : [];
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <p className="text-xs font-black uppercase tracking-normal text-white/60">{title}</p>
      <div className="mt-2 grid gap-2">
        {visibleItems.length ? visibleItems.map((item) => (
          <div key={`${title}:${item.text}`} className="text-xs font-semibold leading-5 text-white/80">
            <p>{item.text}</p>
            {item.source ? <p className="mt-1 font-mono text-[10px] uppercase text-white/45">{item.source}</p> : null}
          </div>
        )) : <p className="text-xs font-semibold leading-5 text-white/55">{empty}</p>}
      </div>
    </div>
  );
}

function DependencyHealthPanel({ sbom }: { sbom?: ReviewResult["sbom"] }) {
  if (!sbom) return null;
  const riskFlags = Array.isArray(sbom.riskFlags) ? sbom.riskFlags.slice(0, 3) : [];
  const components = Array.isArray(sbom.componentsPreview) ? sbom.componentsPreview.slice(0, 6) : [];
  return (
    <div className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-normal text-cyan-100">Dependency health</p>
          <h3 className="mt-2 text-2xl font-black text-white">SBOM preview</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-cyan-50">
            {Number(sbom.componentCount || 0)} component(s) from {Number(sbom.manifestCount || 0)} manifest(s). Completeness: {String(sbom.completeness || "unknown")}.
          </p>
        </div>
        <span className="rounded-full border border-cyan-200/35 px-3 py-1 text-xs font-black uppercase text-cyan-50">{String(sbom.status || "unknown")}</span>
      </div>
      {riskFlags.length ? (
        <div className="mt-4 grid gap-2">
          {riskFlags.map((flag) => (
            <p key={flag} className="rounded-md border border-cyan-200/20 bg-slate-950/40 px-3 py-2 text-sm font-semibold text-cyan-50">{flag}</p>
          ))}
        </div>
      ) : null}
      {components.length ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-black uppercase tracking-normal text-cyan-100">View sampled components</summary>
          <div className="mt-3 grid gap-1.5">
            {components.map((component) => (
              <p key={`${component.name}:${component.version}:${component.scope}`} className="font-mono text-xs font-semibold text-cyan-50/85">
                {component.name}@{component.version} - {component.scope}
              </p>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function ScoreMeter({ label, value, text = false }: { label: string; value: number | string; text?: boolean }) {
  const numeric = typeof value === "number" ? value : 0;
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 transition hover:border-slate-700 hover:bg-slate-900 hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-950">
      <p className="text-xs font-black uppercase tracking-normal text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-black text-white">{text ? value : `${numeric}/100`}</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-emerald-300 transition-all duration-300" style={{ width: text ? "100%" : `${numeric}%` }} />
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
    <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 transition hover:border-amber-300/50 hover:bg-amber-300/20 hover:shadow-lg hover:shadow-amber-900/20">
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

function decisionToneFor(answer: "BUY" | "INVESTIGATE" | "AVOID" | undefined) {
  if (answer === "BUY") {
    return {
      className: "border-emerald-300/40 bg-emerald-300/10 text-emerald-100",
      panelClassName: "border-emerald-300/30 bg-emerald-300/10",
    };
  }
  if (answer === "AVOID") {
    return {
      className: "border-red-300/40 bg-red-500/10 text-red-100",
      panelClassName: "border-red-300/30 bg-red-500/10",
    };
  }
  return {
    className: "border-amber-300/40 bg-amber-300/10 text-amber-100",
    panelClassName: "border-amber-300/30 bg-amber-300/10",
  };
}

function coverageLabelFor(decision: ReviewResult["decision"] | undefined, result: ReviewResult) {
  if (typeof decision?.coveragePercent === "number") return `${decision.coveragePercent}%`;
  if (typeof result.evidenceCoverage?.coveragePercent === "number") return `${result.evidenceCoverage.coveragePercent}%`;
  return String(decision?.coverageLabel || result.evidenceCoverage?.level || "limited").toUpperCase();
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
      detail: "Unlock the signed report when you need a shareable artifact with stronger evidence boundaries and buyer-facing language.",
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
  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title.trim() : "";
    const detail = typeof record.detail === "string" ? record.detail.trim() : "";
    const fixSuggestion = typeof record.fixSuggestion === "string" ? record.fixSuggestion.trim() : "";
    const evidence = typeof record.evidence === "string" ? record.evidence.trim() : "";
    const severity = typeof record.severity === "string" ? record.severity.trim() : "";
    const readable = [
      title,
      detail || fixSuggestion || evidence,
    ].filter(Boolean).join(": ");
    return severity && readable ? `${severity.toUpperCase()}: ${readable}` : readable;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function coverageCapText(coverage: NonNullable<ReviewResult["evidenceCoverage"]>) {
  if (typeof coverage.scoreCap !== "number") return ".";
  if (coverage.level === "complete") {
    return `, with preview scores capped at ${coverage.scoreCap}/100 because runtime operations, ownership, and incident history were not measured.`;
  }
  return `, so preview scores are capped at ${coverage.scoreCap}/100 because submitted evidence coverage is ${coverage.level}.`;
}
