import Link from "next/link";
import type { ReactNode } from "react";

import { VentureOSHeader } from "@/components/institutional/institutional-shell";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";

export type IntelligenceStatus = "verified" | "risk" | "danger" | "unknown";

export type IntelligenceBadge = {
  label: string;
  status?: IntelligenceStatus;
};

export type IntelligenceMetric = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  status?: IntelligenceStatus;
};

export type IntelligenceAction = {
  label: string;
  href?: string;
  onClick?: never;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  copyValue?: string;
  copySuccessMessage?: string;
};

export type IntelligenceListSection = {
  title: string;
  items: ReactNode[];
  status?: IntelligenceStatus;
  fallback?: ReactNode;
};

export type IntelligenceTimelineItem = {
  id: string;
  timestamp?: string;
  type?: string;
  title: string;
  status?: IntelligenceStatus;
  href?: string;
  metrics?: IntelligenceMetric[];
  detail?: ReactNode;
};

export type ArtifactPageSectionSet = {
  trustOverview: ReactNode;
  evidenceCoverage: ReactNode;
  riskSummary: ReactNode;
  metadata: ReactNode;
  timeline: ReactNode;
  linkedArtifacts: ReactNode;
};

const badgeVariantByStatus: Record<IntelligenceStatus, BadgeVariant> = {
  verified: "ready",
  risk: "risky",
  danger: "blocked",
  unknown: "muted",
};

const textClassByStatus: Record<IntelligenceStatus, string> = {
  verified: "vos-status-verified",
  risk: "vos-status-risk",
  danger: "vos-status-danger",
  unknown: "vos-status-unknown",
};

export function ArtifactPageLayout({
  artifactType,
  assetName,
  assetId,
  statusLabel,
  status = "unknown",
  trustScore,
  trustRating,
  generatedAt,
  headerActions = [],
  sections,
}: {
  artifactType: string;
  assetName: string;
  assetId: string;
  statusLabel: string;
  status?: IntelligenceStatus;
  trustScore: number | string;
  trustRating?: ReactNode;
  generatedAt?: string;
  headerActions?: IntelligenceAction[];
  sections: ArtifactPageSectionSet;
}) {
  return (
    <main className="vos-page min-h-screen">
      <VentureOSHeader purposeLabel={artifactType} actions={headerActions} />

      <section className="mx-auto w-full max-w-[1280px] px-4 pb-14 pt-28 sm:px-6 lg:px-8">
        <section className="print-break-inside-avoid vos-panel p-6 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{artifactType}</Badge>
                <Badge variant={badgeVariantByStatus[status]}>{statusLabel}</Badge>
                {generatedAt ? <Badge variant="muted">{generatedAt}</Badge> : null}
              </div>
              <h1 className="mt-5 vos-h1">{assetName}</h1>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <MetricCell item={{ label: "Asset ID", value: assetId }} />
                <MetricCell item={{ label: "Status", value: statusLabel, status }} />
              </div>
            </div>
            <div className="vos-cell p-6 lg:text-right">
              <p className="vos-label">Trust Score</p>
              <p className={["mt-3 text-6xl font-black leading-none", textClassByStatus[status]].join(" ")}>{trustScore}</p>
              {typeof trustScore === "number" ? <p className="mt-1 vos-label">of 100</p> : null}
              {trustRating ? (
                <>
                  <p className="mt-6 vos-label">Trust Rating</p>
                  <p className="mt-1 text-3xl font-black text-[rgb(var(--vos-text))]">{trustRating}</p>
                </>
              ) : null}
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
          <div className="grid gap-8">
            {sections.trustOverview}
            {sections.evidenceCoverage}
            {sections.riskSummary}
          </div>
          <aside className="grid gap-8 lg:sticky lg:top-28">
            {sections.metadata}
            {sections.timeline}
            {sections.linkedArtifacts}
          </aside>
        </section>
      </section>
    </main>
  );
}

export function AssetHeader({
  assetName,
  eyebrow,
  description,
  badges = [],
  metadata = [],
  actions = [],
  trust,
  className = "",
}: {
  assetName: string;
  eyebrow?: string;
  description?: ReactNode;
  badges?: IntelligenceBadge[];
  metadata?: IntelligenceMetric[];
  actions?: IntelligenceAction[];
  trust?: ReactNode;
  className?: string;
}) {
  return (
    <section className={["print-break-inside-avoid vos-panel p-6 sm:p-8", className].filter(Boolean).join(" ")}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {eyebrow ? <Badge variant="outline">{eyebrow}</Badge> : null}
            {badges.map((badge) => (
              <Badge key={`${badge.label}:${badge.status || "default"}`} variant={badge.status ? badgeVariantByStatus[badge.status] : "default"}>
                {badge.label}
              </Badge>
            ))}
          </div>
          <h1 className="mt-5 vos-h1">{assetName}</h1>
          {description ? <p className="mt-4 max-w-3xl vos-body">{description}</p> : null}
          {metadata.length ? (
            <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {metadata.map((item) => (
                <MetricCell key={item.label} item={item} />
              ))}
            </div>
          ) : null}
          {actions.length ? <ActionRow actions={actions} className="mt-7 grid gap-3 sm:grid-cols-3" /> : null}
        </div>
        {trust ? <div>{trust}</div> : null}
      </div>
    </section>
  );
}

export function TrustBlock({
  title = "Trust Position",
  rating,
  score,
  scoreLabel = "of 100",
  status = "unknown",
  rows = [],
  actions = [],
  className = "",
}: {
  title?: string;
  rating: ReactNode;
  score?: ReactNode;
  scoreLabel?: string;
  status?: IntelligenceStatus;
  rows?: IntelligenceMetric[];
  actions?: IntelligenceAction[];
  className?: string;
}) {
  return (
    <aside className={["vos-panel p-6", className].filter(Boolean).join(" ")}>
      <p className="vos-label">{title}</p>
      <div className="mt-5 flex items-end justify-between gap-4">
        <p className={["text-5xl font-black leading-none", textClassByStatus[status]].join(" ")}>{rating}</p>
        {score !== undefined ? (
          <div className="text-right">
            <p className="text-4xl font-black leading-none text-[rgb(var(--vos-text))]">{score}</p>
            <p className="mt-1 vos-label">{scoreLabel}</p>
          </div>
        ) : null}
      </div>
      {rows.length ? <MetadataRows rows={rows} className="mt-6" /> : null}
      {actions.length ? <ActionRow actions={actions} className="mt-6 grid" /> : null}
    </aside>
  );
}

export function EvidenceBlock({
  title = "Evidence",
  eyebrow,
  description,
  coverage,
  sections = [],
  className = "",
}: {
  title?: string;
  eyebrow?: string;
  description?: ReactNode;
  coverage?: IntelligenceMetric;
  sections?: IntelligenceListSection[];
  className?: string;
}) {
  return (
    <section className={["vos-panel p-6 sm:p-8", className].filter(Boolean).join(" ")}>
      <BlockHeader eyebrow={eyebrow} title={title} description={description} />
      {coverage ? (
        <div className="mt-6">
          <MetricCell item={coverage} />
        </div>
      ) : null}
      {sections.length ? (
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {sections.map((section) => (
            <ListSection key={section.title} section={section} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function RiskBlock({
  title = "Risk Register",
  eyebrow,
  description,
  risks,
  emptyState = "No confirmed risks are present in this evidence scope.",
  maxItems = 3,
  className = "",
}: {
  title?: string;
  eyebrow?: string;
  description?: ReactNode;
  risks: Array<{
    id: string;
    title: string;
    severity?: string;
    category?: string;
    summary?: ReactNode;
    confidence?: number;
    impact?: ReactNode;
  }>;
  emptyState?: ReactNode;
  maxItems?: number;
  className?: string;
}) {
  const visibleRisks = risks.slice(0, maxItems);
  return (
    <section className={["vos-panel p-6 sm:p-8", className].filter(Boolean).join(" ")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <BlockHeader eyebrow={eyebrow} title={title} description={description} />
        <Badge variant={visibleRisks.length ? "risky" : "ready"}>{visibleRisks.length ? `${visibleRisks.length} shown` : "Clear"}</Badge>
      </div>
      <div className="mt-6 grid gap-4">
        {visibleRisks.length ? (
          visibleRisks.map((risk, index) => (
            <article key={risk.id} className="vos-cell p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{index + 1}</Badge>
                  {risk.severity ? <Badge variant={badgeVariantForSeverity(risk.severity)}>{risk.severity}</Badge> : null}
                  {risk.category ? <Badge variant="muted">{risk.category}</Badge> : null}
                </div>
                {risk.impact ? <p className="text-sm font-black text-[rgb(var(--vos-verified))]">{risk.impact}</p> : null}
              </div>
              <h3 className="mt-4 vos-card-title">{risk.title}</h3>
              {risk.summary ? <p className="mt-2 vos-body">{risk.summary}</p> : null}
              {typeof risk.confidence === "number" ? (
                <p className="mt-3 vos-label">Confidence {Math.round(risk.confidence * 100)}%</p>
              ) : null}
            </article>
          ))
        ) : (
          <div className="vos-cell border-[rgb(var(--vos-verified))]/45 bg-[rgb(var(--vos-verified-bg))]/25 p-5">
            <p className="text-sm font-black text-[rgb(var(--vos-verified))]">No confirmed risks found</p>
            <p className="mt-2 vos-body">{emptyState}</p>
          </div>
        )}
      </div>
    </section>
  );
}

export function MetadataPanel({
  title,
  eyebrow,
  description,
  items,
  actions = [],
  className = "",
}: {
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  items: IntelligenceMetric[];
  actions?: IntelligenceAction[];
  className?: string;
}) {
  return (
    <section className={["vos-panel p-6", className].filter(Boolean).join(" ")}>
      <BlockHeader eyebrow={eyebrow} title={title} description={description} />
      <MetadataRows rows={items} className="mt-6" />
      {actions.length ? <ActionRow actions={actions} className="mt-6 grid" /> : null}
    </section>
  );
}

export function TimelinePanel({
  title,
  eyebrow,
  description,
  items,
  status,
  emptyState = "No public history events are attached to this asset yet.",
  className = "",
}: {
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  items: IntelligenceTimelineItem[];
  status?: IntelligenceBadge;
  emptyState?: ReactNode;
  className?: string;
}) {
  return (
    <section className={["vos-panel p-6", className].filter(Boolean).join(" ")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <BlockHeader eyebrow={eyebrow} title={title} description={description} />
        {status ? <Badge variant={status.status ? badgeVariantByStatus[status.status] : "outline"}>{status.label}</Badge> : null}
      </div>
      <div className="mt-6 grid gap-4">
        {items.length ? (
          items.map((item) => (
            <article key={item.id} className="vos-cell grid gap-4 p-5 sm:grid-cols-[140px_minmax(0,1fr)_120px] sm:items-center">
              <div>
                {item.type ? <p className="vos-label">{item.type}</p> : null}
                {item.timestamp ? <p className="mt-1 text-sm font-black text-[rgb(var(--vos-text))]">{item.timestamp}</p> : null}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  {item.status ? <Badge variant={badgeVariantByStatus[item.status]}>{item.status}</Badge> : null}
                  {item.metrics?.map((metric) => (
                    <Badge key={metric.label} variant="muted">
                      {metric.label}: {metric.value}
                    </Badge>
                  ))}
                </div>
                <h3 className="mt-3 text-base font-black text-[rgb(var(--vos-text))]">{item.title}</h3>
                {item.detail ? <p className="mt-2 vos-body">{item.detail}</p> : null}
              </div>
              {item.href ? (
                <Link href={item.href} className={buttonClassName({ variant: "outline", size: "sm", className: "w-full" })}>
                  Open
                </Link>
              ) : null}
            </article>
          ))
        ) : (
          <div className="vos-cell p-4">
            <p className="vos-body">{emptyState}</p>
          </div>
        )}
      </div>
    </section>
  );
}

export function ArtifactCard({
  title,
  eyebrow,
  value,
  description,
  status = "unknown",
  metadata = [],
  actions = [],
  href,
  actionLabel = "Open",
  className = "",
}: {
  title: string;
  eyebrow?: string;
  value?: ReactNode;
  description?: ReactNode;
  status?: IntelligenceStatus;
  metadata?: IntelligenceMetric[];
  actions?: IntelligenceAction[];
  href?: string;
  actionLabel?: string;
  className?: string;
}) {
  const allActions = href ? [...actions, { label: actionLabel, href, variant: "outline" as const }] : actions;
  return (
    <article className={["vos-panel p-6", className].filter(Boolean).join(" ")}>
      <div className="flex items-start justify-between gap-4">
        <div>
          {eyebrow ? <p className="vos-label">{eyebrow}</p> : null}
          <h2 className="mt-2 vos-card-title">{title}</h2>
        </div>
        <Badge variant={badgeVariantByStatus[status]}>{status}</Badge>
      </div>
      {value !== undefined ? <p className={["mt-4 text-2xl font-black", textClassByStatus[status]].join(" ")}>{value}</p> : null}
      {description ? <p className="mt-4 vos-body">{description}</p> : null}
      {metadata.length ? (
        <div className="mt-6 grid gap-4">
          {metadata.map((item) => (
            <MetricCell key={item.label} item={item} />
          ))}
        </div>
      ) : null}
      {allActions.length ? <ActionRow actions={allActions} className="mt-6 flex flex-col sm:flex-row" /> : null}
    </article>
  );
}

function BlockHeader({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: ReactNode }) {
  return (
    <div>
      {eyebrow ? <p className="vos-label">{eyebrow}</p> : null}
      <h2 className={eyebrow ? "mt-3 vos-h2" : "vos-h2"}>{title}</h2>
      {description ? <p className="mt-3 max-w-2xl vos-body">{description}</p> : null}
    </div>
  );
}

function MetricCell({ item }: { item: IntelligenceMetric }) {
  return (
    <div className="vos-cell p-4">
      <p className="vos-label">{item.label}</p>
      <p className={["mt-2 break-words text-xl font-black text-[rgb(var(--vos-text))]", item.status ? textClassByStatus[item.status] : ""].join(" ")}>
        {item.value}
      </p>
      {item.detail ? <p className="mt-1 text-xs font-semibold leading-5 text-[rgb(var(--vos-text-subtle))]">{item.detail}</p> : null}
    </div>
  );
}

function MetadataRows({ rows, className = "" }: { rows: IntelligenceMetric[]; className?: string }) {
  return (
    <div className={["grid gap-3", className].filter(Boolean).join(" ")}>
      {rows.map((row) => (
        <div key={row.label} className="flex items-start justify-between gap-4 border-b border-[rgb(var(--vos-border))] pb-4 last:border-b-0 last:pb-0">
          <span className="text-sm font-semibold text-[rgb(var(--vos-text-muted))]">{row.label}</span>
          <span className={["max-w-[240px] break-words text-right text-sm font-black uppercase text-[rgb(var(--vos-text))]", row.status ? textClassByStatus[row.status] : ""].join(" ")}>
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function ListSection({ section }: { section: IntelligenceListSection }) {
  const items = section.items.length ? section.items : section.fallback ? [section.fallback] : [];
  return (
    <div className="vos-cell p-5">
      <Badge variant={section.status ? badgeVariantByStatus[section.status] : "outline"}>{section.title}</Badge>
      <div className="mt-3 grid gap-2">
        {items.slice(0, 6).map((item, index) => (
          <p key={`${section.title}:${index}`} className="vos-body">
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

function ActionRow({ actions, className = "" }: { actions: IntelligenceAction[]; className?: string }) {
  return (
    <div className={["gap-2", className].filter(Boolean).join(" ")}>
      {actions.map((action) => {
        if (action.copyValue !== undefined) {
          return (
            <CopyButton
              key={`${action.label}:copy`}
              value={action.copyValue}
              label={action.label}
              successMessage={action.copySuccessMessage}
              className={buttonClassName({ variant: action.variant || "outline", className: "w-full" })}
            />
          );
        }
        if (action.href) {
          return (
            <Link key={`${action.label}:${action.href}`} href={action.href} className={buttonClassName({ variant: action.variant || "outline", className: "w-full" })}>
              {action.label}
            </Link>
          );
        }
        return null;
      })}
    </div>
  );
}

function badgeVariantForSeverity(severity: string): BadgeVariant {
  const clean = severity.toLowerCase();
  if (clean === "critical" || clean === "high") return "blocked";
  if (clean === "medium") return "risky";
  return "muted";
}
