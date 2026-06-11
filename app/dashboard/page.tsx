import Link from "next/link";
import type { ReactNode } from "react";
import { Award, FileText, Sparkles, Zap } from "lucide-react";

import { InstitutionalPageShell } from "@/components/institutional/institutional-shell";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { buildRegistryItems } from "@/lib/registry/registry-pipeline";
import { BillingWidget } from "@/components/billing-widget";
import { ActivityFeed } from "@/components/activity-feed";
import { IntegrationStatusWidget } from "@/components/integration-status-widget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const registry = await buildRegistryItems({ limit: 6 });
  const verified = registry.items.filter((item) => item.currentState === "ISSUED" || item.currentState === "VERIFIED").length;
  const avgTrust = average(registry.items.map((item) => item.trustScore).filter((score) => score > 0));
  const hasRecords = registry.items.length > 0;

  const subscription = null;
  const jobs = [];
  const scansUsed = 12;
  const scansAllowed = 20;
  const reportsGenerated = registry.count || 0;

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

      {!hasRecords ? (
        <section className="mt-6 vos-panel p-6">
          <p className="vos-label">Empty State</p>
          <h2 className="mt-2 vos-h2">No projects yet.</h2>
          <p className="mt-3 max-w-2xl vos-body">Start with a Free Review. VentureOS will turn your repo into a buyer-readable verdict, then you can generate a signed report when you need one.</p>
          <Link href="/free-review" className={buttonClassName({ className: "mt-5" })}>
            Start a Free Review
          </Link>
        </section>
      ) : null}

      {/* Quick Action Buttons */}
      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickActionButton
          href="/free-review"
          icon={<Zap className="h-5 w-5" />}
          label="New Scan"
          description="Analyze code instantly"
        />
        <QuickActionButton
          href="/dashboard"
          icon={<Sparkles className="h-5 w-5" />}
          label="Generate App"
          description="Create with AI"
        />
        <QuickActionButton
          href="/projects"
          icon={<FileText className="h-5 w-5" />}
          label="View Projects"
          description="See all projects"
        />
        <QuickActionButton
          href="/certificate"
          icon={<Award className="h-5 w-5" />}
          label="Get Certificate"
          description="Download badges"
        />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <ActionCard title="Projects" detail="Open software assets and continue reviews." href="/projects" primary />
        <ActionCard title="Report History" detail="Review generated reports and buyer-ready evidence." href="/software-appraisal" />
        <ActionCard title="Certificate Downloads" detail="Open signed verification badges and public certificates." href="/registry" />
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="vos-panel p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="vos-label">User projects</p>
            <h2 className="mt-2 vos-h2">Latest software assets</h2>
          </div>
          <Link href="/registry" className={buttonClassName({ variant: "outline" })}>
            View Registry
          </Link>
        </div>
        <div className="mt-5 grid gap-3">
          {registry.items.length ? registry.items.map((item) => (
            <Link key={item.ventureOsId} href={item.publicVerificationUrl} className="vos-cell flex flex-col gap-3 p-4 transition hover:border-[rgb(var(--vos-border-strong))] hover:shadow-lg hover:shadow-slate-950/30 hover:-translate-y-0.5 sm:flex-row sm:items-center sm:justify-between">
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
              <p className="text-sm font-bold text-[rgb(var(--vos-text-muted))]">No projects yet. Start a Free Review.</p>
              <Link href="/free-review" className={buttonClassName({ className: "mt-4" })}>
                Start a Free Review
              </Link>
            </div>
          )}
        </div>
      </div>

      <aside className="vos-panel p-5">
        <p className="vos-label">Trust scores</p>
        <h2 className="mt-2 vos-h2">Score summary</h2>
        <div className="mt-5 grid gap-3">
          <DashboardMetric label="Average trust" value={avgTrust ? `${avgTrust}/100` : "Pending"} />
          <DashboardMetric label="Reports" value={registry.count || 0} />
          <DashboardMetric label="Certificates" value={registry.items.filter((item) => item.certificateStatus === "Active").length} />
        </div>
      </aside>
      </section>

      {/* Dashboard Widgets */}
      <section className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ActivityFeed jobs={jobs} />
        </div>
        <div>
          <BillingWidget
            subscription={subscription}
            scansUsed={scansUsed}
            scansAllowed={scansAllowed}
            reportsGenerated={reportsGenerated}
          />
        </div>
      </section>

      <section className="mt-6">
        <IntegrationStatusWidget />
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

function QuickActionButton({
  href,
  icon,
  label,
  description,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="vos-panel flex flex-col items-center justify-center gap-3 rounded-lg p-5 text-center transition hover:-translate-y-1 hover:border-[rgb(var(--vos-border-strong))]"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[rgb(var(--vos-accent))]/20 text-[rgb(var(--vos-accent))]">
        {icon}
      </div>
      <div>
        <p className="text-sm font-bold text-[rgb(var(--vos-text))]">{label}</p>
        <p className="mt-1 text-xs font-semibold text-[rgb(var(--vos-text-muted))]">
          {description}
        </p>
      </div>
    </Link>
  );
}
