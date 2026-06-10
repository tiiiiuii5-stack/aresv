import { buildWorkspaceDecision } from "@/lib/decision-model";
import type { ProjectWorkspace } from "@/lib/services/projectWorkspace";
import { evidenceNodes, findingNodes } from "@/lib/trust-ledger/evidenceGraph";
import type {
  SoftwareTrustScore,
  TrustLedgerEvidenceNode,
  TrustLedgerFindingNode,
  TrustLedgerGraph,
  TrustScoreCap,
  TrustScoreCategory,
  TrustScoreCategoryKey,
  TrustScoreDeduction,
} from "@/lib/trust-ledger/types";

type CategoryDefinition = {
  key: TrustScoreCategoryKey;
  name: string;
  weight: number;
  requiredSignals: number;
};

const categoryDefinitions: CategoryDefinition[] = [
  { key: "identityStructure", name: "Identity & Structure", weight: 10, requiredSignals: 4 },
  { key: "functionalCompleteness", name: "Functional Completeness", weight: 15, requiredSignals: 5 },
  { key: "securityTrust", name: "Security & Trust", weight: 20, requiredSignals: 5 },
  { key: "dataPersistence", name: "Data & Persistence", weight: 12, requiredSignals: 4 },
  { key: "reliabilityOperations", name: "Reliability & Operations", weight: 13, requiredSignals: 5 },
  { key: "maintainability", name: "Maintainability", weight: 10, requiredSignals: 4 },
  { key: "commercialReadiness", name: "Commercial Readiness", weight: 10, requiredSignals: 4 },
  { key: "historicalTrajectory", name: "Historical Trajectory", weight: 10, requiredSignals: 3 },
];

const severityBase: Record<string, number> = {
  critical: 10,
  high: 7,
  medium: 4,
  low: 2,
  unknown: 1,
};

export function compileSoftwareTrustScore(input: {
  workspace: ProjectWorkspace;
  graph: TrustLedgerGraph;
}): SoftwareTrustScore {
  const decision = buildWorkspaceDecision(input.workspace);
  const evidence = evidenceNodes(input.graph);
  const findings = findingNodes(input.graph);
  const categories = categoryDefinitions.map((definition) => compileCategory(definition, input.workspace, findings, evidence));
  const rawScore = round(categories.reduce((sum, category) => sum + category.score, 0));
  const capsApplied = capRules(findings, evidence, decision.latestScan ? decision.latestScan.id : null);
  const score = Math.round(capsApplied.reduce((current, cap) => Math.min(current, cap.cappedAt), rawScore));
  const confidence = scoreConfidence(categories);

  return {
    score,
    rawScore,
    rating: ratingFor(score),
    verdict: verdictFor(score, decision.state),
    confidence,
    categories,
    capsApplied,
    evidenceSummary: {
      evidenceCount: evidence.length,
      findingCount: findings.length,
      tracedExecutionPaths: evidence.filter((item) => item.route || item.filePath).length,
      evaluatedSignals: categories.reduce((sum, item) => sum + item.evaluatedSignals, 0),
      requiredSignals: categories.reduce((sum, item) => sum + item.requiredSignals, 0),
      unsupportedSignalsDiscarded: 0,
    },
  };
}

function compileCategory(
  definition: CategoryDefinition,
  workspace: ProjectWorkspace,
  findings: TrustLedgerFindingNode[],
  evidence: TrustLedgerEvidenceNode[],
): TrustScoreCategory {
  const matchingFindings = findings.filter((finding) => categoryKeysForFinding(finding).includes(definition.key));
  const supportingEvidenceIds = supportingEvidenceFor(definition.key, workspace, evidence);
  const deductions = matchingFindings.flatMap((finding) => deductionsForFinding(definition.key, finding, evidence));
  const deductionTotal = deductions.reduce((sum, item) => sum + item.deduction, 0);
  const evaluatedSignals = evaluatedSignalsFor(definition.key, workspace, evidence, matchingFindings);
  const evidenceCoverage = coverageFor(evaluatedSignals, definition.requiredSignals);
  const coverageCap = coverageCreditCap(evidenceCoverage);
  const maxScore = round(definition.weight * coverageCap);
  const score = Math.max(0, Math.min(maxScore, round(definition.weight - deductionTotal)));
  const confidence = categoryConfidence(evidenceCoverage, supportingEvidenceIds, evidence, matchingFindings);

  return {
    key: definition.key,
    name: definition.name,
    weight: definition.weight,
    maxScore,
    score,
    confidence,
    evidenceCoverage,
    evaluatedSignals,
    requiredSignals: definition.requiredSignals,
    deductions,
    supportingEvidenceIds,
  };
}

function deductionsForFinding(key: TrustScoreCategoryKey, finding: TrustLedgerFindingNode, evidence: TrustLedgerEvidenceNode[]): TrustScoreDeduction[] {
  const evidenceId = finding.evidenceIds[0];
  if (!evidenceId) return [];
  const evidenceNode = evidence.find((item) => item.id === evidenceId);
  const deduction = round(
    (severityBase[finding.severity] || 1) *
      finding.confidence *
      executionReach(evidenceNode) *
      businessImpactMultiplier(finding),
  );
  if (deduction <= 0) return [];
  return [{
    evidenceId,
    findingId: finding.id,
    findingFingerprint: finding.fingerprint,
    severity: finding.severity,
    deduction,
    reason: `${finding.title} reduces ${readableCategory(key)} based on ${finding.severity} evidence.`,
    confidence: finding.confidence,
  }];
}

function categoryKeysForFinding(finding: TrustLedgerFindingNode): TrustScoreCategoryKey[] {
  const text = findingText(finding);
  const keys = new Set<TrustScoreCategoryKey>();
  if (/\b(auth|session|role|owner|ownership|tenant|admin|secret|token|permission|security|cross-user)\b/.test(text)) keys.add("securityTrust");
  if (/\b(db|database|prisma|persist|save|write|migration|schema|data|state|localstorage)\b/.test(text)) keys.add("dataPersistence");
  if (/\b(api missing|missing backend|phantom|button|form|submit|no-op|workflow|flow|endpoint|route)\b/.test(text)) keys.add("functionalCompleteness");
  if (/\b(deploy|deployment|env|worker|queue|redis|build|runtime|error|loading|success|retry|monitoring|health)\b/.test(text)) keys.add("reliabilityOperations");
  if (/\b(duplicate|maintain|complex|test|lint|type|dependency|modular|dead code|unused)\b/.test(text)) keys.add("maintainability");
  if (/\b(billing|stripe|payment|checkout|launch|appraisal|certificate|pricing|revenue)\b/.test(text)) keys.add("commercialReadiness");
  if (keys.size === 0) keys.add("functionalCompleteness");
  return [...keys];
}

function supportingEvidenceFor(key: TrustScoreCategoryKey, workspace: ProjectWorkspace, evidence: TrustLedgerEvidenceNode[]) {
  const ids = new Set<string>();
  for (const item of evidence) {
    const text = `${item.title} ${item.summary} ${item.filePath || ""}`.toLowerCase();
    if (key === "identityStructure" && (item.evidenceType === "scan" || item.evidenceType === "repository")) ids.add(item.id);
    if (key === "historicalTrajectory" && item.evidenceType === "history") ids.add(item.id);
    if (key === "securityTrust" && /\b(auth|session|role|owner|tenant|secret|permission|security)\b/.test(text)) ids.add(item.id);
    if (key === "dataPersistence" && /\b(db|database|prisma|persist|save|write|schema|state)\b/.test(text)) ids.add(item.id);
    if (key === "reliabilityOperations" && /\b(deploy|env|worker|queue|build|runtime|error|monitoring|health)\b/.test(text)) ids.add(item.id);
    if (key === "commercialReadiness" && /\b(billing|stripe|payment|launch|certificate|appraisal)\b/.test(text)) ids.add(item.id);
    if (key === "maintainability" && /\b(test|type|lint|dependency|duplicate|modular|maintain)\b/.test(text)) ids.add(item.id);
    if (key === "functionalCompleteness" && /\b(button|form|api|route|workflow|flow|submit|backend)\b/.test(text)) ids.add(item.id);
  }
  if (key === "identityStructure" && workspace.project && evidence[0]) ids.add(evidence[0].id);
  return [...ids].slice(0, 20);
}

function evaluatedSignalsFor(
  key: TrustScoreCategoryKey,
  workspace: ProjectWorkspace,
  evidence: TrustLedgerEvidenceNode[],
  matchingFindings: TrustLedgerFindingNode[],
) {
  let count = 0;
  const latestScan = workspace.scans.length > 0;
  if (latestScan) count += 1;
  if (matchingFindings.length > 0) count += Math.min(2, matchingFindings.length);

  if (key === "identityStructure") {
    if (workspace.project) count += 1;
    if (workspace.repositoryLinks.length > 0) count += 1;
    if (workspace.scans.some((scan) => scan.framework && scan.framework !== "unknown")) count += 1;
  } else if (key === "historicalTrajectory") {
    if (workspace.scanComparison) count += 2;
    if (workspace.scoreHistory.length >= 2) count += 1;
  } else if (key === "commercialReadiness") {
    if (workspace.reports.length > 0) count += 1;
    if (workspace.findings.some((finding) => /billing|stripe|payment|launch|certificate|appraisal/i.test(`${finding.title} ${finding.category}`))) count += 1;
  } else if (key === "reliabilityOperations") {
    if (workspace.history.some((item) => item.type === "deployment" || item.type === "job")) count += 1;
    if (evidence.some((item) => /deploy|build|env|worker|queue|health/i.test(`${item.title} ${item.summary}`))) count += 1;
  } else if (key === "maintainability") {
    if (workspace.findings.some((finding) => finding.filePath)) count += 1;
    if (workspace.findings.some((finding) => finding.codeFix)) count += 1;
  } else if (key === "functionalCompleteness") {
    if (workspace.findings.some((finding) => /button|form|api|route|workflow|flow|submit|backend/i.test(`${finding.title} ${finding.category}`))) count += 1;
  } else if (key === "securityTrust") {
    if (workspace.findings.some((finding) => /auth|session|owner|tenant|admin|secret|permission|security/i.test(`${finding.title} ${finding.category}`))) count += 1;
  } else if (key === "dataPersistence") {
    if (workspace.findings.some((finding) => /db|database|prisma|persist|save|write|schema|state/i.test(`${finding.title} ${finding.category}`))) count += 1;
  }

  return Math.max(0, count);
}

function coverageFor(evaluatedSignals: number, requiredSignals: number) {
  return Math.max(0, Math.min(1, Number((evaluatedSignals / requiredSignals).toFixed(2))));
}

function coverageCreditCap(coverage: number) {
  if (coverage >= 0.9) return 1;
  if (coverage >= 0.7) return 0.9;
  if (coverage >= 0.5) return 0.75;
  if (coverage >= 0.25) return 0.55;
  return 0.35;
}

function categoryConfidence(
  evidenceCoverage: number,
  supportingEvidenceIds: string[],
  evidence: TrustLedgerEvidenceNode[],
  matchingFindings: TrustLedgerFindingNode[],
) {
  const supportingEvidence = evidence.filter((item) => supportingEvidenceIds.includes(item.id));
  const evidenceConfidence = mean([
    ...supportingEvidence.map((item) => item.confidence),
    ...matchingFindings.map((item) => item.confidence),
  ]) || 0.45;
  const traceCoverage = matchingFindings.length
    ? matchingFindings.filter((finding) => evidence.some((item) => finding.evidenceIds.includes(item.id) && (item.filePath || item.route))).length / matchingFindings.length
    : supportingEvidence.some((item) => item.filePath || item.route) ? 0.8 : 0.55;
  return boundedConfidence(evidenceCoverage * 0.45 + evidenceConfidence * 0.35 + traceCoverage * 0.2);
}

function capRules(findings: TrustLedgerFindingNode[], evidence: TrustLedgerEvidenceNode[], latestScanId: string | null): TrustScoreCap[] {
  const caps: TrustScoreCap[] = [];
  if (!latestScanId) {
    caps.push({
      rule: "NO_LATEST_SCAN",
      cappedAt: 49,
      evidenceId: evidence[0]?.id || "missing-scan-evidence",
      reason: "No latest scan evidence exists, so trust cannot be marked launch-ready.",
    });
  }

  for (const finding of findings) {
    const text = findingText(finding);
    const evidenceId = finding.evidenceIds[0] || evidence[0]?.id || "unknown";
    if (finding.severity === "critical" && /\b(auth|session|owner|tenant|permission|security)\b/.test(text)) {
      caps.push({ rule: "CRITICAL_SECURITY", cappedAt: 59, evidenceId, reason: "Confirmed critical security evidence caps the trust score." });
    }
    if (/\b(cross-user|wrong org|tenant boundary|exposed secret|secret exposure|client-side secret)\b/.test(text)) {
      caps.push({ rule: "TRUST_BOUNDARY_OR_SECRET", cappedAt: 49, evidenceId, reason: "Confirmed trust boundary or secret exposure evidence caps the trust score." });
    }
    if (finding.severity === "high" && /\b(stripe|billing|payment|checkout|entitlement)\b/.test(text)) {
      caps.push({ rule: "PAYMENT_ENTITLEMENT_RISK", cappedAt: 69, evidenceId, reason: "Confirmed payment or entitlement risk caps commercial launch trust." });
    }
  }
  return dedupeCaps(caps).sort((a, b) => a.cappedAt - b.cappedAt);
}

function executionReach(evidence: TrustLedgerEvidenceNode | undefined) {
  if (!evidence) return 0.5;
  if (evidence.route && evidence.filePath) return 1;
  if (evidence.route) return 0.9;
  if (evidence.filePath) return 0.75;
  if (evidence.evidenceType === "scan") return 0.65;
  return 0.55;
}

function businessImpactMultiplier(finding: TrustLedgerFindingNode) {
  const text = findingText(finding);
  if (/\b(cross-user|tenant|owner|secret|data exposure)\b/.test(text)) return 1.25;
  if (/\b(stripe|billing|payment|checkout|subscription)\b/.test(text)) return 1.2;
  if (/\b(deploy|env|worker|queue|build)\b/.test(text)) return 1.15;
  if (/\b(data loss|fake persistence|persist|database|db)\b/.test(text)) return 1.15;
  if (/\b(button|form|workflow|no-op|missing backend)\b/.test(text)) return 1.1;
  if (/\b(test|lint|maintain|duplicate|dependency)\b/.test(text)) return 0.85;
  return 1;
}

function scoreConfidence(categories: TrustScoreCategory[]) {
  const totalWeight = categories.reduce((sum, category) => sum + category.weight, 0) || 1;
  return boundedConfidence(categories.reduce((sum, category) => sum + category.confidence * category.weight, 0) / totalWeight);
}

function ratingFor(score: number): SoftwareTrustScore["rating"] {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function verdictFor(score: number, state: string): SoftwareTrustScore["verdict"] {
  if (score < 50) return "DO_NOT_DEPLOY";
  if (score < 70 || state === "BLOCKED") return "BLOCKED";
  if (score < 85 || state === "RISKY") return "RISKY";
  return "READY";
}

function findingText(finding: TrustLedgerFindingNode) {
  return `${finding.title} ${finding.category} ${finding.filePath || ""} ${finding.fixRecommendation || ""}`.toLowerCase();
}

function readableCategory(key: TrustScoreCategoryKey) {
  return categoryDefinitions.find((category) => category.key === key)?.name || key;
}

function mean(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
}

function boundedConfidence(value: number) {
  return Math.max(0, Math.min(0.99, Number(value.toFixed(2))));
}

function round(value: number) {
  return Math.max(0, Number(value.toFixed(2)));
}

function dedupeCaps(caps: TrustScoreCap[]) {
  const seen = new Set<string>();
  return caps.filter((cap) => {
    const key = `${cap.rule}:${cap.evidenceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
