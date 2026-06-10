"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { RegistryItem } from "@/lib/registry/registry-pipeline";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";

type RegistryIndexTableProps = {
  assets: RegistryItem[];
  query: string;
};

export function RegistryIndexTable({ assets, query }: RegistryIndexTableProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedAssets = useMemo(
    () => selectedIds.map((id) => assets.find((asset) => asset.ventureOsId === id)).filter((asset): asset is RegistryItem => Boolean(asset)),
    [assets, selectedIds],
  );
  const comparisonReady = selectedAssets.length === 2;
  const compareStatus = comparisonReady
    ? `Comparing ${selectedAssets[0].ventureOsId} against ${selectedAssets[1].ventureOsId}.`
    : selectedAssets.length === 1
      ? "Select one more asset to compare."
      : "Select two assets to compare trust score, evidence coverage, status, and verification date.";

  return (
    <section className="grid gap-3">
      <div className="flex flex-col gap-2 border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel))] px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Registry Index</Badge>
          <Badge variant="muted">{assets.length} rows</Badge>
          {query ? <Badge variant="muted">Query: {query}</Badge> : <Badge variant="muted">Latest software passports</Badge>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <p id="registry-compare-status" className="text-xs font-bold text-[rgb(var(--vos-text-muted))]">
            {compareStatus}
          </p>
          <button
            type="button"
            className={buttonClassName({ variant: "outline", size: "sm" })}
            onClick={() => setSelectedIds([])}
            disabled={selectedIds.length === 0}
            title={selectedIds.length === 0 ? "Select assets before clearing comparison." : "Clear selected comparison assets."}
          >
            Clear
          </button>
          <Link href="/appraisal-intake?offer=instant" className={buttonClassName({ size: "sm" })}>
            New Passport
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel))]">
        <table className="vos-table min-w-[1260px] text-left text-sm">
          <caption className="sr-only">VentureOS institutional software asset registry index</caption>
          <thead className="bg-[rgb(var(--vos-panel-raised))]">
            <tr className="border-b border-[rgb(var(--vos-border))]">
              <RegistryHeader label="Compare" className="w-[92px]" />
              <RegistryHeader label="Passport ID" className="w-[190px]" />
              <RegistryHeader label="Name" />
              <RegistryHeader label="Trust" className="w-[132px] text-right" />
              <RegistryHeader label="State" className="w-[142px]" />
              <RegistryHeader label="Certificate" className="w-[130px]" />
              <RegistryHeader label="Transparency" className="w-[132px] text-right" />
              <RegistryHeader label="Events" className="w-[92px] text-right" />
              <RegistryHeader label="Last Verified" className="w-[150px]" />
              <RegistryHeader label="Actions" className="w-[280px]" />
            </tr>
          </thead>
          <tbody>
            {assets.length ? (
              assets.map((asset) => (
                <RegistryRow
                  key={asset.ventureOsId}
                  asset={asset}
                  selected={selectedIds.includes(asset.ventureOsId)}
                  selectionFull={selectedIds.length >= 2}
                  onToggle={() => {
                    setSelectedIds((current) => {
                      if (current.includes(asset.ventureOsId)) return current.filter((id) => id !== asset.ventureOsId);
                      if (current.length >= 2) return current;
                      return [...current, asset.ventureOsId];
                    });
                  }}
                />
              ))
            ) : (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-sm font-bold text-[rgb(var(--vos-text-muted))]">
                  No public asset matched that registry query.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ComparisonPanel assets={selectedAssets} />
    </section>
  );
}

function RegistryHeader({ label, className = "" }: { label: string; className?: string }) {
  return (
    <th scope="col" className={["px-3 py-2 text-xs font-black uppercase text-[rgb(var(--vos-text-subtle))]", className].filter(Boolean).join(" ")}>
      {label}
    </th>
  );
}

function RegistryRow({
  asset,
  selected,
  selectionFull,
  onToggle,
}: {
  asset: RegistryItem;
  selected: boolean;
  selectionFull: boolean;
  onToggle: () => void;
}) {
  const disabled = !selected && selectionFull;
  return (
    <tr className="border-b border-[rgb(var(--vos-border))] last:border-b-0 hover:bg-[rgb(var(--vos-panel-raised))]">
      <td className="px-3 py-2 align-middle">
        <label className="inline-flex items-center gap-2 text-xs font-bold text-[rgb(var(--vos-text-muted))]">
          <input
            type="checkbox"
            checked={selected}
            disabled={disabled}
            onChange={onToggle}
            aria-describedby="registry-compare-status"
            title={disabled ? "Clear a selected asset before selecting another." : `Select ${asset.ventureOsId} for comparison.`}
            className="h-4 w-4 accent-[rgb(var(--vos-primary))]"
          />
          Select
        </label>
      </td>
      <td className="px-3 py-2 align-middle font-black text-[rgb(var(--vos-text))]">{asset.ventureOsId}</td>
      <td className="px-3 py-2 align-middle">
        <div className="min-w-0">
          <p className="font-black text-[rgb(var(--vos-text))]">{asset.name}</p>
          <p className="mt-0.5 text-xs font-semibold text-[rgb(var(--vos-text-subtle))]">{asset.repository || asset.domain || asset.company || "Public software asset"}</p>
        </div>
      </td>
      <td className={["px-3 py-2 text-right align-middle text-base font-black", scoreClass(asset.trustScore)].join(" ")}>
        {formatTrustScore(asset.trustScore)}
      </td>
      <td className="px-3 py-2 align-middle">
        <Badge variant={stateBadge(asset.currentState)}>{asset.currentState}</Badge>
      </td>
      <td className="px-3 py-2 align-middle">
        <Badge variant={asset.certificateStatus === "Active" ? "ready" : asset.certificateStatus === "Pending" ? "muted" : "risky"}>{asset.certificateStatus}</Badge>
      </td>
      <td className="px-3 py-2 text-right align-middle font-black text-[rgb(var(--vos-text))]">{asset.transparencyEntries}</td>
      <td className="px-3 py-2 text-right align-middle font-black text-[rgb(var(--vos-text))]">{asset.eventCount}</td>
      <td className="px-3 py-2 align-middle text-xs font-black uppercase text-[rgb(var(--vos-text-muted))]">{formatDate(asset.lastVerification)}</td>
      <td className="px-3 py-2 align-middle">
        <div className="flex items-center gap-2">
          <Link href={`/registry/${encodeURIComponent(asset.ventureOsId)}`} className={buttonClassName({ variant: "outline", size: "sm" })}>
            Profile
          </Link>
          <Link href={asset.publicVerificationUrl} className={buttonClassName({ variant: "outline", size: "sm" })}>
            Verify
          </Link>
          <Link href={asset.appraisalUrl} className={buttonClassName({ variant: "outline", size: "sm" })}>
            Report
          </Link>
          <Link href={scanHrefFor(asset)} className={buttonClassName({ size: "sm" })}>
            Recheck
          </Link>
        </div>
      </td>
    </tr>
  );
}

function ComparisonPanel({ assets }: { assets: RegistryItem[] }) {
  if (assets.length !== 2) {
    return (
      <div className="border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel))] px-3 py-2">
        <p className="text-xs font-bold text-[rgb(var(--vos-text-muted))]">
            Comparison behavior: select two passports from the index to compare trust score, evidence coverage, status, and verification date. No private evidence is exposed.
        </p>
      </div>
    );
  }

  const [left, right] = assets;
  const scoreDelta = right.trustScore - left.trustScore;
  const evidenceDelta = right.evidenceCoverage - left.evidenceCoverage;

  return (
    <section className="overflow-x-auto border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel))]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] px-3 py-2">
        <div>
          <p className="vos-label">Comparison View</p>
          <h2 className="vos-h2">Selected asset delta</h2>
        </div>
        <Badge variant={scoreDelta >= 0 ? "ready" : "blocked"}>{scoreDelta >= 0 ? "+" : ""}{scoreDelta} score delta</Badge>
      </div>
      <table className="vos-table min-w-[760px] text-sm">
        <tbody>
          <ComparisonRow label="Asset ID" left={left.ventureOsId} right={right.ventureOsId} delta="-" />
          <ComparisonRow label="Name" left={left.name} right={right.name} delta="-" />
          <ComparisonRow label="Trust" left={formatTrustScore(left.trustScore)} right={formatTrustScore(right.trustScore)} delta={left.trustScore && right.trustScore ? `${scoreDelta >= 0 ? "+" : ""}${scoreDelta}` : "Pending"} />
          <ComparisonRow label="Evidence Coverage" left={`${left.evidenceCoverage}%`} right={`${right.evidenceCoverage}%`} delta={`${evidenceDelta >= 0 ? "+" : ""}${evidenceDelta}%`} />
          <ComparisonRow label="State" left={left.currentState} right={right.currentState} delta={left.currentState === right.currentState ? "Same" : "Changed"} />
          <ComparisonRow label="Event Count" left={`${left.eventCount}`} right={`${right.eventCount}`} delta={`${right.eventCount - left.eventCount}`} />
          <ComparisonRow label="Last Verified" left={formatDate(left.lastVerification)} right={formatDate(right.lastVerification)} delta={dateDeltaLabel(left.lastVerification, right.lastVerification)} />
        </tbody>
      </table>
      <div className="flex flex-col gap-2 border-t border-[rgb(var(--vos-border))] px-3 py-2 sm:flex-row">
        <Link href={left.passportUrl} className={buttonClassName({ variant: "outline", size: "sm" })}>
          Open Left Passport
        </Link>
        <Link href={right.passportUrl} className={buttonClassName({ variant: "outline", size: "sm" })}>
          Open Right Passport
        </Link>
        <Link href={scanHrefFor(right)} className={buttonClassName({ size: "sm" })}>
          Recheck Comparison Target
        </Link>
      </div>
    </section>
  );
}

function ComparisonRow({ label, left, right, delta }: { label: string; left: string; right: string; delta: string }) {
  return (
    <tr className="border-b border-[rgb(var(--vos-border))] last:border-b-0">
      <th scope="row" className="w-[180px] px-3 py-2 text-left text-xs font-black uppercase text-[rgb(var(--vos-text-subtle))]">
        {label}
      </th>
      <td className="px-3 py-2 font-black text-[rgb(var(--vos-text))]">{left}</td>
      <td className="px-3 py-2 font-black text-[rgb(var(--vos-text))]">{right}</td>
      <td className="w-[150px] px-3 py-2 text-right text-xs font-black uppercase text-[rgb(var(--vos-text-muted))]">{delta}</td>
    </tr>
  );
}

function scanHrefFor(asset: RegistryItem) {
  const repo = asset.repository ? `https://github.com/${asset.repository}` : asset.domain ? `https://${asset.domain}` : "";
  const params = new URLSearchParams({ offer: "instant", assetId: asset.ventureOsId });
  if (repo) params.set("repo", repo);
  return `/appraisal-intake?${params.toString()}`;
}

function stateBadge(state: string) {
  if (["VERIFIED", "ISSUED", "LOCKED", "TRANSPARENCY_LOCKED"].includes(state)) return "ready" as const;
  if (["FAILED", "REVOKED", "CANCELLED", "REFUNDED"].includes(state)) return "blocked" as const;
  if (["RISKY", "SCANNING", "APPRAISING", "CERTIFYING"].includes(state)) return "risky" as const;
  return "muted" as const;
}

function scoreClass(score: number) {
  if (score <= 0) return "vos-status-unknown";
  if (score >= 85) return "vos-status-verified";
  if (score >= 60) return "vos-status-risk";
  return "vos-status-danger";
}

function formatTrustScore(score: number) {
  return score > 0 ? `${score}/100` : "Pending";
}

function dateDeltaLabel(left: string, right: string) {
  const deltaMs = new Date(right).getTime() - new Date(left).getTime();
  if (!Number.isFinite(deltaMs) || deltaMs === 0) return "Same day";
  const days = Math.round(deltaMs / 86_400_000);
  if (days === 0) return "Same day";
  return `${days > 0 ? "+" : ""}${days} day${Math.abs(days) === 1 ? "" : "s"}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
