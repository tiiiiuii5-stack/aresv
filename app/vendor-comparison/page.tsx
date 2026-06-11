import Link from "next/link";

import { InstitutionalPageHero, InstitutionalPageShell, InstitutionalPanel } from "@/components/institutional/institutional-shell";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { buildDueDiligenceWorkspace } from "@/lib/diligence/due-diligence-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "VentureOS Vendor Comparison",
  description: "Side-by-side software vendor comparison for procurement and buyer diligence.",
};

export default async function VendorComparisonPage() {
  const workspace = await buildDueDiligenceWorkspace({ limit: 16 });

  return (
    <InstitutionalPageShell
      purposeLabel="Vendor Comparison"
      maxWidth="max-w-[1320px]"
      actions={[
        { label: "Dashboard", href: "/due-diligence", variant: "outline" },
        { label: "Evidence", href: "/evidence", variant: "outline" },
        { label: "Start Review", href: "/free-review", variant: "default" },
      ]}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Due Diligence", href: "/due-diligence" },
        { label: "Vendor Comparison" },
      ]}
    >
      <div className="grid gap-6">
        <InstitutionalPageHero
          eyebrow="Procurement Workspace"
          title="Compare software vendors without reading every report first."
          description="This view turns trust score, confidence, evidence count, critical risks, and monitoring status into a buyer-ready decision table."
          actions={
            <>
              <Link href="/free-review" className={buttonClassName({})}>
                Add Vendor
              </Link>
              <Link href="/evidence" className={buttonClassName({ variant: "outline" })}>
                Inspect Evidence
              </Link>
            </>
          }
          aside={
            <p className="text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">
              Recommendation is policy output, not a guarantee. Buyers should review unknowns before procurement approval.
            </p>
          }
        />

        <InstitutionalPanel title="Comparison Table" eyebrow="Decision Matrix">
          <div className="overflow-x-auto">
            <table className="vos-table min-w-[980px]">
              <thead>
                <tr>
                  <th>Vendor / Software</th>
                  <th>Trust</th>
                  <th>Confidence</th>
                  <th>Evidence</th>
                  <th>Critical Risks</th>
                  <th>Status</th>
                  <th>Recommendation</th>
                  <th>Record</th>
                </tr>
              </thead>
              <tbody>
                {workspace.comparison.length ? (
                  workspace.comparison.map((vendor) => (
                    <tr key={vendor.id}>
                      <td>
                        <p className="font-black text-[rgb(var(--vos-text))]">{vendor.name}</p>
                        <p className="mt-1 font-mono text-xs font-bold text-[rgb(var(--vos-text-subtle))]">{vendor.id}</p>
                      </td>
                      <td className="font-mono text-lg font-black">{vendor.trustScore ? `${vendor.trustScore}/100` : "Pending"}</td>
                      <td>
                        <Meter value={vendor.confidence} />
                      </td>
                      <td className="font-mono text-lg font-black">{vendor.evidenceCount}</td>
                      <td>
                        <Badge variant={vendor.criticalRisks ? "blocked" : "ready"}>{vendor.criticalRisks}</Badge>
                      </td>
                      <td>
                        <Badge variant="outline">{vendor.status}</Badge>
                      </td>
                      <td>
                        <Badge variant={vendor.recommendation === "Proceed" ? "ready" : vendor.recommendation === "Review" ? "risky" : "blocked"}>
                          {vendor.recommendation}
                        </Badge>
                      </td>
                      <td>
                        <Link href={vendor.publicUrl} className={buttonClassName({ variant: "outline", size: "sm" })}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-sm font-bold text-[rgb(var(--vos-text-muted))]">
                      No vendors are available yet. Start a review to add the first comparison row.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </InstitutionalPanel>
      </div>
    </InstitutionalPageShell>
  );
}

function Meter({ value }: { value: number }) {
  return (
    <div className="w-40">
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm font-black text-[rgb(var(--vos-text))]">{value}/100</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[rgb(var(--vos-panel-raised))]">
        <div className="h-full rounded-full bg-[rgb(var(--vos-primary))]" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}
