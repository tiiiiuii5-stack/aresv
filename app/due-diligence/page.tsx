import Link from "next/link";

import { InstitutionalMetricCard, InstitutionalPageHero, InstitutionalPageShell, InstitutionalPanel } from "@/components/institutional/institutional-shell";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { buildDueDiligenceWorkspace, type BuyerLensInterpretation, type EvidenceRecord, type PassportDimension, type SoftwarePassportV2 } from "@/lib/diligence/due-diligence-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "VentureOS Auditable Trust Engine",
  description: "Evidence-based software diligence dashboard with provenance, score explainability, and signed audit exports.",
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
          eyebrow="Milestone 3"
          title="Auditable trust engine for software decisions."
          description="VentureOS now links evidence to external anchors, provenance chains, score impact, buyer lenses, deterministic rebuilds, and signed audit exports."
          actions={
            <>
              <Link href="/evidence" className={buttonClassName({})}>
                Open Evidence Explorer
              </Link>
              <Link href="/vendor-comparison" className={buttonClassName({ variant: "outline" })}>
                Compare Vendors
              </Link>
              <Link href={workspace.snapshot.jsonUrl} className={buttonClassName({ variant: "outline" })}>
                Export JSON
              </Link>
              <Link href={workspace.snapshot.pdfUrl} className={buttonClassName({ variant: "outline" })}>
                Export PDF
              </Link>
            </>
          }
          aside={
            <div className="grid gap-3">
              <Badge variant={workspace.isSampleData ? "risky" : "ready"}>{workspace.isSampleData ? "Sample fallback visible" : "Live evidence"}</Badge>
              <Badge variant="outline">Signed {workspace.snapshot.snapshotId}</Badge>
              <p className="text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">
                Snapshot root: <span className="font-mono">{workspace.snapshot.workspaceRootHash.slice(0, 18)}</span>. Deterministic hash: <span className="font-mono">{workspace.deterministicInputHash.slice(0, 18)}</span>.
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
            {primaryPassport ? (
              <PassportV2Summary passport={primaryPassport} evidence={workspace.evidence.filter((record) => record.subjectId === primaryPassport.id)} />
            ) : (
              <EmptyMessage text="No software records are available yet. Start a free review to create the first passport." />
            )}
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

        {primaryPassport ? (
          <InstitutionalPanel title="Buyer Simulation Mode" eyebrow="Interpretation Lens">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {Object.values(primaryPassport.buyerLenses).map((lens) => (
                <BuyerLensCard key={lens.lens} lens={lens} />
              ))}
            </div>
          </InstitutionalPanel>
        ) : null}

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

function PassportV2Summary({ passport, evidence }: { passport: SoftwarePassportV2; evidence: EvidenceRecord[] }) {
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
          <DimensionCard key={dimension.key} dimension={dimension} evidence={evidence.filter((record) => dimension.evidenceIds.includes(record.id))} />
        ))}
      </div>
    </div>
  );
}

function DimensionCard({ dimension, evidence }: { dimension: PassportDimension; evidence: EvidenceRecord[] }) {
  const impacts = [...dimension.explanation.positive, ...dimension.explanation.negative, ...dimension.explanation.neutral];
  return (
    <article className="vos-cell p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="vos-label">{dimension.label}</p>
        <Badge variant={dimension.verdict === "strong" ? "ready" : dimension.verdict === "review" ? "risky" : "muted"}>{dimension.verdict}</Badge>
      </div>
      <p className="mt-3 font-mono text-3xl font-black text-[rgb(var(--vos-text))]">{dimension.score}</p>
      <p className="mt-2 text-xs font-bold text-[rgb(var(--vos-text-subtle))]">{dimension.confidence}/100 confidence</p>
      <p className="mt-3 text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">{dimension.observed[0] || dimension.unknown[0]}</p>
      <details className="mt-4">
        <summary className={buttonClassName({ variant: "outline", size: "sm", className: "w-full cursor-pointer" })}>
          Explain this score
        </summary>
        <div className="mt-3 grid gap-3">
          <div className="rounded-md border border-[rgb(var(--vos-border))] p-3">
            <p className="vos-label">Formula</p>
            <p className="mt-2 text-xs font-semibold leading-5 text-[rgb(var(--vos-text-muted))]">{dimension.explanation.formula}</p>
          </div>
          <div className="rounded-md border border-[rgb(var(--vos-border))] p-3">
            <p className="vos-label">Score Impact</p>
            <div className="mt-2 grid gap-2">
              {impacts.length ? impacts.slice(0, 4).map((impact) => (
                <div key={`${impact.label}:${impact.impact}`} className="flex items-start justify-between gap-3 text-xs">
                  <span className="font-semibold leading-5 text-[rgb(var(--vos-text-muted))]">{impact.label}</span>
                  <span className={["font-mono font-black", impact.impact >= 0 ? "vos-status-verified" : "vos-status-risk"].join(" ")}>
                    {impact.impact >= 0 ? "+" : ""}{impact.impact}
                  </span>
                </div>
              )) : <p className="text-xs font-semibold text-[rgb(var(--vos-text-subtle))]">No direct score impacts were available.</p>}
            </div>
          </div>
          <div className="rounded-md border border-[rgb(var(--vos-border))] p-3">
            <p className="vos-label">Evidence Chain</p>
            <div className="mt-2 grid gap-2">
              {evidence.slice(0, 3).map((record) => (
                <div key={record.id} className="text-xs font-semibold leading-5 text-[rgb(var(--vos-text-muted))]">
                  <p>{`${record.sourceKind.replace(/_/g, " ")} -> ${record.type.replace(/_/g, " ")} -> score impact`}</p>
                  <p className="font-mono text-[rgb(var(--vos-text-subtle))]">{record.hash.slice(0, 24)}</p>
                  <p>{record.anchors[0]?.label || "No external anchor"} · {record.confidence}/100 confidence</p>
                </div>
              ))}
              {!evidence.length ? <p className="text-xs font-semibold text-[rgb(var(--vos-text-subtle))]">No supporting evidence rows are attached yet.</p> : null}
            </div>
          </div>
        </div>
      </details>
    </article>
  );
}

function BuyerLensCard({ lens }: { lens: BuyerLensInterpretation }) {
  return (
    <article className="vos-cell p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black text-[rgb(var(--vos-text))]">{lens.label}</p>
        <Badge variant={lens.recommendation === "Proceed" ? "ready" : lens.recommendation === "Review" ? "risky" : "blocked"}>
          {lens.recommendation}
        </Badge>
      </div>
      <p className="mt-3 text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">{lens.decisionQuestion}</p>
      <div className="mt-4 grid gap-2">
        {lens.prioritySignals.slice(0, 3).map((signal) => (
          <p key={signal} className="text-xs font-bold text-[rgb(var(--vos-text-muted))]">+ {signal}</p>
        ))}
        {lens.concerns.slice(0, 2).map((concern) => (
          <p key={concern} className="text-xs font-bold text-[rgb(var(--vos-text-subtle))]">- {concern}</p>
        ))}
      </div>
      <p className="mt-4 text-xs font-black uppercase text-[rgb(var(--vos-text-subtle))]">{lens.nextAction}</p>
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
