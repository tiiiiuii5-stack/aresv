"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Code2, FileText, Lock, ShieldAlert, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { InstitutionalPageShell } from "@/components/institutional/institutional-shell";
import { BuyerJourneyStrip } from "@/components/buyer-journey-strip";
import { StickyConversionBar } from "@/components/sticky-conversion-bar";
import { buttonClassName } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";

const topIssues = [
  {
    title: "Project mutation needs server-side ownership validation",
    severity: "High",
    file: "app/api/projects/[id]/route.ts",
    impact: "+9 score",
    evidence: "Route updates a project after parsing request input. The sample evidence does not show an owner check before mutation.",
    fix: `const session = await requireSession();
const project = await db.project.findUnique({ where: { id: params.id } });
assertOwnership(project, session);
return Response.json(await updateProject(project.id, input));`,
  },
  {
    title: "Billing webhook reliability cannot be verified from submitted source",
    severity: "Medium",
    file: "app/api/stripe/webhook/route.ts",
    impact: "+6 score",
    evidence: "Submitted files include checkout creation, but webhook signature handling was not included in the evidence package.",
    fix: `const body = await request.text();
const signature = headers().get("stripe-signature");
const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);`,
  },
  {
    title: "Deployment environment requirements are incomplete",
    severity: "Medium",
    file: ".env.example",
    impact: "+4 score",
    evidence: "The app references queue and AI provider env vars, but the submitted deployment manifest does not list all required variables.",
    fix: `GEMINI_API_KEY=
ENCRYPTION_KEY=
REDIS_URL=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=`,
  },
];

const timeline = [
  { label: "Scan 1", score: 52, change: "Initial report" },
  { label: "Scan 2", score: 67, change: "Auth and persistence fixes verified" },
  { label: "Scan 3", score: 74, change: "Remaining billing and deploy checks unresolved" },
];

const observedClaims = [
  "Source files were submitted and scanned.",
  "Top risks map to file-level evidence.",
  "Readiness score is capped by evidence coverage.",
];

const unknowns = [
  "Runtime traffic behavior was not observed.",
  "Full production environment was not connected.",
  "Complete repository history was not included.",
];

const notClaimed = [
  "Market-backed company valuation.",
  "Large proprietary benchmark percentile.",
  "Production uptime guarantee.",
];

const sampleBadgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="40" role="img" aria-label="VentureOS sample evidence receipt badge"><rect width="300" height="40" rx="8" fill="#0f172a"/><rect x="1" y="1" width="298" height="38" rx="7" fill="none" stroke="#34d399"/><text x="14" y="25" fill="#ecfdf5" font-family="Arial, sans-serif" font-size="13" font-weight="700">VentureOS Evidence Review</text><text x="220" y="25" fill="#fbbf24" font-family="Arial, sans-serif" font-size="13" font-weight="700">RISKY</text></svg>`;
const badgeEmbed = `<a href="https://ventureos-intelligence-layer.vercel.app/sample-appraisal" rel="noopener" target="_blank"><img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(sampleBadgeSvg)}" alt="VentureOS sample evidence receipt badge" /></a>`;

export default function SampleAppraisalPage() {
  return (
    <InstitutionalPageShell
      purposeLabel="Evidence Review + Signed Receipt"
      actions={[{ label: "Build Review", href: "/software-appraisal", variant: "default" }]}
      maxWidth="max-w-[1280px]"
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Free Review", href: "/free-review" },
        { label: "Results" },
      ]}
    >
        <Link
          href="/software-appraisal"
          className="print-hide fixed bottom-24 right-4 z-50 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-emerald-300/40 bg-emerald-300 px-4 text-sm font-black text-slate-950 shadow-2xl shadow-black/35 transition hover:-translate-y-0.5 hover:bg-emerald-200 sm:right-6"
        >
          Generate Your Own Review <ArrowRight className="h-4 w-4" />
        </Link>
        <BuyerJourneyStrip current="report" />

        <section className="grid gap-5 py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Sample evidence review</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-normal text-white sm:text-5xl">
              Can this app ship?
            </h1>
            <div className="mt-5 rounded-lg border border-amber-300/30 bg-amber-300/10 p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-100">Answer</p>
              <p className="mt-2 text-4xl font-black text-white">Not yet.</p>
              <p className="mt-3 max-w-2xl text-base font-semibold leading-7 text-amber-50">
                The app is commercially reviewable, but ownership, webhook, and deployment evidence must be tightened before this evidence review should be used in a buyer process.
              </p>
            </div>
          </div>

          <aside className="rounded-lg border border-slate-800 bg-slate-950 p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Signed Evidence Receipt preview</p>
            <div className="mt-4 overflow-hidden rounded-lg border border-emerald-300/25 bg-slate-900/70">
              <div className="border-b border-slate-800 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-[10px] font-black uppercase text-slate-500">Software Evidence Record</p>
                    <p className="mt-2 text-xl font-black text-white">Sample Asset</p>
                  </div>
                  <span className="rounded-md border border-amber-300/40 bg-amber-300/10 px-2.5 py-1 font-mono text-xs font-black text-amber-100">RISKY</span>
                </div>
              </div>
              <div className="grid grid-cols-[1fr_92px] gap-3 p-4">
                <div className="space-y-2">
                  {[68, 74, 82].map((width, index) => (
                    <div key={width} className="h-2 rounded-full bg-slate-800">
                      <div className={["h-2 rounded-full", index === 1 ? "bg-amber-300" : "bg-emerald-300"].join(" ")} style={{ width: `${width}%` }} />
                    </div>
                  ))}
                </div>
                <div className="grid place-items-center rounded-lg border border-slate-800 bg-slate-950">
                  <ShieldCheck className="h-8 w-8 text-emerald-200" />
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Metric label="Confidence" value="Medium" />
              <Metric label="State" value="RISKY" />
              <Metric label="Grade" value="B" />
              <Metric label="Coverage" value="68/100" />
            </div>
            <div className="mt-4 rounded-lg border border-emerald-300/30 bg-emerald-300/10 p-4">
              <p className="flex items-center gap-2 text-sm font-black text-emerald-100">
                <CheckCircle2 className="h-4 w-4" />
                Signed receipt issued after review
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
                Real receipts include registry match, payload signature status, and evidence scope.
              </p>
            </div>
            <div className="mt-4 grid gap-2">
              <Link href="/software-appraisal" className={buttonClassName({ className: "w-full" })}>
                Build Your Evidence Review <ArrowRight className="h-4 w-4" />
              </Link>
              <CopyButton value={badgeEmbed} label="Copy sample badge" successMessage="Sample badge embed copied." />
            </div>
          </aside>
        </section>

        <section className="mb-5 grid gap-3 md:grid-cols-4">
          <ReportSignal icon={<FileText className="h-4 w-4" />} label="Artifact" value="Signed review" />
          <ReportSignal icon={<ShieldCheck className="h-4 w-4" />} label="Evidence" value="Scoped claims" />
          <ReportSignal icon={<AlertTriangle className="h-4 w-4" />} label="Decision" value="Not yet" />
          <ReportSignal icon={<Lock className="h-4 w-4" />} label="Buyer use" value="Diligence ready" />
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {topIssues.map((issue) => (
            <article key={issue.title} className="rounded-lg border border-slate-800 bg-slate-950 p-5">
              <div className="flex items-start justify-between gap-3">
                <span className={severityClass(issue.severity)}>{issue.severity}</span>
                <span className="rounded-full border border-slate-700 px-2.5 py-1 text-xs font-black text-slate-300">{issue.impact}</span>
              </div>
              <h2 className="mt-4 text-lg font-black text-white">{issue.title}</h2>
              <p className="mt-2 font-mono text-xs text-emerald-200">{issue.file}</p>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">{issue.evidence}</p>
              <a href={`#fix-${slug(issue.title)}`} className="mt-4 inline-flex items-center gap-2 text-sm font-black text-emerald-200">
                View fix <ArrowRight className="h-4 w-4" />
              </a>
            </article>
          ))}
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-5">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
              <Code2 className="h-4 w-4" />
              Fix plan
            </p>
            <div className="mt-4 grid gap-4">
              {topIssues.map((issue, index) => (
                <article id={`fix-${slug(issue.title)}`} key={issue.title} className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                  <p className="text-sm font-black text-white">Step {index + 1}: {issue.title}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-400">Expected result: {issue.impact} and lower buyer-visible risk.</p>
                  <pre className="mt-3 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs leading-6 text-slate-200"><code>{issue.fix}</code></pre>
                  <div className="mt-3">
                    <CopyButton value={issue.fix} label="Copy fix" successMessage="Fix snippet copied." />
                  </div>
                </article>
              ))}
            </div>
          </div>

          <aside className="rounded-lg border border-slate-800 bg-slate-950 p-5">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
              <FileText className="h-4 w-4" />
              Evidence scope
            </p>
            <ScopeList title="Observed evidence" items={observedClaims} icon="ready" />
            <ScopeList title="Unknown" items={unknowns} icon="muted" />
            <ScopeList title="Not claimed" items={notClaimed} icon="blocked" />
          </aside>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[420px_minmax(0,1fr)]">
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">History</p>
            <div className="mt-4 grid gap-3">
              {timeline.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                  <div>
                    <p className="text-sm font-black text-white">{item.label}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{item.change}</p>
                  </div>
                  <p className="text-2xl font-black text-emerald-100">{item.score}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950 p-5">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
              <Lock className="h-4 w-4" />
              Launch panel
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Metric label="Readiness" value="74" />
              <Metric label="Status" value="RISKY" />
              <Metric label="Trend" value="UP" />
            </div>
            <div className="mt-4 grid gap-2 text-sm font-semibold leading-6 text-slate-300">
              <p className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />Fix ownership validation before buyer review.</p>
              <p className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />Verify Stripe webhook signature handling.</p>
              <p className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />Attach deployment env evidence before claiming production-ready.</p>
            </div>
            <Link href="/software-appraisal" className={buttonClassName({ className: "mt-5 w-full" })}>
              Build Review
            </Link>
          </div>
        </section>
        <StickyConversionBar
          eyebrow="Buyer-ready evidence"
          title="Generate your own evidence review from real source evidence."
          primaryLabel="Build Review"
          primaryHref="/software-appraisal"
          secondaryLabel="Free Review"
          secondaryHref="/free-review"
          source="sample_report_sticky"
        />
    </InstitutionalPageShell>
  );
}

function ReportSignal({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <article className="rounded-lg border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-700 bg-slate-900 text-emerald-200">
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
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function ScopeList({ title, items, icon }: { title: string; items: string[]; icon: "ready" | "muted" | "blocked" }) {
  const Icon = icon === "ready" ? ShieldCheck : icon === "blocked" ? ShieldAlert : AlertTriangle;
  const classes =
    icon === "ready"
      ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-50"
      : icon === "blocked"
        ? "border-amber-300/30 bg-amber-300/10 text-amber-50"
        : "border-slate-800 bg-slate-900/50 text-slate-300";
  return (
    <div className={`mt-4 rounded-lg border p-4 ${classes}`}>
      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em]">
        <Icon className="h-4 w-4" />
        {title}
      </p>
      <div className="mt-3 grid gap-2 text-sm font-semibold leading-6">
        {items.map((item) => (
          <p key={item}>{item}</p>
        ))}
      </div>
    </div>
  );
}

function severityClass(severity: string) {
  return [
    "rounded-full border px-2.5 py-1 text-xs font-black uppercase tracking-[0.14em]",
    severity === "High" ? "border-red-300/40 bg-red-500/18 text-red-100" : "border-amber-300/40 bg-amber-400/16 text-amber-100",
  ].join(" ");
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
