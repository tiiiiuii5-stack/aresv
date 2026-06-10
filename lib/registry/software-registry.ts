import { tryDatabase } from "@/lib/prisma";
import { looksLikeVentureOSId, ventureOsIdForAsset } from "@/lib/registry/asset-id";

export type RegistryAssetStatus = "VERIFIED" | "APPRAISED" | "EXPIRED" | "REVOKED" | "SUPERSEDED";

export type RegistryAsset = {
  ventureOsId: string;
  publicAssetId: string;
  projectId: string | null;
  appraisalId: string | null;
  appraisalPublicId: string;
  certificateId: string | null;
  name: string;
  company: string | null;
  repository: string | null;
  domain: string | null;
  status: RegistryAssetStatus;
  trustRating: string;
  trustScore: number;
  readinessScore: number;
  evidenceCoverage: number;
  evidenceCoverageLevel: string;
  lastScan: string | null;
  lastVerification: string;
  appraisalUrl: string;
  certificateUrl: string | null;
  passportUrl: string;
  publicVerificationUrl: string;
};

export type RegistrySearchResult = {
  query: string;
  count: number;
  assets: RegistryAsset[];
  searchedBy: string[];
};

export type PassportTimelineItem = {
  id: string;
  type: "APPRAISAL" | "CERTIFICATE";
  timestamp: string;
  label: string;
  trustRating: string;
  readinessScore: number;
  evidenceCoverage: number;
  status: RegistryAssetStatus;
  href: string;
};

export type VentureOSPassport = {
  asset: RegistryAsset;
  timeline: PassportTimelineItem[];
  improvement: {
    firstScore: number;
    latestScore: number;
    delta: number;
    direction: "IMPROVING" | "DECLINING" | "STABLE";
  };
};

type RegistryRow = {
  appraisalId: string;
  publicId: string;
  projectId: string | null;
  appName: string;
  grade: string;
  launchVerdict: string;
  readinessScore: number | bigint;
  publicSummary: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
  certificateId: string | null;
  certificateStatus: string | null;
  certificateIssuedAt: Date | string | null;
  lastScanAt: Date | string | null;
  projectPrompt: string | null;
  repositoryLink: string | null;
  repositoryUrl: string | null;
  githubFullName: string | null;
};

const DEFAULT_SEARCH_LIMIT = 24;
const MAX_PREFILTER_LIMIT = 400;

export async function searchVentureOSRegistry(input: { query?: string; limit?: number }): Promise<RegistrySearchResult> {
  const query = cleanQuery(input.query);
  const limit = boundedLimit(input.limit);
  const rows = await loadRegistryRows({ query: looksLikeVentureOSId(query) ? "" : query, limit: query ? MAX_PREFILTER_LIMIT : limit });
  const realAssets = dedupeRegistryAssets(rows.map(rowToRegistryAsset));
  const assets = !query && realAssets.length === 0 ? fallbackRegistryAssets() : realAssets;
  const filtered = query ? assets.filter((asset) => assetMatchesQuery(asset, query)).slice(0, limit) : assets.slice(0, limit);

  return {
    query,
    count: filtered.length,
    assets: filtered,
    searchedBy: ["VentureOS ID", "Certificate ID", "Company/app name", "Repository", "Domain"],
  };
}

function fallbackRegistryAssets(): RegistryAsset[] {
  const verifiedAt = "2026-06-10T00:00:00.000Z";
  return [
    {
      ventureOsId: "VOS-SAMPLE-ARES",
      publicAssetId: "sample-aresv",
      projectId: null,
      appraisalId: null,
      appraisalPublicId: "sample-aresv",
      certificateId: null,
      name: "Aresv Repository Review",
      company: "VentureOS Sample",
      repository: "tiiiiuii5-stack/aresv",
      domain: null,
      status: "APPRAISED",
      trustRating: "B+",
      trustScore: 84,
      readinessScore: 84,
      evidenceCoverage: 72,
      evidenceCoverageLevel: "sample",
      lastScan: verifiedAt,
      lastVerification: verifiedAt,
      appraisalUrl: "/sample-appraisal",
      certificateUrl: null,
      passportUrl: "/sample-appraisal",
      publicVerificationUrl: "/sample-appraisal",
    },
    {
      ventureOsId: "VOS-SAMPLE-PASSPORT",
      publicAssetId: "sample-passport",
      projectId: null,
      appraisalId: null,
      appraisalPublicId: "sample-passport",
      certificateId: "vos-cert-8b3bcecc6de64fe6",
      name: "VentureOS Software Passport",
      company: "VentureOS Sample",
      repository: null,
      domain: "ventureos-full-fixed.vercel.app",
      status: "VERIFIED",
      trustRating: "A-",
      trustScore: 89,
      readinessScore: 89,
      evidenceCoverage: 86,
      evidenceCoverageLevel: "sample",
      lastScan: verifiedAt,
      lastVerification: verifiedAt,
      appraisalUrl: "/sample-appraisal",
      certificateUrl: "/certificate/vos-cert-8b3bcecc6de64fe6",
      passportUrl: "/sample-appraisal",
      publicVerificationUrl: "/certificate/vos-cert-8b3bcecc6de64fe6",
    },
    {
      ventureOsId: "VOS-SAMPLE-BUYER",
      publicAssetId: "sample-buyer-ready",
      projectId: null,
      appraisalId: null,
      appraisalPublicId: "sample-buyer-ready",
      certificateId: null,
      name: "Buyer-Ready Report Sample",
      company: "VentureOS Sample",
      repository: null,
      domain: null,
      status: "APPRAISED",
      trustRating: "B",
      trustScore: 78,
      readinessScore: 78,
      evidenceCoverage: 68,
      evidenceCoverageLevel: "sample",
      lastScan: verifiedAt,
      lastVerification: verifiedAt,
      appraisalUrl: "/sample-report",
      certificateUrl: null,
      passportUrl: "/sample-report",
      publicVerificationUrl: "/sample-report",
    },
  ];
}

export async function loadVentureOSPassport(identifier: string): Promise<VentureOSPassport | null> {
  const clean = cleanQuery(identifier);
  if (!clean) return null;

  const rows = await loadRegistryRows({ query: looksLikeVentureOSId(clean) ? "" : clean, limit: MAX_PREFILTER_LIMIT });
  const current = dedupeRegistryAssets(rows.map(rowToRegistryAsset)).find((asset) => assetMatchesQuery(asset, clean));
  if (!current) return null;

  const historyRows = current.publicAssetId
    ? await loadHistoryRows({ projectId: rows.find((row) => row.publicId === current.publicAssetId)?.projectId || null, appName: current.name })
    : rows;
  const timeline = historyRows
    .map(rowToRegistryAsset)
    .flatMap((asset) => timelineItemsForAsset(asset))
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
  const scores = timeline.map((item) => item.readinessScore).filter((score) => Number.isFinite(score));
  const firstScore = scores[0] ?? current.readinessScore;
  const latestScore = scores[scores.length - 1] ?? current.readinessScore;
  const delta = latestScore - firstScore;

  return {
    asset: current,
    timeline,
    improvement: {
      firstScore,
      latestScore,
      delta,
      direction: delta > 2 ? "IMPROVING" : delta < -2 ? "DECLINING" : "STABLE",
    },
  };
}

async function loadRegistryRows(input: { query: string; limit: number }) {
  const like = `%${input.query}%`;
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<RegistryRow[]>(
      `SELECT a."publicId", a."projectId", a."appName", a."grade", a."launchVerdict", a."readinessScore",
          a."id" AS "appraisalId",
          a."publicSummary", a."createdAt", a."updatedAt",
          cert."certificateId", cert."certificateStatus", cert."certificateIssuedAt",
          scan."lastScanAt",
          p."prompt" AS "projectPrompt",
          repo."repository" AS "repositoryLink", repo."url" AS "repositoryUrl",
          gh."fullName" AS "githubFullName"
       FROM "software_appraisals" a
       LEFT JOIN LATERAL (
         SELECT c."certificateId", c."status" AS "certificateStatus", c."issuedAt" AS "certificateIssuedAt"
         FROM "software_certificates" c
         WHERE c."appraisalPublicId" = a."publicId" OR c."appraisalId" = a."id"
         ORDER BY c."issuedAt" DESC
         LIMIT 1
       ) cert ON TRUE
       LEFT JOIN "projects" p ON p."id" = a."projectId"
       LEFT JOIN LATERAL (
         SELECT h."scannedAt" AS "lastScanAt"
         FROM "project_scan_history" h
         WHERE h."projectId" = a."projectId"
         ORDER BY h."scannedAt" DESC
         LIMIT 1
       ) scan ON TRUE
       LEFT JOIN LATERAL (
         SELECT prl."repository", prl."url"
         FROM "project_repository_links" prl
         WHERE prl."projectId" = a."projectId"
         ORDER BY prl."updatedAt" DESC
         LIMIT 1
       ) repo ON TRUE
       LEFT JOIN LATERAL (
         SELECT gr."fullName"
         FROM "github_repositories" gr
         WHERE gr."projectId" = a."projectId"
         ORDER BY gr."updatedAt" DESC
         LIMIT 1
       ) gh ON TRUE
       WHERE a."status" = 'active'
         AND ($1 = ''
          OR a."publicId" ILIKE $2
          OR a."appName" ILIKE $2
          OR cert."certificateId" ILIKE $2
          OR p."prompt" ILIKE $2
          OR repo."repository" ILIKE $2
          OR repo."url" ILIKE $2
          OR gh."fullName" ILIKE $2)
       ORDER BY a."createdAt" DESC
       LIMIT $3`,
      input.query,
      like,
      input.limit,
    ),
  );
  return rows || [];
}

async function loadHistoryRows(input: { projectId: string | null; appName: string }) {
  if (!input.projectId) return loadRegistryRows({ query: input.appName, limit: MAX_PREFILTER_LIMIT });
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<RegistryRow[]>(
      `SELECT a."publicId", a."projectId", a."appName", a."grade", a."launchVerdict", a."readinessScore",
          a."id" AS "appraisalId",
          a."publicSummary", a."createdAt", a."updatedAt",
          cert."certificateId", cert."certificateStatus", cert."certificateIssuedAt",
          scan."lastScanAt",
          p."prompt" AS "projectPrompt",
          repo."repository" AS "repositoryLink", repo."url" AS "repositoryUrl",
          gh."fullName" AS "githubFullName"
       FROM "software_appraisals" a
       LEFT JOIN LATERAL (
         SELECT c."certificateId", c."status" AS "certificateStatus", c."issuedAt" AS "certificateIssuedAt"
         FROM "software_certificates" c
         WHERE c."appraisalPublicId" = a."publicId" OR c."appraisalId" = a."id"
         ORDER BY c."issuedAt" DESC
         LIMIT 1
       ) cert ON TRUE
       LEFT JOIN "projects" p ON p."id" = a."projectId"
       LEFT JOIN LATERAL (
         SELECT h."scannedAt" AS "lastScanAt"
         FROM "project_scan_history" h
         WHERE h."projectId" = a."projectId"
         ORDER BY h."scannedAt" DESC
         LIMIT 1
       ) scan ON TRUE
       LEFT JOIN LATERAL (
         SELECT prl."repository", prl."url"
         FROM "project_repository_links" prl
         WHERE prl."projectId" = a."projectId"
         ORDER BY prl."updatedAt" DESC
         LIMIT 1
       ) repo ON TRUE
       LEFT JOIN LATERAL (
         SELECT gr."fullName"
         FROM "github_repositories" gr
         WHERE gr."projectId" = a."projectId"
         ORDER BY gr."updatedAt" DESC
         LIMIT 1
       ) gh ON TRUE
       WHERE a."status" = 'active' AND a."projectId" = $1
       ORDER BY a."createdAt" ASC
       LIMIT $2`,
      input.projectId,
      MAX_PREFILTER_LIMIT,
    ),
  );
  return rows || [];
}

function rowToRegistryAsset(row: RegistryRow): RegistryAsset {
  const summary = objectValue(row.publicSummary);
  const coverage = objectValue(summary.evidenceCoverage);
  const createdAt = isoDate(row.createdAt);
  const lastVerification = row.certificateIssuedAt ? isoDate(row.certificateIssuedAt) : createdAt;
  const repository = cleanRepository(row.repositoryLink || row.githubFullName || extractRepository(row.projectPrompt || ""));
  const domain = extractDomain(row.repositoryUrl || row.projectPrompt || "");
  const publicAssetId = stringValue(summary.publicId) || row.publicId;

  return {
    ventureOsId: ventureOsIdForAsset({ publicAssetId, createdAt }),
    publicAssetId,
    projectId: row.projectId,
    appraisalId: row.appraisalId,
    appraisalPublicId: row.publicId,
    certificateId: row.certificateId,
    name: stringValue(summary.appName) || row.appName,
    company: companyFromName(row.appName),
    repository,
    domain,
    status: statusFor(row.certificateStatus),
    trustRating: stringValue(summary.grade) || row.grade,
    trustScore: publicTrustScore(row, summary),
    readinessScore: publicTrustScore(row, summary),
    evidenceCoverage: numberValue(coverage.score as number | bigint | null | undefined) || 50,
    evidenceCoverageLevel: stringValue(coverage.level) || "limited",
    lastScan: row.lastScanAt ? isoDate(row.lastScanAt) : null,
    lastVerification,
    appraisalUrl: `/appraisal/${encodeURIComponent(row.publicId)}`,
    certificateUrl: row.certificateId ? `/certificate/${encodeURIComponent(row.certificateId)}` : null,
    passportUrl: `/passport/${encodeURIComponent(ventureOsIdForAsset({ publicAssetId, createdAt }))}`,
    publicVerificationUrl: row.certificateId ? `/certificate/${encodeURIComponent(row.certificateId)}` : `/appraisal/${encodeURIComponent(row.publicId)}`,
  };
}

function timelineItemsForAsset(asset: RegistryAsset): PassportTimelineItem[] {
  const items: PassportTimelineItem[] = [
    {
      id: `appraisal:${asset.appraisalPublicId}`,
      type: "APPRAISAL",
      timestamp: asset.lastVerification,
      label: `Trust Rating ${asset.trustRating}`,
      trustRating: asset.trustRating,
      readinessScore: asset.readinessScore,
      evidenceCoverage: asset.evidenceCoverage,
      status: asset.status,
      href: asset.appraisalUrl,
    },
  ];
  if (asset.certificateId && asset.certificateUrl) {
    items.push({
      id: `certificate:${asset.certificateId}`,
      type: "CERTIFICATE",
      timestamp: asset.lastVerification,
      label: `Certificate ${asset.certificateId}`,
      trustRating: asset.trustRating,
      readinessScore: asset.readinessScore,
      evidenceCoverage: asset.evidenceCoverage,
      status: asset.status,
      href: asset.certificateUrl,
    });
  }
  return items;
}

function assetMatchesQuery(asset: RegistryAsset, query: string) {
  const clean = query.toLowerCase();
  return [
    asset.ventureOsId,
    asset.publicAssetId,
    asset.appraisalPublicId,
    asset.certificateId,
    asset.name,
    asset.company,
    asset.repository,
    asset.domain,
  ].some((value) => String(value || "").toLowerCase().includes(clean));
}

function dedupeRegistryAssets(assets: RegistryAsset[]) {
  const byKey = new Map<string, RegistryAsset>();
  for (const asset of assets) {
    const key = [
      asset.repository?.toLowerCase(),
      asset.domain?.toLowerCase(),
      asset.name.toLowerCase().replace(/\s+\d+$/g, "").replace(/[^a-z0-9]+/g, "-"),
    ].filter(Boolean).join(":");
    const existing = byKey.get(key);
    if (!existing || betterRegistryAsset(asset, existing)) byKey.set(key, asset);
  }
  return [...byKey.values()].sort((left, right) => new Date(right.lastVerification).getTime() - new Date(left.lastVerification).getTime());
}

function betterRegistryAsset(candidate: RegistryAsset, existing: RegistryAsset) {
  if (candidate.certificateId && !existing.certificateId) return true;
  if (!candidate.certificateId && existing.certificateId) return false;
  if (candidate.trustScore !== existing.trustScore) return candidate.trustScore > existing.trustScore;
  return new Date(candidate.lastVerification).getTime() > new Date(existing.lastVerification).getTime();
}

function statusFor(status: string | null): RegistryAssetStatus {
  if (status === "ACTIVE") return "VERIFIED";
  if (status === "EXPIRED") return "EXPIRED";
  if (status === "REVOKED") return "REVOKED";
  if (status === "SUPERSEDED") return "SUPERSEDED";
  return "APPRAISED";
}

function cleanRepository(value: string) {
  const clean = value.trim().replace(/^https:\/\/github\.com\//i, "").replace(/\/+$/, "");
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/.test(clean) ? clean.split("/").slice(0, 2).join("/") : null;
}

function extractRepository(value: string) {
  const match = value.match(/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/i);
  return match?.[1] || "";
}

function extractDomain(value: string) {
  const matches = [...value.matchAll(/https?:\/\/([^/\s"'`]+)/gi)];
  const host = matches.find((match) => !/github\.com$/i.test(match[1]))?.[1] || "";
  return host.replace(/^www\./i, "") || null;
}

function companyFromName(value: string) {
  const clean = value.trim();
  if (!clean) return null;
  return clean.split(/[-|:]/)[0]?.trim().slice(0, 90) || clean.slice(0, 90);
}

function cleanQuery(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 160);
}

function boundedLimit(value: unknown) {
  const number = Math.round(Number(value || DEFAULT_SEARCH_LIMIT));
  return Math.max(1, Math.min(50, Number.isFinite(number) ? number : DEFAULT_SEARCH_LIMIT));
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

function numberValue(value: number | bigint | null | undefined) {
  const number = typeof value === "bigint" ? Number(value) : Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function publicTrustScore(row: RegistryRow, summary: Record<string, unknown>) {
  const raw = numberValue(row.readinessScore);
  if (raw > 0) return raw;
  const summaryScore = numberValue(summary.readinessScore as number | bigint | null | undefined);
  if (summaryScore > 0) return summaryScore;
  const qualityScore = numberValue(summary.qualityScore as number | bigint | null | undefined);
  const safetyScore = numberValue(summary.safetyScore as number | bigint | null | undefined);
  if (qualityScore > 0 || safetyScore > 0) return Math.round((qualityScore + safetyScore) / [qualityScore, safetyScore].filter(Boolean).length);
  return 0;
}

function isoDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}
