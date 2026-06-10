import { buildWorkspaceDecision } from "@/lib/decision-model";
import { tryDatabase } from "@/lib/prisma";
import { getProjectWorkspace } from "@/lib/services/projectWorkspace";
import { sanitizeMetadata } from "@/lib/services/platformSupport";
import { createTransparencyEventCommitment } from "@/lib/transparency/eventCommitment";
import { buildAndGateTrustLedgerClaims } from "@/lib/trust-ledger/claimGate";
import { buildTrustLedgerEvidenceGraph } from "@/lib/trust-ledger/evidenceGraph";
import { stableHash } from "@/lib/trust-ledger/hash";
import { compileSoftwareTrustScore } from "@/lib/trust-ledger/scoreCompiler";
import type {
  SoftwareTrustLedgerReport,
  TrustLedgerClaimNode,
  TrustLedgerGraph,
  TrustLedgerScoreNode,
} from "@/lib/trust-ledger/types";

type TrustLedgerSnapshotRow = {
  id: string;
  projectId: string | null;
  userId: string;
  snapshotHash: string;
  score: number | bigint;
  confidence: number;
  verdict: string;
  rating: string;
  evidenceCount: number | bigint;
  claimCount: number | bigint;
  report: unknown;
  createdAt: Date | string;
};

export async function buildSoftwareTrustLedgerReport(input: {
  projectId: string;
  userId: string;
  persist?: boolean;
  generatedAt?: string;
}): Promise<SoftwareTrustLedgerReport> {
  const workspace = await getProjectWorkspace(input.projectId);
  if (!workspace?.project) throw new Error("PROJECT_NOT_FOUND");

  const generatedAt = input.generatedAt || new Date().toISOString();
  const decision = buildWorkspaceDecision(workspace);
  const graph = buildTrustLedgerEvidenceGraph(workspace);
  const score = compileSoftwareTrustScore({ workspace, graph });
  const claimGate = buildAndGateTrustLedgerClaims({ workspace, graph, score });
  const publicClaims = claimGate.acceptedClaims.filter((claim) => claim.visibility === "public");
  const privateClaims = claimGate.acceptedClaims.filter((claim) => claim.visibility === "private");
  const ledgerGraph = augmentGraphWithScoresAndClaims(graph, score, claimGate.acceptedClaims);
  const snapshotHash = stableHash({
    projectId: workspace.project.id,
    latestScanId: decision.latestScan?.id ?? null,
    score: score.score,
    rating: score.rating,
    verdict: score.verdict,
    publicClaims: publicClaims.map((claim) => ({ id: claim.id, evidenceIds: claim.evidenceIds })),
    evidenceIds: ledgerGraph.nodes.filter((node) => node.type === "evidence").map((node) => node.id).sort(),
  });

  const report: SoftwareTrustLedgerReport = {
    engine: "ventureos-software-trust-ledger",
    version: "1.0.0",
    generatedAt,
    projectId: workspace.project.id,
    projectName: decision.projectName,
    state: decision.state,
    snapshotHash,
    graph: ledgerGraph,
    score,
    claimGate,
    publicClaims,
    privateClaims,
    explanation: {
      nodes: ledgerGraph.nodes,
      edges: [
        ...ledgerGraph.edges,
        ...score.categories.flatMap((category) =>
          category.deductions.map((deduction) => ({
            from: deduction.evidenceId,
            to: `score:${category.key}`,
            relation: "reduces_score" as const,
            reason: deduction.reason,
          })),
        ),
        ...claimGate.acceptedClaims.flatMap((claim) =>
          claim.evidenceIds.map((evidenceId) => ({
            from: evidenceId,
            to: claim.id,
            relation: "publishes_as" as const,
            reason: "Claim passed the Trust Ledger proof gate.",
          })),
        ),
      ],
    },
    source: {
      latestScanId: decision.latestScan?.id ?? null,
      latestScanRefId: decision.latestScan?.scanRefId ?? null,
      latestScanSource: decision.latestScan?.source ?? null,
      scanCount: workspace.scans.length,
      findingCount: workspace.findings.length,
      repositoryCount: workspace.repositoryLinks.length,
    },
  };

  if (input.persist !== false) {
    const snapshotId = await persistTrustLedgerSnapshot({ report, userId: input.userId });
    report.storage = { persisted: Boolean(snapshotId), snapshotId: snapshotId || undefined };
  } else {
    report.storage = { persisted: false };
  }

  return report;
}

export async function listSoftwareTrustLedgerSnapshots(input: { projectId: string; userId: string; limit?: number }) {
  const limit = Math.max(1, Math.min(50, Math.round(input.limit || 20)));
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<TrustLedgerSnapshotRow[]>(
      `SELECT "id", "projectId", "userId", "snapshotHash", "score", "confidence", "verdict", "rating", "evidenceCount", "claimCount", "report", "createdAt"
       FROM "software_trust_ledger_snapshots"
       WHERE "projectId" = $1 AND "userId" = $2
       ORDER BY "createdAt" DESC
       LIMIT $3`,
      input.projectId,
      input.userId,
      limit,
    ),
  );

  return (rows || []).map((row) => ({
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    snapshotHash: row.snapshotHash,
    score: numberValue(row.score),
    confidence: Number(row.confidence || 0),
    verdict: row.verdict,
    rating: row.rating,
    evidenceCount: numberValue(row.evidenceCount),
    claimCount: numberValue(row.claimCount),
    report: row.report as SoftwareTrustLedgerReport,
    createdAt: isoDate(row.createdAt),
  }));
}

async function persistTrustLedgerSnapshot(input: { report: SoftwareTrustLedgerReport; userId: string }) {
  const result = await tryDatabase(async (db) => {
    const rows = await db.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO "software_trust_ledger_snapshots" (
          "projectId", "userId", "snapshotHash", "sourceScanId", "sourceScanRefId", "ledgerVersion",
          "score", "confidence", "verdict", "rating", "evidenceCount", "claimCount",
          "graph", "scoreReport", "claimGate", "publicClaims", "privateClaims", "report", "metadata"
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb, $18::jsonb, $19::jsonb)
       ON CONFLICT ("projectId", "snapshotHash")
       DO UPDATE SET "updatedAt" = NOW()
       RETURNING "id"`,
      input.report.projectId,
      input.userId,
      input.report.snapshotHash,
      input.report.source.latestScanId || null,
      input.report.source.latestScanRefId || null,
      input.report.version,
      input.report.score.score,
      input.report.score.confidence,
      input.report.score.verdict,
      input.report.score.rating,
      input.report.graph.counts.evidence,
      input.report.claimGate.stats.accepted,
      JSON.stringify(sanitizeMetadata(input.report.graph as unknown as Record<string, unknown>)),
      JSON.stringify(sanitizeMetadata(input.report.score as unknown as Record<string, unknown>)),
      JSON.stringify(sanitizeMetadata(input.report.claimGate as unknown as Record<string, unknown>)),
      JSON.stringify(sanitizeMetadata({ claims: input.report.publicClaims })),
      JSON.stringify(sanitizeMetadata({ claims: input.report.privateClaims })),
      JSON.stringify(sanitizeMetadata(input.report as unknown as Record<string, unknown>)),
      JSON.stringify(sanitizeMetadata({
        source: input.report.source,
        transparencyCommitment: createTransparencyEventCommitment({
          source: "software_trust_ledger_snapshots",
          projectId: input.report.projectId,
          userId: input.userId,
          snapshotHash: input.report.snapshotHash,
          score: input.report.score.score,
          confidence: input.report.score.confidence,
          verdict: input.report.score.verdict,
          rating: input.report.score.rating,
          evidenceCount: input.report.graph.counts.evidence,
          acceptedClaimCount: input.report.claimGate.stats.accepted,
          generatedAt: input.report.generatedAt,
        }, input.report.generatedAt),
      })),
    );
    return rows[0]?.id || null;
  });

  return result || null;
}

function augmentGraphWithScoresAndClaims(
  graph: TrustLedgerGraph,
  score: SoftwareTrustLedgerReport["score"],
  claims: SoftwareTrustLedgerReport["claimGate"]["acceptedClaims"],
): TrustLedgerGraph {
  const scoreNodes: TrustLedgerScoreNode[] = [
    {
      id: "score:softwareTrustScore",
      type: "score",
      title: "Software Trust Score",
      value: score.score,
      evidenceIds: score.categories.flatMap((category) => [...category.supportingEvidenceIds, ...category.deductions.map((deduction) => deduction.evidenceId)]),
      confidence: score.confidence,
    },
    ...score.categories.map((category) => ({
      id: `score:${category.key}`,
      type: "score" as const,
      title: category.name,
      value: category.score,
      evidenceIds: [...category.supportingEvidenceIds, ...category.deductions.map((deduction) => deduction.evidenceId)],
      confidence: category.confidence,
    })),
  ];

  const claimNodes: TrustLedgerClaimNode[] = claims.map((claim) => ({
    id: claim.id,
    type: "claim",
    visibility: claim.visibility,
    claimType: claim.claimType,
    text: claim.text,
    evidenceIds: claim.evidenceIds,
    relatedScoreKeys: claim.relatedScoreKeys,
    confidence: claim.confidence,
  }));

  const scoreEdges = scoreNodes.flatMap((node) =>
    [...new Set(node.evidenceIds)].map((evidenceId) => ({
      from: evidenceId,
      to: node.id,
      relation: "derived_from" as const,
      reason: "Score node is compiled from evidence-backed ledger inputs.",
    })),
  );
  const claimEdges = claimNodes.flatMap((node) =>
    node.evidenceIds.map((evidenceId) => ({
      from: evidenceId,
      to: node.id,
      relation: "publishes_as" as const,
      reason: "Claim passed the Trust Ledger proof gate.",
    })),
  );

  const nodes = [...graph.nodes, ...scoreNodes, ...claimNodes];
  return {
    nodes,
    edges: [...graph.edges, ...scoreEdges, ...claimEdges],
    counts: {
      evidence: nodes.filter((node) => node.type === "evidence").length,
      findings: nodes.filter((node) => node.type === "finding").length,
      scores: nodes.filter((node) => node.type === "score").length,
      claims: nodes.filter((node) => node.type === "claim").length,
      sources: nodes.filter((node) => node.type === "source").length,
    },
  };
}

function numberValue(value: number | bigint | null | undefined) {
  return typeof value === "bigint" ? Number(value) : Number(value || 0);
}

function isoDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}
