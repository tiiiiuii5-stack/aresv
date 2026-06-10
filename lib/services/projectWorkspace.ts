import { randomUUID } from "node:crypto";

import type { RegressionReport } from "@/lib/intelligence/regression-detection";
import { tryDatabase } from "@/lib/prisma";
import { getProject, type ProjectRecord } from "@/lib/project-store";
import { sanitizeMetadata } from "@/lib/services/platformSupport";

export type WorkspaceScan = {
  id: string;
  source: string;
  scanRefId?: string | null;
  metadataSource?: string | null;
  framework: string;
  riskLevel: string;
  securityScore: number;
  failureScore: number;
  readinessScore: number;
  issueCount: number;
  findingsCount: number;
  criticalFindingsCount: number;
  createdAt: string;
  scannedAt: string;
  regressionReport?: RegressionReport | null;
  externalDataSources?: WorkspaceExternalDataSource[];
  sourceLength?: number | null;
  rawCodeStored?: boolean | null;
  inputTruncated?: boolean | null;
  scanAssurance?: WorkspaceScanAssurance | null;
  assuranceGate?: WorkspaceAssuranceGate | null;
};

export type WorkspaceScanAssurance = {
  scanId?: string;
  sourceHash?: string;
  ruleSetHash?: string;
  fileCount?: number;
  totalBytes?: number;
  deterministic?: boolean;
};

export type WorkspaceAssuranceGate = {
  status?: string;
  summary?: string;
  shouldBlock?: boolean;
  reasons: Array<{
    id?: string;
    title: string;
    severity?: string;
    evidence?: string;
    filePath?: string;
  }>;
  warnings: Array<{
    id?: string;
    title: string;
    severity?: string;
    evidence?: string;
    filePath?: string;
  }>;
  trustScoreExplanation?: {
    threshold?: number;
    scoreBand?: string;
    severityTotals?: Record<string, number>;
    history?: {
      baselineAvailable?: boolean;
      changedFiles?: number;
      addedFiles?: number;
      removedFiles?: number;
      regressionDirection?: string;
      readinessDelta?: number;
    };
  } | null;
  changeImpact?: WorkspaceChangeImpact | null;
};

export type WorkspaceChangeImpact = {
  summary?: string;
  baselineAvailable?: boolean;
  blockingChangeCount?: number;
  reviewChangeCount?: number;
  impacts: Array<{
    path: string;
    changeType?: string;
    impactArea?: string;
    gateEffect?: string;
    reason?: string;
  }>;
};

export type WorkspaceExternalDataSource = {
  id: string;
  label: string;
  status: string;
  evidence: string;
  checkedAt?: string;
};

export type WorkspaceFinding = {
  id: string;
  scanId: string;
  severity: string;
  category: string;
  title: string;
  evidence: string;
  fixSuggestion: string;
  filePath?: string;
  codeFix?: string;
  expectedResult?: string;
  verificationEvidence?: string;
  confidenceScore?: number;
  createdAt: string;
};

export type WorkspaceReport = {
  id: string;
  source: string;
  title: string;
  riskLevel: string;
  score: number;
  createdAt: string;
};

export type WorkspaceHistoryItem = {
  id: string;
  type: "project" | "scan" | "job" | "deployment" | "repository";
  title: string;
  detail: string;
  createdAt: string;
};

export type WorkspaceRepositoryLink = {
  id: string;
  provider: string;
  repository: string;
  url?: string | null;
  branch?: string | null;
  updatedAt: string;
};

export type WorkspaceScorePoint = {
  id: string;
  label: string;
  readinessScore: number;
  findingsCount: number;
  criticalFindingsCount: number;
  scannedAt: string;
};

export type WorkspaceScanComparison = {
  current: WorkspaceScan;
  previous: WorkspaceScan;
  readinessDelta: number;
  findingsDelta: number;
  criticalFindingsDelta: number;
  summary: string;
};

export type ProjectWorkspace = {
  project: ProjectRecord | null;
  isLegacy: boolean;
  scans: WorkspaceScan[];
  scanHistory: WorkspaceScan[];
  scoreHistory: WorkspaceScorePoint[];
  scanComparison: WorkspaceScanComparison | null;
  regressionReport: RegressionReport | null;
  findings: WorkspaceFinding[];
  reports: WorkspaceReport[];
  history: WorkspaceHistoryItem[];
  repositoryLinks: WorkspaceRepositoryLink[];
  legacyScans: WorkspaceScan[];
  migration: {
    projectIdOptional: true;
    legacyScansAccessible: true;
  };
};

type ScanRow = {
  id: string;
  source: string;
  scanRefId?: string | null;
  framework: string | null;
  riskLevel: string | null;
  securityScore: number | bigint | null;
  failureScore: number | bigint | null;
  readinessScore: number | bigint | null;
  issueCount: number | bigint | null;
  criticalFindingsCount?: number | bigint | null;
  metadata?: unknown;
  createdAt: Date | string;
  scannedAt?: Date | string;
};

type FindingRow = {
  scanId: string;
  source: WorkspaceScan["source"];
  issues: unknown;
  createdAt: Date | string;
};

type ReportRow = {
  id: string;
  source: WorkspaceReport["source"];
  riskLevel: string | null;
  securityScore: number | bigint | null;
  createdAt: Date | string;
};

type HistoryRow = {
  id: string;
  type: WorkspaceHistoryItem["type"];
  title: string | null;
  detail: string | null;
  createdAt: Date | string;
};

type RepositoryRow = {
  id: string;
  provider: string;
  repository: string;
  url: string | null;
  branch: string | null;
  updatedAt: Date | string;
};

export async function resolveWorkspaceProjectId(value: unknown): Promise<string | null> {
  const reference = String(value || "").trim();
  if (!reference) return null;
  const project = await getProject(reference);
  return project?.id ?? null;
}

export async function resolveWorkspaceProjectIdForUser(value: unknown, userId: string): Promise<string | null> {
  const projectId = await resolveWorkspaceProjectId(value);
  if (!projectId) return null;

  const owner = await tryDatabase((db) =>
    db.project.findUnique({
      where: { id: projectId },
      select: { userId: true, user: { select: { email: true } } },
    }),
  );
  if (!owner) throw new Error("PROJECT_NOT_FOUND");
  if (owner.userId !== userId && owner.user?.email !== userId) throw new Error("FORBIDDEN - NOT OWNER");

  return projectId;
}

export async function recordProjectRepositoryLink(input: {
  projectId?: string | null;
  repository?: string | null;
  branch?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const projectId = input.projectId?.trim();
  const repository = input.repository?.trim();
  if (!projectId || !repository) return false;

  const result = await tryDatabase(async (db) => {
    await db.$executeRawUnsafe(
      `INSERT INTO "project_repository_links" ("id", "projectId", "provider", "repository", "url", "branch", "metadata", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
       ON CONFLICT ("projectId", "repository")
       DO UPDATE SET "branch" = EXCLUDED."branch", "metadata" = EXCLUDED."metadata", "updatedAt" = NOW()`,
      randomUUID(),
      projectId,
      repositoryProvider(repository),
      repository,
      repositoryUrl(repository),
      input.branch?.trim() || null,
      JSON.stringify(sanitizeMetadata(input.metadata || {})),
    );
    return true;
  });

  return Boolean(result);
}

export async function getProjectWorkspace(id: string): Promise<ProjectWorkspace | null> {
  const cleanId = decodeURIComponent(id || "").trim();
  if (!cleanId) return null;

  if (cleanId === "legacy") {
    const legacyScans = await listLegacyScans(50);
    return {
      project: null,
      isLegacy: true,
      scans: legacyScans,
      scanHistory: legacyScans,
      scoreHistory: scoreHistoryFromScans(legacyScans),
      scanComparison: compareScans(legacyScans),
      regressionReport: latestRegressionReport(legacyScans),
      findings: await listLegacyFindings(),
      reports: legacyScans.map(scanToReport),
      history: legacyScans.map((scan) => ({
        id: scan.id,
        type: "scan",
        title: `Legacy ${scan.source === "app_analysis" ? "app analysis" : "analysis result"}`,
        detail: `${scan.riskLevel} risk | ${scan.issueCount} findings`,
        createdAt: scan.createdAt,
      })),
      repositoryLinks: [],
      legacyScans: [],
      migration: { projectIdOptional: true, legacyScansAccessible: true },
    };
  }

  const project = await getProject(cleanId);
  if (!project) return null;

  const [scans, findings, reports, history, repositoryLinks, legacyScans] = await Promise.all([
    listWorkspaceScans(project.id),
    listWorkspaceFindings(project.id),
    listWorkspaceReports(project.id),
    listWorkspaceHistory(project),
    listRepositoryLinks(project.id),
    listLegacyScans(10),
  ]);

  return {
    project,
    isLegacy: false,
    scans,
    scanHistory: scans,
    scoreHistory: scoreHistoryFromScans(scans),
    scanComparison: compareScans(scans),
    regressionReport: latestRegressionReport(scans),
    findings,
    reports,
    history,
    repositoryLinks,
    legacyScans,
    migration: { projectIdOptional: true, legacyScansAccessible: true },
  };
}

async function listWorkspaceScans(projectId: string) {
  const historyRows = await listStoredScanHistory(projectId, 40);
  if (historyRows?.length) return normalizeScans(historyRows);

  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<ScanRow[]>(
      `SELECT "id", 'app_analysis'::text AS "source", "id" AS "scanRefId", "framework", "riskLevel", "securityScore", "failureScore", "readinessScore", jsonb_array_length("issues") AS "issueCount",
         (SELECT COUNT(*)::int FROM jsonb_array_elements("issues") issue WHERE issue->>'severity' = 'critical') AS "criticalFindingsCount",
         "metadata", "createdAt", "createdAt" AS "scannedAt"
       FROM "app_analyses"
       WHERE "projectId" = $1
       ORDER BY "createdAt" DESC
       LIMIT 40`,
      projectId,
    ),
  );
  return normalizeScans(rows || []);
}

async function listLegacyScans(limit: number) {
  const historyRows = await listStoredScanHistory(null, limit);
  if (historyRows?.length) return normalizeScans(historyRows);

  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<ScanRow[]>(
      `SELECT "id", 'app_analysis'::text AS "source", "id" AS "scanRefId", "framework", "riskLevel", "securityScore", "failureScore", "readinessScore", jsonb_array_length("issues") AS "issueCount",
         (SELECT COUNT(*)::int FROM jsonb_array_elements("issues") issue WHERE issue->>'severity' = 'critical') AS "criticalFindingsCount",
         "metadata", "createdAt", "createdAt" AS "scannedAt"
       FROM "app_analyses"
       WHERE "projectId" IS NULL
       ORDER BY "createdAt" DESC
       LIMIT $1`,
      limit,
    ),
  );
  return normalizeScans(rows || []);
}

async function listStoredScanHistory(projectId: string | null, limit: number) {
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<ScanRow[]>(
      `SELECT "id", "scanSource" AS "source", "scanRefId", "framework", "riskLevel",
         "readinessScore" AS "securityScore",
         GREATEST(0, 100 - "readinessScore") AS "failureScore",
         "readinessScore",
         "findingsCount" AS "issueCount",
         "criticalFindingsCount",
         "metadata",
         "createdAt",
         "scannedAt"
       FROM "project_scan_history"
       WHERE ($1::text IS NULL AND "projectId" IS NULL) OR "projectId" = $1
       ORDER BY "scannedAt" DESC
       LIMIT $2`,
      projectId,
      limit,
    ),
  );
  return rows;
}

async function listWorkspaceFindings(projectId: string) {
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<FindingRow[]>(
      `SELECT "id" AS "scanId", 'app_analysis'::text AS "source", "issues", "createdAt"
       FROM "app_analyses"
       WHERE "projectId" = $1
       ORDER BY "createdAt" DESC
       LIMIT 25`,
      projectId,
    ),
  );
  return flattenFindings(rows || []);
}

async function listLegacyFindings() {
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<FindingRow[]>(
      `SELECT "id" AS "scanId", 'app_analysis'::text AS "source", "issues", "createdAt"
       FROM "app_analyses"
       WHERE "projectId" IS NULL
       ORDER BY "createdAt" DESC
       LIMIT 25`,
    ),
  );
  return flattenFindings(rows || []);
}

async function listWorkspaceReports(projectId: string) {
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<ReportRow[]>(
      `SELECT "id", 'analysis_result'::text AS "source", "riskLevel", "securityScore", "createdAt"
       FROM "analysis_results"
       WHERE "projectId" = $1
       ORDER BY "createdAt" DESC
       LIMIT 20`,
      projectId,
    ),
  );
  return (rows || []).map(rowToReport);
}

async function listWorkspaceHistory(project: ProjectRecord) {
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<HistoryRow[]>(
      `SELECT * FROM (
         SELECT "id", 'job'::text AS "type", COALESCE("currentStep", "type") AS "title", "status"::text AS "detail", "createdAt"
         FROM "jobs"
         WHERE "projectId" = $1
         UNION ALL
         SELECT "id", 'deployment'::text AS "type", 'Deployment'::text AS "title", COALESCE("status", 'unknown') AS "detail", "createdAt"
         FROM "deployments"
         WHERE "projectId" = $1
         UNION ALL
         SELECT "id", 'scan'::text AS "type", 'Scan completed'::text AS "title", COALESCE("riskLevel", 'unknown') AS "detail", "createdAt"
         FROM "analysis_results"
         WHERE "projectId" = $1
         UNION ALL
         SELECT "id", 'scan'::text AS "type", 'Scan history recorded'::text AS "title", CONCAT('readiness ', "readinessScore"::text, ' | findings ', "findingsCount"::text) AS "detail", "scannedAt" AS "createdAt"
         FROM "project_scan_history"
         WHERE "projectId" = $1
         UNION ALL
         SELECT "id", 'repository'::text AS "type", 'Repository linked'::text AS "title", "repository" AS "detail", "updatedAt" AS "createdAt"
         FROM "project_repository_links"
         WHERE "projectId" = $1
       ) history
       ORDER BY "createdAt" DESC
       LIMIT 30`,
      project.id,
    ),
  );

  const projectCreated: WorkspaceHistoryItem = {
    id: `${project.id}:created`,
    type: "project",
    title: "Project created",
    detail: project.category,
    createdAt: project.createdAt,
  };

  return [projectCreated, ...(rows || []).map(normalizeHistory)].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function listRepositoryLinks(projectId: string) {
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<RepositoryRow[]>(
      `SELECT "id", "provider", "repository", "url", "branch", "updatedAt"
       FROM "project_repository_links"
       WHERE "projectId" = $1
       ORDER BY "updatedAt" DESC`,
      projectId,
    ),
  );
  return (rows || []).map((row) => ({
    id: row.id,
    provider: row.provider,
    repository: row.repository,
    url: row.url,
    branch: row.branch,
    updatedAt: isoDate(row.updatedAt),
  }));
}

function normalizeScans(rows: ScanRow[]): WorkspaceScan[] {
  return rows.map((row) => ({
    id: row.id,
    scanRefId: row.scanRefId,
    source: row.source,
    metadataSource: metadataSourceFromMetadata(row.metadata),
    framework: row.framework || "unknown",
    riskLevel: row.riskLevel || "unknown",
    securityScore: numberValue(row.securityScore),
    failureScore: numberValue(row.failureScore),
    readinessScore: numberValue(row.readinessScore),
    issueCount: numberValue(row.issueCount),
    findingsCount: numberValue(row.issueCount),
    criticalFindingsCount: numberValue(row.criticalFindingsCount),
    createdAt: isoDate(row.createdAt),
    scannedAt: isoDate(row.scannedAt || row.createdAt),
    regressionReport: regressionReportFromMetadata(row.metadata),
    externalDataSources: externalDataSourcesFromMetadata(row.metadata),
    sourceLength: sourceLengthFromMetadata(row.metadata),
    rawCodeStored: booleanOrNull(metadataValueFromPath(row.metadata, ["scanInput", "rawCodeStored"])),
    inputTruncated: booleanOrNull(metadataValueFromPath(row.metadata, ["scanInput", "inputTruncated"])),
    scanAssurance: scanAssuranceFromMetadata(row.metadata),
    assuranceGate: assuranceGateFromMetadata(row.metadata),
  }));
}

function flattenFindings(rows: FindingRow[]): WorkspaceFinding[] {
  return rows
    .flatMap((row) => normalizeIssueArray(row.issues).map((issue, index) => ({
      id: `${row.scanId}:${issue.id || index}`,
      scanId: row.scanId,
      severity: String(issue.severity || "unknown"),
      category: String(issue.category || "scan"),
      title: String(issue.title || "Untitled finding"),
      evidence: findingEvidenceText(issue),
      fixSuggestion: String(issue.fixSuggestion || issue.recommendation || "Review the finding and apply a verified fix."),
      filePath: findingFilePath(issue),
      codeFix: findingCodeFix(issue),
      expectedResult: findingExpectedResult(issue),
      verificationEvidence: findingVerificationEvidence(issue),
      confidenceScore: numberFromUnknown(issue.confidenceScore ?? issue.confidence),
      createdAt: isoDate(row.createdAt),
    })))
    .slice(0, 60);
}

function normalizeIssueArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}

function findingEvidenceText(issue: Record<string, unknown>) {
  if (typeof issue.evidence === "string" && issue.evidence.trim()) return issue.evidence;
  const evidenceArray = Array.isArray(issue.evidence) ? issue.evidence : [];
  const firstEvidence = evidenceArray.find((item) => item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown> | undefined;
  const fileEvidence = firstFileEvidence(issue);
  return String(
    firstEvidence?.reason ||
      firstEvidence?.detail ||
      fileEvidence?.reason ||
      issue.explanation ||
      issue.reasoning ||
      "Evidence was not captured for this finding.",
  );
}

function findingFilePath(issue: Record<string, unknown>) {
  const filePath = stringFromUnknown(issue.filePath);
  if (filePath) return filePath;
  const actionableFix = objectFromUnknown(issue.actionableFix);
  const actionPath = stringFromUnknown(actionableFix.filePath);
  if (actionPath) return actionPath;
  const fileEvidence = firstFileEvidence(issue);
  const evidencePath = stringFromUnknown(fileEvidence?.filePath);
  return evidencePath && evidencePath !== "__scan_file_inventory__" ? evidencePath : undefined;
}

function findingCodeFix(issue: Record<string, unknown>) {
  const actionableFix = objectFromUnknown(issue.actionableFix);
  const copyPasteFix = stringFromUnknown(actionableFix.copyPasteFix);
  if (copyPasteFix) return copyPasteFix;
  const codeSnippet = stringFromUnknown(issue.codeSnippet);
  if (codeSnippet) return codeSnippet;
  const fileEvidence = firstFileEvidence(issue);
  return stringFromUnknown(fileEvidence?.codeSnippet) || undefined;
}

function findingExpectedResult(issue: Record<string, unknown>) {
  const actionableFix = objectFromUnknown(issue.actionableFix);
  const verificationSteps = Array.isArray(actionableFix.verificationSteps)
    ? actionableFix.verificationSteps.map((item) => String(item).trim()).filter(Boolean)
    : [];
  if (verificationSteps.length) return verificationSteps[0];
  const title = String(issue.title || "finding").trim();
  return `Next scan no longer reports: ${title}.`;
}

function findingVerificationEvidence(issue: Record<string, unknown>) {
  const proof = objectFromUnknown(issue.proof);
  const reasoning = stringFromUnknown(proof.reasoning) || stringFromUnknown(issue.reasoning);
  if (reasoning) return reasoning;
  const fileEvidence = firstFileEvidence(issue);
  return stringFromUnknown(fileEvidence?.reason) || undefined;
}

function firstFileEvidence(issue: Record<string, unknown>) {
  const fileEvidence = Array.isArray(issue.fileEvidence) ? issue.fileEvidence : [];
  return fileEvidence.find((item) => item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown> | undefined;
}

function objectFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringFromUnknown(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function numberFromUnknown(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function scanToReport(scan: WorkspaceScan): WorkspaceReport {
  return {
    id: scan.id,
    source: scan.source,
    title: scan.source === "app_analysis" ? "Application analysis report" : "Telemetry analysis report",
    riskLevel: scan.riskLevel,
    score: scan.securityScore,
    createdAt: scan.createdAt,
  };
}

function rowToReport(row: ReportRow): WorkspaceReport {
  return {
    id: row.id,
    source: row.source,
    title: row.source === "app_analysis" ? "Application analysis report" : "Telemetry analysis report",
    riskLevel: row.riskLevel || "unknown",
    score: numberValue(row.securityScore),
    createdAt: isoDate(row.createdAt),
  };
}

function normalizeHistory(row: HistoryRow): WorkspaceHistoryItem {
  return {
    id: row.id,
    type: row.type,
    title: row.title || "Workspace event",
    detail: row.detail || "",
    createdAt: isoDate(row.createdAt),
  };
}

function scoreHistoryFromScans(scans: WorkspaceScan[]): WorkspaceScorePoint[] {
  return [...scans]
    .sort((a, b) => a.scannedAt.localeCompare(b.scannedAt))
    .slice(-12)
    .map((scan, index) => ({
      id: scan.id,
      label: `Scan ${index + 1}`,
      readinessScore: scan.readinessScore,
      findingsCount: scan.findingsCount,
      criticalFindingsCount: scan.criticalFindingsCount,
      scannedAt: scan.scannedAt,
    }));
}

function compareScans(scans: WorkspaceScan[]): WorkspaceScanComparison | null {
  const sorted = [...scans].sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
  const current = sorted[0];
  const previous = sorted[1];
  if (!current || !previous) return null;

  const readinessDelta = current.readinessScore - previous.readinessScore;
  const findingsDelta = current.findingsCount - previous.findingsCount;
  const criticalFindingsDelta = current.criticalFindingsCount - previous.criticalFindingsCount;
  const summary =
    readinessDelta > 0 && findingsDelta <= 0 && criticalFindingsDelta <= 0
      ? "Current scan improved against the previous scan."
      : readinessDelta < 0 || criticalFindingsDelta > 0
        ? "Current scan regressed and needs review."
        : "Current scan is broadly unchanged from the previous scan.";

  return { current, previous, readinessDelta, findingsDelta, criticalFindingsDelta, summary };
}

function latestRegressionReport(scans: WorkspaceScan[]) {
  return [...scans].sort((a, b) => b.scannedAt.localeCompare(a.scannedAt)).find((scan) => scan.regressionReport)?.regressionReport || null;
}

function regressionReportFromMetadata(metadata: unknown): RegressionReport | null {
  const value = metadataObject(metadata);
  const regressionDetection = metadataObject(value.regressionDetection);
  const report = regressionDetection.report;
  if (!report || typeof report !== "object" || Array.isArray(report)) return null;
  if ((report as { engine?: unknown }).engine !== "ventureos-regression-detection") return null;
  return report as RegressionReport;
}

function externalDataSourcesFromMetadata(metadata: unknown): WorkspaceExternalDataSource[] {
  const value = metadataObject(metadata);
  const external = metadataObject(value.externalIntelligence);
  const sources = Array.isArray(external.sources) ? external.sources : [];
  return sources
    .filter((source): source is Record<string, unknown> => Boolean(source) && typeof source === "object" && !Array.isArray(source))
    .map((source) => ({
      id: String(source.id || "unknown"),
      label: String(source.label || source.id || "External source"),
      status: String(source.status || "unknown"),
      evidence: String(source.evidence || "No source evidence recorded."),
      checkedAt: typeof source.checkedAt === "string" ? source.checkedAt : undefined,
    }))
    .slice(0, 12);
}

function scanAssuranceFromMetadata(metadata: unknown): WorkspaceScanAssurance | null {
  const value = metadataObject(metadata);
  const assurance = metadataObject(value.scanAssurance);
  if (!assurance.scanId && !assurance.sourceHash && !assurance.ruleSetHash) return null;
  return {
    scanId: stringFromUnknown(assurance.scanId) || undefined,
    sourceHash: stringFromUnknown(assurance.sourceHash) || undefined,
    ruleSetHash: stringFromUnknown(assurance.ruleSetHash) || undefined,
    fileCount: numberFromUnknown(assurance.fileCount),
    totalBytes: numberFromUnknown(assurance.totalBytes),
    deterministic: typeof assurance.deterministic === "boolean" ? assurance.deterministic : undefined,
  };
}

function assuranceGateFromMetadata(metadata: unknown): WorkspaceAssuranceGate | null {
  const value = metadataObject(metadata);
  const gate = metadataObject(value.assuranceGate);
  if (!gate.status && !gate.summary && !Array.isArray(gate.reasons)) return null;
  const explanation = metadataObject(gate.trustScoreExplanation);
  const history = metadataObject(explanation.history);
  return {
    status: stringFromUnknown(gate.status) || undefined,
    summary: stringFromUnknown(gate.summary) || undefined,
    shouldBlock: typeof gate.shouldBlock === "boolean" ? gate.shouldBlock : undefined,
    reasons: normalizeGateReasons(gate.reasons),
    warnings: normalizeGateReasons(gate.warnings),
    trustScoreExplanation: {
      threshold: numberFromUnknown(explanation.threshold),
      scoreBand: stringFromUnknown(explanation.scoreBand) || undefined,
      severityTotals: objectNumberMap(explanation.severityTotals),
      history: {
        baselineAvailable: typeof history.baselineAvailable === "boolean" ? history.baselineAvailable : undefined,
        changedFiles: numberFromUnknown(history.changedFiles),
        addedFiles: numberFromUnknown(history.addedFiles),
        removedFiles: numberFromUnknown(history.removedFiles),
        regressionDirection: stringFromUnknown(history.regressionDirection) || undefined,
        readinessDelta: numberFromUnknown(history.readinessDelta),
      },
    },
    changeImpact: changeImpactFromMetadata(gate.changeImpact),
  };
}

function changeImpactFromMetadata(value: unknown): WorkspaceChangeImpact | null {
  const object = metadataObject(value);
  if (!object.summary && !Array.isArray(object.impacts)) return null;
  const impacts = Array.isArray(object.impacts) ? object.impacts : [];
  return {
    summary: stringFromUnknown(object.summary) || undefined,
    baselineAvailable: typeof object.baselineAvailable === "boolean" ? object.baselineAvailable : undefined,
    blockingChangeCount: numberFromUnknown(object.blockingChangeCount),
    reviewChangeCount: numberFromUnknown(object.reviewChangeCount),
    impacts: impacts
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
      .map((item) => ({
        path: stringFromUnknown(item.path) || "unknown",
        changeType: stringFromUnknown(item.changeType) || undefined,
        impactArea: stringFromUnknown(item.impactArea) || undefined,
        gateEffect: stringFromUnknown(item.gateEffect) || undefined,
        reason: stringFromUnknown(item.reason) || undefined,
      }))
      .slice(0, 10),
  };
}

function normalizeGateReasons(value: unknown): WorkspaceAssuranceGate["reasons"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item) => ({
      id: stringFromUnknown(item.id) || undefined,
      title: stringFromUnknown(item.title) || "Gate reason",
      severity: stringFromUnknown(item.severity) || undefined,
      evidence: stringFromUnknown(item.evidence) || undefined,
      filePath: stringFromUnknown(item.filePath) || undefined,
    }))
    .slice(0, 10);
}

function objectNumberMap(value: unknown) {
  const object = objectFromUnknown(value);
  const output: Record<string, number> = {};
  for (const [key, item] of Object.entries(object)) {
    const number = numberFromUnknown(item);
    if (number !== undefined) output[key] = number;
  }
  return Object.keys(output).length ? output : undefined;
}

function metadataSourceFromMetadata(metadata: unknown) {
  const value = metadataObject(metadata);
  const scanInput = metadataObject(value.scanInput);
  const appMetadata = metadataObject(value.appMetadata);
  const source = stringFromUnknown(scanInput.source) || stringFromUnknown(appMetadata.source);
  return source || null;
}

function sourceLengthFromMetadata(metadata: unknown) {
  const value = metadataObject(metadata);
  const scanInput = metadataObject(value.scanInput);
  return numberFromUnknown(scanInput.sourceLength ?? scanInput.inputLength ?? value.sourceLength);
}

function metadataValueFromPath(metadata: unknown, path: string[]) {
  let value: unknown = metadataObject(metadata);
  for (const key of path) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function booleanOrNull(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function metadataObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return metadataObject(JSON.parse(value) as unknown);
    } catch {
      return {};
    }
  }
  if (typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function numberValue(value: number | bigint | null | undefined) {
  return typeof value === "bigint" ? Number(value) : Number(value || 0);
}

function isoDate(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function repositoryProvider(repository: string) {
  if (/github\.com|^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) return "github";
  if (/gitlab\.com/.test(repository)) return "gitlab";
  if (/bitbucket\.org/.test(repository)) return "bitbucket";
  return "git";
}

function repositoryUrl(repository: string) {
  if (/^https?:\/\//i.test(repository)) return repository;
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) return `https://github.com/${repository}`;
  return null;
}
