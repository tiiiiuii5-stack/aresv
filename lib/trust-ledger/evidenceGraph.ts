import { buildWorkspaceDecision, severityRank } from "@/lib/decision-model";
import type { ProjectWorkspace, WorkspaceFinding, WorkspaceScan } from "@/lib/services/projectWorkspace";
import { stableId } from "@/lib/trust-ledger/hash";
import type {
  TrustLedgerEdge,
  TrustLedgerEvidenceNode,
  TrustLedgerFindingNode,
  TrustLedgerGraph,
  TrustLedgerNode,
  TrustLedgerSourceNode,
} from "@/lib/trust-ledger/types";

export function buildTrustLedgerEvidenceGraph(workspace: ProjectWorkspace): TrustLedgerGraph {
  const nodes: TrustLedgerNode[] = [];
  const edges: TrustLedgerEdge[] = [];
  const decision = buildWorkspaceDecision(workspace);

  if (workspace.project) {
    nodes.push(sourceNode("project", workspace.project.id, workspace.project.name));
  }

  const latestScan = latestWorkspaceScan(workspace.scans);
  if (latestScan) {
    const scanNode = sourceNode("scan", latestScan.id, `Latest ${latestScan.source} scan`);
    const evidence = scanEvidenceNode(latestScan);
    nodes.push(scanNode, evidence);
    edges.push({
      from: evidence.id,
      to: scanNode.id,
      relation: "supports",
      reason: "Latest scan evidence supports the current trust ledger state.",
    });
  }

  for (const repository of workspace.repositoryLinks) {
    const evidence = repositoryEvidenceNode(repository.repository, repository.id, repository.updatedAt);
    nodes.push(evidence);
  }

  if (workspace.scanComparison) {
    nodes.push(historyEvidenceNode(workspace.scanComparison.readinessDelta, workspace.scanComparison.summary, workspace.scanComparison.current.scannedAt));
  }

  for (const finding of workspace.findings) {
    const evidence = findingEvidenceNode(finding);
    const findingNode = findingNodeFor(finding, evidence.id);
    nodes.push(evidence, findingNode);
    edges.push({
      from: evidence.id,
      to: findingNode.id,
      relation: "supports",
      reason: "Finding is retained only because scan evidence exists.",
    });
  }

  for (const issue of decision.topIssues) {
    const findingId = findingNodeId(issue.id, issue.title);
    const evidenceId = nodes.find((node) => node.type === "finding" && node.id === findingId && node.evidenceIds.length)?.type === "finding"
      ? (nodes.find((node) => node.type === "finding" && node.id === findingId) as TrustLedgerFindingNode).evidenceIds[0]
      : undefined;
    if (evidenceId) {
      edges.push({
        from: findingId,
        to: `claim:${stableId(["top-issue", issue.id])}`,
        relation: "increases_risk",
        reason: "Top issue is promoted from a supported finding.",
      });
    }
  }

  return {
    nodes,
    edges,
    counts: {
      evidence: nodes.filter((node) => node.type === "evidence").length,
      findings: nodes.filter((node) => node.type === "finding").length,
      scores: nodes.filter((node) => node.type === "score").length,
      claims: nodes.filter((node) => node.type === "claim").length,
      sources: nodes.filter((node) => node.type === "source").length,
    },
  };
}

export function evidenceNodes(graph: TrustLedgerGraph) {
  return graph.nodes.filter((node): node is TrustLedgerEvidenceNode => node.type === "evidence");
}

export function findingNodes(graph: TrustLedgerGraph) {
  return graph.nodes.filter((node): node is TrustLedgerFindingNode => node.type === "finding");
}

function latestWorkspaceScan(scans: WorkspaceScan[]) {
  return [...scans].sort((a, b) => b.scannedAt.localeCompare(a.scannedAt))[0] || null;
}

function sourceNode(sourceType: TrustLedgerSourceNode["sourceType"], referenceId: string, title: string): TrustLedgerSourceNode {
  return {
    id: `${sourceType}:${stableId([sourceType, referenceId])}`,
    type: "source",
    sourceType,
    title,
    referenceId,
  };
}

function scanEvidenceNode(scan: WorkspaceScan): TrustLedgerEvidenceNode {
  return {
    id: `evidence:${stableId(["scan", scan.id, scan.readinessScore, scan.findingsCount])}`,
    type: "evidence",
    evidenceType: "scan",
    source: scan.source,
    title: `Scan readiness ${scan.readinessScore}`,
    summary: `${scan.source} scan recorded ${scan.findingsCount} finding${scan.findingsCount === 1 ? "" : "s"} with ${scan.criticalFindingsCount} critical.`,
    confidence: 0.86,
    createdAt: scan.scannedAt,
    metadata: {
      scanId: scan.id,
      scanRefId: scan.scanRefId,
      riskLevel: scan.riskLevel,
      framework: scan.framework,
    },
  };
}

function repositoryEvidenceNode(repository: string, id: string, updatedAt: string): TrustLedgerEvidenceNode {
  return {
    id: `evidence:${stableId(["repository", id, repository])}`,
    type: "evidence",
    evidenceType: "repository",
    source: "project_repository_links",
    title: "Repository link recorded",
    summary: `Repository ${repository} is linked to this project workspace.`,
    confidence: 0.78,
    createdAt: updatedAt,
    metadata: { repository },
  };
}

function historyEvidenceNode(readinessDelta: number, summary: string, scannedAt: string): TrustLedgerEvidenceNode {
  return {
    id: `evidence:${stableId(["history", readinessDelta, summary])}`,
    type: "evidence",
    evidenceType: "history",
    source: "project_scan_history",
    title: `Readiness delta ${readinessDelta >= 0 ? "+" : ""}${readinessDelta}`,
    summary,
    confidence: 0.82,
    createdAt: scannedAt,
    metadata: { readinessDelta },
  };
}

function findingEvidenceNode(finding: WorkspaceFinding): TrustLedgerEvidenceNode {
  const confidence = confidenceForFinding(finding);
  const evidenceType = finding.filePath ? "file" : routeLike(finding) ? "route" : "scan";
  return {
    id: evidenceNodeId(finding),
    type: "evidence",
    evidenceType,
    source: "workspace_findings",
    title: finding.title,
    summary: cleanText(finding.verificationEvidence || finding.evidence || finding.fixSuggestion, 1000),
    filePath: finding.filePath,
    route: routeFromFinding(finding),
    confidence,
    createdAt: finding.createdAt,
    metadata: {
      scanId: finding.scanId,
      severity: normalizeSeverity(finding.severity),
      category: finding.category,
    },
  };
}

function findingNodeFor(finding: WorkspaceFinding, evidenceId: string): TrustLedgerFindingNode {
  return {
    id: findingNodeId(finding.id, finding.title),
    type: "finding",
    fingerprint: stableId(["finding", finding.id, finding.title, finding.filePath || ""]),
    title: cleanText(finding.title, 220),
    severity: normalizeSeverity(finding.severity),
    category: cleanText(finding.category || "scan", 120),
    evidenceIds: [evidenceId],
    filePath: finding.filePath,
    confidence: confidenceForFinding(finding),
    fixRecommendation: cleanText(finding.fixSuggestion, 800) || undefined,
  };
}

function evidenceNodeId(finding: WorkspaceFinding) {
  return `evidence:${stableId(["finding-evidence", finding.id, finding.filePath || "", finding.evidence || finding.verificationEvidence || ""])}`;
}

function findingNodeId(id: string, title: string) {
  return `finding:${stableId([id, title])}`;
}

function confidenceForFinding(finding: WorkspaceFinding) {
  const explicit = typeof finding.confidenceScore === "number" ? finding.confidenceScore : Number(finding.confidenceScore || 0);
  if (Number.isFinite(explicit) && explicit > 0) return boundedConfidence(explicit > 1 ? explicit / 100 : explicit);
  let confidence = 0.66;
  if (finding.evidence?.trim()) confidence += 0.07;
  if (finding.verificationEvidence?.trim()) confidence += 0.09;
  if (finding.filePath?.trim()) confidence += 0.1;
  if (severityRank(finding.severity) >= 3) confidence += 0.03;
  return boundedConfidence(confidence);
}

function routeLike(finding: WorkspaceFinding) {
  return /\b(api|route|endpoint|handler|server action|webhook)\b/i.test(`${finding.title} ${finding.category} ${finding.evidence} ${finding.filePath || ""}`);
}

function routeFromFinding(finding: WorkspaceFinding) {
  const text = `${finding.title} ${finding.evidence} ${finding.filePath || ""}`;
  const match = text.match(/(?:GET|POST|PUT|PATCH|DELETE)?\s*(\/api\/[A-Za-z0-9_./:[\]-]+)/);
  return match?.[1];
}

function normalizeSeverity(value: string): TrustLedgerFindingNode["severity"] {
  const clean = value.trim().toLowerCase();
  if (clean === "critical" || clean === "high" || clean === "medium" || clean === "low") return clean;
  return "unknown";
}

function boundedConfidence(value: number) {
  return Math.max(0.35, Math.min(0.99, Number(value.toFixed(2))));
}

function cleanText(value: string, maxLength: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

