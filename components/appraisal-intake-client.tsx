"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, Code2, Download, FileText, Loader2, ShieldAlert, ShieldCheck, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { APPRAISAL_OFFERS, type AppraisalOfferId } from "@/lib/appraisal/offers";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { showToast } from "@/components/ui/toast";

type IntakeState = "idle" | "checkout" | "previewing" | "appraising";
const PREVIEW_CODE_LIMIT = 6_000;

type PreviewResult = {
  score: number;
  riskLevel: string;
  issues: Array<{ title: string; severity: string }>;
};

type EvidenceCoverageResult = {
  score?: number;
  level?: string;
  scope?: string;
  scoreCap?: number;
  scoreCapped?: boolean;
  verifiedClaims?: string[];
  unknowns?: string[];
  unverifiedClaims?: string[];
};

type MoneyRangeResult = {
  label?: string;
  basis?: string;
  available?: boolean;
};

type AppraisalResult = {
  checkout?: {
    sessionId?: string;
    offer?: {
      id?: string;
      name?: string;
      priceLabel?: string;
    };
  };
  scan?: {
    readinessScore?: number;
    riskLevel?: string;
    issueCount?: number;
  };
  appraisal?: {
    publicId?: string;
    appraisalUrl?: string;
    certificateUrl?: string;
    badgeUrl?: string;
    badgeEmbedHtml?: string;
    grade?: string;
    launchVerdict?: string;
    readinessScore?: number;
    technicalValue?: MoneyRangeResult;
    publicSummary?: {
      evidenceCoverage?: EvidenceCoverageResult;
      unknowns?: string[];
      unverifiedClaims?: string[];
      technicalValue?: MoneyRangeResult;
    };
  };
  certificate?: {
    certificateId?: string;
    verificationUrl?: string;
    badgeUrl?: string;
  } | null;
};

export function AppraisalIntakeClient({
  checkoutStatus,
  initialOffer,
  sessionId,
  initialRepositoryUrl,
  initialFramework,
}: {
  checkoutStatus?: string;
  initialOffer?: string;
  sessionId?: string;
  initialRepositoryUrl?: string;
  initialFramework?: string;
}) {
  const [offerId, setOfferId] = useState<AppraisalOfferId>(offerIdFor(initialOffer));
  const [email, setEmail] = useState("");
  const [appName, setAppName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [contactRole, setContactRole] = useState("Founder / owner");
  const [appraisalPurpose, setAppraisalPurpose] = useState("launch-readiness");
  const [assetStage, setAssetStage] = useState("production");
  const [revenueStatus, setRevenueStatus] = useState("pre-revenue");
  const [deploymentTarget, setDeploymentTarget] = useState("vercel");
  const [activeUsers, setActiveUsers] = useState("");
  const [criticalSystems, setCriticalSystems] = useState("");
  const [knownConcerns, setKnownConcerns] = useState("");
  const [deadline, setDeadline] = useState("");
  const [evidenceChecks, setEvidenceChecks] = useState<Record<string, boolean>>({
    auth: false,
    billing: false,
    database: false,
    deployment: false,
    tests: false,
    ci: false,
    monitoring: false,
  });
  const [repoUrl, setRepoUrl] = useState(initialRepositoryUrl || "");
  const [framework, setFramework] = useState(initialFramework || "nextjs");
  const [code, setCode] = useState("");
  const [state, setState] = useState<IntakeState>("idle");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<AppraisalResult | null>(null);
  const viewTracked = useRef(false);
  const paid = true;
  const offer = useMemo(() => APPRAISAL_OFFERS.find((item) => item.id === offerId) || APPRAISAL_OFFERS[0], [offerId]);
  const codeReady = code.trim().length >= 80;
  const repoReady = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+/i.test(repoUrl.trim()) || /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoUrl.trim());
  const sourceReady = codeReady || repoReady;
  const checkedEvidenceCount = Object.values(evidenceChecks).filter(Boolean).length;
  const intakeCompleteness = Math.round(([
    Boolean(email.trim()),
    Boolean(appName.trim()),
    Boolean(companyName.trim() || website.trim()),
    Boolean(appraisalPurpose),
    Boolean(assetStage),
    Boolean(revenueStatus),
    Boolean(framework),
    Boolean(deploymentTarget),
    sourceReady,
    checkedEvidenceCount >= 2,
    Boolean(knownConcerns.trim() || criticalSystems.trim()),
  ].filter(Boolean).length / 11) * 100);
  const intakeContext = useMemo(() => ({
    companyName,
    website,
    contactRole,
    appraisalPurpose,
    assetStage,
    revenueStatus,
    deploymentTarget,
    activeUsers,
    criticalSystems,
    knownConcerns,
    deadline,
    evidenceChecklist: Object.entries(evidenceChecks).filter(([, value]) => value).map(([key]) => key),
    intakeCompleteness,
  }), [
    activeUsers,
    appraisalPurpose,
    assetStage,
    companyName,
    contactRole,
    criticalSystems,
    deadline,
    deploymentTarget,
    evidenceChecks,
    intakeCompleteness,
    knownConcerns,
    revenueStatus,
    website,
  ]);

  useEffect(() => {
    if (viewTracked.current) return;
    viewTracked.current = true;
    void trackProductEvent("appraisal_intake.view", {
      source: "appraisal_intake",
      framework,
      repositoryUrl: repoUrl,
      counts: { checkoutVerified: paid, hasInitialRepositoryUrl: Boolean(initialRepositoryUrl) },
    });
  }, [framework, initialRepositoryUrl, paid, repoUrl]);

  async function startCheckout() {
    showToast({ type: "success", title: "Launch access active", description: "Submit evidence and issue the report directly." });
  }

  async function runPreview() {
    if (!sourceReady) {
      showToast({ type: "info", title: "Source needed", description: "Paste/upload code or enter a public GitHub repository URL." });
      return;
    }

    setState("previewing");
    try {
      await trackProductEvent("appraisal_intake.preview_started", {
        source: "appraisal_intake",
        framework,
        repositoryUrl: repoUrl,
          counts: { hasRepositoryUrl: repoReady, hasPastedCode: codeReady, pastedCharacters: code.trim().length, intakeCompleteness },
      });
      const response = await fetch("/api/public-demo-scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appCode: code.slice(0, PREVIEW_CODE_LIMIT), repositoryUrl: repoUrl, framework, modules: modulesFromContext(intakeContext) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Preview scan failed.");
      setPreview({
        score: Number(payload.productionReadinessScore || payload.securityScore || 0),
        riskLevel: String(payload.riskLevel || "unknown"),
        issues: Array.isArray(payload.issues)
          ? payload.issues.slice(0, 3).map((issue: { title?: unknown; severity?: unknown }) => ({
              title: String(issue.title || "Untitled issue"),
              severity: String(issue.severity || "unknown"),
            }))
          : [],
      });
      showToast({ type: "success", title: "Preview scan complete", description: "Preview generated from the submitted evidence sample." });
      await trackProductEvent("appraisal_intake.preview_completed", {
        source: "appraisal_intake",
        framework,
        repositoryUrl: repoUrl,
        riskLevel: payload.riskLevel,
        counts: {
          readinessScore: Number(payload.productionReadinessScore || payload.securityScore || 0),
          issueCount: Array.isArray(payload.issues) ? payload.issues.length : 0,
          inputTruncated: Boolean(payload.inputTruncated),
          intakeCompleteness,
        },
      });
    } catch (error) {
      showToast({ type: "error", title: "Preview failed", description: error instanceof Error ? error.message : "Unable to run preview scan." });
      await trackProductEvent("appraisal_intake.preview_failed", {
        source: "appraisal_intake",
        framework,
        repositoryUrl: repoUrl,
        metadata: { reason: error instanceof Error ? error.message.slice(0, 120) : "unknown" },
      });
    } finally {
      setState("idle");
    }
  }

  async function runPaidAppraisal() {
    if (!sourceReady) {
      showToast({ type: "error", title: "Source evidence required", description: "Paste/upload source code or enter a public GitHub repository URL." });
      return;
    }

    setState("appraising");
    try {
      await trackProductEvent("appraisal_intake.certificate_started", {
        source: "appraisal_intake",
        framework,
        repositoryUrl: repoUrl,
        counts: { hasRepositoryUrl: repoReady, hasPastedCode: codeReady, offerInstant: offerId === "instant", offerBuyerReady: offerId === "buyer-ready", intakeCompleteness },
      });
      const response = await fetch("/api/appraisal-intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          email,
          appName,
          repositoryUrl: repoUrl,
          code,
          framework,
          offer: offerId,
          modules: modulesFromContext(intakeContext),
          intakeContext,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Verified report could not be generated.");
      setResult(payload);
      showToast({ type: "success", title: "Signed Verification Badge issued", description: "Your VentureOS verified report is ready." });
      await trackProductEvent("appraisal_intake.certificate_completed", {
        source: "appraisal_intake",
        framework,
        repositoryUrl: repoUrl,
        riskLevel: payload.scan?.riskLevel,
        counts: {
          readinessScore: Number(payload.scan?.readinessScore || payload.appraisal?.readinessScore || 0),
          issueCount: Number(payload.scan?.issueCount || 0),
          certificateIssued: Boolean(payload.certificate?.certificateId),
        },
      });
    } catch (error) {
      showToast({ type: "error", title: "Report failed", description: error instanceof Error ? error.message : "Unable to generate verified report." });
      await trackProductEvent("appraisal_intake.certificate_failed", {
        source: "appraisal_intake",
        framework,
        repositoryUrl: repoUrl,
        metadata: { reason: error instanceof Error ? error.message.slice(0, 120) : "unknown" },
      });
    } finally {
      setState("idle");
    }
  }

  async function loadFiles(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files).slice(0, 20);
    const textParts = [];
    for (const file of selected) {
      if (file.size > 120_000) continue;
      const content = await file.text().catch(() => "");
      if (content) textParts.push(`// FILE: ${file.webkitRelativePath || file.name}\n${content}`);
    }
    const nextCode = textParts.join("\n\n").slice(0, 180_000);
    setCode(nextCode);
    showToast({ type: "success", title: "Files loaded", description: `${textParts.length} file(s) added to the report input.` });
  }

  return (
    <>
    <section className="mx-auto grid w-full max-w-[1280px] gap-8 px-4 pb-28 pt-10 sm:px-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      <aside className="vos-panel p-6 text-[rgb(var(--vos-text))]">
        <p className="vos-label">Selected report</p>
        <div className="mt-4 rounded-lg border border-[rgb(var(--vos-primary))] bg-[rgb(var(--vos-panel-raised))] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-black text-[rgb(var(--vos-text))]">{offer.name}</p>
              <p className="mt-2 text-xs font-semibold leading-5 text-[rgb(var(--vos-text-muted))]">{offer.description}</p>
            </div>
            <span className="rounded-full bg-[rgb(var(--vos-primary))] px-2.5 py-1 text-xs font-black text-[rgb(var(--vos-primary-text))]">{offer.priceLabel}</span>
          </div>
        </div>

        <label className="mt-5 block">
          <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Email for report delivery</span>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            autoComplete="email"
            placeholder="founder@example.com"
            className="mt-2 h-11 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-white outline-none focus:border-emerald-300"
          />
          <span className="mt-2 block text-xs font-semibold leading-5 text-slate-500">
            Used for the report record and follow-up. The report can still be generated without checkout.
          </span>
        </label>

        <Button type="button" className="mt-4 w-full" size="lg" onClick={startCheckout}>
          <CheckCircle2 className="h-4 w-4" />
          Launch Access Enabled
        </Button>

        {checkoutStatus === "cancelled" ? (
          <p className="mt-3 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm font-semibold text-amber-100">
            Checkout is not required in the current launch flow.
          </p>
        ) : null}
        {paid ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm font-semibold text-emerald-100">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            Launch access active. Add a public GitHub repo URL, upload files, or paste source, then issue the Signed Verification Badge.
          </p>
        ) : null}

        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Why this page?</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
            VentureOS does not issue the verified report or Signed Verification Badge until source evidence is submitted and you click Pay & Generate Full Report.
          </p>
        </div>

        <FulfillmentSteps paid={paid} sourceReady={sourceReady} resultReady={Boolean(result)} state={state} />

        <div className="mt-5 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Intake strength</p>
          <div className="mt-3 flex items-end justify-between gap-3">
            <p className="text-4xl font-black text-white">{intakeCompleteness}%</p>
            <p className="text-right text-xs font-bold uppercase text-slate-500">{checkedEvidenceCount} evidence areas selected</p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full bg-emerald-300" style={{ width: `${intakeCompleteness}%` }} />
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Evidence rules</p>
          <div className="mt-3 grid gap-2 text-sm font-semibold leading-6 text-slate-300">
            <p>Scores are capped when source evidence is thin or partial.</p>
            <p>Unknowns and not-claimed items appear on the public report.</p>
            <p>Do not paste secrets. Rotate anything accidentally submitted.</p>
          </div>
        </div>
      </aside>

      <div className="vos-panel p-6 text-[rgb(var(--vos-text))]">
        <section className="grid gap-4 lg:grid-cols-2">
          {APPRAISAL_OFFERS.map((item) => {
            const selected = offerId === item.id;
            const buyerReady = item.id === "buyer-ready";
            return (
              <button
                key={`comparison:${item.id}`}
                type="button"
                onClick={() => setOfferId(item.id)}
                aria-pressed={selected}
                className={[
                  "flex min-h-[300px] flex-col rounded-lg border p-5 text-left transition",
                  selected ? "border-[rgb(var(--vos-primary))] bg-[rgb(var(--vos-verified-bg))]/25" : "border-slate-800 bg-slate-900/40 hover:border-slate-600",
                ].join(" ")}
              >
                <span className="flex items-start justify-between gap-4">
                  <span>
                    <span className="block text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                      {buyerReady ? "Best for buyers" : "Fast verified snapshot"}
                    </span>
                    <span className="mt-3 block text-2xl font-black text-white">{item.name}</span>
                  </span>
                  <span className="rounded-full bg-[rgb(var(--vos-primary))] px-3 py-1 text-sm font-black text-[rgb(var(--vos-primary-text))]">
                    {item.priceLabel}
                  </span>
                </span>
                <span className="mt-4 block text-sm font-semibold leading-6 text-slate-300">{item.description}</span>
                <span className="mt-5 grid gap-2">
                  {item.deliverables.map((deliverable) => (
                    <span key={deliverable} className="flex gap-2 text-sm font-bold text-slate-300">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-200" />
                      {deliverable}
                    </span>
                  ))}
                </span>
                <span className="mt-auto pt-5">
                  <span className={selected ? "action primary w-full" : "action w-full"}>
                    {selected ? "Selected" : `Choose ${item.priceLabel}`}
                  </span>
                </span>
              </button>
            );
          })}
        </section>

        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-slate-500">Provide Evidence</p>
            <h1 className="mt-3 vos-section-title">Build a buyer-ready evidence report.</h1>
            <p className="mt-3 max-w-3xl vos-body">
              Give VentureOS enough context to separate verified risks from unknowns. More complete inputs produce a stronger evidence scope and fewer vague conclusions.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={runPreview} disabled={state === "previewing"}>
              {state === "previewing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Preview Scan
            </Button>
            <Button type="button" onClick={runPaidAppraisal} disabled={state === "appraising"}>
              {state === "appraising" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Pay & Generate Full Report
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <IntakeMetric label="Offer" value={offer.priceLabel} detail={offer.name} />
          <IntakeMetric label="Access" value="Launch" detail="No checkout required in this flow" tone="ready" />
          <IntakeMetric label="Source" value={sourceReady ? "Ready" : "Needed"} detail={repoReady ? "Repository URL" : codeReady ? "Submitted source" : "Repo, upload, or paste"} tone={sourceReady ? "ready" : "risk"} />
          <IntakeMetric label="Intake" value={`${intakeCompleteness}%`} detail="Context completeness" tone={intakeCompleteness >= 70 ? "ready" : "risk"} />
        </div>

        <section className="mt-5 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">1. Asset identity</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">App name</span>
            <input
              value={appName}
              onChange={(event) => setAppName(event.target.value)}
              placeholder="Acme SaaS"
              className="mt-2 h-11 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-white outline-none focus:border-emerald-300"
            />
          </label>
          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Company / owner</span>
            <input
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="Acme Inc. or founder name"
              className="mt-2 h-11 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-white outline-none focus:border-emerald-300"
            />
          </label>
          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Website / domain</span>
            <input
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              placeholder="https://example.com"
              className="mt-2 h-11 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-white outline-none focus:border-emerald-300"
            />
          </label>
          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Your role</span>
            <select
              value={contactRole}
              onChange={(event) => setContactRole(event.target.value)}
              className="mt-2 h-11 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-white outline-none focus:border-emerald-300"
            >
              <option>Founder / owner</option>
              <option>Developer / technical lead</option>
              <option>Agency / studio</option>
              <option>Buyer / investor</option>
              <option>Advisor / broker</option>
            </select>
          </label>
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">2. Diligence purpose</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <SelectField label="Purpose" value={appraisalPurpose} onChange={setAppraisalPurpose} options={[
              ["launch-readiness", "Launch readiness"],
              ["buyer-diligence", "Buyer diligence"],
              ["investor-review", "Investor review"],
              ["agency-delivery", "Agency delivery"],
              ["marketplace-listing", "Marketplace listing"],
            ]} />
            <SelectField label="Stage" value={assetStage} onChange={setAssetStage} options={[
              ["prototype", "Prototype"],
              ["mvp", "MVP"],
              ["production", "Production"],
              ["scaling", "Scaling"],
              ["legacy", "Legacy / inherited"],
            ]} />
            <SelectField label="Revenue" value={revenueStatus} onChange={setRevenueStatus} options={[
              ["pre-revenue", "Pre-revenue"],
              ["paid-pilot", "Paid pilot"],
              ["revenue", "Revenue"],
              ["unknown", "Unknown"],
            ]} />
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Decision deadline</span>
              <input
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                placeholder="Friday, funding call, buyer review"
                className="mt-2 h-11 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-white outline-none focus:border-emerald-300"
              />
            </label>
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">3. Technical profile</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Framework</span>
              <select
                value={framework}
                onChange={(event) => setFramework(event.target.value)}
                className="mt-2 h-11 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-white outline-none focus:border-emerald-300"
              >
                <option value="nextjs">Next.js</option>
                <option value="react">React</option>
                <option value="node">Node.js</option>
                <option value="express">Express</option>
                <option value="supabase">Supabase</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
            <SelectField label="Deployment" value={deploymentTarget} onChange={setDeploymentTarget} options={[
              ["vercel", "Vercel"],
              ["netlify", "Netlify"],
              ["aws", "AWS"],
              ["azure", "Azure"],
              ["railway", "Railway / Render"],
              ["unknown", "Unknown"],
            ]} />
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Active users</span>
              <input
                value={activeUsers}
                onChange={(event) => setActiveUsers(event.target.value)}
                placeholder="0, 100, 10k, unknown"
                className="mt-2 h-11 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-white outline-none focus:border-emerald-300"
              />
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Critical systems</span>
              <input
                value={criticalSystems}
                onChange={(event) => setCriticalSystems(event.target.value)}
                placeholder="auth, billing, admin, AI, jobs"
                className="mt-2 h-11 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-white outline-none focus:border-emerald-300"
              />
            </label>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {Object.keys(evidenceChecks).map((key) => (
              <label key={key} className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm font-bold capitalize text-slate-300">
                <input
                  type="checkbox"
                  checked={evidenceChecks[key]}
                  onChange={(event) => setEvidenceChecks((current) => ({ ...current, [key]: event.target.checked }))}
                  className="h-4 w-4"
                />
                {key}
              </label>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">4. Known concerns</p>
          <textarea
            value={knownConcerns}
            onChange={(event) => setKnownConcerns(event.target.value.slice(0, 2_000))}
            placeholder="What should VentureOS pay special attention to? Example: unclear auth, Stripe webhooks, admin routes, database ownership, generated code quality, deployment errors, buyer objections."
            className="mt-3 min-h-28 w-full resize-y rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm leading-6 text-slate-100 outline-none focus:border-emerald-300"
          />
        </section>

        <section className="mt-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">5. Source evidence</p>

        <label className="mt-4 block">
          <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
            <Code2 className="h-4 w-4" />
            Public GitHub repository URL
          </span>
          <input
            value={repoUrl}
            onChange={(event) => setRepoUrl(event.target.value)}
            type="url"
            placeholder="https://github.com/company/app"
            className="mt-2 h-11 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-white outline-none focus:border-emerald-300"
          />
          <span className="mt-2 block text-xs font-semibold leading-5 text-slate-500">
            Public repos can be scanned directly. Private repos should use file upload or the GitHub App connection.
          </span>
        </label>

        <div className="mt-4 grid gap-4">
          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Upload source files</span>
            <span className="mt-2 flex min-h-11 items-center gap-3 rounded-lg border border-dashed border-slate-700 bg-slate-950 px-3 text-sm text-slate-300">
              <Upload className="h-4 w-4" />
              <input
                type="file"
                multiple
                onChange={(event) => void loadFiles(event.target.files)}
                className="w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-xs file:font-black file:text-white"
              />
            </span>
          </label>
        </div>

        <label className="mt-4 block">
          <span className="flex items-center justify-between gap-3">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Paste source code</span>
            <span className="text-xs font-semibold text-slate-500">{code.length.toLocaleString()} / 180,000</span>
          </span>
          <textarea
            value={code}
            onChange={(event) => setCode(event.target.value.slice(0, 180_000))}
            placeholder={'// FILE: app/api/checkout/route.ts\nexport async function POST(request: Request) { ... }'}
            className="mt-2 min-h-[300px] w-full resize-y rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100 outline-none focus:border-emerald-300"
          />
        </label>
        </section>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <ResultPanel preview={preview} />
          <CertificatePanel result={result} />
        </div>
      </div>
    </section>
    <div className="print-hide fixed inset-x-0 bottom-0 z-50 border-t border-slate-800 bg-slate-950/92 px-4 py-3 shadow-2xl shadow-black/30 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200">Next step</p>
          <p className="truncate text-sm font-black text-white">
            {result ? "Report issued. Open or copy the verification links above." : sourceReady ? "Evidence is ready. Preview or issue the Signed Verification Badge." : "Add a public repo, upload files, or paste source evidence."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <Button type="button" variant="outline" className="min-h-11" onClick={runPreview} disabled={state === "previewing" || !sourceReady}>
            {state === "previewing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Preview Scan
          </Button>
          <Button type="button" className="min-h-11" onClick={runPaidAppraisal} disabled={state === "appraising" || !sourceReady}>
            {state === "appraising" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Pay & Generate Full Report
          </Button>
        </div>
      </div>
    </div>
    </>
  );
}

function ResultPanel({ preview }: { preview: PreviewResult | null }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
        <Code2 className="h-4 w-4" />
        Preview scan
      </p>
      {preview ? (
        <>
          <p className="mt-3 text-4xl font-black text-white">{preview.score}/100</p>
          <p className="mt-1 text-sm font-black uppercase text-slate-400">{preview.riskLevel}</p>
          <p className="mt-2 text-xs font-semibold text-slate-500">Preview generated from the submitted evidence sample.</p>
          <div className="mt-3 grid gap-2">
            {preview.issues.length ? preview.issues.map((issue) => (
              <p key={`${issue.severity}:${issue.title}`} className="rounded-md border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm text-amber-50">
                {issue.severity.toUpperCase()}: {issue.title}
              </p>
            )) : <p className="text-sm text-slate-400">No top preview issues returned.</p>}
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm leading-6 text-slate-400">Run a preview before issuing the Signed Verification Badge. Preview uses a limited evidence sample.</p>
      )}
    </div>
  );
}

function CertificatePanel({ result }: { result: AppraisalResult | null }) {
  const appraisal = result?.appraisal;
  const summary = appraisal?.publicSummary;
  const appraisalUrl = appraisal?.appraisalUrl || appraisal?.certificateUrl;
  const certificateUrl = result?.certificate?.verificationUrl;
  const badgeUrl = result?.certificate?.badgeUrl || appraisal?.badgeUrl;
  const badgeEmbedHtml = appraisal?.badgeEmbedHtml || (badgeUrl && appraisalUrl ? `<a href="${appraisalUrl}" rel="noopener" target="_blank"><img src="${badgeUrl}" alt="VentureOS verified report badge" /></a>` : "");
  const coverage = summary?.evidenceCoverage;
  const technicalValue = summary?.technicalValue || appraisal?.technicalValue;

  function downloadResult() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${appraisal?.publicId || "ventureos-report"}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast({ type: "success", title: "Report JSON downloaded." });
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
        <FileText className="h-4 w-4" />
        Completed report
      </p>
      {result ? (
        <>
          <div className="mt-3 rounded-lg border border-emerald-300/30 bg-emerald-300/10 p-3">
            <p className="flex items-center gap-2 text-sm font-black text-emerald-50">
              <CheckCircle2 className="h-4 w-4" />
              Report generated successfully
            </p>
            <p className="mt-1 text-xs font-semibold leading-5 text-emerald-100">
              Your buyer-facing report, verification link, and badge tools are ready below.
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Grade</p>
              <p className="mt-2 text-4xl font-black text-white">{appraisal?.grade || "Issued"}</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Verdict</p>
              <p className="mt-2 text-xl font-black uppercase text-slate-100">{appraisal?.launchVerdict || "Signed"}</p>
              {typeof result.scan?.readinessScore === "number" ? (
                <p className="mt-1 text-xs font-semibold text-slate-500">Scan score {result.scan.readinessScore}/100</p>
              ) : null}
            </div>
          </div>

          {coverage ? (
            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Evidence scope</p>
              <div className="mt-2 grid gap-2 text-sm font-semibold text-slate-300">
                <p>{coverage.score ?? 0}/100 coverage, {String(coverage.level || "limited")} scope, cap {coverage.scoreCap ?? "n/a"}.</p>
                {coverage.scoreCapped ? <p className="text-amber-100">Readiness was capped because evidence was incomplete.</p> : null}
              </div>
            </div>
          ) : null}

          {technicalValue?.available === false ? (
            <div className="mt-3 rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm font-semibold text-amber-50">
              Technical value is not claimed because no verified valuation dataset is configured.
            </div>
          ) : null}

          <ClaimList title="Observed evidence" items={coverage?.verifiedClaims || []} tone="ready" />
          <ClaimList title="Unknown" items={summary?.unknowns || coverage?.unknowns || []} tone="muted" />
          <ClaimList title="Not claimed" items={summary?.unverifiedClaims || coverage?.unverifiedClaims || []} tone="blocked" />

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {appraisalUrl ? (
              <a className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-300 px-4 text-sm font-black text-slate-950" href={appraisalUrl}>
                Open Report <ArrowRight className="h-4 w-4" />
              </a>
            ) : null}
            {certificateUrl ? (
              <a className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 text-sm font-black text-white" href={certificateUrl}>
                Verify Badge <ArrowRight className="h-4 w-4" />
              </a>
            ) : null}
            <CopyButton value={appraisalUrl || ""} label="Copy report link" successMessage="Report link copied." />
            <CopyButton value={certificateUrl || ""} label="Copy verify link" successMessage="Verification link copied." />
            <CopyButton value={badgeEmbedHtml || ""} label="Copy badge embed" successMessage="Badge embed copied." className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 text-sm font-black text-white transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60" />
            <button
              type="button"
              onClick={downloadResult}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 text-sm font-black text-white transition hover:border-slate-500"
            >
              <Download className="h-4 w-4" />
              Download JSON
            </button>
          </div>
        </>
      ) : (
        <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-slate-400">
          <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-amber-200" />
            Signed Verification Badge appears here after source review.
        </p>
      )}
    </div>
  );
}

function FulfillmentSteps({
  paid,
  sourceReady,
  resultReady,
  state,
}: {
  paid: boolean;
  sourceReady: boolean;
  resultReady: boolean;
  state: IntakeState;
}) {
  const appraising = state === "appraising";
  const steps = [
    { label: "Choose Report Type", done: true, active: false },
    { label: "Provide Evidence", done: sourceReady, active: !sourceReady && paid },
    { label: "Review & Pay", done: paid, active: false },
    { label: "Get Report", done: resultReady, active: appraising },
  ];

  return (
    <div className="mt-5 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Report progress</p>
      <div className="mt-3 grid gap-2">
        {steps.map((step, index) => (
          <div key={step.label} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${stepClass(step.done, step.active)}`}>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-slate-950 text-xs font-black">
              {step.active ? <Loader2 className="h-4 w-4 animate-spin" /> : step.done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
            </span>
            <span className="text-sm font-black">{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClaimList({ title, items, tone }: { title: string; items: string[]; tone: "ready" | "muted" | "blocked" }) {
  if (!items.length) return null;
  const Icon = tone === "blocked" ? ShieldAlert : tone === "ready" ? ShieldCheck : AlertTriangle;
  return (
    <div className={`mt-3 rounded-lg border p-3 ${claimClass(tone)}`}>
      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em]">
        <Icon className="h-4 w-4" />
        {title}
      </p>
      <div className="mt-2 grid gap-1.5 text-sm font-semibold leading-6">
        {items.slice(0, 3).map((item) => (
          <p key={item}>{item}</p>
        ))}
      </div>
    </div>
  );
}

function IntakeMetric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "ready" | "risk" | "neutral";
}) {
  const toneClass = tone === "ready" ? "text-emerald-200" : tone === "risk" ? "text-amber-200" : "text-white";
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`mt-2 text-xl font-black ${toneClass}`}>{value}</p>
      <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-white outline-none focus:border-emerald-300"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

function stepClass(done: boolean, active: boolean) {
  if (done) return "border-emerald-300/30 bg-emerald-300/10 text-emerald-100";
  if (active) return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  return "border-slate-800 bg-slate-950 text-slate-500";
}

function claimClass(tone: "ready" | "muted" | "blocked") {
  if (tone === "ready") return "border-emerald-300/30 bg-emerald-300/10 text-emerald-50";
  if (tone === "blocked") return "border-amber-300/30 bg-amber-300/10 text-amber-50";
  return "border-slate-800 bg-slate-950 text-slate-300";
}

function offerIdFor(value: unknown): AppraisalOfferId {
  if (value === "buyer-ready") return value;
  return "instant";
}

function modulesFromContext(context: { deploymentTarget?: string; evidenceChecklist?: string[]; appraisalPurpose?: string }) {
  const modules = [
    "appraisal",
    context.deploymentTarget,
    context.appraisalPurpose,
    ...(Array.isArray(context.evidenceChecklist) ? context.evidenceChecklist : []),
  ];
  return [...new Set(modules.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))].slice(0, 12);
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
    // Product telemetry must never block checkout or certificate issuance.
  }
}
