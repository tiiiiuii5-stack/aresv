import { randomUUID } from "node:crypto";

import {
  detectScanRegression,
  summarizeFindingsForRegression,
  type RegressionFindingInput,
  type RegressionFindingSummary,
  type RegressionReport,
  type RegressionScanSnapshot,
} from "@/lib/intelligence/regression-detection";
import { tryDatabase } from "@/lib/prisma";
import { sanitizeMetadata } from "@/lib/services/platformSupport";
import { createTransparencyEventCommitment } from "@/lib/transparency/eventCommitment";

export type ScanHistoryInput = {
  projectId?: string | null;
  scanSource: "app_analysis" | "repo_scan" | string;
  scanRefId?: string | null;
  readinessScore: number;
  findingsCount: number;
  criticalFindingsCount: number;
  riskLevel?: string | null;
  framework?: string | null;
  scannedAt?: Date;
  findings?: RegressionFindingInput[];
  metadata?: Record<string, unknown>;
};

export type ScanHistoryRecordResult = {
  stored: boolean;
  regressionReport: RegressionReport | null;
};

type StoredScanHistoryRow = {
  id: string;
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

export async function recordScanHistory(input: ScanHistoryInput) {
  const scanRefId = input.scanRefId?.trim() || randomUUID();
  const result = await tryDatabase(async (db): Promise<ScanHistoryRecordResult> => {
    const currentFindings = summarizeFindingsForRegression(input.findings || []);
    const scannedAt = input.scannedAt || new Date();
    const previousRows = await db.$queryRawUnsafe<StoredScanHistoryRow[]>(
      `SELECT "id", "scanSource", "scanRefId", "readinessScore", "findingsCount", "criticalFindingsCount", "riskLevel", "framework", "metadata", "scannedAt"
       FROM "project_scan_history"
       WHERE (($1::text IS NULL AND "projectId" IS NULL) OR "projectId" = $1)
         AND NOT ("scanSource" = $2 AND "scanRefId" = $3)
       ORDER BY "scannedAt" DESC
       LIMIT 12`,
      input.projectId || null,
      input.scanSource,
      scanRefId,
    );
    const previousScans = (previousRows || []).map(rowToRegressionSnapshot);
    const regressionReport = detectScanRegression({
      current: {
        scanSource: input.scanSource,
        scanRefId,
        readinessScore: boundedScore(input.readinessScore),
        findingsCount: boundedCount(input.findingsCount),
        criticalFindingsCount: boundedCount(input.criticalFindingsCount),
        riskLevel: input.riskLevel || null,
        framework: input.framework || null,
        scannedAt: scannedAt.toISOString(),
        findings: currentFindings,
      },
      previousScans,
    });
    const metadata = sanitizeMetadata({
      ...(input.metadata || {}),
      regressionDetection: {
        report: regressionReport,
        findings: currentFindings,
      },
      transparencyCommitment: createTransparencyEventCommitment({
        source: "project_scan_history",
        projectId: input.projectId || null,
        scanSource: input.scanSource,
        scanRefId,
        readinessScore: boundedScore(input.readinessScore),
        findingsCount: boundedCount(input.findingsCount),
        criticalFindingsCount: boundedCount(input.criticalFindingsCount),
        riskLevel: input.riskLevel || null,
        framework: input.framework || null,
        scannedAt: scannedAt.toISOString(),
        findingsFingerprints: currentFindings.map((finding) => finding.fingerprint).sort(),
      }, scannedAt.toISOString()),
    });

    await db.$executeRawUnsafe(
      `INSERT INTO "project_scan_history" ("id", "projectId", "scanSource", "scanRefId", "readinessScore", "findingsCount", "criticalFindingsCount", "riskLevel", "framework", "metadata", "scannedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
       ON CONFLICT ("scanSource", "scanRefId")
       DO UPDATE SET
         "projectId" = EXCLUDED."projectId",
         "readinessScore" = EXCLUDED."readinessScore",
         "findingsCount" = EXCLUDED."findingsCount",
         "criticalFindingsCount" = EXCLUDED."criticalFindingsCount",
         "riskLevel" = EXCLUDED."riskLevel",
         "framework" = EXCLUDED."framework",
         "metadata" = EXCLUDED."metadata",
         "scannedAt" = EXCLUDED."scannedAt"`,
      randomUUID(),
      input.projectId || null,
      input.scanSource,
      scanRefId,
      boundedScore(input.readinessScore),
      boundedCount(input.findingsCount),
      boundedCount(input.criticalFindingsCount),
      input.riskLevel || null,
      input.framework || null,
      JSON.stringify(metadata),
      scannedAt,
    );
    return { stored: true, regressionReport };
  });

  return result || { stored: false, regressionReport: null };
}

export function countCriticalFindings(findings: Array<{ severity?: string }>) {
  return findings.filter((finding) => String(finding.severity || "").toLowerCase() === "critical").length;
}

function boundedScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

function boundedCount(value: number) {
  return Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
}

function rowToRegressionSnapshot(row: StoredScanHistoryRow): RegressionScanSnapshot {
  return {
    id: row.id,
    scanSource: row.scanSource,
    scanRefId: row.scanRefId,
    readinessScore: numberValue(row.readinessScore),
    findingsCount: numberValue(row.findingsCount),
    criticalFindingsCount: numberValue(row.criticalFindingsCount),
    riskLevel: row.riskLevel,
    framework: row.framework,
    scannedAt: isoDate(row.scannedAt),
    findings: findingsFromMetadata(row.metadata),
  };
}

function findingsFromMetadata(metadata: unknown): RegressionFindingSummary[] {
  const value = metadataObject(metadata);
  const regression = metadataObject(value.regressionDetection);
  const findings = regression.findings;
  if (!Array.isArray(findings)) return [];
  return findings.filter(isRegressionFindingSummary);
}

function isRegressionFindingSummary(value: unknown): value is RegressionFindingSummary {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof (value as { fingerprint?: unknown }).fingerprint === "string");
}

function metadataObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return metadataObject(parsed);
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
