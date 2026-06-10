import { buildRegistryItem } from "@/lib/registry/registry-pipeline";
import { loadVentureOSPassport, type RegistryAsset } from "@/lib/registry/software-registry";
import { tryDatabase } from "@/lib/prisma";

export type TrustGraphNodeType =
  | "project"
  | "repository"
  | "scan"
  | "finding"
  | "deployment"
  | "payment"
  | "certificate"
  | "evidence"
  | "score";

export type TrustGraphNode = {
  id: string;
  type: TrustGraphNodeType;
  label: string;
  status?: string | null;
  score?: number | null;
  timestamp?: string | null;
  metadata?: Record<string, unknown>;
};

export type TrustGraphEdge = {
  from: string;
  to: string;
  relation: "belongs_to" | "produced" | "supports" | "reduces" | "raises" | "verifies" | "paid_for" | "deployed_as";
  reason: string;
};

export type TrustExplanation = {
  trustScore: number;
  summary: string;
  reasons: Array<{ label: string; evidenceNodeIds: string[]; impact: number }>;
  penalties: Array<{ label: string; evidenceNodeIds: string[]; impact: number }>;
  policy: TrustPolicyDecision;
};

export type TrustTimelinePoint = {
  timestamp: string;
  score: number;
  source: "scan" | "appraisal" | "certificate" | "trust-ledger";
  label: string;
};

export type TrustPolicyDecision = {
  certificateIssuance: "ALLOW" | "BLOCK" | "REVIEW";
  registryStatus: "VERIFIED" | "RISKY" | "BLOCKED";
  rules: Array<{ rule: string; result: "pass" | "warn" | "fail"; reason: string }>;
};

export type VentureOSTrustGraph = {
  registryItemId: string;
  asset: RegistryAsset;
  nodes: TrustGraphNode[];
  edges: TrustGraphEdge[];
  explanation: TrustExplanation;
  timeline: TrustTimelinePoint[];
  counts: Record<TrustGraphNodeType, number>;
};

type ProjectRow = { id: string; title: string; status: string; createdAt: Date | string };
type RepositoryRow = { id: string; repository: string; url: string | null; updatedAt: Date | string };
type ScanRow = { id: string; scanSource: string; readinessScore: number | bigint; findingsCount: number | bigint; criticalFindingsCount: number | bigint; riskLevel: string | null; scannedAt: Date | string; metadata: unknown };
type DeploymentRow = { id: string; status: string; url: string | null; createdAt: Date | string };
type PaymentRow = { id: string; status: string; fulfillmentStatus: string; offerId: string; amount: number | bigint; paidAt: Date | string | null; updatedAt: Date | string };
type CertificateRow = { certificateId: string; status: string; badgeState: string; issuedAt: Date | string };
type EventRow = { id: string; event: string; metadata: unknown; createdAt: Date | string };
type LedgerRow = { id: string; score: number | bigint; rating: string; verdict: string; evidenceCount: number | bigint; createdAt: Date | string };

export async function buildVentureOSTrustGraph(identifier: string): Promise<VentureOSTrustGraph | null> {
  const passport = await loadVentureOSPassport(identifier);
  if (!passport) return null;
  const asset = passport.asset;
  const registryItem = await buildRegistryItem(asset, { includeReplay: true });
  const projectId = asset.projectId;
  const [projectRows, repositories, scans, deployments, payments, certificates, events, ledgers] = await Promise.all([
    loadProject(projectId),
    loadRepositories(projectId),
    loadScans(projectId),
    loadDeployments(projectId),
    loadPayments(asset),
    loadCertificates(asset),
    loadEvidenceEvents(projectId),
    loadLedgerSnapshots(projectId),
  ]);

  const nodes: TrustGraphNode[] = [];
  const edges: TrustGraphEdge[] = [];
  const project = projectRows[0] || null;
  const projectNodeId = project ? `project:${project.id}` : `project:${asset.ventureOsId}`;
  nodes.push({
    id: projectNodeId,
    type: "project",
    label: project?.title || asset.name,
    status: project?.status || registryItem.currentState,
    score: registryItem.trustScore,
    timestamp: project ? isoDate(project.createdAt) : asset.lastVerification,
  });

  for (const repository of repositories) {
    nodes.push({ id: `repository:${repository.id}`, type: "repository", label: repository.repository, timestamp: isoDate(repository.updatedAt), metadata: { url: repository.url } });
    edges.push({ from: `repository:${repository.id}`, to: projectNodeId, relation: "belongs_to", reason: "Repository is linked to the software project." });
  }

  for (const scan of scans) {
    const scanId = `scan:${scan.id}`;
    nodes.push({
      id: scanId,
      type: "scan",
      label: `${scan.scanSource} readiness ${numberValue(scan.readinessScore)}`,
      status: scan.riskLevel,
      score: numberValue(scan.readinessScore),
      timestamp: isoDate(scan.scannedAt),
      metadata: { findingsCount: numberValue(scan.findingsCount), criticalFindingsCount: numberValue(scan.criticalFindingsCount) },
    });
    edges.push({ from: scanId, to: projectNodeId, relation: "supports", reason: "Scan contributes readiness evidence to the trust graph." });
    const metadata = objectValue(scan.metadata);
    const findings = Array.isArray(metadata.findings) ? metadata.findings : [];
    for (const [index, finding] of findings.slice(0, 8).entries()) {
      const findingRecord = objectValue(finding);
      const severity = stringValue(findingRecord.severity) || "unknown";
      const nodeId = `finding:${scan.id}:${index}`;
      nodes.push({ id: nodeId, type: "finding", label: stringValue(findingRecord.title) || `${severity} finding`, status: severity, timestamp: isoDate(scan.scannedAt), metadata: findingRecord });
      edges.push({ from: nodeId, to: scanId, relation: "reduces", reason: "Finding lowers trust until evidence shows it was fixed." });
    }
  }

  for (const deployment of deployments) {
    nodes.push({ id: `deployment:${deployment.id}`, type: "deployment", label: deployment.url || "Deployment", status: deployment.status, timestamp: isoDate(deployment.createdAt) });
    edges.push({ from: `deployment:${deployment.id}`, to: projectNodeId, relation: "deployed_as", reason: "Deployment history is operational evidence." });
  }

  for (const payment of payments) {
    nodes.push({ id: `payment:${payment.id}`, type: "payment", label: payment.offerId, status: payment.fulfillmentStatus || payment.status, timestamp: payment.paidAt ? isoDate(payment.paidAt) : isoDate(payment.updatedAt), metadata: { amount: numberValue(payment.amount) } });
    edges.push({ from: `payment:${payment.id}`, to: projectNodeId, relation: "paid_for", reason: "Payment entitles appraisal or certificate workflow." });
  }

  for (const certificate of certificates) {
    nodes.push({ id: `certificate:${certificate.certificateId}`, type: "certificate", label: certificate.certificateId, status: certificate.status, timestamp: isoDate(certificate.issuedAt) });
    edges.push({ from: `certificate:${certificate.certificateId}`, to: projectNodeId, relation: "verifies", reason: "Signed certificate verifies the current public trust record." });
  }

  for (const event of events) {
    const nodeId = `evidence:${event.id}`;
    nodes.push({ id: nodeId, type: "evidence", label: event.event, timestamp: isoDate(event.createdAt), metadata: objectValue(event.metadata) });
    edges.push({ from: nodeId, to: projectNodeId, relation: "supports", reason: "Control-plane or product event is part of the audit trail." });
  }

  for (const ledger of ledgers) {
    nodes.push({ id: `score:${ledger.id}`, type: "score", label: `Trust ledger ${ledger.rating}`, status: ledger.verdict, score: numberValue(ledger.score), timestamp: isoDate(ledger.createdAt), metadata: { evidenceCount: numberValue(ledger.evidenceCount) } });
    edges.push({ from: `score:${ledger.id}`, to: projectNodeId, relation: "produced", reason: "Trust ledger snapshot produced an explainable trust score." });
  }

  return {
    registryItemId: registryItem.registryItemId,
    asset,
    nodes,
    edges,
    explanation: explainTrust({ registryItem, nodes, scans, certificates, events }),
    timeline: buildTrustTimeline({ asset, scans, certificates, ledgers }),
    counts: countNodes(nodes),
  };
}

function explainTrust(input: {
  registryItem: Awaited<ReturnType<typeof buildRegistryItem>>;
  nodes: TrustGraphNode[];
  scans: ScanRow[];
  certificates: CertificateRow[];
  events: EventRow[];
}): TrustExplanation {
  const reasons: TrustExplanation["reasons"] = [];
  const penalties: TrustExplanation["penalties"] = [];
  const latestScan = [...input.scans].sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime())[0];
  if (latestScan) reasons.push({ label: `Latest scan readiness is ${numberValue(latestScan.readinessScore)}/100`, evidenceNodeIds: [`scan:${latestScan.id}`], impact: 18 });
  if (input.certificates.some((certificate) => certificate.status === "ACTIVE")) reasons.push({ label: "Active signed certificate is present", evidenceNodeIds: input.certificates.map((certificate) => `certificate:${certificate.certificateId}`), impact: 12 });
  if (input.events.length > 0) reasons.push({ label: `${input.events.length} audit event${input.events.length === 1 ? "" : "s"} support the record`, evidenceNodeIds: input.events.slice(0, 6).map((event) => `evidence:${event.id}`), impact: 8 });

  const criticalFindings = input.scans.reduce((sum, scan) => sum + numberValue(scan.criticalFindingsCount), 0);
  if (criticalFindings > 0) penalties.push({ label: `${criticalFindings} critical finding${criticalFindings === 1 ? "" : "s"} remain in scan history`, evidenceNodeIds: input.scans.map((scan) => `scan:${scan.id}`), impact: -25 });
  if (!input.certificates.some((certificate) => certificate.status === "ACTIVE")) penalties.push({ label: "No active certificate is linked", evidenceNodeIds: [], impact: -12 });
  if (input.registryItem.queueHealth.failed > 0) penalties.push({ label: `${input.registryItem.queueHealth.failed} failed pipeline job${input.registryItem.queueHealth.failed === 1 ? "" : "s"}`, evidenceNodeIds: [], impact: -10 });

  const policy = evaluateTrustPolicy({
    trustScore: input.registryItem.trustScore,
    criticalFindings,
    hasActiveCertificate: input.certificates.some((certificate) => certificate.status === "ACTIVE"),
    failedJobs: input.registryItem.queueHealth.failed,
  });
  return {
    trustScore: input.registryItem.trustScore,
    summary: summaryFor(input.registryItem.trustScore, policy),
    reasons,
    penalties,
    policy,
  };
}

export function evaluateTrustPolicy(input: { trustScore: number; criticalFindings: number; hasActiveCertificate: boolean; failedJobs: number }): TrustPolicyDecision {
  const rules: TrustPolicyDecision["rules"] = [
    {
      rule: "READINESS_MINIMUM_80",
      result: input.trustScore >= 80 ? "pass" : input.trustScore >= 70 ? "warn" : "fail",
      reason: `Trust score is ${input.trustScore}/100.`,
    },
    {
      rule: "NO_CRITICAL_FINDINGS",
      result: input.criticalFindings === 0 ? "pass" : "fail",
      reason: input.criticalFindings === 0 ? "No critical findings are present." : `${input.criticalFindings} critical finding(s) are present.`,
    },
    {
      rule: "ACTIVE_CERTIFICATE",
      result: input.hasActiveCertificate ? "pass" : "warn",
      reason: input.hasActiveCertificate ? "Active certificate is linked." : "Active certificate is missing.",
    },
    {
      rule: "NO_FAILED_PIPELINE_JOBS",
      result: input.failedJobs === 0 ? "pass" : "warn",
      reason: input.failedJobs === 0 ? "Pipeline has no failed jobs." : `${input.failedJobs} failed job(s) need review.`,
    },
  ];
  const hasFail = rules.some((rule) => rule.result === "fail");
  const hasWarn = rules.some((rule) => rule.result === "warn");
  return {
    certificateIssuance: hasFail ? "BLOCK" : hasWarn ? "REVIEW" : "ALLOW",
    registryStatus: hasFail ? "BLOCKED" : hasWarn ? "RISKY" : "VERIFIED",
    rules,
  };
}

function buildTrustTimeline(input: { asset: RegistryAsset; scans: ScanRow[]; certificates: CertificateRow[]; ledgers: LedgerRow[] }): TrustTimelinePoint[] {
  return [
    ...input.scans.map((scan) => ({ timestamp: isoDate(scan.scannedAt), score: numberValue(scan.readinessScore), source: "scan" as const, label: `${scan.scanSource} scan` })),
    ...input.ledgers.map((ledger) => ({ timestamp: isoDate(ledger.createdAt), score: numberValue(ledger.score), source: "trust-ledger" as const, label: `Trust ledger ${ledger.rating}` })),
    ...input.certificates.map((certificate) => ({ timestamp: isoDate(certificate.issuedAt), score: input.asset.trustScore, source: "certificate" as const, label: `Certificate ${certificate.status}` })),
    { timestamp: input.asset.lastVerification, score: input.asset.trustScore, source: "appraisal" as const, label: "Registry appraisal" },
  ].sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
}

async function loadProject(projectId: string | null) {
  if (!projectId) return [];
  return await tryDatabase((db) => db.$queryRawUnsafe<ProjectRow[]>(`SELECT "id", "title", "status", "createdAt" FROM "projects" WHERE "id" = $1 LIMIT 1`, projectId)) || [];
}

async function loadRepositories(projectId: string | null) {
  if (!projectId) return [];
  return await tryDatabase((db) => db.$queryRawUnsafe<RepositoryRow[]>(`SELECT "id", "repository", "url", "updatedAt" FROM "project_repository_links" WHERE "projectId" = $1 ORDER BY "updatedAt" DESC LIMIT 10`, projectId)) || [];
}

async function loadScans(projectId: string | null) {
  if (!projectId) return [];
  return await tryDatabase((db) => db.$queryRawUnsafe<ScanRow[]>(`SELECT "id", "scanSource", "readinessScore", "findingsCount", "criticalFindingsCount", "riskLevel", "scannedAt", "metadata" FROM "project_scan_history" WHERE "projectId" = $1 ORDER BY "scannedAt" DESC LIMIT 20`, projectId)) || [];
}

async function loadDeployments(projectId: string | null) {
  if (!projectId) return [];
  return await tryDatabase((db) => db.$queryRawUnsafe<DeploymentRow[]>(`SELECT "id", "status", "url", "createdAt" FROM "deployments" WHERE "projectId" = $1 ORDER BY "createdAt" DESC LIMIT 10`, projectId)) || [];
}

async function loadPayments(asset: RegistryAsset) {
  return await tryDatabase((db) => db.$queryRawUnsafe<PaymentRow[]>(
    `SELECT "id", "status", "fulfillmentStatus", "offerId", "amount", "paidAt", "updatedAt" FROM "payments"
     WHERE ($1::text IS NOT NULL AND "projectId" = $1) OR ($2::text IS NOT NULL AND "appraisalId" = $2) OR ($3::text IS NOT NULL AND "certificateId" = $3)
     ORDER BY "updatedAt" DESC LIMIT 10`,
    asset.projectId,
    asset.appraisalId,
    asset.certificateId,
  )) || [];
}

async function loadCertificates(asset: RegistryAsset) {
  return await tryDatabase((db) => db.$queryRawUnsafe<CertificateRow[]>(
    `SELECT "certificateId", "status", "badgeState", "issuedAt" FROM "software_certificates"
     WHERE ($1::text IS NOT NULL AND "projectId" = $1) OR ($2::text IS NOT NULL AND "appraisalPublicId" = $2) OR ($3::text IS NOT NULL AND "certificateId" = $3)
     ORDER BY "issuedAt" DESC LIMIT 10`,
    asset.projectId,
    asset.appraisalPublicId,
    asset.certificateId,
  )) || [];
}

async function loadEvidenceEvents(projectId: string | null) {
  if (!projectId) return [];
  return await tryDatabase((db) => db.$queryRawUnsafe<EventRow[]>(`SELECT "id", "event", "metadata", "createdAt" FROM "usage_events" WHERE "projectId" = $1 ORDER BY "createdAt" DESC LIMIT 42`, projectId)) || [];
}

async function loadLedgerSnapshots(projectId: string | null) {
  if (!projectId) return [];
  return await tryDatabase((db) => db.$queryRawUnsafe<LedgerRow[]>(`SELECT "id", "score", "rating", "verdict", "evidenceCount", "createdAt" FROM "software_trust_ledger_snapshots" WHERE "projectId" = $1 ORDER BY "createdAt" DESC LIMIT 20`, projectId)) || [];
}

function countNodes(nodes: TrustGraphNode[]) {
  const counts = Object.fromEntries((["project", "repository", "scan", "finding", "deployment", "payment", "certificate", "evidence", "score"] as TrustGraphNodeType[]).map((type) => [type, 0])) as Record<TrustGraphNodeType, number>;
  for (const node of nodes) counts[node.type] += 1;
  return counts;
}

function summaryFor(score: number, policy: TrustPolicyDecision) {
  if (policy.registryStatus === "VERIFIED") return `Trust score ${score}/100 is supported by linked evidence and passes governance policy.`;
  if (policy.registryStatus === "RISKY") return `Trust score ${score}/100 has enough evidence for review but not automatic issuance.`;
  return `Trust score ${score}/100 is blocked by governance policy.`;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: number | bigint | null | undefined) {
  const number = typeof value === "bigint" ? Number(value) : Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function isoDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}
