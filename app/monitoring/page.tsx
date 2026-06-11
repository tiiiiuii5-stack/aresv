import Link from "next/link";

import { InstitutionalMetricCard, InstitutionalPageHero, InstitutionalPageShell, InstitutionalPanel } from "@/components/institutional/institutional-shell";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { buildDueDiligenceWorkspace } from "@/lib/diligence/due-diligence-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "VentureOS Monitoring Center",
  description: "Continuous monitoring center for software trust evidence, stale scans, and risk drift.",
};

export default async function MonitoringPage() {
  const workspace = await buildDueDiligenceWorkspace({ limit: 16 });
  const ok = workspace.monitoring.filter((alert) => alert.status === "ok").length;
  const watch = workspace.monitoring.filter((alert) => alert.status === "watch").length;
  const attention = workspace.monitoring.filter((alert) => alert.status === "attention").length;

  return (
    <InstitutionalPageShell
      purposeLabel="Monitoring Center"
      maxWidth="max-w-[1280px]"
      actions={[
        { label: "Due Diligence", href: "/due-diligence", variant: "outline" },
        { label: "Evidence", href: "/evidence", variant: "outline" },
        { label: "Run Review", href: "/free-review", variant: "default" },
      ]}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Due Diligence", href: "/due-diligence" },
        { label: "Monitoring" },
      ]}
    >
      <div className="grid gap-6">
        <InstitutionalPageHero
          eyebrow="Continuous Verification"
          title="Monitor trust drift before buyers find it."
          description="Track stale evidence, high-risk records, failed pipeline jobs, and missing freshness signals from one review center."
          actions={
            <>
              <Link href="/free-review" className={buttonClassName({})}>
                Run Fresh Review
              </Link>
              <Link href="/trust-graph" className={buttonClassName({ variant: "outline" })}>
                Open Graph
              </Link>
            </>
          }
          aside={
            <p className="text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">
              Monitoring is conservative. Unknown timestamps and incomplete evidence become watch items instead of being hidden.
            </p>
          }
        />

        <section className="grid gap-4 md:grid-cols-3">
          <InstitutionalMetricCard label="OK" value={ok} detail="No action generated" status="verified" />
          <InstitutionalMetricCard label="Watch" value={watch} detail="Evidence needs review" status={watch ? "risk" : "verified"} />
          <InstitutionalMetricCard label="Attention" value={attention} detail="Buyer blockers or high risk" status={attention ? "danger" : "verified"} />
        </section>

        <InstitutionalPanel title="Monitoring Alerts" eyebrow="Live Review Queue">
          <div className="grid gap-3">
            {workspace.monitoring.map((alert) => (
              <article key={alert.id} className="vos-cell grid gap-3 p-4 lg:grid-cols-[190px_minmax(0,1fr)_170px] lg:items-center">
                <div>
                  <Badge variant={alert.status === "attention" ? "blocked" : alert.status === "watch" ? "risky" : "ready"}>{alert.status}</Badge>
                  <p className="mt-2 text-sm font-black text-[rgb(var(--vos-text))]">{alert.signal}</p>
                </div>
                <div>
                  <p className="text-sm font-black text-[rgb(var(--vos-text))]">{alert.subjectName}</p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">{alert.description}</p>
                </div>
                <div className="text-left lg:text-right">
                  <p className="font-mono text-xs font-bold text-[rgb(var(--vos-text-subtle))]">{formatDateTime(alert.timestamp)}</p>
                  <Link href={`/registry/${encodeURIComponent(alert.subjectId)}`} className={buttonClassName({ variant: "outline", size: "sm", className: "mt-3" })}>
                    Open Record
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </InstitutionalPanel>
      </div>
    </InstitutionalPageShell>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
