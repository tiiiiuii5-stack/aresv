import type { RegressionReport } from "@/lib/intelligence/regression-detection";
import { buildChangeImpactReport, type ChangeImpactItem, type ChangeImpactReport } from "@/lib/scanner/changeImpact";
import type { ScanAssuranceDiff, ScanAssuranceManifest } from "@/lib/scanner/scanAssurance";
import {
  severityBreakdown,
  severityRank,
  severityStandardFor,
  VENTUREOS_SEVERITY_STANDARD,
  VENTUREOS_SEVERITY_STANDARD_VERSION,
  type NormalizedSeverity,
} from "@/lib/scanner/severityStandard";

export type AssuranceGateIssue = {
  id?: string;
  title?: string;
  severity?: string;
  category?: string;
  evidence?: string;
  filePath?: string;
  endpoint?: string;
  confidenceScore?: number;
  blocking?: boolean;
  fixSuggestion?: string;
};

export type AssuranceGateReason = {
  id: string;
  title: string;
  severity: NormalizedSeverity;
  blocking: boolean;
  filePath?: string;
  endpoint?: string;
  evidence: string;
  confidence: number;
  industryMapping: {
    standard: typeof VENTUREOS_SEVERITY_STANDARD_VERSION;
    cvssRange: string;
    sarifLevel: string;
    githubImpact: string;
    mergePolicy: string;
  };
  fix: string;
};

export type TrustScoreExplanation = {
  score: number;
  threshold: number;
  status: "PASS" | "WARNING" | "FAIL";
  scoreBand: "ready" | "review" | "blocked";
  computedFrom: string[];
  severityTotals: Record<NormalizedSeverity, number>;
  assurance: {
    deterministic: boolean;
    scanId?: string;
    sourceHash?: string;
    ruleSetHash?: string;
    fileCount?: number;
    totalBytes?: number;
  };
  history: {
    baselineAvailable: boolean;
    changedFiles: number;
    addedFiles: number;
    removedFiles: number;
    unchangedFiles: number;
    regressionDirection?: string;
    readinessDelta?: number;
  };
  changeImpact: {
    summary: string;
    blockingChangeCount: number;
    reviewChangeCount: number;
    topChangedFiles: Array<{
      path: string;
      changeType: string;
      impactArea: string;
      gateEffect: string;
      reason: string;
    }>;
  };
};

export type AssuranceGateReport = {
  engine: "ventureos-assurance-ci-gate";
  version: "1.0.0";
  generatedAt: string;
  status: "PASS" | "WARNING" | "FAIL";
  state: "success" | "failure";
  shouldBlock: boolean;
  exitCode: 0 | 1;
  summary: string;
  reasons: AssuranceGateReason[];
  warnings: AssuranceGateReason[];
  changeImpact: ChangeImpactReport;
  trustScoreExplanation: TrustScoreExplanation;
  enforcement: {
    provider: "github_status" | "generic_ci";
    requiredContext: "VentureOS Readiness";
    branchProtectionRequired: boolean;
    mergeBlockedWhen: string[];
  };
  severityStandard: {
    version: typeof VENTUREOS_SEVERITY_STANDARD_VERSION;
    mapping: typeof VENTUREOS_SEVERITY_STANDARD;
  };
};

export type BuildAssuranceGateInput = {
  readinessScore: number;
  blockThreshold?: number;
  issues: AssuranceGateIssue[];
  assurance?: ScanAssuranceManifest | null;
  scanDiff?: ScanAssuranceDiff | null;
  regressionReport?: RegressionReport | null;
  blockWarnings?: boolean;
};

export function buildAssuranceGate(input: BuildAssuranceGateInput): AssuranceGateReport {
  const score = boundedScore(input.readinessScore);
  const threshold = boundedScore(input.blockThreshold ?? 75);
  const issueReasons = input.issues.map(issueReason).filter((reason) => reason.confidence >= 75);
  const changeImpact = buildChangeImpactReport({
    scanDiff: input.scanDiff || null,
    issues: input.issues,
    regressionReport: input.regressionReport || null,
  });
  const blockingReasons = issueReasons.filter((reason) => reason.blocking || reason.severity === "critical");
  const thresholdReason = score < threshold ? readinessThresholdReason(score, threshold) : null;
  const historyWarnings = historyReasons(input.scanDiff || null, input.regressionReport || null);
  const changeWarnings = changeImpact.impacts
    .filter((impact) => impact.gateEffect !== "INFORMATIONAL")
    .map(changeImpactReason);
  const reasons = [...blockingReasons, ...(thresholdReason ? [thresholdReason] : [])].sort(reasonSort).slice(0, 10);
  const warnings = issueReasons
    .filter((reason) => !reasons.some((item) => item.id === reason.id))
    .concat(historyWarnings, changeWarnings)
    .sort(reasonSort)
    .slice(0, 10);
  const warningShouldBlock = Boolean(input.blockWarnings && warnings.some((reason) => severityRank(reason.severity) >= 2));
  const status = reasons.length > 0 ? "FAIL" : warningShouldBlock || score < 85 || warnings.some((reason) => severityRank(reason.severity) >= 2) ? "WARNING" : "PASS";
  const shouldBlock = status === "FAIL" || warningShouldBlock;

  return {
    engine: "ventureos-assurance-ci-gate",
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    status,
    state: shouldBlock ? "failure" : "success",
    shouldBlock,
    exitCode: shouldBlock ? 1 : 0,
    summary: summaryFor(status, score, reasons, warnings),
    reasons,
    warnings,
    changeImpact,
    trustScoreExplanation: {
      score,
      threshold,
      status,
      scoreBand: score >= 85 ? "ready" : score >= threshold ? "review" : "blocked",
      computedFrom: [
        "normalized severity standard",
        "confirmed blocking issues",
        "readiness threshold",
        "deterministic assurance manifest",
        "scan history diff when available",
      ],
      severityTotals: severityBreakdown(input.issues),
      assurance: {
        deterministic: input.assurance?.deterministic === true,
        scanId: input.assurance?.scanId,
        sourceHash: input.assurance?.sourceHash,
        ruleSetHash: input.assurance?.ruleSetHash,
        fileCount: input.assurance?.fileCount,
        totalBytes: input.assurance?.totalBytes,
      },
      history: {
        baselineAvailable: Boolean(input.scanDiff?.baselineAvailable || input.regressionReport?.previousScan),
        changedFiles: input.scanDiff?.changedFiles.length || 0,
        addedFiles: input.scanDiff?.addedFiles.length || 0,
        removedFiles: input.scanDiff?.removedFiles.length || 0,
        unchangedFiles: input.scanDiff?.unchangedFiles || 0,
        regressionDirection: input.regressionReport?.scoreChange.direction,
        readinessDelta: input.regressionReport?.scoreChange.readinessDelta,
      },
      changeImpact: {
        summary: changeImpact.summary,
        blockingChangeCount: changeImpact.blockingChangeCount,
        reviewChangeCount: changeImpact.reviewChangeCount,
        topChangedFiles: changeImpact.impacts.slice(0, 5).map((impact) => ({
          path: impact.path,
          changeType: impact.changeType,
          impactArea: impact.impactArea,
          gateEffect: impact.gateEffect,
          reason: impact.reason,
        })),
      },
    },
    enforcement: {
      provider: "github_status",
      requiredContext: "VentureOS Readiness",
      branchProtectionRequired: true,
      mergeBlockedWhen: [
        "commit status context VentureOS Readiness is required by branch protection",
        "gate status is FAIL",
        "gate status is WARNING and warning blocking is enabled",
      ],
    },
    severityStandard: {
      version: VENTUREOS_SEVERITY_STANDARD_VERSION,
      mapping: VENTUREOS_SEVERITY_STANDARD,
    },
  };
}

function changeImpactReason(impact: ChangeImpactItem): AssuranceGateReason {
  const standard = severityStandardFor(impact.severity);
  return {
    id: `change-impact:${impact.changeType.toLowerCase()}:${impact.path}`,
    title: `${impact.changeType.toLowerCase()} ${impact.impactArea} file requires review`,
    severity: impact.severity,
    blocking: false,
    filePath: impact.path,
    evidence: impact.reason,
    confidence: 90,
    industryMapping: {
      standard: VENTUREOS_SEVERITY_STANDARD_VERSION,
      cvssRange: standard.cvssRange,
      sarifLevel: standard.sarifLevel,
      githubImpact: standard.githubImpact,
      mergePolicy: standard.defaultMergePolicy,
    },
    fix: "Review the changed file, confirm the linked findings are resolved, and re-run the deterministic scan.",
  };
}

function issueReason(issue: AssuranceGateIssue): AssuranceGateReason {
  const standard = severityStandardFor(issue.severity);
  const title = cleanText(issue.title || issue.id || "Confirmed VentureOS finding");
  const evidence = cleanText(issue.evidence) || "Finding was emitted by the deterministic scan pipeline.";
  const confidence = boundedConfidence(issue.confidenceScore ?? 75);
  return {
    id: cleanText(issue.id) || stableId(title),
    title,
    severity: standard.severity,
    blocking: Boolean(issue.blocking) || standard.severity === "critical",
    filePath: cleanText(issue.filePath) || undefined,
    endpoint: cleanText(issue.endpoint) || undefined,
    evidence,
    confidence,
    industryMapping: {
      standard: VENTUREOS_SEVERITY_STANDARD_VERSION,
      cvssRange: standard.cvssRange,
      sarifLevel: standard.sarifLevel,
      githubImpact: standard.githubImpact,
      mergePolicy: standard.defaultMergePolicy,
    },
    fix: cleanText(issue.fixSuggestion) || "Review the affected path and apply the evidence-backed remediation.",
  };
}

function readinessThresholdReason(score: number, threshold: number): AssuranceGateReason {
  const standard = severityStandardFor("high");
  return {
    id: "readiness-below-threshold",
    title: "Readiness score is below CI threshold",
    severity: "high",
    blocking: true,
    evidence: `Readiness score ${score}/100 is below required threshold ${threshold}/100.`,
    confidence: 100,
    industryMapping: {
      standard: VENTUREOS_SEVERITY_STANDARD_VERSION,
      cvssRange: standard.cvssRange,
      sarifLevel: standard.sarifLevel,
      githubImpact: standard.githubImpact,
      mergePolicy: standard.defaultMergePolicy,
    },
    fix: "Fix the highest-severity confirmed findings and re-run the scan until readiness meets the configured threshold.",
  };
}

function historyReasons(scanDiff: ScanAssuranceDiff | null, regression: RegressionReport | null): AssuranceGateReason[] {
  const output: AssuranceGateReason[] = [];
  if (scanDiff?.baselineAvailable) {
    if (scanDiff.ruleSetHashChanged) {
      output.push(warningReason("assurance-ruleset-changed", "Rule set changed since baseline", "Rule-set hash differs from the previous assurance manifest.", "low"));
    }
    if (scanDiff.changedFiles.length || scanDiff.addedFiles.length || scanDiff.removedFiles.length) {
      output.push(warningReason(
        "assurance-source-changed",
        "Source changed since baseline",
        `${scanDiff.changedFiles.length} changed, ${scanDiff.addedFiles.length} added, ${scanDiff.removedFiles.length} removed files compared with the baseline manifest.`,
        "low",
      ));
    }
  }

  if (regression?.scoreChange.direction === "regressed") {
    output.push(warningReason("history-regressed", "Readiness regressed from previous scan", regression.summary, "medium"));
  }
  if (regression?.returningFailures.length) {
    output.push(warningReason("history-returning-failures", "Previously seen failures returned", regression.whatGotWorse[0] || regression.summary, "medium"));
  }
  return output;
}

function warningReason(id: string, title: string, evidence: string, severity: NormalizedSeverity): AssuranceGateReason {
  const standard = severityStandardFor(severity);
  return {
    id,
    title,
    severity,
    blocking: false,
    evidence,
    confidence: 90,
    industryMapping: {
      standard: VENTUREOS_SEVERITY_STANDARD_VERSION,
      cvssRange: standard.cvssRange,
      sarifLevel: standard.sarifLevel,
      githubImpact: standard.githubImpact,
      mergePolicy: standard.defaultMergePolicy,
    },
    fix: "Review scan history and confirm the latest result is expected before merging.",
  };
}

function summaryFor(status: "PASS" | "WARNING" | "FAIL", score: number, reasons: AssuranceGateReason[], warnings: AssuranceGateReason[]) {
  if (status === "FAIL") return `FAIL: ${reasons.length} blocking reason${reasons.length === 1 ? "" : "s"}, readiness ${score}/100.`;
  if (status === "WARNING") return `WARNING: ${warnings.length} review reason${warnings.length === 1 ? "" : "s"}, readiness ${score}/100.`;
  return `PASS: no blocking reasons, readiness ${score}/100.`;
}

function reasonSort(a: AssuranceGateReason, b: AssuranceGateReason) {
  return severityRank(b.severity) - severityRank(a.severity) || b.confidence - a.confidence || a.title.localeCompare(b.title);
}

function boundedScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

function boundedConfidence(value: number) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

function cleanText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stableId(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return `gate_${Math.abs(hash).toString(36)}`;
}
