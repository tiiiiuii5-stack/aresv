import Link from "next/link";

import { VentureOSHeader } from "@/components/institutional/institutional-shell";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { anchorManifestForLog, buildPublicTransparencyLog, type TransparencyLogEntry } from "@/lib/transparency/transparencyLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "VentureOS Transparency Log",
  description: "Public VentureOS transparency log for signed attestations, scan commitments, and registry proof hashes.",
};

export default async function TransparencyLogPage({
  searchParams,
}: {
  searchParams: Promise<{ certificateId?: string; certificate_id?: string }>;
}) {
  const params = await searchParams;
  const certificateId = params.certificateId || params.certificate_id || "";
  const log = await buildPublicTransparencyLog({ certificateId, limit: certificateId ? 120 : 80 });
  const anchor = anchorManifestForLog(log);
  const anchorApiUrl = `/api/transparency-log/anchor${certificateId ? `?certificateId=${encodeURIComponent(certificateId)}` : ""}`;
  const wellKnownUrl = `/.well-known/ventureos-transparency-anchor.json${certificateId ? `?certificateId=${encodeURIComponent(certificateId)}` : ""}`;
  const proofApiUrl = `/api/transparency-log/proof${certificateId ? `?certificateId=${encodeURIComponent(certificateId)}` : ""}`;
  const consistencyApiUrl = `/api/transparency-log/consistency?previousSize=${Math.max(0, log.entryCount - 1)}${certificateId ? `&certificateId=${encodeURIComponent(certificateId)}` : ""}`;

  return (
    <main className="vos-page min-h-screen">
      <VentureOSHeader
        purposeLabel="Public Transparency Log"
        actions={[
          { label: "Verification Registry", href: "/registry", variant: "outline" },
          { label: "Generate Report", href: "/appraisal-intake?offer=instant", variant: "default" },
        ]}
      />

      <section className="mx-auto w-full max-w-7xl px-4 pb-8 pt-20 sm:px-6 lg:px-8">
        <section className="border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel))]">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div className="border-b border-[rgb(var(--vos-border))] p-4 lg:border-b-0 lg:border-r">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Transparency Log</Badge>
                <Badge variant={log.verified ? "ready" : "blocked"}>{log.verified ? "Hash Chain Verified" : "Hash Chain Failed"}</Badge>
                <Badge variant="muted">{log.scope.replace(/_/g, " ")}</Badge>
              </div>
              <h1 className="mt-4 vos-h1">VentureOS Transparency Log</h1>
              <p className="mt-2 max-w-3xl vos-body">
                Public hash-chain proof for signed attestations, attestation snapshots, and scan commitments. The log exposes proof hashes, not private source code.
              </p>
            </div>
            <div className="grid grid-cols-2">
              <TransparencyMetric label="Entries" value={log.entryCount.toString()} />
              <TransparencyMetric label="Verified" value={log.verified ? "YES" : "NO"} status={log.verified ? "verified" : "danger"} />
              <TransparencyMetric label="Root Hash" value={shortHash(log.rootHash)} />
              <TransparencyMetric label="Merkle Root" value={shortHash(log.merkleTree.rootHash)} />
              <TransparencyMetric label="Anchor Hash" value={shortHash(anchor.anchorHash)} />
            </div>
          </div>
        </section>

        <section className="mt-3 border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel))]">
          <form action="/transparency-log" className="grid gap-0 md:grid-cols-[minmax(0,1fr)_160px_160px]">
            <label className="grid gap-1 border-b border-[rgb(var(--vos-border))] p-3 md:border-b-0 md:border-r">
              <span className="vos-label">Attestation ID</span>
              <input
                name="certificateId"
                defaultValue={certificateId}
                placeholder="vos-cert-..."
                className="h-9 w-full border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] px-3 text-sm font-bold text-[rgb(var(--vos-text))] outline-none"
              />
            </label>
            <div className="border-b border-[rgb(var(--vos-border))] p-3 md:border-b-0 md:border-r">
              <p className="vos-label">Scope</p>
              <p className="mt-2 text-sm font-black uppercase text-[rgb(var(--vos-text))]">{log.scope.replace(/_/g, " ")}</p>
            </div>
            <div className="flex items-end gap-2 p-3">
              <button type="submit" className={buttonClassName({ size: "sm", className: "w-full" })}>
                Verify
              </button>
              {certificateId ? (
                <Link href="/transparency-log" className={buttonClassName({ variant: "outline", size: "sm", className: "w-full" })}>
                  Reset
                </Link>
              ) : null}
            </div>
          </form>
        </section>

        <section className="mt-3 border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel))]">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="border-b border-[rgb(var(--vos-border))] p-3 lg:border-b-0 lg:border-r">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={anchor.signature ? "ready" : "risky"}>{anchor.signature ? "Signed Anchor" : "Unsigned Anchor"}</Badge>
                <Badge variant="muted">{anchor.publicationTargets[0]?.status || "published"}</Badge>
              </div>
              <h2 className="mt-3 vos-h2">Public Anchor Manifest</h2>
              <p className="mt-2 break-all font-mono text-xs font-bold text-[rgb(var(--vos-text-muted))]">{anchor.anchorHash}</p>
            </div>
            <div className="grid gap-2 p-3">
              <Link href={anchorApiUrl} className={buttonClassName({ variant: "outline", size: "sm" })}>
                Open Anchor API
              </Link>
              <Link href={wellKnownUrl} className={buttonClassName({ variant: "outline", size: "sm" })}>
                Open Well-Known Manifest
              </Link>
              <Link href={proofApiUrl} className={buttonClassName({ variant: "outline", size: "sm" })}>
                Open Inclusion Proof
              </Link>
              <Link href={consistencyApiUrl} className={buttonClassName({ variant: "outline", size: "sm" })}>
                Open Consistency Proof
              </Link>
            </div>
          </div>
          <div className="grid border-t border-[rgb(var(--vos-border))] md:grid-cols-3">
            <div className="border-b border-r border-[rgb(var(--vos-border))] p-3 md:border-b-0">
              <Badge variant="ready">{log.merkleTree.algorithm}</Badge>
              <p className="mt-3 vos-label">Merkle Inclusion Proofs</p>
              <p className="mt-2 text-xs font-bold text-[rgb(var(--vos-text-muted))]">
                Each entry can produce an audit path from leaf hash to Merkle root.
              </p>
            </div>
            <div className="border-b border-r border-[rgb(var(--vos-border))] p-3 md:border-b-0">
              <Badge variant={anchor.witnessPolicy.satisfied ? "ready" : "risky"}>{anchor.witnessPolicy.status.replace(/_/g, " ")}</Badge>
              <p className="mt-3 vos-label">Witness Policy</p>
              <p className="mt-2 text-xs font-bold text-[rgb(var(--vos-text-muted))]">
                {anchor.witnessPolicy.configuredIndependentWitnesses}/{anchor.witnessPolicy.minimumIndependentWitnesses} independent witnesses configured.
              </p>
            </div>
            <div className="border-b border-[rgb(var(--vos-border))] p-3 md:border-b-0">
              <Badge variant="muted">Explicit Limit</Badge>
              <p className="mt-3 vos-label">Fork Detection</p>
              <p className="mt-2 text-xs font-bold text-[rgb(var(--vos-text-muted))]">{anchor.witnessPolicy.reason}</p>
            </div>
          </div>
          <div className="grid border-t border-[rgb(var(--vos-border))] md:grid-cols-3">
            {anchor.publicationTargets.map((target) => (
              <div key={target.type} className="border-b border-r border-[rgb(var(--vos-border))] p-3 last:border-r-0 md:border-b-0">
                <Badge variant={target.status === "published" ? "ready" : target.status === "ready" ? "risky" : "muted"}>{target.status.replace(/_/g, " ")}</Badge>
                <p className="mt-3 vos-label">{target.type.replace(/_/g, " ")}</p>
                <p className="mt-2 text-xs font-bold text-[rgb(var(--vos-text-muted))]">{target.evidence}</p>
              </div>
            ))}
          </div>
          <div className="grid border-t border-[rgb(var(--vos-border))] md:grid-cols-3">
            {anchor.signatures.slice(0, 3).map((signature) => (
              <div key={signature.signerRole} className="border-b border-r border-[rgb(var(--vos-border))] p-3 last:border-r-0 md:border-b-0">
                <Badge variant={signature.status === "present" ? "ready" : "muted"}>{signature.status.replace(/_/g, " ")}</Badge>
                <p className="mt-3 vos-label">{signature.signerRole.replace(/_/g, " ")}</p>
                <p className="mt-2 break-all font-mono text-xs font-bold text-[rgb(var(--vos-text-muted))]">
                  {signature.signingKeyId || "No key configured"}
                </p>
              </div>
            ))}
          </div>
          <div className="border-t border-[rgb(var(--vos-border))] p-3">
            <p className="vos-label">Deterministic Rebuild</p>
            <p className="mt-2 text-xs font-bold text-[rgb(var(--vos-text-muted))]">{anchor.deterministicRebuild.guarantee}</p>
          </div>
        </section>

        <section className="mt-3 vos-panel p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="vos-label">Public Log Entries</p>
              <h2 className="mt-2 vos-h2">Verification history</h2>
            </div>
            <Badge variant={log.verified ? "ready" : "blocked"}>{log.verified ? "Chain verified" : "Needs review"}</Badge>
          </div>
          <div className="mt-5 grid gap-3">
            {log.entries.length ? (
              log.entries.map((entry) => <EntryCard key={`${entry.index}:${entry.entryHash}`} entry={entry} />)
            ) : (
              <div className="vos-cell p-6 text-center">
                <p className="text-sm font-bold text-[rgb(var(--vos-text-muted))]">No public transparency entries matched this query.</p>
              </div>
            )}
          </div>
        </section>

        <section className="mt-3 grid gap-3 md:grid-cols-2">
          {log.limitations.map((item) => (
            <div key={item} className="border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel))] p-3">
              <p className="vos-label">Limitation</p>
              <p className="mt-2 text-sm font-bold text-[rgb(var(--vos-text-muted))]">{item}</p>
            </div>
          ))}
        </section>
      </section>
    </main>
  );
}

function EntryCard({ entry }: { entry: TransparencyLogEntry }) {
  const primaryHash = entry.payloadHash || entry.sourceSnapshotHash || entry.publicSummaryHash || "-";
  return (
    <article className="vos-cell p-4 transition hover:border-[rgb(var(--vos-border-strong))]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">#{entry.index + 1}</Badge>
            <Badge variant={entry.type === "CERTIFICATE_ISSUED" ? "ready" : "muted"}>{entry.type.replace(/_/g, " ")}</Badge>
            <Badge variant={entry.attestation.status === "ingestion_signed" || entry.attestation.status === "certificate_payload_signed" ? "ready" : "muted"}>
              {entry.attestation.status.replace(/_/g, " ")}
            </Badge>
          </div>
          <h3 className="mt-3 text-base font-black text-[rgb(var(--vos-text))]">
            {entry.certificateId ? (
              <Link href={`/certificate/${encodeURIComponent(entry.certificateId)}`} className="hover:underline">
                {entry.certificateId}
              </Link>
            ) : "Registry proof entry"}
          </h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">{entry.evidence.reason}</p>
        </div>
        <p className="shrink-0 text-xs font-black uppercase text-[rgb(var(--vos-text-muted))]">{formatDate(entry.timestamp)}</p>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <HashCell label="Payload" value={primaryHash} />
        <HashCell label="Previous" value={entry.previousEntryHash} />
        <HashCell label="Entry" value={entry.entryHash} strong />
      </div>
      <p className="mt-3 text-[11px] font-black uppercase text-[rgb(var(--vos-text-subtle))]">
        {entry.evidence.source} / confidence {Math.round(entry.evidence.confidence * 100)}%
      </p>
    </article>
  );
}

function HashCell({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-md border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel))] p-3">
      <p className="vos-label">{label}</p>
      <p className={["mt-1 break-all font-mono text-xs font-bold", strong ? "text-[rgb(var(--vos-text))]" : "text-[rgb(var(--vos-text-muted))]"].join(" ")}>{shortHash(value)}</p>
    </div>
  );
}

function TransparencyMetric({ label, value, status }: { label: string; value: string; status?: "verified" | "danger" }) {
  const statusClass = status === "verified" ? "vos-status-verified" : status === "danger" ? "vos-status-danger" : "text-[rgb(var(--vos-text))]";
  return (
    <div className="border-b border-r border-[rgb(var(--vos-border))] p-3 even:border-r-0">
      <p className="vos-label">{label}</p>
      <p className={["mt-2 break-all text-lg font-black", statusClass].join(" ")}>{value}</p>
    </div>
  );
}

function shortHash(value: string) {
  if (!value || value === "-") return "-";
  return value.length <= 18 ? value : `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
