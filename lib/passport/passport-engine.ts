import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

import { tryDatabase } from "@/lib/prisma";
import { buildRegistryItem } from "@/lib/registry/registry-pipeline";
import { searchVentureOSRegistry, type RegistryAsset } from "@/lib/registry/software-registry";

export type PassportSourceType = "github" | "upload" | "url" | "built";
export type EvidenceType = "ci" | "commit" | "runtime" | "config" | "scan" | "build_event";
export type EvidenceCategory = "quality" | "safety" | "identity";
export type EvidenceConfidence = "low" | "medium" | "high";
export type PassportStatus = "unverified" | "verified" | "high_risk";
export type CertificateSealType = "quality_verified" | "safety_verified" | "production_ready" | "ownership_verified";

export type SoftwareIdentity = {
  id: string;
  name: string;
  owner: string;
  sourceType: PassportSourceType;
  sourceUrl: string;
  createdAt: string;
};

export type PassportEvidence = {
  id: string;
  passportId: string;
  type: EvidenceType;
  category: EvidenceCategory;
  description: string;
  rawData: Record<string, unknown>;
  confidence: EvidenceConfidence;
  timestamp: string;
};

export type PassportCertificate = {
  id: string;
  passportId: string;
  type: CertificateSealType;
  issuedAt: string;
  expiresAt: string | null;
  signatureHash: string;
};

export type TrustEvent = {
  id: string;
  passportId: string;
  eventType: string;
  deltaScore: number;
  reason: string;
  timestamp: string;
};

export type SoftwarePassportRecord = {
  passportId: string;
  softwareIdentity: SoftwareIdentity;
  trustScore: number;
  qualityScore: number;
  safetyScore: number;
  status: PassportStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  verdict: "verified" | "caution" | "high_risk";
  summaries: {
    trust: string;
    quality: string;
    safety: string;
    recommendedUse: string;
  };
  scores: {
    quality: {
      buildQuality: number;
      reliability: number;
      maintainability: number;
      operationalMaturity: number;
    };
    safety: {
      identitySafety: number;
      accessSafety: number;
      dataSafety: number;
      integrationSafety: number;
      deploymentSafety: number;
    };
  };
  evidence: PassportEvidence[];
  certificates: PassportCertificate[];
  timeline: TrustEvent[];
  riskFlags: string[];
  links: {
    passport: string;
    registry: string;
    verification: string;
  };
};

type StoredPassportPayload = {
  passportId: string;
  source: {
    type: PassportSourceType;
    url: string;
    name: string;
    owner: string;
  };
  createdAt: string;
  updatedAt: string;
  scan?: {
    qualityScore: number;
    safetyScore: number;
    evidence: PassportEvidence[];
    riskFlags: string[];
    scannedAt: string;
  };
  certificates?: PassportCertificate[];
  timeline?: TrustEvent[];
};

export async function createPassport(input: { source: unknown; sourceType?: unknown; name?: unknown; owner?: unknown }) {
  const sourceUrl = cleanText(input.source, 260);
  if (!sourceUrl) throw new Error("source is required.");
  const sourceType = sourceTypeFor(input.sourceType, sourceUrl);
  const name = cleanText(input.name, 120) || nameFromSource(sourceUrl);
  const owner = cleanText(input.owner, 120) || ownerFromSource(sourceUrl);
  const now = new Date().toISOString();
  const passportId = passportIdFor(sourceUrl);
  const payload: StoredPassportPayload = {
    passportId,
    source: { type: sourceType, url: sourceUrl, name, owner },
    createdAt: now,
    updatedAt: now,
    timeline: [trustEvent(passportId, "passport.created", 0, "Software identity record initialized.", now)],
  };

  await persistPassportPayload(payload, "passport.created");
  return materializeStoredPassport(payload);
}

export async function runScanner(passportId: string) {
  const existing = await loadPassport(passportId);
  if (!existing) throw new Error("PASSPORT_NOT_FOUND");
  const now = new Date().toISOString();
  const source = existing.softwareIdentity.sourceUrl;
  const quality = computeQualitySignals(source, existing);
  const safety = computeSafetySignals(source, existing);
  const evidence = [...quality.evidence, ...safety.evidence, identityEvidence(existing)];
  const riskFlags = [...quality.riskFlags, ...safety.riskFlags];
  const previousTrust = existing.trustScore;
  const qualityScore = scoreAverage(Object.values(quality.scores));
  const safetyScore = scoreAverage(Object.values(safety.scores));
  const trustScore = scoreAverage([qualityScore, safetyScore]);
  const payload = await loadStoredPayload(passportId);

  if (payload) {
    const next: StoredPassportPayload = {
      ...payload,
      updatedAt: now,
      scan: { qualityScore, safetyScore, evidence, riskFlags, scannedAt: now },
      timeline: [
        ...(payload.timeline || []),
        trustEvent(passportId, "passport.scanned", trustScore - previousTrust, scanReason(trustScore, previousTrust), now),
      ],
    };
    await persistPassportPayload(next, "passport.scanned");
    return materializeStoredPassport(next);
  }

  return {
    ...existing,
    qualityScore,
    safetyScore,
    trustScore,
    status: statusFor(trustScore),
    verdict: verdictFor(trustScore),
    evidence,
    riskFlags,
    timeline: [
      ...existing.timeline,
      trustEvent(passportId, "passport.scanned", trustScore - previousTrust, scanReason(trustScore, previousTrust), now),
    ],
    summaries: summariesFor({ trustScore, qualityScore, safetyScore, riskFlags }),
  } satisfies SoftwarePassportRecord;
}

export async function generateEvidence(passportId: string) {
  const passport = await loadPassport(passportId);
  if (!passport) throw new Error("PASSPORT_NOT_FOUND");
  return passport.evidence;
}

export async function computeScores(passportId: string) {
  const passport = await loadPassport(passportId);
  if (!passport) throw new Error("PASSPORT_NOT_FOUND");
  return {
    passportId: passport.passportId,
    trustScore: passport.trustScore,
    qualityScore: passport.qualityScore,
    safetyScore: passport.safetyScore,
    verdict: passport.verdict,
    interpretation: passport.summaries,
  };
}

export async function issuePassportCertificate(passportId: string, requestedType?: unknown) {
  const passport = await loadPassport(passportId);
  if (!passport) throw new Error("PASSPORT_NOT_FOUND");
  const types = certificateTypesFor(passport, requestedType);
  if (!types.length) throw new Error("CERTIFICATE_THRESHOLD_NOT_MET");
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();
  const certificates = types.map((type) => ({
    id: `seal_${hash([passportId, type, issuedAt]).slice(0, 18)}`,
    passportId,
    type,
    issuedAt,
    expiresAt,
    signatureHash: hash([passportId, type, passport.trustScore, passport.qualityScore, passport.safetyScore, issuedAt]),
  }));

  const payload = await loadStoredPayload(passportId);
  if (payload) {
    const next = {
      ...payload,
      updatedAt: issuedAt,
      certificates: mergeCertificates(payload.certificates || [], certificates),
      timeline: [
        ...(payload.timeline || []),
        trustEvent(passportId, "certificate.issued", 0, `${certificates.length} passport seal(s) issued.`, issuedAt),
      ],
    };
    await persistPassportPayload(next, "passport.certificate.issued");
    return materializeStoredPassport(next);
  }

  return { ...passport, certificates: mergeCertificates(passport.certificates, certificates) };
}

export async function updateTrustTimeline(passportId: string) {
  const passport = await loadPassport(passportId);
  if (!passport) throw new Error("PASSPORT_NOT_FOUND");
  return passport.timeline;
}

export async function loadPassport(passportId: string): Promise<SoftwarePassportRecord | null> {
  const registry = await searchVentureOSRegistry({ query: passportId, limit: 50 });
  const asset = registry.assets.find((item) => item.ventureOsId.toLowerCase() === passportId.toLowerCase() || item.publicAssetId.toLowerCase() === passportId.toLowerCase());
  if (asset) return materializeRegistryPassport(asset);
  const stored = await loadStoredPayload(passportId);
  return stored ? materializeStoredPassport(stored) : null;
}

export async function listPassports(input: { query?: string; limit?: number } = {}) {
  const registry = await searchVentureOSRegistry({ query: input.query, limit: input.limit || 24 });
  return Promise.all(registry.assets.map(materializeRegistryPassport));
}

async function materializeRegistryPassport(asset: RegistryAsset): Promise<SoftwarePassportRecord> {
  const item = await buildRegistryItem(asset);
  const qualityScore = qualityScoreForAsset(asset);
  const safetyScore = safetyScoreForAsset(asset);
  const evidence = registryEvidence(asset, item.transparencyEntries);
  const certificates = registryCertificates(asset);
  const timeline = registryTimeline(asset);
  const riskFlags = riskFlagsFor(asset, qualityScore, safetyScore);
  return {
    passportId: asset.ventureOsId,
    softwareIdentity: {
      id: `SID-${hash([asset.publicAssetId]).slice(0, 12).toUpperCase()}`,
      name: asset.name,
      owner: asset.company || "Ownership evidence limited",
      sourceType: asset.repository ? "github" : asset.domain ? "url" : "built",
      sourceUrl: asset.repository ? `https://github.com/${asset.repository}` : asset.domain ? `https://${asset.domain}` : asset.passportUrl,
      createdAt: asset.lastVerification,
    },
    trustScore: asset.trustScore,
    qualityScore,
    safetyScore,
    status: statusFor(asset.trustScore),
    version: Math.max(1, item.eventCount || 1),
    createdAt: asset.lastVerification,
    updatedAt: asset.lastVerification,
    verdict: verdictFor(asset.trustScore),
    summaries: summariesFor({ trustScore: asset.trustScore, qualityScore, safetyScore, riskFlags }),
    scores: {
      quality: qualityBreakdown(asset),
      safety: safetyBreakdown(asset),
    },
    evidence,
    certificates,
    timeline,
    riskFlags,
    links: {
      passport: asset.passportUrl,
      registry: `/registry/${encodeURIComponent(asset.ventureOsId)}`,
      verification: asset.publicVerificationUrl,
    },
  };
}

function materializeStoredPassport(payload: StoredPassportPayload): SoftwarePassportRecord {
  const baseQuality = payload.scan?.qualityScore ?? 58;
  const baseSafety = payload.scan?.safetyScore ?? 54;
  const riskFlags = payload.scan?.riskFlags ?? ["Initial passport only. Scanner evidence has not been completed."];
  const trustScore = scoreAverage([baseQuality, baseSafety]);
  const evidence = payload.scan?.evidence ?? [
    evidenceItem(payload.passportId, "build_event", "identity", "Software identity record created from submitted source.", { sourceType: payload.source.type }, "medium", payload.createdAt),
  ];
  return {
    passportId: payload.passportId,
    softwareIdentity: {
      id: `SID-${hash([payload.source.url]).slice(0, 12).toUpperCase()}`,
      name: payload.source.name,
      owner: payload.source.owner,
      sourceType: payload.source.type,
      sourceUrl: payload.source.url,
      createdAt: payload.createdAt,
    },
    trustScore,
    qualityScore: baseQuality,
    safetyScore: baseSafety,
    status: statusFor(trustScore),
    version: (payload.timeline || []).length || 1,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
    verdict: verdictFor(trustScore),
    summaries: summariesFor({ trustScore, qualityScore: baseQuality, safetyScore: baseSafety, riskFlags }),
    scores: {
      quality: {
        buildQuality: clamp(baseQuality + 4),
        reliability: clamp(baseQuality - 3),
        maintainability: clamp(baseQuality),
        operationalMaturity: clamp(baseQuality - 7),
      },
      safety: {
        identitySafety: payload.source.type === "github" || payload.source.type === "url" ? 72 : 58,
        accessSafety: clamp(baseSafety),
        dataSafety: clamp(baseSafety - 4),
        integrationSafety: clamp(baseSafety - 2),
        deploymentSafety: clamp(baseSafety - 6),
      },
    },
    evidence,
    certificates: payload.certificates || [],
    timeline: payload.timeline || [],
    riskFlags,
    links: {
      passport: `/passport/${encodeURIComponent(payload.passportId)}`,
      registry: `/registry?q=${encodeURIComponent(payload.passportId)}`,
      verification: `/passport/${encodeURIComponent(payload.passportId)}`,
    },
  };
}

async function persistPassportPayload(payload: StoredPassportPayload, event: string) {
  await tryDatabase((db) =>
    db.usageEvent.create({
      data: {
        event,
        userId: "passport-engine",
        metadata: jsonValue({
          passportEngine: true,
          passportId: payload.passportId,
          payload,
        }),
      },
    }),
  );
}

async function loadStoredPayload(passportId: string): Promise<StoredPassportPayload | null> {
  const rows = await tryDatabase((db) =>
    db.usageEvent.findMany({
      where: {
        event: { in: ["passport.created", "passport.scanned", "passport.certificate.issued"] },
        metadata: { path: ["passportId"], equals: passportId },
      },
      orderBy: { createdAt: "desc" },
      take: 1,
      select: { metadata: true },
    }),
  );
  const metadata = rows?.[0]?.metadata;
  return objectValue(metadata).payload as StoredPassportPayload | null;
}

function computeQualitySignals(source: string, passport: SoftwarePassportRecord) {
  const hasRepo = /github\.com|gitlab\.com|bitbucket\.org/i.test(source);
  const hasDeployment = /^https?:\/\//i.test(source);
  const scores = {
    buildQuality: hasRepo ? 82 : 68,
    reliability: hasDeployment ? 76 : 62,
    maintainability: hasRepo ? 78 : 60,
    operationalMaturity: passport.softwareIdentity.sourceType === "built" ? 74 : 64,
  };
  return {
    scores,
    evidence: [
      evidenceItem(passport.passportId, "scan", "quality", hasRepo ? "Repository source detected for build and dependency review." : "Repository source not available; build quality evidence is limited.", { hasRepo }, hasRepo ? "high" : "low"),
      evidenceItem(passport.passportId, "runtime", "quality", hasDeployment ? "Live URL or endpoint was provided for runtime review." : "No live deployment endpoint was provided.", { hasDeployment }, hasDeployment ? "medium" : "low"),
      evidenceItem(passport.passportId, "config", "quality", "Quality scanner evaluated build, reliability, maintainability, and operational maturity signals.", scores, "medium"),
    ],
    riskFlags: [
      ...(!hasRepo ? ["Repository evidence unavailable."] : []),
      ...(!hasDeployment ? ["Runtime endpoint unavailable."] : []),
    ],
  };
}

function computeSafetySignals(source: string, passport: SoftwarePassportRecord) {
  const hasRepo = /github\.com|gitlab\.com|bitbucket\.org/i.test(source);
  const hasHttps = /^https:\/\//i.test(source);
  const knownOwner = !/limited|unknown/i.test(passport.softwareIdentity.owner);
  const scores = {
    identitySafety: knownOwner ? 78 : 58,
    accessSafety: hasRepo ? 74 : 61,
    dataSafety: hasHttps ? 72 : 58,
    integrationSafety: hasRepo ? 70 : 60,
    deploymentSafety: hasHttps ? 74 : 57,
  };
  return {
    scores,
    evidence: [
      evidenceItem(passport.passportId, "scan", "safety", knownOwner ? "Owner identity was inferred from the submitted source." : "Owner identity remains limited.", { owner: passport.softwareIdentity.owner }, knownOwner ? "medium" : "low"),
      evidenceItem(passport.passportId, "config", "safety", hasHttps ? "HTTPS deployment source observed." : "HTTPS deployment source was not observed.", { hasHttps }, hasHttps ? "medium" : "low"),
      evidenceItem(passport.passportId, "scan", "safety", "Safety scanner evaluated identity, access, data, integration, and deployment controls.", scores, "medium"),
    ],
    riskFlags: [
      ...(!knownOwner ? ["Ownership evidence incomplete."] : []),
      ...(!hasHttps ? ["Deployment safety evidence incomplete."] : []),
    ],
  };
}

function registryEvidence(asset: RegistryAsset, transparencyEntries: number): PassportEvidence[] {
  return [
    evidenceItem(asset.ventureOsId, "scan", "quality", `Readiness score observed at ${asset.readinessScore}/100.`, { readinessScore: asset.readinessScore, coverage: asset.evidenceCoverage }, "high", asset.lastVerification),
    evidenceItem(asset.ventureOsId, "scan", "safety", asset.certificateId ? "Active certificate evidence is attached to this passport." : "No active certificate is attached to this passport.", { certificateId: asset.certificateId }, asset.certificateId ? "high" : "medium", asset.lastVerification),
    evidenceItem(asset.ventureOsId, "commit", "identity", asset.repository ? `Repository origin observed: ${asset.repository}.` : "Repository origin was not observed in the registry record.", { repository: asset.repository, domain: asset.domain }, asset.repository ? "high" : "low", asset.lastVerification),
    evidenceItem(asset.ventureOsId, "build_event", "identity", `${transparencyEntries} transparency-linked record(s) are associated with this passport.`, { transparencyEntries }, transparencyEntries > 0 ? "high" : "medium", asset.lastVerification),
  ];
}

function registryCertificates(asset: RegistryAsset): PassportCertificate[] {
  if (!asset.certificateId) return [];
  const issuedAt = asset.lastVerification;
  return certificateTypesForScores(asset.trustScore, qualityScoreForAsset(asset), safetyScoreForAsset(asset)).map((type) => ({
    id: `${asset.certificateId}:${type}`,
    passportId: asset.ventureOsId,
    type,
    issuedAt,
    expiresAt: null,
    signatureHash: hash([asset.certificateId, type, asset.ventureOsId]),
  }));
}

function registryTimeline(asset: RegistryAsset): TrustEvent[] {
  return [
    trustEvent(asset.ventureOsId, "appraisal.recorded", 0, `Trust rating ${asset.trustRating} recorded.`, asset.lastVerification),
    ...(asset.certificateId ? [trustEvent(asset.ventureOsId, "certificate.active", 0, `Certificate ${asset.certificateId} is active.`, asset.lastVerification)] : []),
  ];
}

function qualityBreakdown(asset: RegistryAsset) {
  const base = qualityScoreForAsset(asset);
  return {
    buildQuality: clamp(base + 3),
    reliability: clamp(asset.readinessScore),
    maintainability: clamp(asset.evidenceCoverage + (asset.repository ? 8 : 0)),
    operationalMaturity: clamp(asset.lastScan ? base : base - 8),
  };
}

function safetyBreakdown(asset: RegistryAsset) {
  const base = safetyScoreForAsset(asset);
  return {
    identitySafety: clamp(asset.repository || asset.domain ? base + 4 : base - 8),
    accessSafety: clamp(base),
    dataSafety: clamp(base - (asset.evidenceCoverage < 75 ? 8 : 2)),
    integrationSafety: clamp(base - (asset.repository ? 1 : 8)),
    deploymentSafety: clamp(asset.lastScan ? base : base - 6),
  };
}

function qualityScoreForAsset(asset: RegistryAsset) {
  const values = [asset.readinessScore + 3, asset.readinessScore, asset.evidenceCoverage + (asset.repository ? 8 : 0), asset.lastScan ? asset.readinessScore - 4 : asset.readinessScore - 10];
  return scoreAverage(values);
}

function safetyScoreForAsset(asset: RegistryAsset) {
  const certBoost = asset.certificateId ? 4 : -8;
  const values = [asset.trustScore + certBoost, asset.evidenceCoverage, asset.repository || asset.domain ? asset.trustScore : asset.trustScore - 12, asset.lastScan ? asset.trustScore - 2 : asset.trustScore - 8];
  return scoreAverage(values);
}

function certificateTypesFor(passport: SoftwarePassportRecord, requestedType?: unknown): CertificateSealType[] {
  const requested = cleanText(requestedType, 80) as CertificateSealType;
  const eligible = certificateTypesForScores(passport.trustScore, passport.qualityScore, passport.safetyScore);
  return requested ? eligible.filter((type) => type === requested) : eligible;
}

function certificateTypesForScores(trust: number, quality: number, safety: number): CertificateSealType[] {
  const types: CertificateSealType[] = [];
  if (trust >= 75) types.push("ownership_verified");
  if (quality >= 80) types.push("quality_verified");
  if (safety >= 80) types.push("safety_verified");
  if (quality >= 85 && safety >= 80) types.push("production_ready");
  return types;
}

function riskFlagsFor(asset: RegistryAsset, qualityScore: number, safetyScore: number) {
  return [
    ...(qualityScore < 80 ? ["Quality review recommended before broad production use."] : []),
    ...(safetyScore < 80 ? ["Safety controls require buyer review."] : []),
    ...(!asset.certificateId ? ["Certificate seal has not been issued."] : []),
    ...(!asset.repository ? ["Repository origin is not linked."] : []),
  ];
}

function summariesFor(input: { trustScore: number; qualityScore: number; safetyScore: number; riskFlags: string[] }) {
  return {
    trust: input.trustScore >= 85 ? "This software shows strong trust evidence within the observed scope." : input.trustScore >= 70 ? "This software has usable trust evidence, with review conditions." : "This software needs additional evidence before a trust decision.",
    quality: input.qualityScore >= 85 ? "Quality signals indicate production readiness." : input.qualityScore >= 70 ? "Quality signals are usable but should be reviewed." : "Quality signals are limited or elevated risk.",
    safety: input.safetyScore >= 85 ? "Safety signals indicate low observed safety risk." : input.safetyScore >= 70 ? "Safety controls need standard buyer review." : "Safety evidence is limited and requires deeper review.",
    recommendedUse: input.qualityScore >= 85 && input.safetyScore >= 85 ? "Suitable for deployment after standard internal review." : input.qualityScore >= 70 && input.safetyScore >= 70 ? "Suitable for controlled pilot, procurement review, or diligence." : "Hold for remediation, independent assessment, or additional evidence.",
  };
}

function evidenceItem(passportId: string, type: EvidenceType, category: EvidenceCategory, description: string, rawData: Record<string, unknown>, confidence: EvidenceConfidence, timestamp = new Date().toISOString()): PassportEvidence {
  return {
    id: `ev_${hash([passportId, type, category, description, timestamp]).slice(0, 18)}`,
    passportId,
    type,
    category,
    description,
    rawData,
    confidence,
    timestamp,
  };
}

function identityEvidence(passport: SoftwarePassportRecord) {
  return evidenceItem(passport.passportId, "build_event", "identity", "Software identity, owner, source type, and source URL are attached to the passport.", passport.softwareIdentity, "medium");
}

function trustEvent(passportId: string, eventType: string, deltaScore: number, reason: string, timestamp = new Date().toISOString()): TrustEvent {
  return {
    id: `te_${hash([passportId, eventType, reason, timestamp]).slice(0, 18)}`,
    passportId,
    eventType,
    deltaScore,
    reason,
    timestamp,
  };
}

function sourceTypeFor(value: unknown, source: string): PassportSourceType {
  const clean = cleanText(value, 20).toLowerCase();
  if (["github", "upload", "url", "built"].includes(clean)) return clean as PassportSourceType;
  if (/github\.com/i.test(source)) return "github";
  if (/^https?:\/\//i.test(source)) return "url";
  return "built";
}

function nameFromSource(source: string) {
  try {
    const url = new URL(source);
    if (/github\.com$/i.test(url.hostname)) return url.pathname.split("/").filter(Boolean).slice(0, 2).join("/") || url.hostname;
    return url.hostname.replace(/^www\./i, "");
  } catch {
    return source.split(/[/:?#]/)[0]?.slice(0, 80) || "Software Asset";
  }
}

function ownerFromSource(source: string) {
  try {
    const url = new URL(source);
    if (/github\.com$/i.test(url.hostname)) return url.pathname.split("/").filter(Boolean)[0] || "Ownership evidence limited";
    return url.hostname.replace(/^www\./i, "");
  } catch {
    return "Ownership evidence limited";
  }
}

function passportIdFor(source: string) {
  const year = new Date().getUTCFullYear();
  const number = String(parseInt(hash([source]).slice(0, 8), 16) % 1_000_000).padStart(6, "0");
  return `VOS-${year}-${number}`;
}

function statusFor(score: number): PassportStatus {
  if (score >= 80) return "verified";
  if (score < 60) return "high_risk";
  return "unverified";
}

function verdictFor(score: number): SoftwarePassportRecord["verdict"] {
  if (score >= 80) return "verified";
  if (score < 60) return "high_risk";
  return "caution";
}

function scanReason(next: number, previous: number) {
  if (next > previous) return "Trust score increased after quality and safety evidence update.";
  if (next < previous) return "Trust score decreased after quality and safety evidence update.";
  return "Trust score unchanged after quality and safety scan.";
}

function mergeCertificates(current: PassportCertificate[], next: PassportCertificate[]) {
  const byType = new Map(current.map((certificate) => [certificate.type, certificate]));
  for (const certificate of next) byType.set(certificate.type, certificate);
  return [...byType.values()];
}

function scoreAverage(values: number[]) {
  return clamp(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length));
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

function cleanText(value: unknown, max: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function hash(parts: unknown[]) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function jsonValue<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
