import { randomUUID } from "node:crypto";

import { buildAppraisalReport } from "@/lib/appraisal/scoring";
import type {
  AppraisalAuthorityBoundary,
  AppraisalMoneyRange,
  AppraisalPrivateReport,
  AppraisalPublicSummary,
  AppraisalReportClaim,
  CreateAppraisalInput,
  SoftwareAppraisal,
} from "@/lib/appraisal/types";
import { buildReportLanguageContract, neutralizeReportText } from "@/lib/appraisal/reportLanguage";
import { buildAppraisalUrls, buildBadgeEmbed } from "@/lib/appraisal/badge";
import { tryDatabase } from "@/lib/prisma";
import { getProjectWorkspace } from "@/lib/services/projectWorkspace";
import { sanitizeMetadata } from "@/lib/services/platformSupport";

type SoftwareAppraisalRow = {
  id: string;
  publicId: string;
  projectId: string | null;
  userId: string;
  appName: string;
  status: string;
  grade: string;
  launchVerdict: string;
  readinessScore: number | bigint;
  technicalRiskScore: number | bigint;
  transferReadinessScore: number | bigint;
  repairCostLow: number | bigint;
  repairCostHigh: number | bigint;
  valueLow: number | bigint;
  valueHigh: number | bigint;
  badgeState: string;
  publicSummary: unknown;
  privateReport?: unknown;
  sourceScanId: string | null;
  sourceScanRefId: string | null;
  monitoredUntil: Date | string | null;
  expiresAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export async function createSoftwareAppraisal(input: CreateAppraisalInput) {
  const workspace = await getProjectWorkspace(input.projectId);
  if (!workspace?.project) throw new Error("PROJECT_NOT_FOUND");

  const generatedAt = input.generatedAt || new Date().toISOString();
  const publicId = createPublicAppraisalId();
  const { publicSummary, privateReport } = buildAppraisalReport(workspace, generatedAt);
  publicSummary.publicId = publicId;

  const persisted = await persistSoftwareAppraisal({
    publicId,
    userId: input.userId,
    projectId: workspace.project.id,
    publicSummary,
    privateReport,
  });

  return withUrls(persisted);
}

export async function listSoftwareAppraisals(input: { userId: string; projectId?: string | null; limit?: number }) {
  const limit = Math.max(1, Math.min(50, Math.round(input.limit || 20)));
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<SoftwareAppraisalRow[]>(
      `SELECT "id", "publicId", "projectId", "userId", "appName", "status", "grade", "launchVerdict", "readinessScore", "technicalRiskScore",
          "transferReadinessScore", "repairCostLow", "repairCostHigh", "valueLow", "valueHigh", "badgeState", "publicSummary",
          NULL AS "privateReport", "sourceScanId", "sourceScanRefId", "monitoredUntil", "expiresAt", "createdAt", "updatedAt"
       FROM "software_appraisals"
       WHERE "userId" = $1 AND ($2::text IS NULL OR "projectId" = $2)
       ORDER BY "createdAt" DESC
       LIMIT $3`,
      input.userId,
      input.projectId?.trim() || null,
      limit,
    ),
  );
  return (rows || []).map((row) => withUrls(rowToAppraisal(row, false)));
}

export async function loadPrivateSoftwareAppraisal(idOrPublicId: string, userId: string) {
  const cleanId = idOrPublicId.trim();
  if (!cleanId) return null;

  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<SoftwareAppraisalRow[]>(
      `SELECT "id", "publicId", "projectId", "userId", "appName", "status", "grade", "launchVerdict", "readinessScore", "technicalRiskScore",
          "transferReadinessScore", "repairCostLow", "repairCostHigh", "valueLow", "valueHigh", "badgeState", "publicSummary",
          "privateReport", "sourceScanId", "sourceScanRefId", "monitoredUntil", "expiresAt", "createdAt", "updatedAt"
       FROM "software_appraisals"
       WHERE ("id" = $1 OR "publicId" = $1) AND "userId" = $2
       LIMIT 1`,
      cleanId,
      userId,
    ),
  );
  const row = rows?.[0];
  return row ? withUrls(rowToAppraisal(row, true)) : null;
}

export async function loadPublicSoftwareAppraisal(publicId: string) {
  const cleanId = publicId.trim();
  if (!cleanId) return null;

  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<SoftwareAppraisalRow[]>(
      `SELECT "id", "publicId", "projectId", "userId", "appName", "status", "grade", "launchVerdict", "readinessScore", "technicalRiskScore",
          "transferReadinessScore", "repairCostLow", "repairCostHigh", "valueLow", "valueHigh", "badgeState", "publicSummary",
          NULL AS "privateReport", "sourceScanId", "sourceScanRefId", "monitoredUntil", "expiresAt", "createdAt", "updatedAt"
       FROM "software_appraisals"
       WHERE "publicId" = $1 AND "status" = 'active'
       LIMIT 1`,
      cleanId,
    ),
  );
  const row = rows?.[0];
  return row ? withUrls(rowToAppraisal(row, false)) : null;
}

async function persistSoftwareAppraisal(input: {
  publicId: string;
  userId: string;
  projectId: string;
  publicSummary: AppraisalPublicSummary;
  privateReport: AppraisalPrivateReport;
}) {
  const id = randomUUID();
  const evidenceRef = {
    engine: input.privateReport.engine,
    source: input.privateReport.source,
    evidenceCount: input.privateReport.evidence.length,
    generatedAt: input.privateReport.generatedAt,
  };

  const row = await tryDatabase(async (db) => {
    const rows = await db.$queryRawUnsafe<SoftwareAppraisalRow[]>(
      `INSERT INTO "software_appraisals" (
          "id", "publicId", "projectId", "userId", "appName", "status", "grade", "launchVerdict", "readinessScore",
          "technicalRiskScore", "transferReadinessScore", "repairCostLow", "repairCostHigh", "valueLow", "valueHigh",
          "badgeState", "publicSummary", "privateReport", "evidenceRef", "sourceScanId", "sourceScanRefId", "expiresAt"
       )
       VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17::jsonb, $18::jsonb, $19, $20, $21)
       RETURNING "id", "publicId", "projectId", "userId", "appName", "status", "grade", "launchVerdict", "readinessScore", "technicalRiskScore",
          "transferReadinessScore", "repairCostLow", "repairCostHigh", "valueLow", "valueHigh", "badgeState", "publicSummary",
          "privateReport", "sourceScanId", "sourceScanRefId", "monitoredUntil", "expiresAt", "createdAt", "updatedAt"`,
      id,
      input.publicId,
      input.projectId,
      input.userId,
      input.publicSummary.appName,
      input.publicSummary.grade,
      input.publicSummary.launchVerdict,
      input.publicSummary.readinessScore,
      input.publicSummary.technicalRiskScore,
      input.publicSummary.transferReadinessScore,
      input.publicSummary.repairCost.low,
      input.publicSummary.repairCost.high,
      input.publicSummary.technicalValue.low,
      input.publicSummary.technicalValue.high,
      input.publicSummary.badgeState,
      JSON.stringify(sanitizePublicSummary(input.publicSummary)),
      JSON.stringify(sanitizeMetadata(input.privateReport as unknown as Record<string, unknown>)),
      JSON.stringify(sanitizeMetadata(evidenceRef)),
      input.privateReport.source.latestScanId || null,
      input.privateReport.source.latestScanRefId || null,
      input.publicSummary.expiresAt ? new Date(input.publicSummary.expiresAt) : null,
    );
    return rows[0] || null;
  });

  if (!row) throw new Error("DATABASE_UNAVAILABLE");
  return rowToAppraisal(row, true);
}

function rowToAppraisal(row: SoftwareAppraisalRow, includePrivateReport: boolean): SoftwareAppraisal {
  const publicSummary = normalizePublicSummary(row.publicSummary, row);
  return {
    id: row.id,
    publicId: row.publicId,
    projectId: row.projectId,
    userId: row.userId,
    appName: row.appName,
    status: row.status,
    grade: publicSummary.grade,
    launchVerdict: publicSummary.launchVerdict,
    readinessScore: numberValue(row.readinessScore),
    technicalRiskScore: numberValue(row.technicalRiskScore),
    transferReadinessScore: numberValue(row.transferReadinessScore),
    repairCost: publicSummary.repairCost,
    technicalValue: publicSummary.technicalValue,
    badgeState: publicSummary.badgeState,
    publicSummary,
    privateReport: includePrivateReport ? normalizePrivateReport(row.privateReport) : undefined,
    sourceScanId: row.sourceScanId,
    sourceScanRefId: row.sourceScanRefId,
    monitoredUntil: isoDateOrNull(row.monitoredUntil),
    expiresAt: isoDateOrNull(row.expiresAt),
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
  };
}

function withUrls<T extends SoftwareAppraisal>(appraisal: T) {
  const urls = buildAppraisalUrls(appraisal.publicId);
  return {
    ...appraisal,
    appraisalUrl: urls.appraisalUrl,
    certificateUrl: urls.certificateUrl,
    badgeUrl: urls.badgeUrl,
    badgeEmbedHtml: buildBadgeEmbed(appraisal.publicSummary),
  };
}

function normalizePublicSummary(value: unknown, row: SoftwareAppraisalRow): AppraisalPublicSummary {
  const record = objectValue(value);
  const coverage = normalizeEvidenceCoverage(record.evidenceCoverage, row);
  const fallbackLanguage = fallbackReportLanguage(coverage);
  return {
    publicId: stringValue(record.publicId) || row.publicId,
    appName: stringValue(record.appName) || row.appName,
    grade: (stringValue(record.grade) || row.grade) as AppraisalPublicSummary["grade"],
    launchVerdict: (stringValue(record.launchVerdict) || row.launchVerdict) as AppraisalPublicSummary["launchVerdict"],
    badgeState: (stringValue(record.badgeState) || row.badgeState) as AppraisalPublicSummary["badgeState"],
    readinessScore: numberValue(row.readinessScore),
    technicalRiskScore: numberValue(row.technicalRiskScore),
    transferReadinessScore: numberValue(row.transferReadinessScore),
    repairCost: moneyRange(row.repairCostLow, row.repairCostHigh, stringValue(objectValue(record.repairCost).basis), booleanOrUndefined(objectValue(record.repairCost).available)),
    technicalValue: moneyRange(row.valueLow, row.valueHigh, stringValue(objectValue(record.technicalValue).basis), booleanOrUndefined(objectValue(record.technicalValue).available)),
    topRisks: Array.isArray(record.topRisks) ? record.topRisks.slice(0, 3) as AppraisalPublicSummary["topRisks"] : [],
    conditions: Array.isArray(record.conditions) ? record.conditions.map(stringValue).map(neutralizeReportText).filter(Boolean).slice(0, 3) : [],
    evidenceSources: normalizeEvidenceSources(record.evidenceSources),
    evidenceCoverage: coverage,
    sbom: normalizeSbom(record.sbom),
    unknowns: Array.isArray(record.unknowns) ? record.unknowns.map(stringValue).map(neutralizeReportText).filter(Boolean).slice(0, 5) : [],
    unverifiedClaims: Array.isArray(record.unverifiedClaims) ? record.unverifiedClaims.map(stringValue).map(neutralizeReportText).filter(Boolean).slice(0, 5) : [],
    authorityBoundaries: arrayOfObjects<AppraisalAuthorityBoundary>(record.authorityBoundaries, fallbackLanguage.boundaries),
    observedClaims: arrayOfObjects<AppraisalReportClaim>(record.observedClaims, fallbackLanguage.claims.observed),
    inferredClaims: arrayOfObjects<AppraisalReportClaim>(record.inferredClaims, fallbackLanguage.claims.inferred),
    notVerifiedClaims: arrayOfObjects<AppraisalReportClaim>(record.notVerifiedClaims, fallbackLanguage.claims.notVerified),
    trend: (stringValue(record.trend) || "stable") as AppraisalPublicSummary["trend"],
    generatedAt: stringValue(record.generatedAt) || isoDate(row.createdAt),
    expiresAt: stringValue(record.expiresAt) || isoDateOrNull(row.expiresAt),
    disclaimer: stringValue(record.disclaimer) || "VentureOS reports observations and computed readiness estimates from submitted evidence, stored scan metadata, signed records, and configured external sources. It is not an independent audit, legal opinion, accounting opinion, compliance certification, or market valuation.",
  };
}

function normalizeSbom(value: unknown): AppraisalPublicSummary["sbom"] {
  const record = objectValue(value);
  return record.engine === "ventureos-built-in-sbom" ? record as AppraisalPublicSummary["sbom"] : null;
}

function normalizePrivateReport(value: unknown): AppraisalPrivateReport | undefined {
  const record = objectValue(value);
  if (record.engine !== "ventureos-software-appraisal") return undefined;
  const coverage = normalizeEvidenceCoverage(objectValue(record.scoreBreakdown).evidenceCoverage, legacyRowForCoverage());
  const fallbackLanguage = fallbackReportLanguage(coverage);
  return {
    ...record,
    authorityBoundaries: arrayOfObjects<AppraisalAuthorityBoundary>(record.authorityBoundaries, fallbackLanguage.boundaries),
    observedClaims: arrayOfObjects<AppraisalReportClaim>(record.observedClaims, fallbackLanguage.claims.observed),
    inferredClaims: arrayOfObjects<AppraisalReportClaim>(record.inferredClaims, fallbackLanguage.claims.inferred),
    notVerifiedClaims: arrayOfObjects<AppraisalReportClaim>(record.notVerifiedClaims, fallbackLanguage.claims.notVerified),
  } as AppraisalPrivateReport;
}

function sanitizePublicSummary(summary: AppraisalPublicSummary) {
  return sanitizeMetadata({
    ...summary,
    topRisks: summary.topRisks.map((risk) => ({
      id: risk.id,
      title: risk.title,
      severity: risk.severity,
      category: risk.category,
      confidence: risk.confidence,
      fixImpact: risk.fixImpact,
      publicSummary: risk.publicSummary,
    })),
  });
}

function normalizeEvidenceSources(value: unknown): AppraisalPublicSummary["evidenceSources"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item) => ({
      id: stringValue(item.id) || "unknown",
      label: stringValue(item.label) || stringValue(item.id) || "External source",
      status: stringValue(item.status) || "unknown",
      evidence: stringValue(item.evidence) || "No source evidence recorded.",
      checkedAt: stringValue(item.checkedAt) || undefined,
    }))
    .slice(0, 12);
}

function normalizeEvidenceCoverage(value: unknown, row: SoftwareAppraisalRow): AppraisalPublicSummary["evidenceCoverage"] {
  const record = objectValue(value);
  const level = stringValue(record.level);
  const scope = stringValue(record.scope);
  const score = numberValue(record.score as number | bigint | null | undefined);
  const scoreCap = numberValue(record.scoreCap as number | bigint | null | undefined) || numberValue(row.readinessScore);
  return {
    score: score || 50,
    level: level === "strong" || level === "moderate" || level === "limited" ? level : "limited",
    scope: scope === "full_repository" || scope === "repository_linked" || scope === "partial_submission" || scope === "stored_scan_only" ? scope : "stored_scan_only",
    scoreCap: scoreCap || 75,
    scoreCapped: typeof record.scoreCapped === "boolean" ? record.scoreCapped : false,
    reasons: arrayOfStrings(record.reasons, ["This appraisal predates evidence coverage scoring."]),
    verifiedClaims: arrayOfStrings(record.verifiedClaims, ["Stored appraisal data is available."]),
    unverifiedClaims: arrayOfStrings(record.unverifiedClaims, ["Evidence coverage was not recorded for this appraisal."]),
    unknowns: arrayOfStrings(record.unknowns, ["Run a new appraisal to attach scope, coverage, and unknowns."]),
  };
}

function createPublicAppraisalId() {
  return `vos-${randomUUID().replace(/-/g, "").slice(0, 14)}`;
}

function moneyRange(lowValue: number | bigint, highValue: number | bigint, basis?: string, available?: boolean): AppraisalMoneyRange {
  const low = numberValue(lowValue);
  const high = Math.max(low, numberValue(highValue));
  return {
    low,
    high,
    currency: "USD",
    label: available === false ? "Not verified" : `$${formatMoney(low)}-$${formatMoney(high)}`,
    available,
    basis: basis || "Generated from VentureOS appraisal scoring inputs.",
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return objectValue(JSON.parse(value) as unknown);
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function arrayOfStrings(value: unknown, fallback: string[]) {
  if (Array.isArray(value)) return value.map(stringValue).map(neutralizeReportText).filter(Boolean).slice(0, 5);
  return fallback.map(neutralizeReportText);
}

function arrayOfObjects<T>(value: unknown, fallback: T[]): T[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") as T[] : fallback;
}

function fallbackReportLanguage(coverage: AppraisalPublicSummary["evidenceCoverage"]) {
  return buildReportLanguageContract({ coverage, evidence: [], verdict: "RISKY" });
}

function legacyRowForCoverage(): SoftwareAppraisalRow {
  return {
    id: "",
    publicId: "",
    projectId: null,
    userId: "",
    appName: "",
    status: "active",
    grade: "C",
    launchVerdict: "RISKY",
    readinessScore: 0,
    technicalRiskScore: 0,
    transferReadinessScore: 0,
    repairCostLow: 0,
    repairCostHigh: 0,
    valueLow: 0,
    valueHigh: 0,
    badgeState: "VENTUREOS_APPRAISED",
    publicSummary: {},
    sourceScanId: null,
    sourceScanRefId: null,
    monitoredUntil: null,
    expiresAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function booleanOrUndefined(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function numberValue(value: number | bigint | null | undefined) {
  return typeof value === "bigint" ? Number(value) : Math.round(Number(value || 0));
}

function isoDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function isoDateOrNull(value: Date | string | null) {
  return value ? isoDate(value) : null;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}
