import type { ProjectWorkspace, WorkspaceFinding, WorkspaceScan, WorkspaceScorePoint } from "@/lib/services/projectWorkspace";

export type DecisionState = "BLOCKED" | "RISKY" | "READY";
export type DecisionTrend = "up" | "down" | "stable";
export type ShipAnswer = "NO" | "NOT YET" | "YES";
export type RiskCategoryName = "Security" | "Scaling" | "Payments" | "API";
export type VerificationStatus = "Verified" | "Partial" | "Failed";

export type DecisionIssue = {
  id: string;
  title: string;
  riskLevel: string;
  category: string;
  fixImpact: number;
  filePath?: string;
  codeFix: string;
  expectedResult: string;
  evidence: string;
  confidenceScore?: number;
};

export type DecisionTimelineItem = {
  id: string;
  label: string;
  score: number;
  issuesFound: number;
  change: number;
  criticalChange: number;
  scannedAt: string;
};

export type DecisionRiskCategory = {
  name: RiskCategoryName;
  count: number;
  severity: string;
};

export type DecisionFixStep = {
  id: string;
  label: string;
  title: string;
  filePath: string;
  codeFix: string;
  expectedResult: string;
  riskLevel: string;
};

export type DecisionVerification = {
  status: VerificationStatus;
  title: string;
  evidence: string;
};

export type WorkspaceDecision = {
  projectName: string;
  projectId: string;
  projectHref: string;
  readinessScore: number;
  state: DecisionState;
  trend: DecisionTrend;
  shipAnswer: ShipAnswer;
  shipReason: string;
  topIssues: DecisionIssue[];
  riskCategories: DecisionRiskCategory[];
  timeline: DecisionTimelineItem[];
  fixSteps: DecisionFixStep[];
  verification: DecisionVerification[];
  scaleRisks: string[];
  warnings: string[];
  latestScan: WorkspaceScan | null;
};

const categoryNames: RiskCategoryName[] = ["Security", "Scaling", "Payments", "API"];

export function buildWorkspaceDecision(workspace: ProjectWorkspace): WorkspaceDecision {
  const latestScan = latestWorkspaceScan(workspace.scans);
  const readinessScore = boundedScore(latestScan?.readinessScore ?? workspace.project?.qa?.score ?? 0);
  const topIssues = topDecisionIssues(workspace.findings);
  const state = stateFor(readinessScore, latestScan, topIssues);
  const trend = trendFor(workspace);

  return {
    projectName: workspace.project?.name || "Legacy scan inbox",
    projectId: workspace.project?.id || "legacy",
    projectHref: workspace.project ? `/project/${encodeURIComponent(workspace.project.id)}` : "/project/legacy",
    readinessScore,
    state,
    trend,
    shipAnswer: answerFor(state),
    shipReason: reasonFor(state, latestScan, topIssues),
    topIssues,
    riskCategories: riskCategoriesFor(workspace.findings),
    timeline: timelineFor(workspace.scoreHistory),
    fixSteps: fixStepsFor(topIssues),
    verification: verificationFromRegression(workspace),
    scaleRisks: scaleRisksFor(workspace, topIssues, state),
    warnings: warningsFor(workspace, state, topIssues),
    latestScan,
  };
}

export function stateVariant(state: DecisionState) {
  if (state === "BLOCKED") return "blocked" as const;
  if (state === "RISKY") return "risky" as const;
  return "ready" as const;
}

export function severityRank(value: string) {
  const clean = value.toLowerCase();
  if (clean === "critical") return 4;
  if (clean === "high") return 3;
  if (clean === "medium") return 2;
  if (clean === "low") return 1;
  return 0;
}

export function stateTone(state: DecisionState) {
  if (state === "BLOCKED") return {
    text: "text-red-100",
    border: "border-red-300/40",
    bg: "bg-red-500/10",
    accent: "text-red-300",
  };
  if (state === "RISKY") return {
    text: "text-amber-100",
    border: "border-amber-300/40",
    bg: "bg-amber-400/10",
    accent: "text-amber-200",
  };
  return {
    text: "text-emerald-100",
    border: "border-emerald-300/40",
    bg: "bg-emerald-400/10",
    accent: "text-emerald-200",
  };
}

function latestWorkspaceScan(scans: WorkspaceScan[]) {
  return [...scans].sort((a, b) => b.scannedAt.localeCompare(a.scannedAt))[0] || null;
}

function stateFor(score: number, latestScan: WorkspaceScan | null, topIssues: DecisionIssue[]): DecisionState {
  if (!latestScan) return "BLOCKED";
  if (latestScan.criticalFindingsCount > 0 || topIssues.some((issue) => severityRank(issue.riskLevel) >= 4) || score < 65) return "BLOCKED";
  if (latestScan.findingsCount > 0 || topIssues.length > 0 || score < 85) return "RISKY";
  return "READY";
}

function answerFor(state: DecisionState): ShipAnswer {
  if (state === "BLOCKED") return "NO";
  if (state === "RISKY") return "NOT YET";
  return "YES";
}

function reasonFor(state: DecisionState, latestScan: WorkspaceScan | null, issues: DecisionIssue[]) {
  if (!latestScan) return "No stored scan has proven this app is safe.";
  if (state === "BLOCKED") return `${latestScan.criticalFindingsCount || issues.filter((issue) => severityRank(issue.riskLevel) >= 4).length} critical blocker${latestScan.criticalFindingsCount === 1 ? "" : "s"} must be fixed first.`;
  if (state === "RISKY") return `${latestScan.findingsCount || issues.length} warning${(latestScan.findingsCount || issues.length) === 1 ? "" : "s"} remain before launch.`;
  return "Current scan has no blocking launch risks.";
}

function trendFor(workspace: ProjectWorkspace): DecisionTrend {
  const delta = workspace.scanComparison?.readinessDelta ?? 0;
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  const status = workspace.regressionReport?.trend.status;
  if (status === "improving") return "up";
  if (status === "regressing") return "down";
  return "stable";
}

function topDecisionIssues(findings: WorkspaceFinding[]): DecisionIssue[] {
  return findings
    .slice()
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.title.localeCompare(b.title))
    .slice(0, 3)
    .map((finding) => ({
      id: finding.id,
      title: finding.title,
      riskLevel: normalizeSeverity(finding.severity),
      category: finding.category,
      fixImpact: fixImpactFor(finding.severity),
      filePath: finding.filePath,
      codeFix: finding.codeFix || finding.fixSuggestion,
      expectedResult: finding.expectedResult || `Next scan no longer reports: ${finding.title}.`,
      evidence: finding.verificationEvidence || finding.evidence,
      confidenceScore: finding.confidenceScore,
    }));
}

function riskCategoriesFor(findings: WorkspaceFinding[]): DecisionRiskCategory[] {
  return categoryNames.map((name) => {
    const scoped = findings.filter((finding) => categoryForFinding(finding) === name);
    return {
      name,
      count: scoped.length,
      severity: scoped.reduce((highest, finding) => (severityRank(finding.severity) > severityRank(highest) ? finding.severity : highest), scoped.length ? "low" : "none"),
    };
  });
}

function categoryForFinding(finding: WorkspaceFinding): RiskCategoryName {
  const text = `${finding.category} ${finding.title} ${finding.evidence} ${finding.filePath || ""}`.toLowerCase();
  if (/\b(stripe|billing|payment|checkout|subscription|invoice|portal|webhook)\b/.test(text)) return "Payments";
  if (/\b(api|route|endpoint|handler|fetch|server action|webhook)\b/.test(text)) return "API";
  if (/\b(auth|session|role|owner|tenant|admin|secret|token|permission|security)\b/.test(text)) return "Security";
  return "Scaling";
}

function timelineFor(points: WorkspaceScorePoint[]): DecisionTimelineItem[] {
  return points.map((point, index) => {
    const previous = points[index - 1];
    return {
      id: point.id,
      label: point.label || `Scan ${index + 1}`,
      score: point.readinessScore,
      issuesFound: point.findingsCount,
      change: previous ? point.readinessScore - previous.readinessScore : 0,
      criticalChange: previous ? point.criticalFindingsCount - previous.criticalFindingsCount : 0,
      scannedAt: point.scannedAt,
    };
  });
}

function fixStepsFor(issues: DecisionIssue[]): DecisionFixStep[] {
  const labels = ["Fix critical issue", "Fix billing issue", "Fix API issue"];
  return issues.map((issue, index) => ({
    id: issue.id,
    label: labels[index] || `Fix ${issue.category || "issue"}`,
    title: issue.title,
    filePath: issue.filePath || "No file path captured",
    codeFix: issue.codeFix,
    expectedResult: issue.expectedResult,
    riskLevel: issue.riskLevel,
  }));
}

function verificationFromRegression(workspace: ProjectWorkspace): DecisionVerification[] {
  const regression = workspace.regressionReport;
  if (!regression) return [];
  const verified = regression.fixedFailures.slice(0, 1).map((finding) => ({
    status: "Verified" as const,
    title: finding.title,
    evidence: `Diff evidence: ${finding.fingerprint} is absent from the latest scan.`,
  }));
  const partial = regression.persistentFailures.slice(0, 1).map((finding) => ({
    status: "Partial" as const,
    title: finding.title,
    evidence: `Diff evidence: ${finding.fingerprint} remains in current and previous scans.`,
  }));
  const failed = [...regression.returningFailures, ...regression.newFailures].slice(0, 1).map((finding) => ({
    status: "Failed" as const,
    title: finding.title,
    evidence: `Diff evidence: ${finding.fingerprint} is present in the latest scan.`,
  }));
  return [...verified, ...partial, ...failed].slice(0, 3);
}

function scaleRisksFor(workspace: ProjectWorkspace, issues: DecisionIssue[], state: DecisionState) {
  const risks: string[] = issues.map((issue) => {
    const category = categoryForText(`${issue.category} ${issue.title} ${issue.filePath || ""}`);
    if (category === "Payments") return "Billing or entitlement state can fail under concurrent paid users.";
    if (category === "API") return "High request volume can expose missing route, validation, or backend gaps.";
    if (category === "Security") return "More users increase exposure to auth, tenant, or secret handling failures.";
    return "Operational load can amplify deployment, persistence, or worker assumptions.";
  });
  if (risks.length < 3 && workspace.scanComparison?.criticalFindingsDelta && workspace.scanComparison.criticalFindingsDelta > 0) {
    risks.push("Recent critical regression can compound after traffic increases.");
  }
  if (risks.length < 3 && state !== "READY") risks.push("Remaining warnings can become production support work at scale.");
  if (risks.length === 0) risks.push("No scale-specific failure is currently supported by scan evidence.");
  return [...new Set(risks)].slice(0, 3);
}

function categoryForText(text: string): RiskCategoryName {
  const clean = text.toLowerCase();
  if (/\b(stripe|billing|payment|checkout|subscription|invoice|portal|webhook)\b/.test(clean)) return "Payments";
  if (/\b(api|route|endpoint|handler|fetch|server action|webhook)\b/.test(clean)) return "API";
  if (/\b(auth|session|role|owner|tenant|admin|secret|token|permission|security)\b/.test(clean)) return "Security";
  return "Scaling";
}

function warningsFor(workspace: ProjectWorkspace, state: DecisionState, issues: DecisionIssue[]) {
  const warnings = issues
    .filter((issue) => severityRank(issue.riskLevel) < 4)
    .map((issue) => issue.title);
  if (workspace.scanComparison && workspace.scanComparison.readinessDelta < 0) warnings.unshift("Readiness declined since the previous scan.");
  if (state === "READY" && latestWorkspaceScan(workspace.scans)) warnings.push("Launch is conditional on keeping current scan gates passing.");
  return [...new Set(warnings)].slice(0, 3);
}

function fixImpactFor(severity: string) {
  const rank = severityRank(severity);
  if (rank >= 4) return 18;
  if (rank === 3) return 12;
  if (rank === 2) return 7;
  return 3;
}

function normalizeSeverity(value: string) {
  const clean = value.toLowerCase();
  if (clean === "critical" || clean === "high" || clean === "medium" || clean === "low") return clean;
  return "unknown";
}

function boundedScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}
