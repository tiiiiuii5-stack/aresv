import { buildWorkspaceDecision } from "@/lib/decision-model";
import type { ProjectWorkspace } from "@/lib/services/projectWorkspace";
import { evidenceNodes, findingNodes } from "@/lib/trust-ledger/evidenceGraph";
import { stableId } from "@/lib/trust-ledger/hash";
import type {
  SoftwareTrustScore,
  TrustLedgerClaim,
  TrustLedgerClaimGateResult,
  TrustLedgerGraph,
  TrustLedgerRejectedClaim,
  TrustScoreCategoryKey,
} from "@/lib/trust-ledger/types";

const minimumPublicConfidence = 0.6;

export function buildAndGateTrustLedgerClaims(input: {
  workspace: ProjectWorkspace;
  graph: TrustLedgerGraph;
  score: SoftwareTrustScore;
}): TrustLedgerClaimGateResult {
  const candidates = buildCandidateClaims(input.workspace, input.graph, input.score);
  const evidenceIds = new Set(evidenceNodes(input.graph).map((node) => node.id));
  const scoreKeys = new Set(input.score.categories.map((category) => category.key));
  const acceptedClaims: TrustLedgerClaim[] = [];
  const rejectedClaims: TrustLedgerRejectedClaim[] = [];

  for (const claim of candidates) {
    const rejection = rejectionFor(claim, evidenceIds, scoreKeys);
    if (rejection) rejectedClaims.push({ id: claim.id, text: claim.text, reason: rejection });
    else acceptedClaims.push(claim);
  }

  return {
    acceptedClaims,
    rejectedClaims,
    stats: {
      accepted: acceptedClaims.length,
      rejected: rejectedClaims.length,
      publicClaims: acceptedClaims.filter((claim) => claim.visibility === "public").length,
      privateClaims: acceptedClaims.filter((claim) => claim.visibility === "private").length,
    },
  };
}

function buildCandidateClaims(workspace: ProjectWorkspace, graph: TrustLedgerGraph, score: SoftwareTrustScore): TrustLedgerClaim[] {
  const decision = buildWorkspaceDecision(workspace);
  const evidence = evidenceNodes(graph);
  const findings = findingNodes(graph);
  const scanEvidence = evidence.find((node) => node.evidenceType === "scan");
  const historyEvidence = evidence.find((node) => node.evidenceType === "history");
  const claims: TrustLedgerClaim[] = [];

  if (scanEvidence) {
    claims.push(claim({
      type: "score",
      visibility: "public",
      text: `Software Trust Score is ${score.score}/100 with ${Math.round(score.confidence * 100)}% evidence confidence.`,
      evidenceIds: [scanEvidence.id, ...topEvidenceIds(score).slice(0, 4)],
      scoreKeys: score.categories.map((category) => category.key),
      confidence: score.confidence,
    }));
    claims.push(claim({
      type: "verdict",
      visibility: "public",
      text: `Current trust verdict is ${score.verdict}.`,
      evidenceIds: [scanEvidence.id],
      scoreKeys: ["commercialReadiness", "securityTrust"],
      confidence: Math.max(0.55, score.confidence),
    }));
  }

  for (const finding of findings.slice(0, 5)) {
    claims.push(claim({
      type: "risk",
      visibility: finding.severity === "critical" || finding.severity === "high" ? "public" : "private",
      text: `${finding.severity.toUpperCase()} risk: ${finding.title}.`,
      evidenceIds: finding.evidenceIds,
      scoreKeys: scoreKeysForFinding(finding.title, finding.category),
      confidence: finding.confidence,
    }));
  }

  for (const category of score.categories.filter((item) => item.deductions.length > 0).slice(0, 5)) {
    claims.push(claim({
      type: "recommendation",
      visibility: "private",
      text: `${category.name} was reduced by ${round(category.deductions.reduce((sum, item) => sum + item.deduction, 0))} point${category.deductions.length === 1 ? "" : "s"} from supported findings.`,
      evidenceIds: category.deductions.map((item) => item.evidenceId),
      scoreKeys: [category.key],
      confidence: category.confidence,
    }));
  }

  if (historyEvidence && decision.trend !== "stable") {
    claims.push(claim({
      type: "history",
      visibility: "public",
      text: `Historical trend is ${decision.trend}.`,
      evidenceIds: [historyEvidence.id],
      scoreKeys: ["historicalTrajectory"],
      confidence: historyEvidence.confidence,
    }));
  }

  if (workspace.repositoryLinks[0]) {
    const repositoryEvidence = evidence.find((node) => node.evidenceType === "repository");
    if (repositoryEvidence) {
      claims.push(claim({
        type: "certificate",
        visibility: "public",
        text: "Public trust claims are linked to a stored project repository record.",
        evidenceIds: [repositoryEvidence.id],
        scoreKeys: ["identityStructure"],
        confidence: repositoryEvidence.confidence,
      }));
    }
  }

  return claims;
}

function claim(input: {
  type: TrustLedgerClaim["claimType"];
  visibility: TrustLedgerClaim["visibility"];
  text: string;
  evidenceIds: string[];
  scoreKeys: TrustScoreCategoryKey[];
  confidence: number;
}): TrustLedgerClaim {
  return {
    id: `claim:${stableId([input.type, input.visibility, input.text, input.evidenceIds])}`,
    visibility: input.visibility,
    claimType: input.type,
    text: input.text,
    evidenceIds: [...new Set(input.evidenceIds)].filter(Boolean),
    relatedScoreKeys: [...new Set(input.scoreKeys)],
    confidence: boundedConfidence(input.confidence),
    generatedBy: "trust-ledger",
  };
}

function rejectionFor(claim: TrustLedgerClaim, evidenceIds: Set<string>, scoreKeys: Set<string>): TrustLedgerRejectedClaim["reason"] | null {
  if (claim.evidenceIds.length === 0) return "MISSING_EVIDENCE";
  if (claim.evidenceIds.some((id) => !evidenceIds.has(id))) return "UNKNOWN_EVIDENCE";
  if (claim.relatedScoreKeys.some((key) => !scoreKeys.has(key as TrustScoreCategoryKey))) return "UNSUPPORTED_SCORE";
  if (claim.visibility === "public" && claim.confidence < minimumPublicConfidence) return "LOW_CONFIDENCE";
  return null;
}

function topEvidenceIds(score: SoftwareTrustScore) {
  return score.categories
    .flatMap((category) => [...category.supportingEvidenceIds, ...category.deductions.map((deduction) => deduction.evidenceId)])
    .filter(Boolean);
}

function scoreKeysForFinding(title: string, category: string): TrustScoreCategoryKey[] {
  const text = `${title} ${category}`.toLowerCase();
  const keys = new Set<TrustScoreCategoryKey>();
  if (/auth|session|role|owner|tenant|admin|secret|security|permission/.test(text)) keys.add("securityTrust");
  if (/db|database|prisma|persist|save|schema|state/.test(text)) keys.add("dataPersistence");
  if (/deploy|env|worker|queue|build|runtime|error/.test(text)) keys.add("reliabilityOperations");
  if (/billing|stripe|payment|checkout|launch|appraisal|certificate/.test(text)) keys.add("commercialReadiness");
  if (/test|lint|duplicate|dependency|maintain/.test(text)) keys.add("maintainability");
  if (/button|form|api|route|workflow|backend|submit/.test(text)) keys.add("functionalCompleteness");
  if (keys.size === 0) keys.add("functionalCompleteness");
  return [...keys];
}

function boundedConfidence(value: number) {
  return Math.max(0, Math.min(0.99, Number(value.toFixed(2))));
}

function round(value: number) {
  return Number(value.toFixed(2));
}

