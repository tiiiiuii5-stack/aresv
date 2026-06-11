import Link from "next/link";

import { TrustGraphView } from "@/components/diligence/trust-graph-view";
import { InstitutionalPageHero, InstitutionalPageShell } from "@/components/institutional/institutional-shell";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { buildDueDiligenceWorkspace } from "@/lib/diligence/due-diligence-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "VentureOS Trust Graph",
  description: "Interactive software trust graph connecting passports, source evidence, and risks.",
};

export default async function TrustGraphPage() {
  const workspace = await buildDueDiligenceWorkspace({ limit: 8 });

  return (
    <InstitutionalPageShell
      purposeLabel="Trust Graph"
      maxWidth="max-w-[1400px]"
      actions={[
        { label: "Evidence", href: "/evidence", variant: "outline" },
        { label: "Monitoring", href: "/monitoring", variant: "outline" },
        { label: "Start Review", href: "/free-review", variant: "default" },
      ]}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Due Diligence", href: "/due-diligence" },
        { label: "Trust Graph" },
      ]}
    >
      <div className="grid gap-6">
        <InstitutionalPageHero
          eyebrow="Relationship Model"
          title="A living graph of software evidence and risk."
          description="This graph connects software records to repositories, evidence records, signed receipts, transparency events, and risk findings."
          actions={
            <>
              <Link href="/evidence" className={buttonClassName({})}>
                Search Evidence
              </Link>
              <Link href="/due-diligence" className={buttonClassName({ variant: "outline" })}>
                Dashboard
              </Link>
            </>
          }
          aside={
            <div className="grid gap-3">
              <Badge variant="ready">{workspace.graph.nodes.length} nodes</Badge>
              <Badge variant="muted">{workspace.graph.edges.length} edges</Badge>
              <p className="text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">
                Use filters to hide machinery by default while keeping audit depth available.
              </p>
            </div>
          }
        />
        <TrustGraphView graph={workspace.graph} />
      </div>
    </InstitutionalPageShell>
  );
}
