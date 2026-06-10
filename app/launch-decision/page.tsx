import Link from "next/link";

import { DecisionIcon } from "@/components/decision-icon";
import { InstitutionalEmptyState, InstitutionalMetricCard, InstitutionalPageShell, InstitutionalPanel } from "@/components/institutional/institutional-shell";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { buildWorkspaceDecision, stateTone, stateVariant, type DecisionTrend } from "@/lib/decision-model";
import { listProjects } from "@/lib/project-store";
import { getProjectWorkspace } from "@/lib/services/projectWorkspace";

export const dynamic = "force-dynamic";

export default async function LaunchDecisionPage() {
  const decision = await loadHomeDecision();

  if (!decision) {
    return (
      <InstitutionalPageShell purposeLabel="Launch Decision" actions={[{ label: "Run Scan", href: "/build", variant: "destructive" }]}>
        <InstitutionalEmptyState
          title="Can this app ship? No."
          description="No project or legacy scan history is available. Run a scan before making a launch decision."
          action={
            <Link href="/build" className={buttonClassName({ variant: "destructive" })}>
              Run Scan <DecisionIcon name="arrow" className="h-4 w-4" />
            </Link>
          }
        />
      </InstitutionalPageShell>
    );
  }

  const tone = stateTone(decision.state);
  const stateIcon = decision.state === "READY" ? "shield-check" : decision.state === "RISKY" ? "alert" : "shield-alert";

  return (
    <InstitutionalPageShell
      purposeLabel="Launch Decision"
      maxWidth="max-w-6xl"
      className="grid min-h-screen content-center gap-5"
      actions={[{ label: "Deep View", href: decision.projectHref }, { label: "Run Scan", href: "/build", variant: "default" }]}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="vos-label">VentureOS ship decision</p>
          <h1 className="mt-2 vos-h1">{decision.projectName}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={stateVariant(decision.state)}>{decision.state}</Badge>
          <TrendBadge trend={decision.trend} />
        </div>
      </div>

      <InstitutionalPanel className={`${tone.border} ${tone.bg}`}>
        <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)_260px] lg:items-center">
          <InstitutionalMetricCard label="Readiness" value={decision.readinessScore} detail="out of 100" status={decision.state === "READY" ? "verified" : decision.state === "RISKY" ? "risk" : "danger"} />

          <div className="text-center">
            <p className="vos-label">Can this app ship?</p>
            <p className={`mt-4 text-4xl font-black ${tone.text}`}>{decision.shipAnswer}</p>
            <p className="mx-auto mt-4 max-w-xl vos-body">{decision.shipReason}</p>
          </div>

          <div className={`vos-cell ${tone.border} p-4`}>
            <DecisionIcon name={stateIcon} className={`h-7 w-7 ${tone.accent}`} />
            <p className="mt-4 vos-label">System State</p>
            <p className={`mt-2 text-2xl font-black ${tone.text}`}>{decision.state}</p>
            <div className="my-4 vos-separator" />
            <p className="vos-label">Trend</p>
            <div className="mt-2 flex items-center gap-2">
              <TrendIcon trend={decision.trend} />
              <span className="text-lg font-black capitalize text-[rgb(var(--vos-text))]">{decision.trend}</span>
            </div>
          </div>
        </div>
      </InstitutionalPanel>

      <InstitutionalPanel
        eyebrow="Top issues"
        actions={
          <Link href={`${decision.projectHref}#fix-flow`} className={buttonClassName({ variant: "ghost", size: "sm" })}>
            Deep View <DecisionIcon name="arrow" className="h-4 w-4" />
          </Link>
        }
      >

        {decision.topIssues.length ? (
          <div className="grid gap-3 lg:grid-cols-3">
            {decision.topIssues.map((issue) => (
              <Card key={issue.id} className="border-slate-800 bg-slate-950/80">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Badge variant={riskVariant(issue.riskLevel)}>{issue.riskLevel}</Badge>
                    <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-black text-emerald-100">
                      +{issue.fixImpact}
                    </span>
                  </div>
                  <h3 className="mt-4 min-h-12 text-base font-semibold leading-6 text-white">{issue.title}</h3>
                  <Link href={`${decision.projectHref}#fix-flow`} className={buttonClassName({ variant: "outline", size: "sm", className: "mt-4 w-full" })}>
                    Fix <DecisionIcon name="arrow" className="h-4 w-4" />
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-emerald-300/30 bg-emerald-400/10">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-semibold text-emerald-100">No top blockers are present in the latest workspace findings.</p>
              <Link href={decision.projectHref} className={buttonClassName({ variant: "outline", size: "sm" })}>
                Review Conditions <DecisionIcon name="arrow" className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>
        )}
      </InstitutionalPanel>
    </InstitutionalPageShell>
  );
}

async function loadHomeDecision() {
  const projects = await withTimeout(listProjects(), 1500).catch(() => []);
  const projectWorkspace = projects[0] ? await withTimeout(getProjectWorkspace(projects[0].id), 2000).catch(() => null) : null;
  const workspace = projectWorkspace || await getProjectWorkspace("legacy");
  return workspace ? buildWorkspaceDecision(workspace) : null;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

function TrendBadge({ trend }: { trend: DecisionTrend }) {
  const className =
    trend === "up"
      ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-100"
      : trend === "down"
        ? "border-red-300/40 bg-red-500/10 text-red-100"
        : "border-slate-700 bg-slate-900 text-slate-300";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-black uppercase tracking-[0.12em] ${className}`}>
      <TrendIcon trend={trend} />
      {trend}
    </span>
  );
}

function TrendIcon({ trend }: { trend: DecisionTrend }) {
  if (trend === "up") return <DecisionIcon name="arrow" className="h-4 w-4 -rotate-45 text-emerald-200" />;
  if (trend === "down") return <DecisionIcon name="arrow" className="h-4 w-4 rotate-45 text-red-200" />;
  return <DecisionIcon name="minus" className="h-4 w-4 text-slate-400" />;
}

function riskVariant(riskLevel: string) {
  const clean = riskLevel.toLowerCase();
  if (clean === "critical" || clean === "high") return "blocked" as const;
  if (clean === "medium") return "risky" as const;
  return "muted" as const;
}
