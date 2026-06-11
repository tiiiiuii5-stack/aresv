import Link from "next/link";

import { InstitutionalPageShell } from "@/components/institutional/institutional-shell";
import { RegistryIndexTable } from "@/components/registry/registry-index-table";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { buildRegistryItems } from "@/lib/registry/registry-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "VentureOS Software Passport Registry",
  description: "Search public VentureOS software evidence records, trust records, signed evidence receipts, and review history.",
};

export default async function VentureOSRegistryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const registry = await buildRegistryItems({ query: q, limit: 24 });
  const verifiedCount = registry.items.filter((asset) => asset.status === "VERIFIED").length;
  const averageTrust = average(registry.items.map((asset) => asset.trustScore).filter((score) => score > 0));
  const lastVerified = latestDate(registry.items.map((asset) => asset.lastVerification));
  const eventCount = registry.items.reduce((sum, item) => sum + item.eventCount, 0);

  return (
    <InstitutionalPageShell
        purposeLabel="Software Passport Registry"
        maxWidth="max-w-[1280px]"
        actions={[
          { label: "Transparency Log", href: "/transparency-log", variant: "outline" },
          { label: "Free Review", href: "/free-review", variant: "outline" },
          { label: "Generate Report", href: "/software-appraisal", variant: "default" },
        ]}
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Free Review", href: "/free-review" },
          { label: "Public Registry" },
        ]}
      >
        <section className="vos-panel">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="border-b border-[rgb(var(--vos-border))] p-8 lg:border-b-0 lg:border-r">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Software Passport Registry</Badge>
                <Badge variant="muted">Public Index</Badge>
                <Badge variant="muted">Public Verification</Badge>
              </div>
              <h1 className="mt-5 vos-h1">The public identity layer for software trust.</h1>
              <p className="mt-4 max-w-3xl vos-body">
                Search software evidence records by identity, receipt, organization, repository, or domain. Each record links trust status, evidence history, signed evidence receipts, and a permanent public record.
              </p>
            </div>
            <div className="grid grid-cols-2">
              <RegistryMetric label="Records" value={registry.count.toString()} />
              <RegistryMetric label="Verified" value={verifiedCount.toString()} />
              <RegistryMetric label="Avg Trust" value={registry.items.length ? `${averageTrust}/100` : "-"} />
              <RegistryMetric label="Events" value={eventCount.toString()} />
            </div>
          </div>
        </section>

        <section className="mt-6 vos-panel">
          <form action="/registry" className="grid gap-0 md:grid-cols-[minmax(0,1fr)_160px_160px]">
            <label className="grid gap-1 border-b border-[rgb(var(--vos-border))] p-3 md:border-b-0 md:border-r">
              <span className="vos-label">Passport Search</span>
              <input
                name="q"
                defaultValue={q}
                placeholder="Passport ID, badge ID, company, repository, domain"
                className="h-9 w-full border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] px-3 text-sm font-bold text-[rgb(var(--vos-text))] outline-none"
              />
            </label>
            <div className="border-b border-[rgb(var(--vos-border))] p-3 md:border-b-0 md:border-r">
              <p className="vos-label">Last Verified</p>
              <p className="mt-2 text-sm font-black uppercase text-[rgb(var(--vos-text))]">{lastVerified ? formatDate(lastVerified) : "-"}</p>
            </div>
            <div className="flex items-end gap-2 p-3">
              <button type="submit" className={buttonClassName({ size: "sm", className: "w-full" })}>
                Search
              </button>
              {q ? (
                <Link href="/registry" className={buttonClassName({ variant: "outline", size: "sm", className: "w-full" })}>
                  Reset
                </Link>
              ) : null}
            </div>
          </form>
        </section>

        <section className="mt-3 grid grid-cols-2 border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel))] md:grid-cols-5">
          {registry.searchedBy.map((item) => (
            <div key={item} className="border-b border-r border-[rgb(var(--vos-border))] p-2 last:border-r-0 md:border-b-0">
              <p className="text-[11px] font-black uppercase text-[rgb(var(--vos-text-subtle))]">{item}</p>
            </div>
          ))}
        </section>

        <section className="mt-3">
          <RegistryIndexTable assets={registry.items} query={registry.query} />
        </section>
    </InstitutionalPageShell>
  );
}

function RegistryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-r border-[rgb(var(--vos-border))] p-3 even:border-r-0">
      <p className="vos-label">{label}</p>
      <p className="mt-2 text-2xl font-black text-[rgb(var(--vos-text))]">{value}</p>
    </div>
  );
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function latestDate(values: string[]) {
  const timestamps = values.map((value) => new Date(value).getTime()).filter(Number.isFinite);
  if (!timestamps.length) return "";
  return new Date(Math.max(...timestamps)).toISOString();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
