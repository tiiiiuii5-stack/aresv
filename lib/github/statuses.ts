import type { GitHubGateDecision, GitHubGateStatus } from "@/lib/github/types";
import type { AssuranceGateReport } from "@/lib/scanner/assuranceGate";

export type GitHubGateInput = {
  readinessScore: number;
  blockingIssues: number;
  criticalFindings: number;
  blockWarnings?: boolean;
  assuranceGate?: AssuranceGateReport;
};

export function decideGitHubGate(input: GitHubGateInput): GitHubGateDecision {
  if (input.assuranceGate) {
    const status = input.assuranceGate.status;
    const shouldBlockMerge = status === "FAIL" || (status === "WARNING" && Boolean(input.blockWarnings));
    return {
      status,
      state: shouldBlockMerge ? "failure" : "success",
      shouldBlockMerge,
      description: input.assuranceGate.summary,
      reasons: input.assuranceGate.reasons.map((reason) => ({
        id: reason.id,
        title: reason.title,
        severity: reason.severity,
        evidence: reason.evidence,
        filePath: reason.filePath,
      })),
      warnings: input.assuranceGate.warnings.map((warning) => ({
        id: warning.id,
        title: warning.title,
        severity: warning.severity,
        evidence: warning.evidence,
      })),
      trustScoreExplanation: input.assuranceGate.trustScoreExplanation,
      severityStandard: input.assuranceGate.severityStandard,
      changeImpact: input.assuranceGate.changeImpact,
    };
  }

  const readinessScore = boundedScore(input.readinessScore);
  const status: GitHubGateStatus =
    input.criticalFindings > 0 || input.blockingIssues > 0 || readinessScore < 70
      ? "FAIL"
      : readinessScore < 85
        ? "WARNING"
        : "PASS";
  const shouldBlockMerge = status === "FAIL" || (status === "WARNING" && Boolean(input.blockWarnings));
  return {
    status,
    state: shouldBlockMerge ? "failure" : "success",
    shouldBlockMerge,
    description:
      status === "PASS"
        ? `PASS: readiness ${readinessScore}/100`
        : status === "WARNING"
          ? `WARNING: readiness ${readinessScore}/100`
          : `FAIL: ${input.blockingIssues || input.criticalFindings} blocker(s), readiness ${readinessScore}/100`,
  };
}

export function formatPullRequestAnalysisComment(input: {
  readinessScore: number;
  gate: GitHubGateDecision;
  issues: Array<{ title: string; severity?: string; fixSuggestion?: string }>;
  recommendations: string[];
  assurance?: {
    scanId?: string;
    sourceHash?: string;
    ruleSetHash?: string;
  };
}) {
  const issues = input.issues.slice(0, 5);
  const issueLines = issues.length
    ? issues.map((issue) => `- ${String(issue.severity || "risk").toUpperCase()}: ${issue.title}`).join("\n")
    : "- No new high-confidence issues detected.";
  const fixLines = input.recommendations.slice(0, 5).map((item) => `- ${item}`).join("\n") || "- Keep current release gates passing.";
  const reasonLines = input.gate.reasons?.length
    ? input.gate.reasons.slice(0, 5).map((reason) => `- ${String(reason.severity || "risk").toUpperCase()}: ${reason.title}${reason.filePath ? ` (${reason.filePath})` : ""}`).join("\n")
    : "- No blocking gate reasons.";
  const warningLines = input.gate.warnings?.length
    ? input.gate.warnings.slice(0, 3).map((warning) => `- ${String(warning.severity || "review").toUpperCase()}: ${warning.title}`).join("\n")
    : "- No gate warnings.";
  const assuranceLines = input.assurance?.scanId
    ? [
      `Scan ID: \`${input.assurance.scanId}\``,
      `Source hash: \`${shortHash(input.assurance.sourceHash)}\``,
      `Rule-set hash: \`${shortHash(input.assurance.ruleSetHash)}\``,
    ].join("\n")
    : "Assurance manifest unavailable.";
  const changeImpactLines = formatChangeImpact(input.gate.changeImpact);

  return [
    "## VentureOS Analysis",
    "",
    `Readiness Score: **${boundedScore(input.readinessScore)}**`,
    `Status: **${input.gate.status}**`,
    `Gate: **${input.gate.description}**`,
    "",
    "### Gate Reasoning",
    reasonLines,
    "",
    "### Gate Warnings",
    warningLines,
    "",
    "### What Changed And Why It Matters",
    changeImpactLines,
    "",
    "### New Issues",
    issueLines,
    "",
    "### Recommended Fixes",
    fixLines,
    "",
    "### Assurance",
    assuranceLines,
    "",
    "_Evidence-backed by VentureOS repository analysis. No code was executed._",
  ].join("\n");
}

function boundedScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

function shortHash(value: unknown) {
  const clean = String(value || "");
  return clean ? clean.slice(0, 12) : "unavailable";
}

function formatChangeImpact(value: unknown) {
  const report = value && typeof value === "object" && !Array.isArray(value) ? value as { summary?: unknown; impacts?: unknown } : {};
  const impacts = Array.isArray(report.impacts) ? report.impacts : [];
  const lines = impacts
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .slice(0, 5)
    .map((impact) => `- ${String(impact.gateEffect || "INFO")}: ${String(impact.changeType || "CHANGED")} ${String(impact.path || "unknown path")} - ${String(impact.reason || "No explanation available.")}`);
  return lines.length ? lines.join("\n") : `- ${String(report.summary || "No baseline manifest was supplied, so commit-level change impact is unavailable.")}`;
}
