import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { InstitutionalShell } from "@/components/institutional/institutional-shell";
import { PassportDecisionPanel } from "@/components/passport/decision-panel";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { buildBuyerGradePassportReport } from "@/lib/passport/buyer-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BuyerReport = Awaited<ReturnType<typeof buildBuyerGradePassportReport>>;
type UserProfileState = "free" | "pro" | "venture";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return {
    title: `${decodeURIComponent(id || "Passport")} Buyer Report`,
    description: "Buyer-grade VentureOS software passport report with decision ledger and audit trail.",
  };
}

export default async function PassportBuyerReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let report: BuyerReport;
  try {
    report = await buildBuyerGradePassportReport(decodeURIComponent(id || ""));
  } catch (error) {
    if (error instanceof Error && error.message === "PASSPORT_NOT_FOUND") notFound();
    throw error;
  }

  const userProfileState: UserProfileState = "free";
  const isFree = userProfileState === "free";

  return (
    <InstitutionalShell
      currentSection="Workbench"
      subscriptionTier="Free"
      pageTitle="Buyer Report"
      pageDescription="Decision-ready software trust record"
      rightSlot={
        <div className="flex items-center gap-2">
          <Link href={`/passport/${encodeURIComponent(report.passportId)}`} className={buttonClassName({ variant: "outline", size: "sm" })}>
            Passport
          </Link>
          <Link href={`/api/passport/${encodeURIComponent(report.passportId)}/report`} className={buttonClassName({ size: "sm" })}>
            JSON
          </Link>
        </div>
      }
    >
      <div className="grid gap-5">
        <ReportHero report={report} />

        <section className="grid gap-3 lg:grid-cols-3">
          <ScoreMeter label="Trust" value={report.trustScore} tone="emerald" />
          <ScoreMeter label="Quality" value={report.qualityScore} tone="blue" />
          <ScoreMeter label="Safety" value={report.safetyScore} tone={report.safetyScore >= 80 ? "emerald" : "amber"} />
        </section>

        <PassportDecisionPanel passportId={report.passportId} initialSummary={report.decisions} />

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Panel title="Executive Decision" eyebrow="Recommendation">
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-3">
                <Fact label="Production" value={report.decisionRecommendation.trustedForProduction ? "Trusted" : "Hold"} tone={report.decisionRecommendation.trustedForProduction ? "emerald" : "amber"} />
                <Fact label="Confidence" value={report.decisionRecommendation.decisionConfidence} tone="blue" />
                <Fact label="Use Case" value={report.decisionRecommendation.recommendedUse} />
              </div>
              <p className="text-sm font-semibold leading-7 text-slate-400">
                {report.decisionRecommendation.explanation.auditQuote}
              </p>
              <div className="grid gap-3 lg:grid-cols-3">
                <Explanation title="Why approved" body={report.decisionRecommendation.explanation.whyApproved} />
                <Explanation title="Why rejected" body={report.decisionRecommendation.explanation.whyRejected} />
                <Explanation title="What changed" body={report.decisionRecommendation.explanation.whatChanged} />
              </div>
            </div>
          </Panel>

          <Panel title="Trust Movement" eyebrow="Change">
            <div className="grid gap-3">
              <Delta label="Trust" value={report.changeHistory.scoreDeltas.trust} />
              <Delta label="Quality" value={report.changeHistory.scoreDeltas.quality} />
              <Delta label="Safety" value={report.changeHistory.scoreDeltas.safety} />
            </div>
            <p className="mt-4 text-sm font-semibold leading-7 text-slate-400">{report.changeHistory.regressionAnalysis}</p>
          </Panel>
        </section>

        <section className="relative overflow-hidden rounded-lg border border-slate-800 bg-slate-950/60">
          <div className="border-b border-slate-800 px-5 py-4">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Deep Review</p>
            <h2 className="mt-1 text-lg font-black text-slate-100">Line-item vulnerabilities and evidence</h2>
          </div>
          <div className={["grid gap-4 p-5 lg:grid-cols-2", isFree ? "max-h-[360px] overflow-hidden blur-sm select-none" : ""].join(" ")}>
            <EvidenceList report={report} />
            <RiskList report={report} />
          </div>
          {isFree ? <PaywallOverlay /> : null}
        </section>

        <details className="rounded-lg border border-slate-800 bg-slate-950/60">
          <summary className="cursor-pointer px-5 py-4 text-sm font-black text-slate-300 outline-none">
            Technical audit manifest
            <span className="ml-2 text-xs font-semibold text-slate-600">Prompt versions, schema hashes, output hashes</span>
          </summary>
          <div className="grid gap-4 border-t border-slate-800 p-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="grid gap-3">
              {report.audit.pipeline.promptManifest.map((stage) => (
                <div key={stage.stage} className="rounded-md border border-slate-800 bg-[#0B0F19] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-xs font-black uppercase text-slate-300">{stage.stage}</p>
                    <Badge variant="outline">v{stage.version}</Badge>
                  </div>
                  <HashRow label="Prompt" value={stage.promptHash} />
                  <HashRow label="Schema" value={stage.outputSchemaHash} />
                </div>
              ))}
            </div>
            <div className="grid content-start gap-3">
              <AuditEnvelope title="Evidence Ingestion" envelope={report.audit.stageOutputHashes.evidenceIngestion} />
              <AuditEnvelope title="Consensus Reduction" envelope={report.audit.stageOutputHashes.consensusReduction} />
              <AuditEnvelope title="Ledger Replay" envelope={report.audit.stageOutputHashes.ledgerReplay} />
              <HashRow label="Report" value={report.audit.reportHash} strong />
            </div>
          </div>
        </details>
      </div>
    </InstitutionalShell>
  );
}

function ReportHero({ report }: { report: BuyerReport }) {
  const verdictTone = report.verdict === "verified" ? "ready" : report.verdict === "high_risk" ? "blocked" : "risky";
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-5 shadow-2xl shadow-black/20">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={verdictTone}>{report.verdict.replace(/_/g, " ").toUpperCase()}</Badge>
            <span className="rounded-full border border-slate-800 bg-[#0B0F19] px-3 py-1 font-mono text-xs font-bold text-slate-400">{report.passportId}</span>
          </div>
          <h1 className="mt-4 break-words text-3xl font-black tracking-tight text-slate-50 sm:text-5xl">{report.softwareIdentity.name}</h1>
          <p className="mt-4 max-w-3xl text-base font-semibold leading-7 text-slate-400">
            A clean buyer-facing trust record. The machinery is available for audit, but the default view is built for decisions.
          </p>
        </div>
        <div className="grid gap-3 rounded-lg border border-slate-800 bg-[#0B0F19]/70 p-4">
          <Fact label="Owner" value={report.softwareIdentity.owner} />
          <Fact label="Source" value={report.softwareIdentity.sourceType.toUpperCase()} />
          <Fact label="Generated" value={formatDateTime(report.generatedAt)} />
        </div>
      </div>
    </section>
  );
}

function ScoreMeter({ label, value, tone }: { label: string; value: number; tone: "emerald" | "amber" | "blue" }) {
  const color = tone === "emerald" ? "bg-emerald-400 text-emerald-200" : tone === "amber" ? "bg-amber-300 text-amber-200" : "bg-blue-400 text-blue-200";
  return (
    <article className="rounded-lg border border-slate-800 bg-slate-950/70 p-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</p>
        <span className={["h-2 w-2 rounded-full", color.split(" ")[0]].join(" ")} />
      </div>
      <div className="mt-4 flex items-end justify-between gap-4">
        <p className="font-mono text-5xl font-black text-slate-50">{value}</p>
        <p className={["text-xs font-black uppercase", color.split(" ")[1]].join(" ")}>{value >= 85 ? "Strong" : value >= 70 ? "Review" : "Risk"}</p>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-900">
        <div className={["h-full rounded-full", color.split(" ")[0]].join(" ")} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </article>
  );
}

function Panel({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-5">
      <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{eyebrow}</p>
      <h2 className="mt-1 text-lg font-black text-slate-100">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "amber" | "blue" }) {
  const toneClass = tone === "emerald" ? "text-emerald-200" : tone === "amber" ? "text-amber-200" : tone === "blue" ? "text-blue-200" : "text-slate-100";
  return (
    <div className="min-w-0 rounded-md border border-slate-800 bg-[#0B0F19]/80 p-3">
      <p className="text-[11px] font-black uppercase tracking-wide text-slate-600">{label}</p>
      <p className={["mt-1 break-words text-sm font-black", toneClass].join(" ")}>{value}</p>
    </div>
  );
}

function Explanation({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-md border border-slate-800 bg-[#0B0F19]/80 p-4">
      <p className="text-sm font-black text-slate-100">{title}</p>
      <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">{body}</p>
    </article>
  );
}

function Delta({ label, value }: { label: string; value: number }) {
  const positive = value > 0;
  const negative = value < 0;
  return (
    <div className="flex items-center justify-between rounded-md border border-slate-800 bg-[#0B0F19]/80 px-4 py-3">
      <p className="text-sm font-black text-slate-400">{label}</p>
      <p className={["font-mono text-lg font-black", positive ? "text-emerald-300" : negative ? "text-amber-300" : "text-slate-300"].join(" ")}>
        {positive ? `+${value}` : value}
      </p>
    </div>
  );
}

function EvidenceList({ report }: { report: BuyerReport }) {
  return (
    <div className="grid gap-3">
      {report.evidenceSummary.evidence.map((item) => (
        <div key={item.id} className="rounded-md border border-slate-800 bg-[#0B0F19]/80 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={item.confidence === "high" ? "ready" : item.confidence === "medium" ? "risky" : "muted"}>{item.confidence.toUpperCase()}</Badge>
            <Badge variant="outline">{item.category.toUpperCase()}</Badge>
          </div>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-400">{item.description}</p>
        </div>
      ))}
    </div>
  );
}

function RiskList({ report }: { report: BuyerReport }) {
  const risks = report.riskBreakdown.riskFlags.length ? report.riskBreakdown.riskFlags : ["No material risk flags in the current evidence scope."];
  return (
    <div className="grid content-start gap-3">
      {risks.map((risk) => (
        <div key={risk} className="rounded-md border border-slate-800 bg-[#0B0F19]/80 p-4">
          <p className="text-sm font-semibold leading-6 text-slate-400">{risk}</p>
        </div>
      ))}
    </div>
  );
}

function PaywallOverlay() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[#0B0F19]/50 p-6 backdrop-blur-md">
      <div className="max-w-md rounded-lg border border-emerald-400/30 bg-slate-950/90 p-6 text-center shadow-2xl shadow-black/30">
        <p className="text-[11px] font-black uppercase tracking-wide text-emerald-300">Pro review required</p>
        <h3 className="mt-2 text-2xl font-black text-slate-50">Unlock line-item vulnerabilities</h3>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-400">
          Free reports show the decision layer. Pro unlocks full evidence rows, vulnerability details, and export-ready audit context.
        </p>
        <Link href="/pricing" className={buttonClassName({ className: "mt-5 w-full justify-center" })}>
          Upgrade
        </Link>
      </div>
    </div>
  );
}

function AuditEnvelope({ title, envelope }: { title: string; envelope: BuyerReport["audit"]["stageOutputHashes"][keyof BuyerReport["audit"]["stageOutputHashes"]] }) {
  return (
    <div className="rounded-md border border-slate-800 bg-[#0B0F19] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black text-slate-100">{title}</p>
        <Badge variant={envelope.valid ? "ready" : "blocked"}>{envelope.valid ? "VALID" : "INVALID"}</Badge>
      </div>
      <HashRow label="Output" value={envelope.outputHash} />
      <HashRow label="Schema" value={envelope.outputSchemaHash} />
    </div>
  );
}

function HashRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="mt-3 min-w-0">
      <p className="text-[11px] font-black uppercase tracking-wide text-slate-600">{label}</p>
      <p className={["mt-1 break-all font-mono text-xs", strong ? "text-slate-100" : "text-slate-500"].join(" ")}>{value}</p>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
