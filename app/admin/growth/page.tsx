import Link from "next/link";
import type { ReactNode } from "react";

import { VentureOSHeader } from "@/components/institutional/institutional-shell";
import { Badge } from "@/components/ui/badge";
import { loadProductFunnelMetrics } from "@/lib/analytics/product-funnel-store";
import { loadWaitlistLeadMetrics } from "@/lib/analytics/waitlist-lead-store";
import { canonicalAppUrl } from "@/lib/appraisal/app-url";
import { requireAdmin } from "@/lib/auth/guards";
import { requireSession } from "@/lib/auth/session";
import { loadGrowthDashboardSnapshot } from "@/lib/services/growthDashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "VentureOS Growth Dashboard",
  description: "Owner-only user and revenue tracking for VentureOS.",
};

export default async function AdminGrowthPage() {
  const access = await adminAccess();
  if (access === "unauthorized") return <AdminLoginRequired />;
  if (access === "forbidden") return <AdminAccessDenied />;

  const [snapshot, funnel, waitlist] = await Promise.all([
    loadGrowthDashboardSnapshot(),
    loadProductFunnelMetrics(),
    loadWaitlistLeadMetrics(),
  ]);
  const realPreviewStarted = funnel.uniqueReal.previewStarted;
  const realPreviewCompleted = funnel.uniqueReal.previewCompleted;
  const realCheckoutStarted = funnel.uniqueReal.checkoutStarted;
  const realPaidIntent = funnel.uniqueReal.paidIntent;
  const homepageDemand = funnel.uniqueReal.homepageIntent;
  const demandLinks = demandCampaignLinks();

  return (
    <main className="vos-page min-h-screen">
      <VentureOSHeader
        purposeLabel="Growth"
        actions={[
          { label: "Admin", href: "/admin", variant: "outline" },
          { label: "Operations", href: "/admin/operations", variant: "outline" },
          { label: "Refresh", href: "/admin/growth", variant: "default" },
        ]}
      />

      <section className="mx-auto w-full max-w-[1280px] px-4 pb-12 pt-28 sm:px-6 lg:px-8">
        <section className="vos-panel p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Owner Metrics</Badge>
            <Badge variant="muted">Generated {formatDateTime(snapshot.generatedAt)}</Badge>
            <Badge variant={snapshot.dataSource.available ? "ready" : "risky"}>
              {snapshot.dataSource.available ? "Postgres live" : `Postgres unavailable: ${snapshot.dataSource.reason}`}
            </Badge>
          </div>
          <h1 className="mt-4 vos-h1">Users and money.</h1>
          <p className="mt-3 max-w-3xl vos-body">
            Tracks real database users, paid customers, subscriptions, revenue, and plan mix without counting internal founder access as paid revenue. If the database source is unavailable, VentureOS keeps the page online and marks the counts as unavailable instead of pretending they are proven.
          </p>
        </section>

        <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Metric label="Total users" value={snapshot.users.total} detail="All user rows" />
          <Metric label="Likely real" value={snapshot.users.likelyReal} detail="Excludes obvious system/test users" tone="ready" />
          <Metric label="Paying users" value={snapshot.revenue.paidUsers} detail="Users with paid payments" tone={snapshot.revenue.paidUsers ? "ready" : "muted"} />
          <Metric label="Active subs" value={snapshot.revenue.activeSubscribers} detail="Active Pro/Team subscriptions" tone={snapshot.revenue.activeSubscribers ? "ready" : "muted"} />
          <Metric label="MRR" value={formatMoney(snapshot.revenue.estimatedMrrCents)} detail="Estimated from active tiers" tone={snapshot.revenue.estimatedMrrCents ? "ready" : "muted"} />
        </section>

        <section className="mt-6 grid gap-3 md:grid-cols-3">
          <Metric label="Revenue" value={formatMoney(snapshot.revenue.totalPaidRevenueCents)} detail="Completed paid payments" tone={snapshot.revenue.totalPaidRevenueCents ? "ready" : "muted"} />
          <Metric label="New 7 days" value={snapshot.users.newLast7Days} detail="Recent signups" />
          <Metric label="New 30 days" value={snapshot.users.newLast30Days} detail="Monthly signups" />
        </section>

        <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Metric label="Unique previews" value={realPreviewStarted} detail="Real non-bot preview visitors" tone={realPreviewStarted >= 10 ? "ready" : "muted"} />
          <Metric label="Unique completions" value={realPreviewCompleted} detail="Real completed preview visitors" tone={realPreviewCompleted ? "ready" : "muted"} />
          <Metric label="Unique paid intent" value={realPaidIntent} detail="Real paid CTA or checkout visitors" tone={realPaidIntent ? "ready" : "muted"} />
          <Metric label="Unique checkouts" value={realCheckoutStarted} detail="Real checkout-start visitors" tone={realCheckoutStarted ? "ready" : "muted"} />
          <Metric label="Homepage intent" value={homepageDemand} detail="Real free review or pricing visitors" tone={homepageDemand ? "ready" : "muted"} />
        </section>

        <section className="mt-6 grid gap-3 md:grid-cols-3">
          <Metric label="Captured leads" value={waitlist.total} detail={waitlist.available ? "Unique emails in durable KV/Postgres" : "Lead store unavailable"} tone={waitlist.total ? "ready" : "muted"} />
          <Metric label="Lead store" value={waitlist.available ? "Live" : "Offline"} detail="Durable lead capture status" tone={waitlist.available ? "ready" : "muted"} />
          <Metric label="Waitlist event" value={funnel.events["waitlist.joined"] || 0} detail="All waitlist submissions by event" tone={(funnel.events["waitlist.joined"] || 0) ? "ready" : "muted"} />
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
          <Panel title="Funnel Proof Gates" badge={funnel.available ? "live kv" : "unavailable"}>
            <div className="grid gap-2">
              <BreakdownRow label="Demand proof" value={realPreviewStarted} total={10} />
              <BreakdownRow label="Conversion proof" value={funnel.uniqueReal.previewToCheckoutPath ? 1 : 0} total={1} />
              <BreakdownRow label="Synthetic events" value={funnel.syntheticTotalEvents} total={Math.max(1, funnel.totalEvents)} />
              <BreakdownRow label="Bot events" value={funnel.botTotalEvents} total={Math.max(1, funnel.totalEvents)} />
            </div>
            <p className="mt-3 px-1 text-xs font-bold leading-5 text-[rgb(var(--vos-text-muted))]">
              Enterprise readiness requires 10 unique real preview visitors and at least one unique real visitor with both preview and checkout. Synthetic tests and obvious bots are tracked but excluded.
            </p>
          </Panel>

          <Panel title="Demand Campaign Links" badge="send these">
            <div className="grid gap-3">
              {demandLinks.map((link) => (
                <div key={link.label} className="rounded-lg border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] p-3">
                  <p className="text-sm font-black text-[rgb(var(--vos-text))]">{link.label}</p>
                  <p className="mt-1 text-xs font-bold leading-5 text-[rgb(var(--vos-text-muted))]">{link.detail}</p>
                  <a href={link.href} className="mt-2 block truncate font-mono text-xs font-bold text-[rgb(var(--vos-verified))]" title={link.href}>
                    {link.href}
                  </a>
                </div>
              ))}
            </div>
          </Panel>
        </section>

        <section className="mt-6">
          <Panel title="Recent Funnel Events" badge={`${funnel.recent.length} latest`}>
            <DataTable
              headers={["Event", "Source", "Kind", "Repo", "Created"]}
              rows={funnel.recent.map((event) => [
                event.eventType,
                event.source,
                event.bot ? "bot" : event.synthetic ? "synthetic" : "real",
                event.hasRepositoryUrl ? "yes" : "no",
                formatDateTime(event.createdAt),
              ])}
              empty="No funnel events recorded yet."
            />
          </Panel>
        </section>

        <section className="mt-6">
          <Panel title="Recent Leads" badge={`${waitlist.recent.length} latest`}>
            <DataTable
              headers={["Email", "Role", "Source", "Campaign", "Created"]}
              rows={waitlist.recent.map((lead) => [
                lead.email,
                lead.role,
                lead.source,
                lead.campaign || "none",
                formatDateTime(lead.createdAt),
              ])}
              empty="No leads captured yet."
            />
          </Panel>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
          <Panel title="Plan Mix" badge={`${snapshot.plans.length} plans`}>
            <div className="grid gap-2">
              {snapshot.plans.map((plan) => (
                <BreakdownRow key={plan.plan} label={plan.plan} value={plan.count} total={snapshot.users.total} />
              ))}
            </div>
          </Panel>

          <Panel title="Recent Users" badge={`${snapshot.recentUsers.length} latest`}>
            <DataTable
              headers={["Email", "Plan", "Created"]}
              rows={snapshot.recentUsers.map((user) => [user.email, user.plan, formatDateTime(user.createdAt)])}
              empty="No users recorded yet."
            />
          </Panel>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <Panel title="Subscription Mix" badge={`${snapshot.subscriptions.length} states`}>
            {snapshot.subscriptions.length ? (
              <DataTable
                headers={["Tier", "Status", "Count"]}
                rows={snapshot.subscriptions.map((subscription) => [subscription.tier, subscription.status, String(subscription.count)])}
                empty="No subscriptions recorded yet."
              />
            ) : (
              <Empty>No subscriptions recorded yet.</Empty>
            )}
          </Panel>

          <Panel title="Recent Payments" badge={`${snapshot.recentPayments.length} latest`}>
            <DataTable
              headers={["Email", "Offer", "Status", "Amount", "Created"]}
              rows={snapshot.recentPayments.map((payment) => [
                payment.email || "unknown",
                payment.offerId,
                payment.status,
                formatMoney(payment.amount),
                formatDateTime(payment.createdAt),
              ])}
              empty="No payments recorded yet."
            />
          </Panel>
        </section>
      </section>
    </main>
  );
}

async function adminAccess() {
  try {
    const session = await requireSession();
    await requireAdmin(session);
    return "allowed" as const;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "UNAUTHORIZED") return "unauthorized" as const;
    return "forbidden" as const;
  }
}

function AdminLoginRequired() {
  return (
    <main className="vos-page grid min-h-screen place-items-center px-4 pt-20">
      <VentureOSHeader purposeLabel="Growth" actions={[{ label: "Home", href: "/", variant: "outline" }]} />
      <section className="w-full max-w-md vos-panel p-6">
        <p className="vos-label">Owner Metrics Locked</p>
        <h1 className="mt-3 vos-h1">Sign in to track users and money.</h1>
        <p className="mt-3 vos-body">
          User counts, payment totals, subscriptions, and recent customer activity are only shown after admin authentication.
        </p>
        <Link href="/admin/login" className="mt-6 action primary">
          Open Admin Login
        </Link>
      </section>
    </main>
  );
}

function AdminAccessDenied() {
  return (
    <main className="vos-page grid min-h-screen place-items-center px-4 pt-20">
      <VentureOSHeader purposeLabel="Growth" actions={[{ label: "Home", href: "/", variant: "default" }]} />
      <section className="w-full max-w-md vos-panel p-6">
        <p className="vos-label text-[rgb(var(--vos-danger))]">Admin Access Blocked</p>
        <h1 className="mt-3 vos-h1">You do not have admin permission.</h1>
        <Link href="/" className="mt-6 action primary">
          Return to VentureOS
        </Link>
      </section>
    </main>
  );
}

function demandCampaignLinks() {
  const origin = appOriginForLinks();
  const sampleRepo = "https://github.com/tiiiiuii5-stack/aresv.git";
  return [
    {
      label: "Founder outreach",
      detail: "Send this to founders who need a fast software trust decision.",
      href: trackedReviewUrl(origin, "founder_outreach", "founder_dm", sampleRepo),
    },
    {
      label: "Buyer proof",
      detail: "Send this to buyers or operators reviewing a software asset.",
      href: trackedReviewUrl(origin, "buyer_review", "buyer_email", sampleRepo),
    },
    {
      label: "Public sample",
      detail: "Use this anywhere you need a low-friction demo that starts scanning immediately.",
      href: trackedReviewUrl(origin, "public_sample", "public_link", sampleRepo),
    },
  ];
}

function trackedReviewUrl(origin: string, campaign: string, source: string, repo: string) {
  const url = new URL("/t", origin);
  url.searchParams.set("e", "homepage.free_review_clicked");
  url.searchParams.set("source", source);
  url.searchParams.set("to", "/free-review");
  url.searchParams.set("repo", repo);
  url.searchParams.set("framework", "nextjs");
  url.searchParams.set("campaign", campaign);
  url.searchParams.set("utm_source", source);
  return url.toString();
}

function appOriginForLinks() {
  try {
    return canonicalAppUrl();
  } catch {
    return "https://ventureos-full-fixed.vercel.app";
  }
}

function Metric({ label, value, detail, tone = "muted" }: { label: string; value: number | string; detail: string; tone?: "ready" | "muted" }) {
  return (
    <div className="vos-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="vos-label">{label}</p>
        <Badge variant={tone}>{tone === "ready" ? "live" : "track"}</Badge>
      </div>
      <p className="mt-3 text-3xl font-black text-[rgb(var(--vos-text))]">{value}</p>
      <p className="mt-1 text-xs font-bold text-[rgb(var(--vos-text-muted))]">{detail}</p>
    </div>
  );
}

function Panel({ title, badge, children }: { title: string; badge: string; children: ReactNode }) {
  return (
    <section className="vos-panel">
      <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--vos-border))] p-4">
        <h2 className="text-base font-black text-[rgb(var(--vos-text))]">{title}</h2>
        <Badge variant="muted">{badge}</Badge>
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function BreakdownRow({ label, value, total }: { label: string; value: number; total: number }) {
  const width = total ? Math.min(100, Math.max((value / total) * 100, value ? 4 : 0)) : 0;
  return (
    <div className="border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black uppercase text-[rgb(var(--vos-text))]">{label}</p>
        <p className="font-mono text-sm font-black text-[rgb(var(--vos-text-muted))]">{value}</p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[rgb(var(--vos-border))]">
        <div className="h-full bg-[rgb(var(--vos-verified))]" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function DataTable({ headers, rows, empty }: { headers: string[]; rows: string[][]; empty: string }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="vos-table min-w-[620px] text-left text-xs">
        <thead className="bg-[rgb(var(--vos-panel-raised))]">
          <tr>{headers.map((header) => <th key={header} className="px-3 py-2 font-black uppercase text-[rgb(var(--vos-text-subtle))]">{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row[0]}:${index}`} className="border-b border-[rgb(var(--vos-border))] last:border-b-0">
              {row.map((cell, cellIndex) => (
                <td key={`${cell}:${cellIndex}`} className="max-w-[260px] truncate px-3 py-2 font-bold text-[rgb(var(--vos-text-muted))]" title={cell}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="p-3 text-sm font-bold text-[rgb(var(--vos-text-muted))]">{children}</p>;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
