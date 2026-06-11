import Link from "next/link";

import { InstitutionalMetricCard, InstitutionalPageHero, InstitutionalPageShell, InstitutionalPanel } from "@/components/institutional/institutional-shell";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { buildDueDiligenceWorkspace, type PassportDimension, type SoftwarePassportV2 } from "@/lib/diligence/due-diligence-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "VentureOS Due Diligence Dashboard",
  description: "Evidence-based software diligence dashboard for buyers, investors, and procurement teams.",
};

export default async function DueDiligenceDashboardPage() {
  const workspace = await buildDueDiligenceWorkspace({ limit: 10 });
  const primaryPassport = workspace.passports[0] || null;

  return (
    <InstitutionalPageShell
      purposeLabel="Due Diligence Engine"
      maxWidth="max-w-[1320px]"
      actions={[
        { label: "Evidence", href: "/evidence", variant: "outline" },
        { label: "Trust Graph", href: "/trust-graph", variant: "outline" },
        { label: "Start Review", href: "/free-review", variant: "default" },
      ]}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Due Diligence" },
      ]}
    >
      <div className="grid gap-6">
        <InstitutionalPageHero
          eyebrow="Milestone 2"
          title="Evidence-based due diligence for software buyers."
          description="VentureOS now separates observed evidence, inferred conclusions, unknowns, confidence, and buyer risk into one operating workspace."
          actions={
            <>
              <Link href="/evidence" className={buttonClassName({})}>
                Open Evidence Explorer
              </Link>
              <Link href="/vendor-comparison" className={buttonClassName({ variant: "outline" })}>
                Compare Vendors
              </Link>
            </>
          }
          aside={
            <div className="grid gap-3">
              <Badge variant={workspace.isSampleData ? "risky" : "ready"}>{workspace.isSampleData ? "Sample fallback visible" : "Live evidence"}</Badge>
              <p className="text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">
                Generated {formatDateTime(workspace.generatedAt)}. Sample fallback rows are clearly marked and should not be used as buyer proof.
              </p>
            </div>
          }
        />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <InstitutionalMetricCard label="Vendors" value={workspace.metrics.vendors} detail="Software records in this diligence view" />
          <InstitutionalMetricCard label="Evidence" value={workspace.metrics.evidenceRecords} detail="Hashed evidence records" status="verified" />
          <InstitutionalMetricCard label="Avg Trust" value={workspace.metrics.averageTrust ? `${workspace.metrics.averageTrust}/100` : "Pending"} detail="Evidence-weighted registry signal" />
          <InstitutionalMetricCard label="Open Risks" value={workspace.metrics.openRisks} detail="Risk engine findings" status={workspace.metrics.openRisks ? "risk" : "verified"} />
          <InstitutionalMetricCard label="Critical" value={workspace.metrics.criticalRisks} detail="Blocker-level findings" status={workspace.metrics.criticalRisks ? "danger" : "verified"} />
          <InstitutionalMetricCard label="Alerts" value={workspace.metrics.monitoringAttention} detail="Monitoring needs attention" status={workspace.metrics.monitoringAttention ? "risk" : "verified"} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <InstitutionalPanel title="Software Passport v2" eyebrow="Decision Surface">
            {primaryPassport ? <PassportV2Summary passport={primaryPassport} /> : <EmptyMessage text="No software records are available yet. Start a free review to create the first passport." />}
          </InstitutionalPanel>

          <InstitutionalPanel title="Highest Priority Risks" eyebrow="Risk Engine">
            <div className="grid gap-3">
              {workspace.risks.slice(0, 5).map((risk) => (
                <article key={risk.id} className="vos-cell p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={risk.severity === "critical" || risk.severity === "high" ? "blocked" : risk.severity === "medium" ? "risky" : "muted"}>
                      {risk.severity}
                    </Badge>
                    <Badge variant="outline">{risk.category.replace(/_/g, " ")}</Badge>
                    <span className="font-mono text-xs font-black text-[rgb(var(--vos-text-subtle))]">{risk.confidence}/100</span>
                  </div>
                  <p className="mt-3 text-sm font-black text-[rgb(var(--vos-text))]">{risk.subjectName}</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">{risk.description}</p>
                </article>
              ))}
              {!workspace.risks.length ? <EmptyMessage text="No risk findings were generated from the current evidence." /> : null}
            </div>
          </InstitutionalPanel>
        </section>

        <InstitutionalPanel
          title="Due Diligence Workflows"
          eyebrow="Buyer Workspace"
          actions={<Link href="/monitoring" className={buttonClassName({ variant: "outline", size: "sm" })}>Monitoring Center</Link>}
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <WorkflowCard title="Evidence Explorer" href="/evidence" detail="Search every hashed evidence record by source, confidence, type, date, and subject." />
            <WorkflowCard title="Trust Graph" href="/trust-graph" detail="See how repositories, domains, receipts, risks, and records connect." />
            <WorkflowCard title="Vendor Comparison" href="/vendor-comparison" detail="Compare software vendors side-by-side for procurement decisions." />
            <WorkflowCard title="Monitoring Center" href="/monitoring" detail="Track stale evidence, failed jobs, high-risk items, and review drift." />
          </div>
        </InstitutionalPanel>
      </div>
    </InstitutionalPageShell>
  );
}

function PassportV2Summary({ passport }: { passport: SoftwarePassportV2 }) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={passport.monitoringStatus === "attention" ? "risky" : "ready"}>{passport.status}</Badge>
            <Badge variant="outline">{passport.confidence}/100 confidence</Badge>
          </div>
          <h2 className="mt-4 vos-h2">{passport.name}</h2>
          <p className="mt-3 vos-body">
            {passport.repository || passport.domain || passport.company || "Software identity record"} · {passport.evidenceCount} evidence records · {passport.riskCount} risks
          </p>
        </div>
        <div className="vos-cell p-4">
          <p className="vos-label">Trust Score</p>
          <p className="mt-2 font-mono text-5xl font-black text-[rgb(var(--vos-text))]">{passport.trustScore || "Pending"}</p>
          <Link href={passport.publicUrl} className={buttonClassName({ variant: "outline", size: "sm", className: "mt-4 w-full" })}>
            Open Record
          </Link>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {passport.dimensions.map((dimension) => (
          <DimensionCard key={dimension.key} dimension={dimension} />
        ))}
      </div>
    </div>
  );
}

function DimensionCard({ dimension }: { dimension: PassportDimension }) {
  return (
    <article className="vos-cell p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="vos-label">{dimension.label}</p>
        <Badge variant={dimension.verdict === "strong" ? "ready" : dimension.verdict === "review" ? "risky" : "muted"}>{dimension.verdict}</Badge>
      </div>
      <p className="mt-3 font-mono text-3xl font-black text-[rgb(var(--vos-text))]">{dimension.score}</p>
      <p className="mt-2 text-xs font-bold text-[rgb(var(--vos-text-subtle))]">{dimension.confidence}/100 confidence</p>
      <p className="mt-3 text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">{dimension.observed[0] || dimension.unknown[0]}</p>
    </article>
  );
}

function WorkflowCard({ title, detail, href }: { title: string; detail: string; href: string }) {
  return (
    <Link href={href} className="vos-cell flex min-h-[190px] flex-col p-5 transition hover:-translate-y-1 hover:border-[rgb(var(--vos-border-strong))]">
      <h3 className="text-lg font-black text-[rgb(var(--vos-text))]">{title}</h3>
      <p className="mt-3 flex-1 text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">{detail}</p>
      <span className={buttonClassName({ variant: "outline", size: "sm", className: "mt-5 w-full" })}>Open</span>
    </Link>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return <p className="vos-cell p-5 text-sm font-bold text-[rgb(var(--vos-text-muted))]">{text}</p>;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
