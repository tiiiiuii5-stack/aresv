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
  sbom?: SbomResult | null;
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

type SbomResult = {
  format?: string;
  specVersion?: string;
  bomHash?: string;
  status?: string;
  completeness?: string;
  manifestCount?: number;
  componentCount?: number;
  directDependencyCount?: number;
  devDependencyCount?: number;
  packageManagers?: string[];
  riskFlags?: string[];
  limitations?: string[];
  componentsPreview?: Array<{ name?: string; version?: string; scope?: string; manifestPath?: string; packageManager?: string; purl?: string }>;
  cyclonedx?: Record<string, unknown>;
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
    sbom?: SbomResult | null;
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
      sbom?: SbomResult | null;
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
  const accessGranted = true;
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
      counts: { accessGranted, hasInitialRepositoryUrl: Boolean(initialRepositoryUrl) },
    });
  }, [accessGranted, framework, initialRepositoryUrl, repoUrl]);

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
        sbom: normalizeSbom(payload.sbom),
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
      if (!response.ok) throw new Error(payload.error || "Evidence review could not be generated.");
      setResult(payload);
      showToast({ type: "success", title: "Signed Evidence Receipt issued", description: "Your VentureOS evidence review is ready." });
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
      showToast({ type: "error", title: "Review failed", description: error instanceof Error ? error.message : "Unable to generate evidence review." });
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
    <section className="mx-auto grid w-full max-w-[1280px] gap-8 px-4 pb-28 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="vos-panel p-6 text-[rgb(var(--vos-text))]">
        <div className="flex flex-col gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="vos-label">Build Your Evidence Review</p>
            <h1 className="mt-3 vos-section-title">Paste a repo. Get the buyer output.</h1>
            <p className="mt-3 max-w-3xl vos-body">
              VentureOS turns source evidence into a preview scan, buyer-facing evidence review, and signed evidence receipt. Keep it simple: source first, context second.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button type="button" variant="outline" className="min-h-11" onClick={runPreview} disabled={state === "previewing" || !sourceReady}>
              {state === "previewing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Preview
            </Button>
            <Button type="button" className="min-h-11" onClick={runPaidAppraisal} disabled={state === "appraising" || !sourceReady}>
              {state === "appraising" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Generate Review
            </Button>
          </div>
        </div>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
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
                      {buyerReady ? "Best for buyers" : "Fast evidence review"}
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

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <IntakeMetric label="Offer" value={offer.priceLabel} detail={offer.name} />
          <IntakeMetric label="Access" value="Free" detail="No checkout in this launch flow" tone="ready" />
          <IntakeMetric label="Source" value={sourceReady ? "Ready" : "Needed"} detail={repoReady ? "Repository URL" : codeReady ? "Submitted source" : "Repo, upload, or paste"} tone={sourceReady ? "ready" : "risk"} />
          <IntakeMetric label="Intake" value={`${intakeCompleteness}%`} detail="Context completeness" tone={intakeCompleteness >= 70 ? "ready" : "risk"} />
        </div>

        <section className="mt-5 rounded-lg border border-emerald-300/30 bg-emerald-300/10 p-5">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-100">1. Source evidence</p>

          <label className="mt-4 block">
            <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-100">
              <Code2 className="h-4 w-4" />
              Public GitHub repository URL
            </span>
            <input
              value={repoUrl}
              onChange={(event) => setRepoUrl(event.target.value)}
              type="url"
              placeholder="https://github.com/username/repo"
              className="mt-2 h-12 w-full rounded-lg border border-emerald-300/30 bg-slate-950 px-4 text-base font-semibold text-white outline-none transition focus:border-emerald-200"
            />
            <span className="mt-2 block text-xs font-semibold leading-5 text-emerald-100/80">
              Public repos scan fastest. Private code can be uploaded or pasted below.
            </span>
          </label>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-emerald-100">Upload source files</span>
              <span className="mt-2 flex min-h-12 items-center gap-3 rounded-lg border border-dashed border-emerald-300/30 bg-slate-950 px-3 text-sm text-slate-300">
                <Upload className="h-4 w-4" />
                <input
                  type="file"
                  multiple
                  onChange={(event) => void loadFiles(event.target.files)}
                  className="w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-xs file:font-black file:text-white"
                />
              </span>
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-emerald-100">Delivery email optional</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="email"
                placeholder="founder@example.com"
                className="mt-2 h-12 w-full rounded-lg border border-emerald-300/30 bg-slate-950 px-4 text-sm text-white outline-none transition focus:border-emerald-200"
              />
            </label>
          </div>

          <label className="mt-4 block">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-emerald-100">Paste source code optional</span>
            <textarea
              value={code}
              onChange={(event) => setCode(event.target.value.slice(0, 180_000))}
              placeholder={'// FILE: app/api/checkout/route.ts\nexport async function POST(request: Request) { ... }'}
              className="mt-2 min-h-[180px] w-full resize-y rounded-lg border border-emerald-300/30 bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100 outline-none transition focus:border-emerald-200"
            />
          </label>
        </section>

        <details className="mt-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <summary className="cursor-pointer text-sm font-black text-white">Add buyer context</summary>
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

          <p className="mt-6 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Diligence purpose</p>
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

          <p className="mt-6 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Technical profile</p>
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

          <p className="mt-6 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Known concerns</p>
          <textarea
            value={knownConcerns}
            onChange={(event) => setKnownConcerns(event.target.value.slice(0, 2_000))}
            placeholder="What should VentureOS pay special attention to? Example: unclear auth, Stripe webhooks, admin routes, database ownership, generated code quality, deployment errors, buyer objections."
            className="mt-3 min-h-28 w-full resize-y rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm leading-6 text-slate-100 outline-none focus:border-emerald-300"
          />
        </details>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <ResultPanel preview={preview} />
          <CertificatePanel result={result} />
        </div>
      </div>

      <aside className="space-y-5">
        <div className="vos-panel p-6 text-[rgb(var(--vos-text))]">
          <p className="vos-label">Customer output</p>
          <h2 className="mt-3 text-2xl font-black text-white">What they get</h2>
          <div className="mt-5 grid gap-3">
            {[
              "Buyer-facing evidence summary",
              "Quality and safety summary",
              "Risk findings with plain-English notes",
              "Observed / inferred / unknown sections",
              "Signed Evidence Receipt",
              "Public evidence link",
            ].map((item) => (
              <p key={item} className="flex gap-2 text-sm font-bold text-slate-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-200" />
                {item}
              </p>
            ))}
          </div>
        </div>

        <FulfillmentSteps accessGranted={accessGranted} sourceReady={sourceReady} resultReady={Boolean(result)} state={state} />

        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Evidence strength</p>
          <div className="mt-3 flex items-end justify-between gap-3">
            <p className="text-4xl font-black text-white">{intakeCompleteness}%</p>
            <p className="text-right text-xs font-bold uppercase text-slate-500">{checkedEvidenceCount} areas</p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full bg-emerald-300 transition-all" style={{ width: `${intakeCompleteness}%` }} />
          </div>
          <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">
            More context improves the report, but a public repo is enough to start.
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Evidence rules</p>
          <div className="mt-3 grid gap-2 text-sm font-semibold leading-6 text-slate-300">
            <p>Unknowns are shown instead of overclaimed.</p>
            <p>Thin evidence lowers confidence.</p>
            <p>Do not paste secrets.</p>
          </div>
        </div>
      </aside>
    </section>
    <div className="print-hide fixed inset-x-0 bottom-0 z-50 border-t border-slate-800 bg-slate-950/92 px-4 py-3 shadow-2xl shadow-black/30 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200">Next step</p>
          <p className="truncate text-sm font-black text-white">
            {result ? "Evidence review issued. Open or copy the public links above." : sourceReady ? "Evidence is ready. Preview or issue the signed evidence receipt." : "Add a public repo, upload files, or paste source evidence."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <Button type="button" variant="outline" className="min-h-11" onClick={runPreview} disabled={state === "previewing" || !sourceReady}>
            {state === "previewing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Preview Scan
          </Button>
          <Button type="button" className="min-h-11" onClick={runPaidAppraisal} disabled={state === "appraising" || !sourceReady}>
            {state === "appraising" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Generate Review
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
          <SbomSummaryCard sbom={preview.sbom} compact />
          <div className="mt-3 grid gap-2">
            {preview.issues.length ? preview.issues.map((issue) => (
              <p key={`${issue.severity}:${issue.title}`} className="rounded-md border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm text-amber-50">
                {issue.severity.toUpperCase()}: {issue.title}
              </p>
            )) : <p className="text-sm text-slate-400">No top preview issues returned.</p>}
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm leading-6 text-slate-400">Run a preview before issuing the signed evidence receipt. Preview uses a limited evidence sample.</p>
      )}
    </div>
  );
}

function CertificatePanel({ result }: { result: AppraisalResult | null }) {
  const appraisal = result?.appraisal;
  const summary = appraisal?.publicSummary;
  const sbom = summary?.sbom || result?.scan?.sbom || null;
  const appraisalUrl = appraisal?.appraisalUrl || appraisal?.certificateUrl;
  const certificateUrl = result?.certificate?.verificationUrl;
  const badgeUrl = result?.certificate?.badgeUrl || appraisal?.badgeUrl;
  const badgeEmbedHtml = appraisal?.badgeEmbedHtml || (badgeUrl && appraisalUrl ? `<a href="${appraisalUrl}" rel="noopener" target="_blank"><img src="${badgeUrl}" alt="VentureOS evidence receipt badge" /></a>` : "");
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

  function downloadSbom() {
    if (!sbom) return;
    const payload = sbom.cyclonedx || sbom;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${appraisal?.publicId || "ventureos"}-sbom.cyclonedx.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast({ type: "success", title: "SBOM JSON downloaded." });
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
        <FileText className="h-4 w-4" />
        Completed evidence review
      </p>
      {result ? (
        <>
          <div className="mt-3 rounded-lg border border-emerald-300/30 bg-emerald-300/10 p-3">
            <p className="flex items-center gap-2 text-sm font-black text-emerald-50">
              <CheckCircle2 className="h-4 w-4" />
              Evidence review generated
            </p>
            <p className="mt-1 text-xs font-semibold leading-5 text-emerald-100">
              Your buyer-facing evidence review, receipt link, and share tools are ready below.
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
              Technical value is not claimed because no independently validated valuation dataset is configured.
            </div>
          ) : null}

          <ClaimList title="Observed evidence" items={coverage?.verifiedClaims || []} tone="ready" />
          <ClaimList title="Unknown" items={summary?.unknowns || coverage?.unknowns || []} tone="muted" />
          <ClaimList title="Not claimed" items={summary?.unverifiedClaims || coverage?.unverifiedClaims || []} tone="blocked" />
          <SbomSummaryCard sbom={sbom} />

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {appraisalUrl ? (
              <a className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-300 px-4 text-sm font-black text-slate-950" href={appraisalUrl}>
                Open Report <ArrowRight className="h-4 w-4" />
              </a>
            ) : null}
            {certificateUrl ? (
              <a className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 text-sm font-black text-white" href={certificateUrl}>
                Open Receipt <ArrowRight className="h-4 w-4" />
              </a>
            ) : null}
            <CopyButton value={appraisalUrl || ""} label="Copy report link" successMessage="Report link copied." />
            <CopyButton value={certificateUrl || ""} label="Copy receipt link" successMessage="Receipt link copied." />
            <CopyButton value={badgeEmbedHtml || ""} label="Copy receipt embed" successMessage="Receipt embed copied." className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 text-sm font-black text-white transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60" />
            <CopyButton value={JSON.stringify(sbom?.cyclonedx || sbom || {}, null, 2)} label="Copy SBOM JSON" successMessage="SBOM JSON copied." className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 text-sm font-black text-white transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60" />
            <button
              type="button"
              onClick={downloadSbom}
              disabled={!sbom}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 text-sm font-black text-white transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              Download SBOM
            </button>
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
            Signed Evidence Receipt appears here after source review.
        </p>
      )}
    </div>
  );
}

function FulfillmentSteps({
  accessGranted,
  sourceReady,
  resultReady,
  state,
}: {
  accessGranted: boolean;
  sourceReady: boolean;
  resultReady: boolean;
  state: IntakeState;
}) {
  const appraising = state === "appraising";
  const steps = [
    { label: "Choose Review Type", done: true, active: false },
    { label: "Provide Evidence", done: sourceReady, active: !sourceReady && accessGranted },
    { label: "Review & Generate", done: accessGranted, active: false },
    { label: "Get Review", done: resultReady, active: appraising },
  ];

  return (
    <div className="mt-5 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Review progress</p>
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

function SbomSummaryCard({ sbom, compact = false }: { sbom?: SbomResult | null; compact?: boolean }) {
  if (!sbom) {
    return compact ? null : (
      <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm font-semibold text-slate-400">
        SBOM dependency inventory was not available in this response.
      </div>
    );
  }

  const riskFlags = Array.isArray(sbom.riskFlags) ? sbom.riskFlags.slice(0, compact ? 1 : 3) : [];
  const components = Array.isArray(sbom.componentsPreview) ? sbom.componentsPreview.slice(0, compact ? 3 : 6) : [];
  return (
    <div className="mt-3 rounded-lg border border-cyan-300/25 bg-cyan-300/10 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-100">SBOM dependency health</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-cyan-50">
            {Number(sbom.componentCount || 0)} component(s) from {Number(sbom.manifestCount || 0)} manifest(s). Completeness: {String(sbom.completeness || "unknown")}.
          </p>
        </div>
        <span className="rounded-full border border-cyan-200/30 px-2.5 py-1 text-xs font-black uppercase text-cyan-50">
          {String(sbom.status || "unknown")}
        </span>
      </div>
      {sbom.bomHash ? <p className="mt-2 font-mono text-[11px] font-bold text-cyan-100/80">SBOM hash {shortHash(sbom.bomHash)}</p> : null}
      {riskFlags.length ? (
        <div className="mt-3 grid gap-1.5">
          {riskFlags.map((flag) => (
            <p key={flag} className="text-xs font-semibold leading-5 text-cyan-50/85">{flag}</p>
          ))}
        </div>
      ) : null}
      {!compact && components.length ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.14em] text-cyan-100">View top components</summary>
          <div className="mt-2 grid gap-1.5">
            {components.map((component) => (
              <p key={`${component.name}:${component.version}:${component.scope}`} className="font-mono text-[11px] font-semibold text-cyan-50/85">
                {component.name}@{component.version} - {component.scope}
              </p>
            ))}
          </div>
        </details>
      ) : null}
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

function normalizeSbom(value: unknown): SbomResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as SbomResult;
}

function shortHash(value: string) {
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;
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
