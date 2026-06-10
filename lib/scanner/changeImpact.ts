import type { RegressionReport } from "@/lib/intelligence/regression-detection";
import type { ScanAssuranceDiff } from "@/lib/scanner/scanAssurance";
import { normalizeSeverity, severityRank, type NormalizedSeverity } from "@/lib/scanner/severityStandard";

export type ChangeImpactIssue = {
  id?: string;
  title?: string;
  severity?: string;
  filePath?: string;
  blocking?: boolean;
  evidence?: string;
};

export type ChangeImpactArea = "api" | "auth" | "billing" | "database" | "dependency" | "deployment" | "ui" | "worker" | "unknown";
export type ChangeImpactType = "ADDED" | "CHANGED" | "REMOVED";
export type ChangeGateEffect = "BLOCKING" | "REVIEW" | "INFORMATIONAL";

export type ChangeImpactItem = {
  path: string;
  changeType: ChangeImpactType;
  impactArea: ChangeImpactArea;
  severity: NormalizedSeverity;
  gateEffect: ChangeGateEffect;
  reason: string;
  linkedFindings: Array<{
    id?: string;
    title: string;
    severity: NormalizedSeverity;
    blocking: boolean;
  }>;
  evidence: Array<{
    source: "assurance_diff" | "current_scan" | "scan_history";
    reason: string;
    confidence: number;
  }>;
};

export type ChangeImpactReport = {
  engine: "ventureos-change-impact";
  version: "1.0.0";
  generatedAt: string;
  baselineAvailable: boolean;
  changedFileCount: number;
  addedFileCount: number;
  removedFileCount: number;
  unchangedFileCount: number;
  blockingChangeCount: number;
  reviewChangeCount: number;
  summary: string;
  impacts: ChangeImpactItem[];
};

export type BuildChangeImpactInput = {
  scanDiff?: ScanAssuranceDiff | null;
  issues: ChangeImpactIssue[];
  regressionReport?: RegressionReport | null;
};

export function buildChangeImpactReport(input: BuildChangeImpactInput): ChangeImpactReport {
  const scanDiff = input.scanDiff || null;
  const changes = scanDiff?.baselineAvailable
    ? [
      ...scanDiff.addedFiles.map((path) => changeItem(path, "ADDED", input.issues, input.regressionReport || null)),
      ...scanDiff.changedFiles.map((path) => changeItem(path, "CHANGED", input.issues, input.regressionReport || null)),
      ...scanDiff.removedFiles.map((path) => changeItem(path, "REMOVED", input.issues, input.regressionReport || null)),
    ]
    : [];
  const impacts = changes.sort(changeSort).slice(0, 25);
  const blockingChangeCount = impacts.filter((item) => item.gateEffect === "BLOCKING").length;
  const reviewChangeCount = impacts.filter((item) => item.gateEffect === "REVIEW").length;

  return {
    engine: "ventureos-change-impact",
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    baselineAvailable: Boolean(scanDiff?.baselineAvailable),
    changedFileCount: scanDiff?.changedFiles.length || 0,
    addedFileCount: scanDiff?.addedFiles.length || 0,
    removedFileCount: scanDiff?.removedFiles.length || 0,
    unchangedFileCount: scanDiff?.unchangedFiles || 0,
    blockingChangeCount,
    reviewChangeCount,
    summary: summaryFor(scanDiff, blockingChangeCount, reviewChangeCount),
    impacts,
  };
}

function changeItem(path: string, changeType: ChangeImpactType, issues: ChangeImpactIssue[], regressionReport: RegressionReport | null): ChangeImpactItem {
  const linkedFindings = linkedIssues(path, issues);
  const highestSeverity = linkedFindings.reduce<NormalizedSeverity>(
    (severity, issue) => {
      const issueSeverity = normalizeSeverity(issue.severity);
      return severityRank(issueSeverity) > severityRank(severity) ? issueSeverity : severity;
    },
    "unknown",
  );
  const impactArea = impactAreaFor(path, linkedFindings);
  const inferredSeverity = highestSeverity !== "unknown" ? highestSeverity : defaultSeverityFor(impactArea, changeType);
  const gateEffect: ChangeGateEffect = linkedFindings.some((issue) => issue.blocking) || severityRank(inferredSeverity) >= 3
    ? "BLOCKING"
    : severityRank(inferredSeverity) >= 2
      ? "REVIEW"
      : "INFORMATIONAL";

  return {
    path,
    changeType,
    impactArea,
    severity: inferredSeverity,
    gateEffect,
    reason: reasonFor(path, changeType, impactArea, linkedFindings, regressionReport),
    linkedFindings: linkedFindings.map((issue) => ({
      id: issue.id,
      title: cleanTitle(issue.title || issue.id || "Current scan finding"),
      severity: normalizeSeverity(issue.severity),
      blocking: Boolean(issue.blocking),
    })),
    evidence: evidenceFor(path, changeType, linkedFindings, regressionReport),
  };
}

function linkedIssues(path: string, issues: ChangeImpactIssue[]) {
  const normalized = normalizePath(path);
  const base = normalized.split("/").pop() || normalized;
  return issues.filter((issue) => {
    const issuePath = normalizePath(issue.filePath || "");
    if (!issuePath) return false;
    return issuePath === normalized || issuePath.endsWith(`/${base}`) || normalized.endsWith(`/${issuePath}`);
  }).sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function impactAreaFor(path: string, linkedFindings: ChangeImpactIssue[]): ChangeImpactArea {
  const normalized = normalizePath(path);
  const linkedText = linkedFindings.map((issue) => `${issue.title || ""} ${issue.evidence || ""}`).join(" ").toLowerCase();
  if (/auth|session|permission|owner|tenant/.test(normalized) || /auth|session|permission|owner|tenant/.test(linkedText)) return "auth";
  if (/billing|stripe|checkout|payment|subscription/.test(normalized) || /billing|stripe|checkout|payment/.test(linkedText)) return "billing";
  if (/app\/api|pages\/api|route\.(ts|js|tsx|jsx)$/.test(normalized)) return "api";
  if (/prisma|migration|schema\.prisma|database|db\//.test(normalized)) return "database";
  if (/package\.json|lock|requirements\.txt|pyproject\.toml|gemfile|cargo\.toml/.test(normalized)) return "dependency";
  if (/vercel|docker|compose|github\/workflows|ci|env|next\.config|build|deploy/.test(normalized)) return "deployment";
  if (/worker|queue|bullmq|cron|scheduled/.test(normalized)) return "worker";
  if (/\.(tsx|jsx|css|scss)$/.test(normalized) || /app\/|pages\/|components\//.test(normalized)) return "ui";
  return "unknown";
}

function defaultSeverityFor(area: ChangeImpactArea, changeType: ChangeImpactType): NormalizedSeverity {
  if (area === "auth" || area === "billing" || area === "database") return "medium";
  if (area === "api" || area === "deployment" || area === "dependency" || area === "worker") return "medium";
  if (changeType === "REMOVED" && area !== "unknown") return "medium";
  if (area === "ui") return "low";
  return "low";
}

function reasonFor(path: string, changeType: ChangeImpactType, area: ChangeImpactArea, linkedFindings: ChangeImpactIssue[], regressionReport: RegressionReport | null) {
  if (linkedFindings.length) {
    const blocking = linkedFindings.some((issue) => issue.blocking);
    return `${changeType.toLowerCase()} ${area} file is linked to ${linkedFindings.length} current scan finding${linkedFindings.length === 1 ? "" : "s"}${blocking ? " and affects the CI gate" : ""}.`;
  }
  if (regressionReport?.scoreChange.direction === "regressed") {
    return `${changeType.toLowerCase()} ${area} file occurred in a scan where readiness regressed.`;
  }
  return `${changeType.toLowerCase()} ${area} file changed since the baseline manifest; no current blocking finding is attached to this file.`;
}

function evidenceFor(path: string, changeType: ChangeImpactType, linkedFindings: ChangeImpactIssue[], regressionReport: RegressionReport | null): ChangeImpactItem["evidence"] {
  const output: ChangeImpactItem["evidence"] = [{
    source: "assurance_diff",
    reason: `${path} is listed as ${changeType.toLowerCase()} by the deterministic assurance manifest comparison.`,
    confidence: 0.96,
  }];
  if (linkedFindings.length) {
    output.push({
      source: "current_scan",
      reason: `${linkedFindings.length} current finding${linkedFindings.length === 1 ? "" : "s"} map to the changed file path.`,
      confidence: 0.9,
    });
  }
  if (regressionReport?.scoreChange.direction === "regressed") {
    output.push({
      source: "scan_history",
      reason: regressionReport.summary,
      confidence: 0.86,
    });
  }
  return output;
}

function summaryFor(scanDiff: ScanAssuranceDiff | null, blockingChangeCount: number, reviewChangeCount: number) {
  if (!scanDiff?.baselineAvailable) return "No baseline manifest was supplied, so commit-level change impact is unavailable.";
  const total = scanDiff.changedFiles.length + scanDiff.addedFiles.length + scanDiff.removedFiles.length;
  if (total === 0) return "No file changes were detected against the supplied baseline manifest.";
  if (blockingChangeCount > 0) return `${blockingChangeCount} changed file${blockingChangeCount === 1 ? "" : "s"} affect the release gate.`;
  if (reviewChangeCount > 0) return `${reviewChangeCount} changed file${reviewChangeCount === 1 ? "" : "s"} require review before merge.`;
  return `${total} changed file${total === 1 ? "" : "s"} detected; no gate-blocking changed file is attached to current findings.`;
}

function changeSort(a: ChangeImpactItem, b: ChangeImpactItem) {
  return gateRank(b.gateEffect) - gateRank(a.gateEffect) || severityRank(b.severity) - severityRank(a.severity) || a.path.localeCompare(b.path);
}

function gateRank(value: ChangeGateEffect) {
  if (value === "BLOCKING") return 3;
  if (value === "REVIEW") return 2;
  return 1;
}

function normalizePath(value: string) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "").trim().toLowerCase();
}

function cleanTitle(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
