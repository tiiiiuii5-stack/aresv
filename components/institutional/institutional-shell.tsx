import Link from "next/link";
import type { ReactNode } from "react";

import { buttonClassName } from "@/components/ui/button";

export type SubscriptionTier = "Free" | "Pro" | "Venture";

export type InstitutionalHeaderAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  disabled?: boolean;
  title?: string;
};

export type InstitutionalBreadcrumb = {
  label: string;
  href?: string;
};

const coreNavigation = [
  { label: "Home", href: "/" },
  { label: "Free Review", href: "/free-review" },
  { label: "Reports", href: "/software-appraisal" },
  { label: "Sample", href: "/sample-appraisal" },
  { label: "Tutorial", href: "/tutorial" },
] as const;

const primaryNavigation = [
  {
    label: "Workbench",
    href: "/build",
    description: "Build, scan, decide",
    mapsTo: ["/build", "/analyze", "/passport", "/launch-decision"],
  },
  {
    label: "Public Ledger",
    href: "/registry",
    description: "Registry, certificates, proofs",
    mapsTo: ["/registry", "/certificate", "/transparency-log"],
  },
  {
    label: "Plan & Settings",
    href: "/pricing",
    description: "Billing, limits, account",
    mapsTo: ["/pricing", "/account", "/admin"],
  },
] as const;

const tierStyles: Record<SubscriptionTier, string> = {
  Free: "border-slate-700/80 bg-slate-900/80 text-slate-300",
  Pro: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  Venture: "border-blue-400/40 bg-blue-400/10 text-blue-200",
};

export function InstitutionalShell({
  children,
  currentSection = "Workbench",
  subscriptionTier = "Free",
  pageTitle,
  pageDescription,
  rightSlot,
  maxWidth = "max-w-[1440px]",
}: {
  children: ReactNode;
  currentSection?: "Workbench" | "Public Ledger" | "Plan & Settings";
  subscriptionTier?: SubscriptionTier;
  pageTitle?: ReactNode;
  pageDescription?: ReactNode;
  rightSlot?: ReactNode;
  maxWidth?: string;
}) {
  return (
    <main className="min-h-screen bg-[#0B0F19] text-slate-100">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_18%_12%,rgba(59,130,246,0.10),transparent_28%),radial-gradient(circle_at_86%_18%,rgba(16,185,129,0.08),transparent_28%)]" />
      <div className="relative flex min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-slate-800/90 bg-[#0B0F19]/95 px-4 py-5 backdrop-blur xl:block">
          <Link href="/" className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
            <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-md border border-emerald-400/30 bg-emerald-400/10 font-mono text-sm font-black text-emerald-200">
              V
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-black tracking-wide text-slate-100">VentureOS</span>
              <span className="block truncate text-xs font-semibold text-slate-500">Software trust operating system</span>
            </span>
          </Link>

          <div className={["mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-wide", tierStyles[subscriptionTier]].join(" ")}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {subscriptionTier}
          </div>

          <nav className="mt-8 grid gap-2">
            {primaryNavigation.map((item) => {
              const active = item.label === currentSection;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={[
                    "group rounded-lg border px-4 py-3 transition",
                    active ? "border-emerald-400/40 bg-emerald-400/10 text-slate-50" : "border-transparent text-slate-400 hover:border-slate-800 hover:bg-slate-900/70 hover:text-slate-100",
                  ].join(" ")}
                >
                  <span className="block text-sm font-black">{item.label}</span>
                  <span className="mt-1 block text-xs font-semibold text-slate-500 group-hover:text-slate-400">{item.description}</span>
                </Link>
              );
            })}
          </nav>

          <div className="absolute bottom-5 left-4 right-4 rounded-lg border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">System posture</p>
            <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-400">
              <div className="flex items-center justify-between">
                <span>Passport Engine</span>
                <span className="font-mono text-emerald-300">Ready</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Ledger</span>
                <span className="font-mono text-blue-300">Synced</span>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col xl:pl-72">
          <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#0B0F19]/85 px-4 py-3 backdrop-blur sm:px-6 xl:px-8">
            <div className="mx-auto flex min-h-14 w-full max-w-[1440px] items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 xl:hidden">
                  <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-md border border-emerald-400/30 bg-emerald-400/10 font-mono text-xs font-black text-emerald-200">V</span>
                  <span className={["rounded-full border px-2.5 py-1 text-[10px] font-black uppercase", tierStyles[subscriptionTier]].join(" ")}>{subscriptionTier}</span>
                </div>
                {pageTitle ? <h1 className="mt-2 truncate text-lg font-black text-slate-50 xl:mt-0">{pageTitle}</h1> : null}
                {pageDescription ? <p className="mt-1 max-w-3xl truncate text-sm font-semibold text-slate-500">{pageDescription}</p> : null}
              </div>
              {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
            </div>
            <nav className="mx-auto mt-3 grid w-full max-w-[1440px] grid-cols-3 gap-2 xl:hidden">
              {primaryNavigation.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className={[
                    "rounded-md border px-2 py-2 text-center text-xs font-black",
                    item.label === currentSection ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100" : "border-slate-800 bg-slate-950/50 text-slate-500",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </header>
          <section className={["mx-auto w-full px-4 py-6 sm:px-6 xl:px-8", maxWidth].filter(Boolean).join(" ")}>
            {children}
          </section>
        </div>
      </div>
    </main>
  );
}

export function VentureOSHeader({
  purposeLabel,
  actions = [],
  rightSlot,
}: {
  purposeLabel: string;
  actions?: InstitutionalHeaderAction[];
  rightSlot?: ReactNode;
}) {
  return (
    <header className="print-hide fixed left-0 right-[calc(100%-100vw)] top-0 z-50 max-w-full overflow-hidden border-b border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-surface))]">
      <div className="mx-auto flex h-20 w-full min-w-0 max-w-[100vw] items-center justify-between gap-4 overflow-hidden px-4 sm:max-w-[1280px] sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 flex-1 items-center gap-3 text-sm font-black text-[rgb(var(--vos-text))] sm:flex-none">
          <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-primary))] text-[rgb(var(--vos-primary-text))]">
            V
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[0.95rem]">VentureOS</span>
            <span className="block truncate text-xs font-bold text-[rgb(var(--vos-text-subtle))]">{purposeLabel}</span>
          </span>
        </Link>
        <nav className="hidden shrink-0 flex-wrap justify-end gap-2 lg:flex" aria-label="Primary navigation">
          {coreNavigation.map((item) => (
            <Link key={item.href} href={item.href} className="nav">
              {item.label}
            </Link>
          ))}
        </nav>
        <nav className="hidden shrink-0 flex-wrap justify-end gap-2 sm:flex">
          {rightSlot ? <div className="hidden items-center sm:flex">{rightSlot}</div> : null}
          {actions.map((action) => {
            const className = buttonClassName({ variant: action.variant || "outline", size: "sm" });
            if (action.href) {
              return (
              <Link key={`${action.label}:${action.href}`} href={action.href} className={className} title={action.title}>
                {action.label}
              </Link>
              );
            }
            if (action.onClick) {
              return (
                <button key={`${action.label}:button`} type="button" onClick={action.onClick} disabled={action.disabled} title={action.title} className={className}>
                  {action.label}
                </button>
              );
            }
            if (action.disabled) {
              return (
                <button key={`${action.label}:disabled`} type="button" disabled title={action.title} className={className}>
                  {action.label}
                </button>
              );
            }
            return null;
          })}
        </nav>
      </div>
      <nav className="mx-auto flex w-full max-w-[100vw] gap-2 overflow-x-auto px-4 pb-3 sm:hidden" aria-label="Primary navigation">
        {coreNavigation.map((item) => (
          <Link key={item.href} href={item.href} className="nav min-w-fit text-xs">
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function InstitutionalPageShell({
  purposeLabel,
  actions,
  rightSlot,
  children,
  maxWidth = "max-w-7xl",
  className = "",
  showFooter = true,
  breadcrumbs,
}: {
  purposeLabel: string;
  actions?: InstitutionalHeaderAction[];
  rightSlot?: ReactNode;
  children: ReactNode;
  maxWidth?: string;
  className?: string;
  showFooter?: boolean;
  breadcrumbs?: InstitutionalBreadcrumb[];
}) {
  return (
    <main className="vos-page min-h-screen">
      <VentureOSHeader purposeLabel={purposeLabel} actions={actions} rightSlot={rightSlot} />
      <section className={["mx-auto w-full px-4 pb-12 pt-36 sm:px-6 sm:pt-28 lg:px-8", maxWidth, className].filter(Boolean).join(" ")}>
        {breadcrumbs?.length ? <InstitutionalBreadcrumbs items={breadcrumbs} /> : null}
        {children}
      </section>
      {showFooter ? <VentureOSFooter /> : null}
    </main>
  );
}

export function InstitutionalBreadcrumbs({ items }: { items: InstitutionalBreadcrumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="print-hide mb-5 flex flex-wrap items-center gap-2 text-sm font-bold text-[rgb(var(--vos-text-subtle))]">
      {items.map((item, index) => {
        const current = index === items.length - 1;
        return (
          <span key={`${item.label}:${index}`} className="inline-flex items-center gap-2">
            {index > 0 ? <span aria-hidden="true" className="text-[rgb(var(--vos-border-strong))]">&gt;</span> : null}
            {item.href && !current ? (
              <Link href={item.href} className="hover:text-[rgb(var(--vos-text))]">
                {item.label}
              </Link>
            ) : (
              <span aria-current={current ? "page" : undefined} className={current ? "text-[rgb(var(--vos-text))]" : ""}>
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export function InfoTooltip({ label, text }: { label?: string; text: string }) {
  return (
    <span
      tabIndex={0}
      data-vos-tooltip={text}
      aria-label={text}
      className="relative inline-flex h-5 w-5 items-center justify-center rounded-full border border-[rgb(var(--vos-border))] text-[11px] font-black text-[rgb(var(--vos-text-muted))]"
    >
      {label || "?"}
    </span>
  );
}

export function VentureOSFooter() {
  return (
    <footer className="border-t border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-surface))]">
      <div className="mx-auto grid w-full max-w-[1280px] gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] lg:px-8">
        <div>
          <p className="vos-label">VentureOS</p>
          <p className="mt-4 max-w-sm vos-body">
            Software passports and trust records for founders, buyers, operators, customers, and engineering teams.
          </p>
          <div className="mt-4 grid gap-1 text-xs font-bold text-[rgb(var(--vos-text-muted))]">
            <p>Contact: sales@ventureos.ai</p>
            <p>Legal: legal@ventureos.ai</p>
            <p>Operating location: United States, remote-first</p>
            <p>Mailing address: provided in customer order paperwork and vendor onboarding.</p>
          </div>
        </div>

        <div>
          <p className="vos-label">Public Offers</p>
          <div className="mt-3 grid gap-2 text-sm font-bold text-[rgb(var(--vos-text-muted))]">
            <Link href="/free-review" className="hover:text-[rgb(var(--vos-text))]">Free limited software review</Link>
            <Link href="/software-appraisal" className="hover:text-[rgb(var(--vos-text))]">Verified Software Passport - $49</Link>
            <Link href="/software-appraisal" className="hover:text-[rgb(var(--vos-text))]">Buyer-Ready Passport - $199</Link>
            <Link href="/tutorial" className="hover:text-[rgb(var(--vos-text))]">Tutorial</Link>
            <a href="mailto:sales@ventureos.ai?subject=CTO-assisted%20VentureOS%20review" className="hover:text-[rgb(var(--vos-text))]">
              CTO-assisted review - $750-$1,500
            </a>
          </div>
        </div>

        <div>
          <p className="vos-label">Company & Legal</p>
          <div className="mt-3 grid gap-2 text-sm font-bold text-[rgb(var(--vos-text-muted))]">
            <Link href="/about" className="hover:text-[rgb(var(--vos-text))]">About VentureOS</Link>
            <Link href="/pricing" className="hover:text-[rgb(var(--vos-text))]">Pricing</Link>
            <Link href="/privacy" className="hover:text-[rgb(var(--vos-text))]">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-[rgb(var(--vos-text))]">Terms of Service</Link>
            <Link href="/refund" className="hover:text-[rgb(var(--vos-text))]">Refund Policy</Link>
          </div>
          <p className="mt-4 text-xs font-semibold leading-5 text-[rgb(var(--vos-text-subtle))]">
            VentureOS passports are evidence summaries, not legal, accounting, investment, or compliance certification advice.
          </p>
        </div>
      </div>
    </footer>
  );
}

export function InstitutionalPageHero({
  eyebrow,
  title,
  description,
  aside,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="vos-panel p-6 sm:p-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-end">
        <div>
          <p className="vos-label">{eyebrow}</p>
          <h1 className="mt-3 vos-h1">{title}</h1>
          {description ? <p className="mt-4 max-w-3xl vos-body">{description}</p> : null}
          {actions ? <div className="mt-6 flex flex-wrap gap-3">{actions}</div> : null}
        </div>
        {aside ? <aside className="vos-cell p-5">{aside}</aside> : null}
      </div>
    </section>
  );
}

export function InstitutionalPanel({
  title,
  eyebrow,
  children,
  className = "",
  actions,
}: {
  title?: ReactNode;
  eyebrow?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <section className={["vos-panel p-6", className].filter(Boolean).join(" ")}>
      {eyebrow || title || actions ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {eyebrow ? <p className="vos-label">{eyebrow}</p> : null}
            {title ? <h2 className="mt-2 vos-h2">{title}</h2> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={eyebrow || title || actions ? "mt-4" : ""}>{children}</div>
    </section>
  );
}

export function InstitutionalMetricCard({
  label,
  value,
  detail,
  status,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  status?: "verified" | "risk" | "danger" | "unknown";
}) {
  const statusClass =
    status === "verified"
      ? "vos-status-verified"
      : status === "risk"
        ? "vos-status-risk"
        : status === "danger"
          ? "vos-status-danger"
          : "text-[rgb(var(--vos-text))]";
  return (
    <article className="vos-cell p-4">
      <p className="vos-label">{label}</p>
      <p className={["mt-2 text-3xl font-black leading-tight", statusClass].join(" ")}>{value}</p>
      {detail ? <p className="mt-2 vos-body">{detail}</p> : null}
    </article>
  );
}

export function InstitutionalEmptyState({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="grid min-h-[320px] place-items-center vos-panel border-dashed p-8 text-center">
      <div>
        <h2 className="vos-h2">{title}</h2>
        {description ? <p className="mt-3 max-w-md vos-body">{description}</p> : null}
        {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}
