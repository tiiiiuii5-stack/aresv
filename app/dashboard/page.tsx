import Link from "next/link";
import type { ReactNode } from "react";

import { InstitutionalPageShell } from "@/components/institutional/institutional-shell";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { buildRegistryItems } from "@/lib/registry/registry-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const registry = await buildRegistryItems({ limit: 6 });
  const verified = registry.items.filter((item) => item.currentState === "ISSUED" || item.currentState === "VERIFIED").length;
  const avgTrust = average(registry.items.map((item) => item.trustScore).filter((score) => score > 0));

  return (
    <InstitutionalPageShell
      purposeLabel="Workbench"
      maxWidth="max-w-[1280px]"
      actions={[
        { label: "Free Review", href: "/free-review", variant: "outline" },
        { label: "Registry", href: "/registry", variant: "outline" },
        { label: "Build Report", href: "/software-appraisal", variant: "default" },
      ]}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Dashboard" },
      ]}
    >
      <section className="vos-panel p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Owner Dashboard</Badge>
          <Badge variant="ready">Live</Badge>
        </div>
        <h1 className="mt-5 vos-h1">Your software trust command center.</h1>
        <p className="mt-4 max-w-3xl vos-body">
          Start reviews, generate buyer-ready reports, and open public passport records without waiting on a project loader.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <DashboardMetric label="Registry records" value={registry.count || 0} />
          <DashboardMetric label="Verified records" value={verified} />
          <DashboardMetric label="Average trust" value={avgTrust ? `${avgTrust}/100` : "Pending"} />
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <ActionCard title="Start Free Review" detail="Paste a repo or URL and get launch blockers before asking for payment." href="/free-review" primary />
        <ActionCard title="Build Verified Report" detail="Collect evidence and issue a buyer-facing Signed Verification Badge." href="/software-appraisal" />
        <ActionCard title="Open Registry" detail="Search public software passports and verification records." href="/registry" />
      </section>

      <section className="mt-6 vos-panel p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="vos-label">Recent public records</p>
            <h2 className="mt-2 vos-h2">Latest passports</h2>
          </div>
          <Link href="/registry" className={buttonClassName({ variant: "outline" })}>
            View Registry
          </Link>
        </div>
        <div className="mt-5 grid gap-3">
          {registry.items.length ? registry.items.map((item) => (
            <Link key={item.ventureOsId} href={item.publicVerificationUrl} className="vos-cell flex flex-col gap-3 p-4 transition hover:border-[rgb(var(--vos-border-strong))] sm:flex-row sm:items-center sm:justify-between">
              <span>
                <span className="block text-sm font-black text-[rgb(var(--vos-text))]">{item.name}</span>
                <span className="mt-1 block text-xs font-semibold text-[rgb(var(--vos-text-muted))]">{item.repository || item.domain || item.ventureOsId}</span>
              </span>
              <span className="flex items-center gap-2">
                <Badge variant={item.trustScore >= 85 ? "ready" : item.trustScore >= 60 ? "risky" : "muted"}>{item.trustScore > 0 ? `${item.trustScore}/100` : "Pending"}</Badge>
                <Badge variant="outline">{item.certificateStatus}</Badge>
              </span>
            </Link>
          )) : (
            <div className="vos-cell p-5">
              <p className="text-sm font-bold text-[rgb(var(--vos-text-muted))]">No public records yet. Start with a free review.</p>
            </div>
          )}
        </div>
      </section>
    </InstitutionalPageShell>
  );
}

function DashboardMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="vos-cell p-4">
      <div className="flex items-center gap-3">
        <span className="h-2 w-2 rounded-full bg-[rgb(var(--vos-verified))]" />
        <p className="vos-label">{label}</p>
      </div>
      <p className="mt-3 text-3xl font-black text-[rgb(var(--vos-text))]">{value}</p>
    </div>
  );
}

function ActionCard({ title, detail, href, primary = false }: { title: string; detail: string; href: string; primary?: boolean }) {
  return (
    <Link href={href} className="vos-panel flex min-h-[220px] flex-col p-6 transition hover:-translate-y-0.5 hover:border-[rgb(var(--vos-border-strong))]">
      <span className="h-2 w-10 rounded-full bg-[rgb(var(--vos-verified))]" />
      <h2 className="mt-5 vos-card-title">{title}</h2>
      <p className="mt-3 flex-1 vos-body">{detail}</p>
      <span className={buttonClassName({ variant: primary ? "default" : "outline", className: "mt-5 w-full" })}>
        Open
      </span>
    </Link>
  );
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}
