"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import type { EvidenceCategory, EvidenceRecord, EvidenceSourceKind } from "@/lib/diligence/due-diligence-engine";

const categories: Array<"all" | EvidenceCategory> = [
  "all",
  "identity",
  "security",
  "reliability",
  "maintainability",
  "buyer_readiness",
  "supply_chain",
  "ledger",
];

const sources: Array<"all" | EvidenceSourceKind> = [
  "all",
  "registry",
  "github_repository",
  "domain",
  "sbom",
  "certificate",
  "transparency_log",
  "event_log",
  "self_attested",
];

export function EvidenceExplorer({ records }: { records: EvidenceRecord[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | EvidenceCategory>("all");
  const [source, setSource] = useState<"all" | EvidenceSourceKind>("all");
  const [minimumConfidence, setMinimumConfidence] = useState(0);
  const [copiedHash, setCopiedHash] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return records.filter((record) => {
      const matchesQuery =
        !normalized ||
        [
          record.subjectName,
          record.subjectId,
          record.source,
          record.type,
          record.summary,
          record.hash,
          ...record.anchors.map((anchor) => `${anchor.kind} ${anchor.externalId} ${anchor.url}`),
          ...record.provenance.map((step) => step.label),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      return (
        matchesQuery &&
        (category === "all" || record.category === category) &&
        (source === "all" || record.sourceKind === source) &&
        record.confidence >= minimumConfidence
      );
    });
  }, [category, minimumConfidence, query, records, source]);

  async function copyHash(hash: string) {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedHash(hash);
      window.setTimeout(() => setCopiedHash(""), 1800);
    } catch {
      setCopiedHash("");
    }
  }

  return (
    <div className="grid gap-4">
      <section className="vos-panel p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px_220px]">
          <label className="grid gap-2">
            <span className="vos-label">Search Evidence</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Repository, domain, passport ID, hash, finding"
              className="input min-h-12"
            />
          </label>
          <label className="grid gap-2">
            <span className="vos-label">Category</span>
            <select value={category} onChange={(event) => setCategory(event.target.value as "all" | EvidenceCategory)} className="input min-h-12">
              {categories.map((item) => (
                <option key={item} value={item}>
                  {labelize(item)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="vos-label">Source</span>
            <select value={source} onChange={(event) => setSource(event.target.value as "all" | EvidenceSourceKind)} className="input min-h-12">
              {sources.map((item) => (
                <option key={item} value={item}>
                  {labelize(item)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="vos-label">Minimum Confidence</span>
            <div className="vos-cell flex min-h-12 items-center gap-3 px-3">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={minimumConfidence}
                onChange={(event) => setMinimumConfidence(Number(event.target.value))}
                className="w-full accent-[rgb(var(--vos-primary))]"
              />
              <span className="w-10 text-right font-mono text-sm font-black text-[rgb(var(--vos-text))]">{minimumConfidence}</span>
            </div>
          </label>
        </div>
      </section>

      <section className="vos-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgb(var(--vos-border))] p-4">
          <div>
            <p className="vos-label">Evidence Ledger</p>
            <h2 className="mt-1 vos-h2">{filtered.length} record{filtered.length === 1 ? "" : "s"}</h2>
          </div>
          {copiedHash ? <Badge variant="ready">Hash copied</Badge> : <Badge variant="muted">{records.length} total</Badge>}
        </div>
        <div className="overflow-x-auto">
          <table className="vos-table min-w-[1120px]">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Source</th>
                <th>Type</th>
                <th>Confidence</th>
                <th>Summary</th>
                <th>Hash</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? (
                filtered.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <p className="font-black">{record.subjectName}</p>
                      <p className="mt-1 font-mono text-xs text-[rgb(var(--vos-text-subtle))]">{record.subjectId}</p>
                    </td>
                    <td>
                      <Badge variant={record.verified ? "ready" : "muted"}>{labelize(record.sourceKind)}</Badge>
                      <p className="mt-2 max-w-[240px] truncate text-xs font-bold text-[rgb(var(--vos-text-muted))]">{record.source}</p>
                      {record.anchors[0] ? (
                        <a href={record.anchors[0].url} target="_blank" rel="noreferrer" className="mt-2 block max-w-[240px] truncate text-xs font-black text-[rgb(var(--vos-primary))]">
                          {labelize(record.anchors[0].kind)}
                        </a>
                      ) : null}
                    </td>
                    <td>
                      <p className="font-black">{labelize(record.type)}</p>
                      <p className="mt-1 text-xs font-bold uppercase text-[rgb(var(--vos-text-subtle))]">{labelize(record.category)}</p>
                    </td>
                    <td>
                      <ConfidenceBar value={record.confidence} />
                    </td>
                    <td className="max-w-[360px]">
                      <p className="text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">{record.summary}</p>
                      {record.limitations.length ? (
                        <p className="mt-2 text-xs font-semibold leading-5 text-[rgb(var(--vos-text-subtle))]">{record.limitations[0]}</p>
                      ) : null}
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs font-black uppercase text-[rgb(var(--vos-primary))]">Provenance</summary>
                        <div className="mt-2 grid gap-2">
                          {record.provenance.slice(0, 4).map((step) => (
                            <div key={`${record.id}:${step.stage}:${step.outputHash}`} className="rounded-md border border-[rgb(var(--vos-border))] p-2">
                              <p className="text-xs font-black uppercase text-[rgb(var(--vos-text))]">{labelize(step.stage)}</p>
                              <p className="mt-1 text-xs font-semibold text-[rgb(var(--vos-text-muted))]">{step.label}</p>
                              <p className="mt-1 truncate font-mono text-[11px] text-[rgb(var(--vos-text-subtle))]">{step.outputHash}</p>
                              {step.impact ? (
                                <p className="mt-1 font-mono text-xs font-black text-[rgb(var(--vos-text))]">
                                  impact {step.impact.impact >= 0 ? "+" : ""}{step.impact.impact}
                                </p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </details>
                    </td>
                    <td>
                      <p className="max-w-[180px] truncate font-mono text-xs font-bold text-[rgb(var(--vos-text-subtle))]">{record.hash}</p>
                    </td>
                    <td>
                      <button type="button" onClick={() => copyHash(record.hash)} className={buttonClassName({ variant: "outline", size: "sm" })}>
                        Copy Hash
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm font-bold text-[rgb(var(--vos-text-muted))]">
                    No evidence matches the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const tone = value >= 80 ? "bg-[rgb(var(--vos-verified))]" : value >= 60 ? "bg-[rgb(var(--vos-risk))]" : "bg-[rgb(var(--vos-danger))]";
  return (
    <div className="w-36">
      <div className="flex items-center justify-between">
        <span className="vos-label">Score</span>
        <span className="font-mono text-sm font-black text-[rgb(var(--vos-text))]">{value}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[rgb(var(--vos-panel-raised))]">
        <div className={["h-full rounded-full", tone].join(" ")} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function labelize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
