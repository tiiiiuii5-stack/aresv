import { randomUUID } from "node:crypto";

import { tryDatabase } from "@/lib/prisma";
import { sanitizeMetadata } from "@/lib/services/platformSupport";

export type HistoricalEvidence = {
  source: string;
  reason: string;
  confidence: number;
};

export type SeverityTotals = {
  critical: number;
  high: number;
  medium: number;
  low: number;
};

export type ProjectScanFinding = {
  fingerprint: string;
  title: string;
  severity: string;
  category: string;
  filePath?: string;
  affectedRoutes: string[];
  evidence?: string;
  fixSuggestion?: string;
};

export type ProjectCodeSnapshot = {
  sourceHash?: string;
  sourceLength?: number;
  fileHashes: Record<string, string>;
};

export type ProjectScanSnapshot = {
  id: string;
  projectId: string | null;
  scanSource: string;
  scanRefId: string | null;
  readinessScore: number;
  findingsCount: number;
  criticalFindingsCount: number;
  riskLevel: string | null;
  framework: string | null;
  severityTotals: SeverityTotals;
  findings: ProjectScanFinding[];
  codeSnapshot?: ProjectCodeSnapshot | null;
  scannedAt: string;
};

export type ProjectHistorySnapshot = {
  timestamp: string;
  readiness: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
};

export type ProjectDiffTelemetryInput = {
  projectId: string;
  currentReadiness: number | null;
  previousReadiness: number | null;
  delta: number;
  trend: string;
  confidence: number;
  issueCounts: {
    fixed: number;
    introduced: number;
    unchanged: number;
    severityChanged: number;
  };
  verificationCounts: {
    verified: number;
    partial: number;
    failed: number;
  };
  readinessImpact: {
    scoreIncrease: number;
    scoreDecrease: number;
    netChange: number;
  };
  topContributingFindings: Array<{
    issueId: string;
    title: string;
    status: string;
  }>;
  historySnapshots: ProjectHistorySnapshot[];
};

type ScanHistoryRow = {
  id: string;
  projectId: string | null;
  scanSource: string;
  scanRefId: string | null;
  readinessScore: number | bigint;
  findingsCount: number | bigint;
  criticalFindingsCount: number | bigint;
  riskLevel: string | null;
  framework: string | null;
  metadata: unknown;
  scannedAt: Date | string;
};

export async function loadProjectScanSnapshots(projectId: string, limit = 24): Promise<ProjectScanSnapshot[]> {
  const cleanProjectId = projectId.trim();
  if (!cleanProjectId) return [];
  const boundedLimit = Math.max(2, Math.min(50, Math.round(limit)));

  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<ScanHistoryRow[]>(
      `SELECT "id", "projectId", "scanSource", "scanRefId", "readinessScore", "findingsCount", "criticalFindingsCount", "riskLevel", "framework", "metadata", "scannedAt"
       FROM "project_scan_history"
       WHERE "projectId" = $1
       ORDER BY "scannedAt" DESC
       LIMIT $2`,
      cleanProjectId,
      boundedLimit,
    ),
  );

  return (rows || []).map(rowToSnapshot);
}

export async function loadGlobalLatestScanSnapshots(limit = 500): Promise<ProjectScanSnapshot[]> {
  const boundedLimit = Math.max(10, Math.min(1000, Math.round(limit)));

  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<ScanHistoryRow[]>(
      `WITH ranked_scans AS (
         SELECT
           "id",
           "projectId",
           "scanSource",
           "scanRefId",
           "readinessScore",
           "findingsCount",
           "criticalFindingsCount",
           "riskLevel",
           "framework",
           "metadata",
           "scannedAt",
           ROW_NUMBER() OVER (
             PARTITION BY COALESCE("projectId", CONCAT("scanSource", ':', COALESCE("scanRefId", "id")))
             ORDER BY "scannedAt" DESC
           ) AS row_number
         FROM "project_scan_history"
       )
       SELECT "id", "projectId", "scanSource", "scanRefId", "readinessScore", "findingsCount", "criticalFindingsCount", "riskLevel", "framework", "metadata", "scannedAt"
       FROM ranked_scans
       WHERE row_number = 1
       ORDER BY "scannedAt" DESC
       LIMIT $1`,
      boundedLimit,
    ),
  );

  return (rows || []).map(rowToSnapshot);
}

export function historySnapshotsFromScans(scans: ProjectScanSnapshot[]): ProjectHistorySnapshot[] {
  return scans
    .slice()
    .sort((a, b) => a.scannedAt.localeCompare(b.scannedAt))
    .map((scan) => ({
      timestamp: scan.scannedAt,
      readiness: scan.readinessScore,
      criticalCount: scan.severityTotals.critical,
      highCount: scan.severityTotals.high,
      mediumCount: scan.severityTotals.medium,
      lowCount: scan.severityTotals.low,
    }));
}

export async function recordProjectDiffTelemetry(input: ProjectDiffTelemetryInput) {
  const result = await tryDatabase(async (db) => {
    await db.$executeRawUnsafe(
      `INSERT INTO "app_telemetry_events" ("id", "projectId", "snapshotId", "analysisResultId", "eventType", "dataset", "framework", "riskLevel", "severity", "counts", "metadata")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb)`,
      randomUUID(),
      input.projectId,
      null,
      null,
      "project.diff.generated",
      "historical_scan_diff",
      "unknown",
      riskLevelFor(input),
      severityFor(input),
      JSON.stringify({
        currentReadiness: input.currentReadiness,
        previousReadiness: input.previousReadiness,
        delta: input.delta,
        issuesFixed: input.issueCounts.fixed,
        issuesIntroduced: input.issueCounts.introduced,
        issuesUnchanged: input.issueCounts.unchanged,
        severityChanged: input.issueCounts.severityChanged,
        verifiedFixes: input.verificationCounts.verified,
        partialFixes: input.verificationCounts.partial,
        failedFixes: input.verificationCounts.failed,
      }),
      JSON.stringify(
        sanitizeMetadata({
          trend: input.trend,
          confidence: input.confidence,
          readinessImpact: input.readinessImpact,
          topContributingFindings: input.topContributingFindings.slice(0, 10),
          historySnapshots: input.historySnapshots.slice(-12),
        }),
      ),
    );
    return true;
  });

  return Boolean(result);
}

function rowToSnapshot(row: ScanHistoryRow): ProjectScanSnapshot {
  const findings = findingsFromMetadata(row.metadata);
  const criticalFindingsCount = numberValue(row.criticalFindingsCount);
  return {
    id: row.id,
    projectId: row.projectId,
    scanSource: row.scanSource,
    scanRefId: row.scanRefId,
    readinessScore: boundedScore(numberValue(row.readinessScore)),
    findingsCount: boundedCount(numberValue(row.findingsCount)),
    criticalFindingsCount: boundedCount(criticalFindingsCount),
    riskLevel: row.riskLevel,
    framework: row.framework,
    severityTotals: severityTotalsFor(findings, criticalFindingsCount),
    findings,
    codeSnapshot: codeSnapshotFromMetadata(row.metadata),
    scannedAt: isoDate(row.scannedAt),
  };
}

function findingsFromMetadata(metadata: unknown): ProjectScanFinding[] {
  const value = metadataObject(metadata);
  const regression = metadataObject(value.regressionDetection);
  const candidates = Array.isArray(regression.findings)
    ? regression.findings
    : Array.isArray(value.findings)
      ? value.findings
      : [];

  const output = new Map<string, ProjectScanFinding>();
  for (const candidate of candidates) {
    const finding = findingFromUnknown(candidate);
    if (!finding) continue;
    const existing = output.get(finding.fingerprint);
    if (!existing || severityRank(finding.severity) > severityRank(existing.severity)) {
      output.set(finding.fingerprint, finding);
    }
  }
  return [...output.values()].sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.title.localeCompare(b.title));
}

function findingFromUnknown(value: unknown): ProjectScanFinding | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const fingerprint = stringValue(record.fingerprint);
  const title = stringValue(record.title);
  if (!fingerprint || !title) return null;

  return {
    fingerprint,
    title,
    severity: normalizeSeverity(stringValue(record.severity) || "unknown"),
    category: stringValue(record.category) || "scan",
    filePath: stringValue(record.filePath) || undefined,
    affectedRoutes: Array.isArray(record.affectedRoutes) ? record.affectedRoutes.map(stringValue).filter(Boolean) : [],
    evidence: stringValue(record.evidence) || undefined,
    fixSuggestion: stringValue(record.fixSuggestion) || stringValue(record.recommendation) || undefined,
  };
}

function codeSnapshotFromMetadata(metadata: unknown): ProjectCodeSnapshot | null {
  const value = metadataObject(metadata);
  const explicit = metadataObject(value.codeSnapshot);
  const fileHashes = stringMapValue(explicit.fileHashes);
  const sourceHash =
    stringValue(explicit.sourceHash) ||
    stringValue(value.sourceHash) ||
    stringValue(value.appCodeHash) ||
    stringValue(value.repositorySourceHash) ||
    stringValue(value.codeHash);
  const sourceLength = numberFromUnknown(explicit.sourceLength ?? value.sourceLength);

  if (!sourceHash && Object.keys(fileHashes).length === 0) return null;
  return {
    sourceHash: sourceHash || undefined,
    sourceLength,
    fileHashes,
  };
}

function severityTotalsFor(findings: ProjectScanFinding[], criticalFallback: number): SeverityTotals {
  if (findings.length === 0) {
    return { critical: boundedCount(criticalFallback), high: 0, medium: 0, low: 0 };
  }

  return findings.reduce<SeverityTotals>(
    (totals, finding) => {
      const severity = normalizeSeverity(finding.severity);
      if (severity === "critical") totals.critical += 1;
      else if (severity === "high") totals.high += 1;
      else if (severity === "medium") totals.medium += 1;
      else totals.low += 1;
      return totals;
    },
    { critical: 0, high: 0, medium: 0, low: 0 },
  );
}

function riskLevelFor(input: ProjectDiffTelemetryInput) {
  if (input.trend === "DECLINING" || input.issueCounts.introduced > 0 || input.verificationCounts.failed > 0) return "high";
  if (input.trend === "VOLATILE" || input.verificationCounts.partial > 0) return "medium";
  return "low";
}

function severityFor(input: ProjectDiffTelemetryInput) {
  if (input.issueCounts.introduced > 0 || input.verificationCounts.failed > 0) return "High";
  if (input.issueCounts.severityChanged > 0 || input.verificationCounts.partial > 0) return "Medium";
  return "none";
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

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringMapValue(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    const cleanKey = key.replace(/\\/g, "/").replace(/^\/+/, "").trim().toLowerCase();
    const cleanValue = stringValue(item);
    if (cleanKey && cleanValue) output[cleanKey] = cleanValue;
  }
  return output;
}

function numberFromUnknown(value: unknown) {
  const number = typeof value === "bigint" ? Number(value) : typeof value === "number" ? value : Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : undefined;
}

function numberValue(value: number | bigint | null | undefined) {
  return typeof value === "bigint" ? Number(value) : Number(value || 0);
}

function boundedScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

function boundedCount(value: number) {
  return Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
}

function isoDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function normalizeSeverity(value: string) {
  const clean = value.trim().toLowerCase();
  if (clean === "critical" || clean === "high" || clean === "medium" || clean === "low") return clean;
  if (clean === "info" || clean === "informational") return "low";
  return "unknown";
}

function severityRank(value: string) {
  const severity = normalizeSeverity(value);
  if (severity === "critical") return 4;
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  if (severity === "low") return 1;
  return 0;
}
