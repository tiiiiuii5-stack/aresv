import Link from "next/link";
import { notFound } from "next/navigation";

import { DecisionIcon } from "@/components/decision-icon";
import { GenerateLaunchReportButton, VerifyFixButton } from "@/components/decision-actions";
import { InstitutionalPageShell } from "@/components/institutional/institutional-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildWorkspaceDecision, severityRank, stateTone, stateVariant, type DecisionState, type DecisionTrend } from "@/lib/decision-model";
import { compareHistoricalScans } from "@/lib/evolution/diffEngine";
import { loadProjectScanSnapshots } from "@/lib/evolution/projectHistory";
import { verifyRecommendedFixes, type FixVerificationResult } from "@/lib/evolution/verificationEngine";
import { getProjectWorkspace, type WorkspaceScan } from "@/lib/services/projectWorkspace";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

type VerificationCard = {
  status: "Verified" | "Partial" | "Failed";
  title: string;
  evidence: string;
};

export default async function ProjectDecisionPage({ params }: PageProps) {
  const { id } = await params;
  const workspace = await getProjectWorkspace(id);
  if (!workspace) notFound();

  const decision = buildWorkspaceDecision(workspace);
  const verification = workspace.project ? await loadDiffVerification(workspace.project.id) : [];
  const verificationCards = verification.length ? verification : decision.verification;
  const reportDisabledReason = workspace.project ? undefined : "Legacy scans need a project workspace before launch report generation.";
  const latestScan = latestScanWithAssurance(workspace.scans);

  return (
    <InstitutionalPageShell
      purposeLabel="Project"
      actions={[{ label: "Projects", href: "/projects" }, { label: "Launch Decision", href: "/launch-decision", variant: "default" }]}
    >
      <div className="grid gap-5">
        <div className="flex flex-col gap-3 vos-panel p-5 sm:p-6">
          <Link href="/" className="inline-flex items-center gap-2 text-xs font-black uppercase text-[rgb(var(--vos-text-muted))] hover:text-[rgb(var(--vos-text))]">
            <DecisionIcon name="arrow" className="h-4 w-4 rotate-180" />
            Ship Decision
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="vos-h1">{decision.projectName}</h1>
            <Badge variant={stateVariant(decision.state)}>{decision.state}</Badge>
            <TrendBadge trend={decision.trend} />
          </div>
        </div>

        <LaunchDecisionHeader decision={decision} />
        <RiskCategories categories={decision.riskCategories} />
        <ScanTimeline timeline={decision.timeline} />
        <AssuranceExplanationPanel scan={latestScan} />
        <FixFlow projectId={decision.projectId} isLegacy={!workspace.project} steps={decision.fixSteps} />
        <VerificationPanel cards={verificationCards} />
        <ScaleRisk state={decision.state} risks={decision.scaleRisks} />
        <LaunchPanel decision={decision} disabledReason={reportDisabledReason} />
      </div>
    </InstitutionalPageShell>
  );
}

function latestScanWithAssurance(scans: WorkspaceScan[]) {
  return [...scans].sort((a, b) => b.scannedAt.localeCompare(a.scannedAt)).find((scan) => scan.assuranceGate || scan.scanAssurance) || null;
}

async function loadDiffVerification(projectId: string): Promise<VerificationCard[]> {
  const snapshots = await loadProjectScanSnapshots(projectId, 24);
  const diff = compareHistoricalScans({ projectId, snapshots });
  const verification = verifyRecommendedFixes({
    previousScan: diff.previousScan,
    currentScan: diff.currentScan,
  });

  return [
    ...verification.verifiedFixes.slice(0, 1).map((item) => verificationCard("Verified", item)),
    ...verification.partialFixes.slice(0, 1).map((item) => verificationCard("Partial", item)),
    ...verification.failedFixes.slice(0, 1).map((item) => verificationCard("Failed", item)),
  ].slice(0, 3);
}

function verificationCard(status: VerificationCard["status"], item: FixVerificationResult): VerificationCard {
  return {
    status,
    title: item.title,
    evidence: item.evidence[0]?.reason || `${item.issueId} has ${item.status.toLowerCase()} diff evidence.`,
  };
}

function LaunchDecisionHeader({ decision }: { decision: ReturnType<typeof buildWorkspaceDecision> }) {
  const tone = stateTone(decision.state);
  const stateIcon = decision.state === "READY" ? "shield-check" : decision.state === "RISKY" ? "alert" : "shield-alert";

  return (
    <Card className={`${tone.border} ${tone.bg}`}>
      <CardContent className="grid gap-5 p-5 lg:grid-cols-[220px_minmax(0,1fr)_260px] lg:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Readiness</p>
          <p className="mt-3 text-4xl font-black text-white">{decision.readinessScore}</p>
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Can this app ship?</p>
          <p className={`mt-3 text-4xl font-black ${tone.text}`}>{decision.shipAnswer}</p>
          <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-300">{decision.shipReason}</p>
        </div>
        <div className={`rounded-lg border ${tone.border} bg-slate-950/60 p-4`}>
          <DecisionIcon name={stateIcon} className={`h-7 w-7 ${tone.accent}`} />
          <p className="mt-3 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Required outcome</p>
          <p className="mt-2 text-sm font-semibold text-slate-200">
            {decision.state === "READY" ? "Keep gates passing." : decision.state === "RISKY" ? "Clear warnings." : "Fix blockers."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function RiskCategories({ categories }: { categories: ReturnType<typeof buildWorkspaceDecision>["riskCategories"] }) {
  return (
    <section>
      <SectionLabel title="Risk Categories" />
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        {categories.map((category) => (
          <Card key={category.name}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-white">{category.name}</p>
                <SeverityBadge severity={category.severity} />
              </div>
              <p className="mt-5 text-4xl font-black">{category.count}</p>
              <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-slate-500">issues</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function ScanTimeline({ timeline }: { timeline: ReturnType<typeof buildWorkspaceDecision>["timeline"] }) {
  return (
    <section>
      <SectionLabel title="Timeline" />
      <Card className="mt-3">
        <CardContent className="p-4">
          {timeline.length ? (
            <div className="grid gap-3">
              {timeline.map((scan) => (
                <div key={scan.id} className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3 md:grid-cols-[120px_minmax(0,1fr)_160px] md:items-center">
                  <div>
                    <p className="text-sm font-black text-white">{scan.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatDate(scan.scannedAt)}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-black text-white">{scan.score}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                        <div className={scoreBarClass(scan.score)} style={{ width: `${scan.score}%` }} />
                      </div>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-slate-400">issues found {scan.issuesFound}</p>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-black">
                    <ChangeBadge value={scan.change} />
                    <span className="text-slate-500">critical {formatSigned(scan.criticalChange)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <OutcomeEmpty text="No scan history yet. Run a project-linked scan to create the first decision point." />
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function AssuranceExplanationPanel({ scan }: { scan: WorkspaceScan | null }) {
  const gate = scan?.assuranceGate || null;
  const assurance = scan?.scanAssurance || null;
  const explanation = gate?.trustScoreExplanation || null;
  const changeImpact = gate?.changeImpact || null;
  const reasons = gate?.reasons || [];
  const warnings = gate?.warnings || [];

  return (
    <section>
      <SectionLabel title="Trust Score Explanation" />
      <Card className="mt-3">
        <CardContent className="grid gap-4 p-4 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Gate</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant={gate?.status === "FAIL" ? "blocked" : gate?.status === "WARNING" ? "risky" : gate?.status === "PASS" ? "ready" : "muted"}>
                {gate?.status || "No gate"}
              </Badge>
              {typeof explanation?.threshold === "number" ? <Badge variant="muted">threshold {explanation.threshold}</Badge> : null}
            </div>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-200">
              {gate?.summary || "Assurance metadata appears after a repository scan runs through the CI gate."}
            </p>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Reasoning</p>
            <div className="mt-3 grid gap-2">
              {(reasons.length ? reasons : warnings).slice(0, 3).map((reason) => (
                <div key={`${reason.id || reason.title}`} className="rounded-lg border border-slate-800 bg-slate-950/45 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={reason.severity || "unknown"} />
                    {reason.filePath ? <Badge variant="muted">{reason.filePath}</Badge> : null}
                  </div>
                  <p className="mt-2 text-sm font-black text-white">{reason.title}</p>
                  {reason.evidence ? <p className="mt-1 text-xs leading-5 text-slate-400">{reason.evidence}</p> : null}
                </div>
              ))}
              {!reasons.length && !warnings.length ? <OutcomeEmpty text="No gate reasons are available for the latest scan." /> : null}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Assurance Data</p>
            <div className="mt-3 grid gap-2 text-xs font-semibold leading-5 text-slate-300">
              <p>Scan ID: <span className="font-mono text-slate-100">{assurance?.scanId || "unavailable"}</span></p>
              <p>Source hash: <span className="font-mono text-slate-100">{shortHash(assurance?.sourceHash)}</span></p>
              <p>Rule-set hash: <span className="font-mono text-slate-100">{shortHash(assurance?.ruleSetHash)}</span></p>
              <p>Files: <span className="text-slate-100">{assurance?.fileCount ?? "unknown"}</span></p>
              <p>History: <span className="text-slate-100">{historyLabel(explanation?.history)}</span></p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 lg:col-span-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">What Changed And Why It Matters</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
                  {changeImpact?.summary || "Supply a previous assurance manifest to explain changed files against a baseline."}
                </p>
              </div>
              {changeImpact ? (
                <div className="flex flex-wrap gap-2">
                  <Badge variant={changeImpact.blockingChangeCount ? "blocked" : "muted"}>{changeImpact.blockingChangeCount || 0} blocking</Badge>
                  <Badge variant={changeImpact.reviewChangeCount ? "risky" : "muted"}>{changeImpact.reviewChangeCount || 0} review</Badge>
                </div>
              ) : null}
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {(changeImpact?.impacts || []).slice(0, 4).map((impact) => (
                <div key={`${impact.changeType || "change"}:${impact.path}`} className="rounded-lg border border-slate-800 bg-slate-950/45 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={impact.gateEffect === "BLOCKING" ? "blocked" : impact.gateEffect === "REVIEW" ? "risky" : "muted"}>
                      {impact.gateEffect || "INFO"}
                    </Badge>
                    <Badge variant="muted">{impact.changeType || "CHANGED"}</Badge>
                    <Badge variant="outline">{impact.impactArea || "unknown"}</Badge>
                  </div>
                  <p className="mt-2 break-all font-mono text-xs text-slate-100">{impact.path}</p>
                  {impact.reason ? <p className="mt-2 text-xs leading-5 text-slate-400">{impact.reason}</p> : null}
                </div>
              ))}
              {changeImpact && changeImpact.impacts.length === 0 ? <OutcomeEmpty text="No changed files were detected against the baseline manifest." /> : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function FixFlow({ projectId, isLegacy, steps }: { projectId: string; isLegacy: boolean; steps: ReturnType<typeof buildWorkspaceDecision>["fixSteps"] }) {
  return (
    <section id="fix-flow" className="scroll-mt-6">
      <SectionLabel title="Fix Flow" />
      <div className="mt-3 grid gap-3">
        {steps.length ? (
          steps.map((step, index) => (
            <Card key={step.id} className={severityRank(step.riskLevel) >= 4 ? "border-red-300/35" : "border-slate-800"}>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <Badge variant={severityRank(step.riskLevel) >= 3 ? "blocked" : "risky"}>Step {index + 1}</Badge>
                    <CardTitle className="mt-3">{step.label}</CardTitle>
                    <p className="mt-2 text-sm font-semibold text-slate-300">{step.title}</p>
                  </div>
                  <VerifyFixButton
                    projectId={projectId}
                    issueTitle={step.title}
                    disabledReason={isLegacy ? "Legacy scans need a project workspace before fix verification." : undefined}
                  />
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 pt-0 lg:grid-cols-[260px_minmax(0,1fr)_260px]">
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">File path</p>
                  <p className="mt-2 break-all font-mono text-xs text-slate-200">{step.filePath}</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Code fix</p>
                  <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-100">{step.codeFix}</pre>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Expected result</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-200">{step.expectedResult}</p>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="border-emerald-300/30 bg-emerald-400/10">
            <CardContent className="p-4">
              <OutcomeEmpty text="No remediation steps are required by the latest top findings." />
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}

function VerificationPanel({ cards }: { cards: VerificationCard[] }) {
  const byStatus = {
    Verified: cards.filter((card) => card.status === "Verified"),
    Partial: cards.filter((card) => card.status === "Partial"),
    Failed: cards.filter((card) => card.status === "Failed"),
  };

  return (
    <section>
      <SectionLabel title="Verification" />
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {(["Verified", "Partial", "Failed"] as const).map((status) => {
          const item = byStatus[status][0];
          return (
            <Card key={status} className={verificationClass(status)}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <VerificationIcon status={status} />
                  <p className="font-black text-white">{status}</p>
                </div>
                <p className="mt-4 text-sm font-semibold leading-6 text-slate-200">{item?.title || "No diff result yet"}</p>
                <p className="mt-2 text-xs leading-5 text-slate-400">{item?.evidence || "Diff evidence appears after at least two project-linked scans."}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function ScaleRisk({ state, risks }: { state: DecisionState; risks: string[] }) {
  const users = state === "READY" ? "10,000" : "1,000";
  return (
    <section>
      <SectionLabel title="Scale Risk" />
      <Card className="mt-3">
        <CardContent className="p-4">
          <p className="text-sm font-black text-white">If scaled to {users} users, likely failures are:</p>
          <div className="mt-3 grid gap-2">
            {risks.slice(0, 3).map((risk) => (
              <div key={risk} className="flex gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                <DecisionIcon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                <p className="text-sm font-semibold leading-6 text-slate-200">{risk}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function LaunchPanel({ decision, disabledReason }: { decision: ReturnType<typeof buildWorkspaceDecision>; disabledReason?: string }) {
  const tone = stateTone(decision.state);
  return (
    <section>
      <SectionLabel title="Launch Panel" />
      <Card className={`mt-3 ${tone.border} ${tone.bg}`}>
        <CardContent className="grid gap-5 p-5 lg:grid-cols-[180px_180px_minmax(0,1fr)_260px] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Score</p>
            <p className="mt-2 text-4xl font-black text-white">{decision.readinessScore}</p>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Status</p>
            <Badge className="mt-3" variant={stateVariant(decision.state)}>{decision.state}</Badge>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Warnings</p>
            <div className="mt-3 grid gap-2">
              {(decision.warnings.length ? decision.warnings : ["No launch warnings supported by current scan evidence."]).slice(0, 3).map((warning) => (
                <p key={warning} className="rounded-lg border border-slate-800 bg-slate-950/45 px-3 py-2 text-sm font-semibold text-slate-200">{warning}</p>
              ))}
            </div>
          </div>
          <GenerateLaunchReportButton projectId={decision.projectId} disabledReason={disabledReason} />
        </CardContent>
      </Card>
    </section>
  );
}

function SectionLabel({ title }: { title: string }) {
  return <h2 className="vos-label">{title}</h2>;
}

function SeverityBadge({ severity }: { severity: string }) {
  const clean = severity.toLowerCase();
  const variant = clean === "critical" || clean === "high" ? "blocked" : clean === "medium" ? "risky" : clean === "low" ? "ready" : "muted";
  return <Badge variant={variant}>{severity}</Badge>;
}

function ChangeBadge({ value }: { value: number }) {
  const positive = value > 0;
  const negative = value < 0;
  const className = positive
    ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
    : negative
      ? "border-red-300/30 bg-red-500/10 text-red-100"
      : "border-slate-700 bg-slate-900 text-slate-300";
  return <span className={`rounded-full border px-2.5 py-1 text-xs ${className}`}>{formatSigned(value)}</span>;
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
      {trend === "up" ? <DecisionIcon name="arrow" className="h-4 w-4 -rotate-45" /> : trend === "down" ? <DecisionIcon name="arrow" className="h-4 w-4 rotate-45" /> : <DecisionIcon name="minus" className="h-4 w-4" />}
      {trend}
    </span>
  );
}

function VerificationIcon({ status }: { status: VerificationCard["status"] }) {
  if (status === "Verified") return <DecisionIcon name="check" className="h-5 w-5 text-emerald-200" />;
  if (status === "Partial") return <DecisionIcon name="circle" className="h-5 w-5 text-amber-200" />;
  return <DecisionIcon name="alert" className="h-5 w-5 text-red-200" />;
}

function verificationClass(status: VerificationCard["status"]) {
  if (status === "Verified") return "border-emerald-300/30 bg-emerald-400/10";
  if (status === "Partial") return "border-amber-300/30 bg-amber-400/10";
  return "border-red-300/30 bg-red-500/10";
}

function OutcomeEmpty({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 vos-cell p-4">
      <DecisionIcon name="file" className="h-5 w-5 text-slate-400" />
      <p className="text-sm font-semibold text-slate-300">{text}</p>
    </div>
  );
}

function scoreBarClass(score: number) {
  if (score >= 85) return "h-full rounded-full bg-emerald-400";
  if (score >= 65) return "h-full rounded-full bg-amber-300";
  return "h-full rounded-full bg-red-500";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

function formatSigned(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function shortHash(value: unknown) {
  const clean = String(value || "");
  return clean ? clean.slice(0, 12) : "unavailable";
}

function historyLabel(history: unknown) {
  if (!history || typeof history !== "object") return "no baseline";
  const record = history as { baselineAvailable?: boolean; changedFiles?: number; addedFiles?: number; removedFiles?: number; readinessDelta?: number; regressionDirection?: string };
  if (!record.baselineAvailable) return "no baseline";
  const delta = typeof record.readinessDelta === "number" ? `, readiness ${formatSigned(record.readinessDelta)}` : "";
  return `${record.changedFiles || 0} changed, ${record.addedFiles || 0} added, ${record.removedFiles || 0} removed${delta}`;
}
