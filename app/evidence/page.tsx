import Link from "next/link";

import { EvidenceExplorer } from "@/components/diligence/evidence-explorer";
import { InstitutionalPageHero, InstitutionalPageShell } from "@/components/institutional/institutional-shell";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { buildDueDiligenceWorkspace } from "@/lib/diligence/due-diligence-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "VentureOS Evidence Explorer",
  description: "Search hashed evidence records with source attribution, confidence, and limitations.",
};

export default async function EvidencePage() {
  const workspace = await buildDueDiligenceWorkspace({ limit: 16 });

  return (
    <InstitutionalPageShell
      purposeLabel="Evidence Explorer"
      maxWidth="max-w-[1320px]"
      actions={[
        { label: "Due Diligence", href: "/due-diligence", variant: "outline" },
        { label: "Trust Graph", href: "/trust-graph", variant: "outline" },
        { label: "Start Review", href: "/free-review", variant: "default" },
      ]}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Due Diligence", href: "/due-diligence" },
        { label: "Evidence" },
      ]}
    >
      <div className="grid gap-6">
        <InstitutionalPageHero
          eyebrow="Evidence Ledger"
          title="Search the facts behind every buyer conclusion."
          description="Every evidence record carries source attribution, timestamp, confidence, hash, verification status, and limitations."
          actions={
            <>
              <Link href="/trust-graph" className={buttonClassName({})}>
                View Trust Graph
              </Link>
              <Link href="/vendor-comparison" className={buttonClassName({ variant: "outline" })}>
                Compare Vendors
              </Link>
            </>
          }
          aside={
            <div className="grid gap-3">
              <Badge variant="ready">{workspace.metrics.evidenceRecords} records</Badge>
              <p className="text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">
                Confidence is evidence quality, not sales certainty. Low-confidence evidence stays visible so buyers know what remains unknown.
              </p>
            </div>
          }
        />
        <EvidenceExplorer records={workspace.evidence} />
      </div>
    </InstitutionalPageShell>
  );
}
