import { buildWorkspaceDecision, severityRank, type WorkspaceDecision } from "@/lib/decision-model";
import type { ProjectWorkspace, WorkspaceFinding } from "@/lib/services/projectWorkspace";
import type {
  AppraisalBadgeState,
  AppraisalEvidenceCoverage,
  AppraisalEvidenceItem,
  AppraisalFixPlanStep,
  AppraisalGrade,
  AppraisalLaunchVerdict,
  AppraisalMoneyRange,
  AppraisalPrivateReport,
  AppraisalPublicSummary,
} from "@/lib/appraisal/types";
import { assertNeutralReportLanguage, buildReportLanguageContract, neutralizeReportText } from "@/lib/appraisal/reportLanguage";

const publicDisclaimer =
  "VentureOS reports observations and computed readiness estimates from submitted evidence, stored scan metadata, signed records, and configured external sources. It is not an independent audit, legal opinion, accounting opinion, compliance certification, or market valuation.";

export function buildAppraisalReport(workspace: ProjectWorkspace, generatedAt = new Date().toISOString()): {
  publicSummary: AppraisalPublicSummary;
  privateReport: AppraisalPrivateReport;
} {
  if (!workspace.project) throw new Error("PROJECT_WORKSPACE_REQUIRED");

  const latestScan = latestWorkspaceScanForAppraisal(workspace);
  const currentFindings = currentFindingsForAppraisal(workspace.findings, latestScan);
  const appraisalWorkspace = { ...workspace, findings: currentFindings };
  const decision = buildWorkspaceDecision(appraisalWorkspace);
  const evidence = appraisalEvidenceFor(currentFindings);
  const riskCounts = riskCountsFor(currentFindings);
  const rawReadinessScore = boundedScore(decision.readinessScore);
  const evidenceSources = decision.latestScan?.externalDataSources || [];
  const evidenceCoverage = evidenceCoverageFor(appraisalWorkspace, decision, evidence, evidenceSources);
  const readinessScore = Math.min(rawReadinessScore, evidenceCoverage.scoreCap);
  const technicalRiskScore = technicalRiskFor(readinessScore, riskCounts);
  const transferReadinessScore = transferReadinessFor(appraisalWorkspace, decision, evidence);
  const grade = gradeFor(readinessScore, riskCounts);
  const launchVerdict = launchVerdictFor(decision, readinessScore, riskCounts);
  const badgeState = badgeStateFor(launchVerdict, readinessScore, workspace.scanComparison?.readinessDelta ?? 0);
  const repairCost = repairCostFor(riskCounts, readinessScore);
  const technicalValue = technicalValueFor(readinessScore, technicalRiskScore, transferReadinessScore, repairCost, evidenceSources);
  const conditions = conditionsFor(launchVerdict, decision, evidence, evidenceCoverage);
  const fixPlan = fixPlanFor(evidence, decision);
  const language = buildReportLanguageContract({ coverage: evidenceCoverage, evidence, verdict: launchVerdict });

  const publicSummary: AppraisalPublicSummary = {
    publicId: "",
    appName: decision.projectName,
    grade,
    launchVerdict,
    badgeState,
    readinessScore,
    technicalRiskScore,
    transferReadinessScore,
    repairCost,
    technicalValue,
    topRisks: evidence.slice(0, 3).map((item) => ({
      id: item.id,
      title: item.title,
      severity: item.severity,
      category: item.category,
      confidence: item.confidence,
      fixImpact: item.fixImpact,
      publicSummary: neutralizeReportText(item.publicSummary),
    })),
    conditions: conditions.map(neutralizeReportText),
    evidenceSources,
    evidenceCoverage,
    unknowns: evidenceCoverage.unknowns.map(neutralizeReportText),
    unverifiedClaims: evidenceCoverage.unverifiedClaims.map(neutralizeReportText),
    authorityBoundaries: language.boundaries,
    observedClaims: language.claims.observed,
    inferredClaims: language.claims.inferred,
    notVerifiedClaims: language.claims.notVerified,
    trend: decision.trend,
    generatedAt,
    expiresAt: null,
    disclaimer: publicDisclaimer,
  };

  const privateReport: AppraisalPrivateReport = {
    engine: "ventureos-software-appraisal",
    version: "1.0.0",
    generatedAt,
    projectId: workspace.project.id,
    projectName: decision.projectName,
    state: decision.state,
    shipAnswer: decision.shipAnswer,
    shipReason: neutralizeReportText(decision.shipReason),
    scoreBreakdown: {
      readiness: readinessScore,
      rawReadiness: rawReadinessScore,
      technicalRisk: technicalRiskScore,
      transferReadiness: transferReadinessScore,
      evidenceConfidence: evidenceConfidenceFor(evidence, workspace, evidenceCoverage),
      evidenceCoverage,
      riskCounts,
    },
    evidence,
    fixPlan,
    warnings: decision.warnings,
    scaleRisks: decision.scaleRisks,
    source: {
      latestScanId: decision.latestScan?.id ?? null,
      latestScanRefId: decision.latestScan?.scanRefId ?? null,
      latestScanSource: decision.latestScan?.source ?? null,
      scanCount: workspace.scans.length,
      findingCount: currentFindings.length,
      repositoryCount: workspace.repositoryLinks.length,
      sourceLength: decision.latestScan?.sourceLength ?? null,
      rawCodeStored: decision.latestScan?.rawCodeStored ?? null,
      inputTruncated: decision.latestScan?.inputTruncated ?? null,
      externalDataSources: evidenceSources,
    },
    authorityBoundaries: language.boundaries,
    observedClaims: language.claims.observed,
    inferredClaims: language.claims.inferred,
    notVerifiedClaims: language.claims.notVerified,
  };

  assertNeutralReportLanguage({ publicSummary, privateReport });

  return { publicSummary, privateReport };
}

function latestWorkspaceScanForAppraisal(workspace: ProjectWorkspace) {
  return [...workspace.scans].sort((a, b) => b.scannedAt.localeCompare(a.scannedAt))[0] || null;
}

function currentFindingsForAppraisal(findings: WorkspaceFinding[], latestScan: ReturnType<typeof latestWorkspaceScanForAppraisal>) {
  if (!latestScan) return findings;
  const latestIds = new Set([latestScan.scanRefId, latestScan.id].filter((value): value is string => Boolean(value)));
  const current = findings.filter((finding) => latestIds.has(finding.scanId));
  if (current.length > 0 || findings.length === 0 || latestScan.findingsCount === 0) return current;
  return findings;
}

export function gradeFor(readinessScore: number, riskCounts: AppraisalPrivateReport["scoreBreakdown"]["riskCounts"]): AppraisalGrade {
  if (riskCounts.critical > 0 || readinessScore < 50) return "F";
  if (riskCounts.high >= 3 || readinessScore < 65) return "D";
  if (riskCounts.high > 0 || readinessScore < 80) return "C";
  if (riskCounts.medium > 2 || readinessScore < 92) return "B";
  return "A";
}

export function launchVerdictFor(
  decision: WorkspaceDecision,
  readinessScore: number,
  riskCounts: AppraisalPrivateReport["scoreBreakdown"]["riskCounts"],
): AppraisalLaunchVerdict {
  if (!decision.latestScan || riskCounts.critical > 1 || readinessScore < 45) return "DO_NOT_DEPLOY";
  if (decision.state === "BLOCKED" || riskCounts.critical > 0 || readinessScore < 65) return "BLOCKED";
  if (decision.state === "RISKY" || riskCounts.high > 0 || readinessScore < 85) return "RISKY";
  return "READY";
}

export function badgeStateFor(verdict: AppraisalLaunchVerdict, readinessScore: number, readinessDelta: number): AppraisalBadgeState {
  if (verdict === "READY" && readinessDelta > 0) return "REVERIFIED";
  if (verdict === "READY") return "PRODUCTION_READY";
  if (verdict === "DO_NOT_DEPLOY" || readinessScore < 55) return "HIGH_RISK";
  if (verdict === "RISKY") return "RISK_REVIEWED";
  return "VENTUREOS_APPRAISED";
}

function appraisalEvidenceFor(findings: WorkspaceFinding[]): AppraisalEvidenceItem[] {
  return findings
    .filter((finding) => hasEvidence(finding))
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || confidenceFor(b) - confidenceFor(a) || a.title.localeCompare(b.title))
    .slice(0, 12)
    .map((finding) => ({
      id: finding.id,
      title: cleanText(finding.title, 180),
      severity: normalizeSeverity(finding.severity),
      category: cleanText(finding.category || "scan", 80),
      filePath: finding.filePath,
      evidence: cleanText(finding.verificationEvidence || finding.evidence, 900),
      fixRecommendation: cleanText(finding.fixSuggestion, 900),
      confidence: confidenceFor(finding),
      fixImpact: fixImpactFor(finding.severity),
      publicSummary: publicRiskSummary(finding),
    }));
}

function fixPlanFor(evidence: AppraisalEvidenceItem[], decision: WorkspaceDecision): AppraisalFixPlanStep[] {
  const issueById = new Map(decision.topIssues.map((issue) => [issue.id, issue]));
  return evidence.slice(0, 5).map((item, index) => {
    const issue = issueById.get(item.id);
    return {
      id: item.id,
      order: index + 1,
      title: item.title,
      filePath: item.filePath,
      codeFix: issue?.codeFix,
      expectedResult: neutralizeReportText(issue?.expectedResult || `Next appraisal no longer reports: ${item.title}.`),
      estimatedScoreImpact: item.fixImpact,
      verificationStatus: "UNVERIFIED",
    };
  });
}

function riskCountsFor(findings: WorkspaceFinding[]) {
  return findings.reduce(
    (counts, finding) => {
      const severity = normalizeSeverity(finding.severity);
      if (severity === "critical") counts.critical += 1;
      else if (severity === "high") counts.high += 1;
      else if (severity === "medium") counts.medium += 1;
      else counts.low += 1;
      return counts;
    },
    { critical: 0, high: 0, medium: 0, low: 0 },
  );
}

function technicalRiskFor(readinessScore: number, riskCounts: ReturnType<typeof riskCountsFor>) {
  const issuePenalty = riskCounts.critical * 12 + riskCounts.high * 7 + riskCounts.medium * 3 + riskCounts.low;
  return boundedScore(100 - readinessScore + issuePenalty);
}

function transferReadinessFor(workspace: ProjectWorkspace, decision: WorkspaceDecision, evidence: AppraisalEvidenceItem[]) {
  let score = decision.readinessScore;
  if (workspace.repositoryLinks.length > 0) score += 8;
  if (workspace.scans.length >= 2) score += 6;
  if (workspace.reports.length > 0) score += 4;
  if (evidence.some((item) => item.filePath)) score += 4;
  if (workspace.findings.some((finding) => !finding.filePath)) score -= 8;
  if (!decision.latestScan) score = 25;
  return boundedScore(score);
}

function repairCostFor(riskCounts: ReturnType<typeof riskCountsFor>, readinessScore: number): AppraisalMoneyRange {
  if (readinessScore >= 90 && riskCounts.critical === 0 && riskCounts.high === 0 && riskCounts.medium === 0 && riskCounts.low === 0) {
    return {
      low: 0,
      high: 0,
      currency: "USD",
      label: "$0",
      available: true,
      basis: "No remediation cost is estimated because the latest scan emitted no current findings.",
    };
  }

  const low =
    riskCounts.critical * 1500 +
    riskCounts.high * 750 +
    riskCounts.medium * 300 +
    riskCounts.low * 100 +
    (readinessScore < 65 ? 900 : 0);
  const boundedLow = Math.max(0, Math.round(low / 50) * 50);
  const boundedHigh = Math.max(boundedLow, Math.round((boundedLow * 2.35 + (riskCounts.critical > 0 ? 2500 : 650)) / 50) * 50);
  return {
    low: boundedLow,
    high: boundedHigh,
    currency: "USD",
    label: moneyRangeLabel(boundedLow, boundedHigh),
    available: true,
    basis: "Estimated engineering remediation effort from current scan severity and evidence count.",
  };
}

function technicalValueFor(
  readinessScore: number,
  technicalRiskScore: number,
  transferReadinessScore: number,
  repairCost: AppraisalMoneyRange,
  evidenceSources: AppraisalPublicSummary["evidenceSources"],
): AppraisalMoneyRange {
  if (!sourceAvailable(evidenceSources, "software_valuation_dataset")) {
    return {
      low: 0,
      high: 0,
      currency: "USD",
      label: "Not verified",
      available: false,
      basis: "No software valuation dataset is configured. VentureOS will not present a market-backed asset value from internal scan evidence alone.",
    };
  }

  const grossSignal = Math.round((readinessScore * readinessScore * 4.8 + transferReadinessScore * 95) / 100) * 100;
  const riskPenalty = Math.round((technicalRiskScore * 80 + repairCost.high * 0.35) / 100) * 100;
  const low = Math.max(500, Math.round((grossSignal - riskPenalty) / 250) * 250);
  const confidenceSpread = readinessScore >= 85 ? 1.7 : readinessScore >= 65 ? 2.4 : 3.2;
  const high = Math.max(low + 500, Math.round((low * confidenceSpread + 1500) / 250) * 250);
  return {
    low,
    high,
    currency: "USD",
    label: moneyRangeLabel(low, high),
    available: true,
    basis: "Technical asset estimate based on configured valuation evidence, software completeness, readiness, transferability, and known repair burden.",
  };
}

function conditionsFor(verdict: AppraisalLaunchVerdict, decision: WorkspaceDecision, evidence: AppraisalEvidenceItem[], coverage: AppraisalEvidenceCoverage) {
  const scopeCondition = coverage.level === "strong"
    ? ""
    : `Evidence coverage is ${coverage.level}; run a fuller repository scan before using this as a final diligence claim.`;

  if (verdict === "READY") {
    return [
      scopeCondition,
      "Current scan evidence does not show blocking launch risk.",
      "Badge remains valid only while future scans stay at or above the current readiness level.",
    ].filter(Boolean).slice(0, 3);
  }
  const conditions = evidence.slice(0, 3).map((item) => `Resolve ${item.severity.toUpperCase()}: ${item.title}.`);
  if (scopeCondition) conditions.unshift(scopeCondition);
  if (conditions.length === 0) conditions.push(neutralizeReportText(decision.shipReason));
  return conditions.slice(0, 3);
}

function evidenceConfidenceFor(evidence: AppraisalEvidenceItem[], workspace: ProjectWorkspace, coverage: AppraisalEvidenceCoverage) {
  if (!workspace.scans.length) return 0.35;
  const evidenceScore = evidence.length ? evidence.reduce((sum, item) => sum + item.confidence, 0) / evidence.length : 0.78;
  const historyLift = workspace.scans.length >= 2 ? 0.07 : 0;
  const coveragePenalty = coverage.level === "strong" ? 0 : coverage.level === "moderate" ? 0.08 : 0.18;
  return Math.max(0.35, Math.min(0.99, Number((evidenceScore + historyLift - coveragePenalty).toFixed(2))));
}

function evidenceCoverageFor(
  workspace: ProjectWorkspace,
  decision: WorkspaceDecision,
  evidence: AppraisalEvidenceItem[],
  evidenceSources: AppraisalPublicSummary["evidenceSources"],
): AppraisalEvidenceCoverage {
  const latestScan = decision.latestScan;
  const projectFiles = workspace.project?.files.length || 0;
  const sourceLength = latestScan?.sourceLength || 0;
  const hasRepository = workspace.repositoryLinks.length > 0;
  const rawCodeStored = latestScan?.rawCodeStored;
  const inputTruncated = latestScan?.inputTruncated === true;
  const reasons: string[] = [];
  const verifiedClaims: string[] = [];
  const unverifiedClaims: string[] = [];
  const unknowns: string[] = [];
  let score = 0;

  if (latestScan) {
    score += 25;
    verifiedClaims.push("A stored VentureOS scan was observed for this appraisal.");
  } else {
    unknowns.push("No stored scan is available for this software asset.");
  }

  let scope: AppraisalEvidenceCoverage["scope"] = "stored_scan_only";
  if (!inputTruncated && projectFiles >= 20 && sourceLength >= 500_000) {
    scope = "full_repository";
    score += 35;
    reasons.push(`${projectFiles} project files and ${formatCount(sourceLength)} characters of source evidence were available.`);
    verifiedClaims.push("Repository-scale source evidence was available to the appraisal engine.");
  } else if (hasRepository && !inputTruncated) {
    scope = "repository_linked";
    score += 22;
    reasons.push("A repository link is attached, but the appraisal could not prove complete repository coverage from stored scan metadata.");
    unknowns.push("Full repository coverage was not proven from the stored scan metadata.");
  } else if (sourceLength >= 80_000 || workspace.project?.category === "paid-software-appraisal") {
    scope = "partial_submission";
    score += 14;
    reasons.push(inputTruncated ? `${formatCount(sourceLength)} characters of submitted source evidence were scanned before truncation.` : `${formatCount(sourceLength)} characters of submitted source evidence were scanned.`);
    unknowns.push("Files outside the submitted evidence were not verified.");
  } else {
    score += latestScan ? 6 : 0;
    reasons.push("Only stored scan summary evidence was available.");
    unknowns.push("Source file coverage could not be proven.");
  }

  if (sourceLength >= 750_000) score += 12;
  else if (sourceLength >= 250_000) score += 8;
  else if (sourceLength > 0) score += 4;

  if (workspace.scans.length >= 2) {
    score += 10;
    verifiedClaims.push("Historical scan comparison was observed.");
  } else {
    unknowns.push("Longitudinal trend is not proven from multiple scans.");
  }

  const fileBackedEvidence = evidence.filter((item) => item.filePath).length;
  if (workspace.findings.length > 0 && fileBackedEvidence > 0) {
    score += Math.min(10, fileBackedEvidence * 3);
    verifiedClaims.push("Reported risks include file-linked evidence.");
  } else if (workspace.findings.length === 0 && latestScan) {
    score += 5;
    reasons.push("The latest scan reported no findings, but absence of findings is not proof of full coverage.");
  } else {
    unknowns.push("Finding-level file evidence is incomplete.");
  }

  if (sourceAvailable(evidenceSources, "github_advisory")) {
    score += 5;
    verifiedClaims.push("Dependency advisory checks ran against GitHub Advisory Database.");
  } else {
    unknowns.push("Dependency advisory coverage is limited or unavailable.");
  }

  if (!sourceAvailable(evidenceSources, "software_valuation_dataset")) {
    unverifiedClaims.push("Market-backed software valuation.");
  }
  if (!sourceAvailable(evidenceSources, "runtime_monitoring_agent")) {
    unverifiedClaims.push("Runtime production behavior.");
  }
  if (!sourceAvailable(evidenceSources, "repository_corpus") && !sourceAvailable(evidenceSources, "proprietary_benchmark_dataset")) {
    unverifiedClaims.push("Large-scale repository or proprietary benchmark percentile.");
  }
  if (rawCodeStored === false) {
    reasons.push("Raw submitted code was not stored; future review depends on hashes and scan metadata.");
  }
  if (inputTruncated) {
    unknowns.push("The scan input was truncated before analysis.");
  }

  const boundedCoverage = boundedScore(score);
  const level: AppraisalEvidenceCoverage["level"] = boundedCoverage >= 80 ? "strong" : boundedCoverage >= 55 ? "moderate" : "limited";
  let scoreCap = level === "strong" ? 100 : level === "moderate" ? 88 : 75;
  if (scope === "partial_submission") scoreCap = Math.min(scoreCap, 82);
  if (scope === "stored_scan_only") scoreCap = Math.min(scoreCap, 75);
  if (!latestScan) scoreCap = 45;

  return {
    score: boundedCoverage,
    level,
    scope,
    scoreCap,
    scoreCapped: boundedScore(decision.readinessScore) > scoreCap,
    reasons: [...new Set(reasons)].slice(0, 5),
    verifiedClaims: [...new Set(verifiedClaims.map(neutralizeReportText))].slice(0, 5),
    unverifiedClaims: [...new Set(unverifiedClaims.map(neutralizeReportText))].slice(0, 5),
    unknowns: [...new Set(unknowns.map(neutralizeReportText))].slice(0, 5),
  };
}

function hasEvidence(finding: WorkspaceFinding) {
  return Boolean(finding.title?.trim() && (finding.evidence?.trim() || finding.verificationEvidence?.trim() || finding.filePath));
}

function confidenceFor(finding: WorkspaceFinding) {
  const explicit = typeof finding.confidenceScore === "number" ? finding.confidenceScore : Number(finding.confidenceScore || 0);
  if (Number.isFinite(explicit) && explicit > 0) return Math.max(0.35, Math.min(0.99, explicit > 1 ? explicit / 100 : explicit));
  let confidence = 0.72;
  if (finding.filePath) confidence += 0.08;
  if (finding.verificationEvidence) confidence += 0.07;
  if (finding.codeFix) confidence += 0.04;
  return Math.min(0.95, Number(confidence.toFixed(2)));
}

function publicRiskSummary(finding: WorkspaceFinding) {
  const category = cleanText(finding.category || "software risk", 90);
  const file = finding.filePath ? " Evidence is linked to a specific implementation file." : "";
  return `${normalizeSeverity(finding.severity).toUpperCase()} ${category} risk observed in scan evidence.${file}`;
}

function fixImpactFor(severity: string) {
  const rank = severityRank(severity);
  if (rank >= 4) return 18;
  if (rank === 3) return 12;
  if (rank === 2) return 7;
  return 3;
}

function normalizeSeverity(value: string) {
  const clean = value.trim().toLowerCase();
  if (clean === "critical" || clean === "high" || clean === "medium" || clean === "low") return clean;
  return "low";
}

function boundedScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

function sourceAvailable(sources: AppraisalPublicSummary["evidenceSources"], id: string) {
  return sources.some((source) => source.id === id && source.status === "available");
}

function moneyRangeLabel(low: number, high: number) {
  return `$${formatMoney(low)}-$${formatMoney(high)}`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function cleanText(value: string, maxLength: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
