import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { VentureOSHeader } from "@/components/institutional/institutional-shell";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { buildVentureOSTrustGraph } from "@/lib/trust-graph/trustGraph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const graph = await buildVentureOSTrustGraph(decodeURIComponent(id || ""));
  if (!graph) return { title: "VentureOS Trust Profile" };
  return {
    title: `${graph.asset.name} Trust Profile`,
    description: `${graph.asset.name} trust score ${graph.explanation.trustScore}/100 with ${graph.nodes.length} linked evidence nodes.`,
  };
}

export default async function PublicTrustProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const graph = await buildVentureOSTrustGraph(decodeURIComponent(id || ""));
  if (!graph) notFound();

  return (
    <main className="vos-page min-h-screen">
      <VentureOSHeader purposeLabel="Trust Profile" actions={[
        { label: "Registry", href: "/registry", variant: "outline" },
        { label: "Passport", href: graph.asset.passportUrl, variant: "outline" },
        { label: "Verify", href: graph.asset.publicVerificationUrl, variant: "default" },
      ]} />
      <section className="mx-auto w-full max-w-[1280px] px-4 pb-12 pt-28 sm:px-6 lg:px-8">
        <section className="vos-panel p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{graph.registryItemId}</Badge>
            <Badge variant={graph.explanation.policy.registryStatus === "VERIFIED" ? "ready" : graph.explanation.policy.registryStatus === "BLOCKED" ? "blocked" : "risky"}>{graph.explanation.policy.registryStatus}</Badge>
            <Badge variant="muted">{graph.nodes.length} nodes</Badge>
          </div>
          <h1 className="mt-4 vos-h1">{graph.asset.name}</h1>
          <p className="mt-3 max-w-3xl vos-body">{graph.explanation.summary}</p>
        </section>

        <section className="mt-6 grid gap-3 md:grid-cols-4">
          <Metric label="Trust Score" value={`${graph.explanation.trustScore}/100`} />
          <Metric label="Scans" value={String(graph.counts.scan)} />
          <Metric label="Certificates" value={String(graph.counts.certificate)} />
          <Metric label="Evidence" value={String(graph.counts.evidence + graph.counts.finding)} />
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <Panel title="Why This Score">
            <div className="grid gap-3">
              {graph.explanation.reasons.map((reason) => (
                <ExplanationRow key={reason.label} label={reason.label} impact={`+${reason.impact}`} tone="ready" />
              ))}
              {graph.explanation.penalties.map((penalty) => (
                <ExplanationRow key={penalty.label} label={penalty.label} impact={`${penalty.impact}`} tone="blocked" />
              ))}
            </div>
          </Panel>

          <Panel title="Governance Policy">
            <div className="grid gap-2">
              {graph.explanation.policy.rules.map((rule) => (
                <div key={rule.rule} className="border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-black uppercase text-[rgb(var(--vos-text))]">{rule.rule}</p>
                    <Badge variant={rule.result === "pass" ? "ready" : rule.result === "fail" ? "blocked" : "risky"}>{rule.result}</Badge>
                  </div>
                  <p className="mt-2 text-xs font-bold text-[rgb(var(--vos-text-muted))]">{rule.reason}</p>
                </div>
              ))}
            </div>
          </Panel>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <Panel title="Trust Time Machine">
            <div className="grid gap-2">
              {graph.timeline.map((point) => (
                <div key={`${point.source}:${point.timestamp}:${point.label}`} className="grid grid-cols-[90px_1fr_auto] items-center gap-3 border-b border-[rgb(var(--vos-border))] py-2 last:border-b-0">
                  <p className="text-xs font-black uppercase text-[rgb(var(--vos-text-subtle))]">{formatDate(point.timestamp)}</p>
                  <p className="text-sm font-bold text-[rgb(var(--vos-text-muted))]">{point.label}</p>
                  <p className="text-sm font-black text-[rgb(var(--vos-text))]">{point.score}/100</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Linked Trust Graph">
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(graph.counts).map(([type, count]) => (
                <div key={type} className="border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] p-3">
                  <p className="text-xs font-black uppercase text-[rgb(var(--vos-text-subtle))]">{type}</p>
                  <p className="mt-2 text-2xl font-black text-[rgb(var(--vos-text))]">{count}</p>
                </div>
              ))}
            </div>
            <Link href={graph.asset.passportUrl} className={buttonClassName({ className: "mt-4" })}>Open Passport</Link>
          </Panel>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="vos-panel p-4"><p className="vos-label">{label}</p><p className="mt-3 text-3xl font-black text-[rgb(var(--vos-text))]">{value}</p></div>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="vos-panel"><div className="border-b border-[rgb(var(--vos-border))] p-4"><h2 className="text-base font-black text-[rgb(var(--vos-text))]">{title}</h2></div><div className="p-4">{children}</div></section>;
}

function ExplanationRow({ label, impact, tone }: { label: string; impact: string; tone: "ready" | "blocked" }) {
  return <div className="flex items-center justify-between gap-3 border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] p-3"><p className="text-sm font-bold text-[rgb(var(--vos-text-muted))]">{label}</p><Badge variant={tone}>{impact}</Badge></div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(new Date(value));
}
