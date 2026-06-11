import { createHash } from "crypto";

import { buildRegistryItems, type RegistryItem } from "@/lib/registry/registry-pipeline";

export type EvidenceCategory =
  | "identity"
  | "security"
  | "reliability"
  | "maintainability"
  | "buyer_readiness"
  | "supply_chain"
  | "ledger";

export type EvidenceSourceKind =
  | "registry"
  | "github_repository"
  | "domain"
  | "sbom"
  | "certificate"
  | "transparency_log"
  | "event_log"
  | "self_attested";

export type EvidenceRecord = {
  id: string;
  subjectId: string;
  subjectName: string;
  source: string;
  sourceKind: EvidenceSourceKind;
  type: string;
  category: EvidenceCategory;
  summary: string;
  timestamp: string;
  confidence: number;
  hash: string;
  verified: boolean;
  href?: string;
  limitations: string[];
};

export type PassportDimension = {
  key: "identity" | "security" | "reliability" | "maintainability" | "buyer_readiness";
  label: string;
  score: number;
  confidence: number;
  verdict: "strong" | "review" | "limited" | "unknown";
  observed: string[];
  inferred: string[];
  unknown: string[];
  evidenceIds: string[];
};

export type RiskSeverity = "critical" | "high" | "medium" | "low" | "informational";

export type DiligenceRisk = {
  id: string;
  subjectId: string;
  subjectName: string;
  severity: RiskSeverity;
  category: EvidenceCategory;
  description: string;
  evidenceIds: string[];
  confidence: number;
  recommendedAction: string;
  estimatedEffort: "Low" | "Medium" | "High";
};

export type MonitoringAlert = {
  id: string;
  subjectId: string;
  subjectName: string;
  status: "ok" | "watch" | "attention";
  signal: string;
  description: string;
  timestamp: string;
};

export type SoftwarePassportV2 = {
  id: string;
  name: string;
  company: string | null;
  repository: string | null;
  domain: string | null;
  status: string;
  trustScore: number;
  confidence: number;
  evidenceCount: number;
  riskCount: number;
  openCriticalRisks: number;
  monitoringStatus: "ok" | "watch" | "attention";
  publicUrl: string;
  dimensions: PassportDimension[];
};

export type TrustGraphData = {
  nodes: Array<{
    id: string;
    label: string;
    type: "passport" | "evidence" | "risk" | "source";
    category?: EvidenceCategory;
    status?: string;
    score?: number;
  }>;
  edges: Array<{
    id: string;
    from: string;
    to: string;
    label: string;
  }>;
};

export type VendorComparisonRow = {
  id: string;
  name: string;
  trustScore: number;
  confidence: number;
  evidenceCount: number;
  criticalRisks: number;
  status: string;
  recommendation: "Proceed" | "Review" | "Do Not Approve";
  publicUrl: string;
};

export type DueDiligenceWorkspace = {
  generatedAt: string;
  isSampleData: boolean;
  metrics: {
    vendors: number;
    evidenceRecords: number;
    averageTrust: number;
    openRisks: number;
    criticalRisks: number;
    monitoringAttention: number;
  };
  passports: SoftwarePassportV2[];
  evidence: EvidenceRecord[];
  risks: DiligenceRisk[];
  monitoring: MonitoringAlert[];
  graph: TrustGraphData;
  comparison: VendorComparisonRow[];
};

export async function buildDueDiligenceWorkspace(input: { query?: string; limit?: number } = {}): Promise<DueDiligenceWorkspace> {
  const registry = await buildRegistryItems({ query: input.query, limit: input.limit || 12 });
  const generatedAt = new Date().toISOString();
  const evidence = registry.items.flatMap((item) => evidenceForRegistryItem(item, generatedAt));
  const risks = registry.items.flatMap((item) => risksForRegistryItem(item, evidence.filter((record) => record.subjectId === item.ventureOsId)));
  const monitoring = registry.items.flatMap((item) => monitoringForRegistryItem(item, risks.filter((risk) => risk.subjectId === item.ventureOsId), generatedAt));
  const passports = registry.items.map((item) => {
    const itemEvidence = evidence.filter((record) => record.subjectId === item.ventureOsId);
    const itemRisks = risks.filter((risk) => risk.subjectId === item.ventureOsId);
    const itemAlerts = monitoring.filter((alert) => alert.subjectId === item.ventureOsId);
    return passportV2ForRegistryItem(item, itemEvidence, itemRisks, itemAlerts);
  });

  return {
    generatedAt,
    isSampleData: registry.items.some((item) => item.evidenceCoverageLevel === "sample"),
    metrics: {
      vendors: registry.items.length,
      evidenceRecords: evidence.length,
      averageTrust: average(passports.map((passport) => passport.trustScore).filter((score) => score > 0)),
      openRisks: risks.length,
      criticalRisks: risks.filter((risk) => risk.severity === "critical").length,
      monitoringAttention: monitoring.filter((alert) => alert.status === "attention").length,
    },
    passports,
    evidence,
    risks,
    monitoring,
    graph: graphForWorkspace(registry.items, evidence, risks),
    comparison: passports.map((passport) => ({
      id: passport.id,
      name: passport.name,
      trustScore: passport.trustScore,
      confidence: passport.confidence,
      evidenceCount: passport.evidenceCount,
      criticalRisks: passport.openCriticalRisks,
      status: passport.status,
      recommendation: recommendationFor(passport.trustScore, passport.openCriticalRisks, passport.confidence),
      publicUrl: passport.publicUrl,
    })),
  };
}

function evidenceForRegistryItem(item: RegistryItem, generatedAt: string): EvidenceRecord[] {
  const records: Omit<EvidenceRecord, "id" | "hash">[] = [
    {
      subjectId: item.ventureOsId,
      subjectName: item.name,
      source: "VentureOS registry",
      sourceKind: "registry",
      type: "registry_profile",
      category: "identity",
      summary: `${item.name} is present in the VentureOS registry with state ${item.currentState}.`,
      timestamp: item.lastVerification || generatedAt,
      confidence: confidenceFromCoverage(item.evidenceCoverage, item.evidenceCoverageLevel),
      verified: item.evidenceCoverageLevel !== "sample",
      href: `/registry/${encodeURIComponent(item.ventureOsId)}`,
      limitations: item.evidenceCoverageLevel === "sample" ? ["Sample registry fallback record. Replace with live evidence before using for a buyer decision."] : [],
    },
    {
      subjectId: item.ventureOsId,
      subjectName: item.name,
      source: "Score compiler",
      sourceKind: "registry",
      type: "trust_score",
      category: "ledger",
      summary: item.trustScore > 0 ? `Trust score observed as ${item.trustScore}/100.` : "Trust score is pending because no completed score was available.",
      timestamp: item.lastVerification || generatedAt,
      confidence: item.trustScore > 0 ? confidenceFromCoverage(item.evidenceCoverage, item.evidenceCoverageLevel) : 25,
      verified: item.trustScore > 0 && item.evidenceCoverageLevel !== "sample",
      href: item.publicVerificationUrl,
      limitations: item.trustScore > 0 ? [] : ["No completed trust score is available yet."],
    },
  ];

  if (item.repository) {
    records.push({
      subjectId: item.ventureOsId,
      subjectName: item.name,
      source: `github.com/${item.repository}`,
      sourceKind: "github_repository",
      type: "repository_identity",
      category: "identity",
      summary: `Repository identity observed for ${item.repository}.`,
      timestamp: item.lastScan || item.lastVerification || generatedAt,
      confidence: 88,
      verified: item.evidenceCoverageLevel !== "sample",
      href: `https://github.com/${item.repository}`,
      limitations: ["Repository presence does not prove production deployment, ownership, or internal controls by itself."],
    });
  }

  if (item.domain) {
    records.push({
      subjectId: item.ventureOsId,
      subjectName: item.name,
      source: item.domain,
      sourceKind: "domain",
      type: "domain_identity",
      category: "buyer_readiness",
      summary: `Public domain observed for ${item.domain}.`,
      timestamp: item.lastVerification || generatedAt,
      confidence: 70,
      verified: false,
      href: `https://${item.domain}`,
      limitations: ["Domain ownership and DNS control require external verification."],
    });
  }

  if (item.certificateStatus === "Active") {
    records.push({
      subjectId: item.ventureOsId,
      subjectName: item.name,
      source: item.certificateId || "signed evidence receipt",
      sourceKind: "certificate",
      type: "signed_evidence_receipt",
      category: "ledger",
      summary: "Signed evidence receipt is active for this software record.",
      timestamp: item.lastVerification || generatedAt,
      confidence: 92,
      verified: true,
      href: item.certificateUrl || item.publicVerificationUrl,
      limitations: ["Receipt proves the reviewed evidence state, not future software behavior."],
    });
  }

  if (item.transparencyEntries > 0) {
    records.push({
      subjectId: item.ventureOsId,
      subjectName: item.name,
      source: "Transparency log",
      sourceKind: "transparency_log",
      type: "ledger_entries",
      category: "ledger",
      summary: `${item.transparencyEntries} transparency entr${item.transparencyEntries === 1 ? "y" : "ies"} observed.`,
      timestamp: item.lastVerification || generatedAt,
      confidence: 86,
      verified: true,
      href: "/transparency-log",
      limitations: ["Transparency entries show recorded events, not independent legal certification."],
    });
  }

  if (item.eventCount > 0) {
    records.push({
      subjectId: item.ventureOsId,
      subjectName: item.name,
      source: "Decision and usage events",
      sourceKind: "event_log",
      type: "event_history",
      category: "reliability",
      summary: `${item.eventCount} lifecycle event${item.eventCount === 1 ? "" : "s"} are attached to this record.`,
      timestamp: item.lastVerification || generatedAt,
      confidence: 74,
      verified: true,
      href: item.passportUrl,
      limitations: ["Event history may be incomplete if integrations were not connected at the time."],
    });
  }

  return records.map((record) => materializeEvidenceRecord(record));
}

function risksForRegistryItem(item: RegistryItem, evidence: EvidenceRecord[]): DiligenceRisk[] {
  const risks: Omit<DiligenceRisk, "id">[] = [];
  const evidenceIds = evidence.map((record) => record.id);

  if (item.trustScore > 0 && item.trustScore < 50) {
    risks.push({
      subjectId: item.ventureOsId,
      subjectName: item.name,
      severity: "critical",
      category: "security",
      description: `Trust score is ${item.trustScore}/100, below the buyer approval floor.`,
      evidenceIds,
      confidence: confidenceFromCoverage(item.evidenceCoverage, item.evidenceCoverageLevel),
      recommendedAction: "Block approval until critical findings are reviewed and a fresh evidence run is completed.",
      estimatedEffort: "High",
    });
  }

  if (item.trustScore === 0) {
    risks.push({
      subjectId: item.ventureOsId,
      subjectName: item.name,
      severity: "high",
      category: "ledger",
      description: "No completed trust score is available.",
      evidenceIds,
      confidence: 70,
      recommendedAction: "Run a preview scan or full evidence review before using this software in a decision.",
      estimatedEffort: "Medium",
    });
  }

  if (item.evidenceCoverage < 70) {
    risks.push({
      subjectId: item.ventureOsId,
      subjectName: item.name,
      severity: "medium",
      category: "buyer_readiness",
      description: `Evidence coverage is ${item.evidenceCoverage}%, so unknowns should remain visible in the report.`,
      evidenceIds,
      confidence: 82,
      recommendedAction: "Add repository, SBOM, security policy, CI/CD, and deployment evidence before buyer review.",
      estimatedEffort: "Medium",
    });
  }

  if (!item.repository) {
    risks.push({
      subjectId: item.ventureOsId,
      subjectName: item.name,
      severity: "medium",
      category: "identity",
      description: "Repository identity is not attached to the public record.",
      evidenceIds,
      confidence: 76,
      recommendedAction: "Connect GitHub or upload a source snapshot so identity and provenance can be reviewed.",
      estimatedEffort: "Low",
    });
  }

  if (item.certificateStatus !== "Active") {
    risks.push({
      subjectId: item.ventureOsId,
      subjectName: item.name,
      severity: "low",
      category: "ledger",
      description: "Signed evidence receipt is not active.",
      evidenceIds,
      confidence: 80,
      recommendedAction: "Issue a signed evidence receipt after a current evidence review.",
      estimatedEffort: "Low",
    });
  }

  if (item.transparencyEntries === 0) {
    risks.push({
      subjectId: item.ventureOsId,
      subjectName: item.name,
      severity: "informational",
      category: "ledger",
      description: "No transparency entries are linked to this record yet.",
      evidenceIds,
      confidence: 72,
      recommendedAction: "Record review events in the transparency log so the history is auditable.",
      estimatedEffort: "Low",
    });
  }

  return risks.map((risk) => ({
    ...risk,
    id: deterministicId("risk", risk.subjectId, risk.description),
  }));
}

function monitoringForRegistryItem(item: RegistryItem, risks: DiligenceRisk[], generatedAt: string): MonitoringAlert[] {
  const alerts: Omit<MonitoringAlert, "id">[] = [];
  const lastScan = item.lastScan ? new Date(item.lastScan) : null;
  const daysSinceScan = lastScan ? Math.floor((Date.now() - lastScan.getTime()) / 86_400_000) : null;

  if (risks.some((risk) => risk.severity === "critical" || risk.severity === "high")) {
    alerts.push({
      subjectId: item.ventureOsId,
      subjectName: item.name,
      status: "attention",
      signal: "Open high-risk review item",
      description: "A critical or high risk exists in the current diligence record.",
      timestamp: generatedAt,
    });
  }

  if (daysSinceScan === null) {
    alerts.push({
      subjectId: item.ventureOsId,
      subjectName: item.name,
      status: "watch",
      signal: "No scan timestamp",
      description: "No last-scan timestamp is attached, so freshness cannot be confirmed.",
      timestamp: generatedAt,
    });
  } else if (daysSinceScan > 30) {
    alerts.push({
      subjectId: item.ventureOsId,
      subjectName: item.name,
      status: daysSinceScan > 90 ? "attention" : "watch",
      signal: "Evidence freshness",
      description: `Last scan was ${daysSinceScan} day${daysSinceScan === 1 ? "" : "s"} ago.`,
      timestamp: generatedAt,
    });
  }

  if (item.queueHealth.failed > 0) {
    alerts.push({
      subjectId: item.ventureOsId,
      subjectName: item.name,
      status: "attention",
      signal: "Pipeline failures",
      description: `${item.queueHealth.failed} failed job${item.queueHealth.failed === 1 ? "" : "s"} require review.`,
      timestamp: generatedAt,
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      subjectId: item.ventureOsId,
      subjectName: item.name,
      status: "ok",
      signal: "Monitoring baseline",
      description: "No monitoring alerts were generated from the current record.",
      timestamp: generatedAt,
    });
  }

  return alerts.map((alert) => ({
    ...alert,
    id: deterministicId("alert", alert.subjectId, alert.signal, alert.description),
  }));
}

function passportV2ForRegistryItem(
  item: RegistryItem,
  evidence: EvidenceRecord[],
  risks: DiligenceRisk[],
  alerts: MonitoringAlert[],
): SoftwarePassportV2 {
  const criticalRisks = risks.filter((risk) => risk.severity === "critical").length;
  const highRisks = risks.filter((risk) => risk.severity === "high").length;
  const confidence = average(evidence.map((record) => record.confidence));
  const monitoringStatus = alerts.some((alert) => alert.status === "attention")
    ? "attention"
    : alerts.some((alert) => alert.status === "watch")
      ? "watch"
      : "ok";

  return {
    id: item.ventureOsId,
    name: item.name,
    company: item.company,
    repository: item.repository,
    domain: item.domain,
    status: item.currentState,
    trustScore: item.trustScore,
    confidence,
    evidenceCount: evidence.length,
    riskCount: risks.length,
    openCriticalRisks: criticalRisks,
    monitoringStatus,
    publicUrl: item.publicVerificationUrl,
    dimensions: [
      dimension({
        key: "identity",
        label: "Identity",
        score: item.repository || item.domain ? Math.max(62, item.evidenceCoverage) : 45,
        confidence,
        evidence,
        category: "identity",
        observed: [
          item.repository ? `Repository observed: ${item.repository}` : "",
          item.domain ? `Domain observed: ${item.domain}` : "",
          `Registry state: ${item.currentState}`,
        ],
        inferred: [item.company ? `Company label appears as ${item.company}.` : "Owner identity requires stronger source evidence."],
        unknown: ["Legal ownership", "Maintainer access controls", "Organization administrator list"],
      }),
      dimension({
        key: "security",
        label: "Security",
        score: clamp(Math.round((item.trustScore || 50) - criticalRisks * 18 - highRisks * 10)),
        confidence: Math.max(25, Math.min(confidence, item.evidenceCoverage + 10)),
        evidence,
        category: "security",
        observed: [item.trustScore > 0 ? `Trust score observed as ${item.trustScore}/100.` : "No completed trust score observed."],
        inferred: risks.length ? [`${risks.length} risk item${risks.length === 1 ? "" : "s"} generated from current evidence.`] : ["No material risk items generated from current evidence."],
        unknown: ["Runtime penetration test results", "Production incident history", "Private infrastructure configuration"],
      }),
      dimension({
        key: "reliability",
        label: "Reliability",
        score: clamp(Math.round((item.readinessScore || item.trustScore || 50) - (item.queueHealth.failed > 0 ? 12 : 0))),
        confidence: evidence.some((record) => record.category === "reliability") ? confidence : Math.min(confidence, 55),
        evidence,
        category: "reliability",
        observed: [
          item.lastScan ? `Last scan: ${formatDate(item.lastScan)}.` : "No last-scan timestamp observed.",
          item.eventCount > 0 ? `${item.eventCount} lifecycle events observed.` : "No lifecycle events observed.",
        ],
        inferred: [item.queueHealth.failed > 0 ? "Pipeline failures may reduce operational confidence." : "No failed pipeline jobs are visible in the registry item."],
        unknown: ["Actual uptime", "Monitoring coverage", "Recovery time objective"],
      }),
      dimension({
        key: "maintainability",
        label: "Maintainability",
        score: clamp(Math.round((item.readinessScore || 60) * 0.75 + (item.repository ? 18 : 0))),
        confidence: item.repository ? Math.min(90, confidence + 8) : Math.min(confidence, 50),
        evidence,
        category: "maintainability",
        observed: [item.repository ? "Source repository is linked for review." : "No source repository is linked."],
        inferred: ["Maintainability is inferred from readiness, repository presence, and review history."],
        unknown: ["Full test coverage", "Code ownership map", "Open issue aging"],
      }),
      dimension({
        key: "buyer_readiness",
        label: "Buyer Readiness",
        score: clamp(Math.round(item.evidenceCoverage * 0.7 + (item.certificateStatus === "Active" ? 24 : 8))),
        confidence,
        evidence,
        category: "buyer_readiness",
        observed: [
          `Evidence coverage: ${item.evidenceCoverage}%.`,
          `Signed receipt: ${item.certificateStatus}.`,
        ],
        inferred: [item.evidenceCoverage >= 80 ? "Record has enough coverage for initial buyer review." : "Record needs more evidence before buyer review."],
        unknown: ["Commercial terms", "Privacy/security contacts", "Business continuity procedures"],
      }),
    ],
  };
}

function graphForWorkspace(items: RegistryItem[], evidence: EvidenceRecord[], risks: DiligenceRisk[]): TrustGraphData {
  const nodes: TrustGraphData["nodes"] = [];
  const edges: TrustGraphData["edges"] = [];

  for (const item of items.slice(0, 8)) {
    nodes.push({
      id: item.ventureOsId,
      label: item.name,
      type: "passport",
      status: item.currentState,
      score: item.trustScore,
    });

    if (item.repository) {
      const sourceId = `source:repo:${item.ventureOsId}`;
      nodes.push({ id: sourceId, label: item.repository, type: "source", category: "identity" });
      edges.push({ id: `${sourceId}->${item.ventureOsId}`, from: sourceId, to: item.ventureOsId, label: "identifies" });
    }

    for (const record of evidence.filter((entry) => entry.subjectId === item.ventureOsId).slice(0, 5)) {
      nodes.push({
        id: record.id,
        label: record.type.replace(/_/g, " "),
        type: "evidence",
        category: record.category,
        score: record.confidence,
      });
      edges.push({ id: `${record.id}->${item.ventureOsId}`, from: record.id, to: item.ventureOsId, label: "supports" });
    }

    for (const risk of risks.filter((entry) => entry.subjectId === item.ventureOsId).slice(0, 4)) {
      nodes.push({
        id: risk.id,
        label: risk.severity,
        type: "risk",
        category: risk.category,
        status: risk.severity,
        score: risk.confidence,
      });
      edges.push({ id: `${risk.id}->${item.ventureOsId}`, from: risk.id, to: item.ventureOsId, label: "reduces confidence" });
    }
  }

  return { nodes, edges };
}

function dimension(input: {
  key: PassportDimension["key"];
  label: string;
  score: number;
  confidence: number;
  evidence: EvidenceRecord[];
  category: EvidenceCategory;
  observed: string[];
  inferred: string[];
  unknown: string[];
}): PassportDimension {
  const score = clamp(input.score);
  return {
    key: input.key,
    label: input.label,
    score,
    confidence: clamp(input.confidence),
    verdict: score >= 80 ? "strong" : score >= 65 ? "review" : score > 0 ? "limited" : "unknown",
    observed: input.observed.filter(Boolean),
    inferred: input.inferred.filter(Boolean),
    unknown: input.unknown.filter(Boolean),
    evidenceIds: input.evidence.filter((record) => record.category === input.category || record.category === "ledger").map((record) => record.id),
  };
}

function materializeEvidenceRecord(record: Omit<EvidenceRecord, "id" | "hash">): EvidenceRecord {
  const hash = sha256({
    subjectId: record.subjectId,
    source: record.source,
    type: record.type,
    category: record.category,
    timestamp: record.timestamp,
    confidence: record.confidence,
    verified: record.verified,
  });
  return {
    ...record,
    hash,
    id: deterministicId("evidence", record.subjectId, record.source, record.type, hash),
  };
}

function confidenceFromCoverage(coverage: number, level: string) {
  if (level === "sample") return 45;
  if (coverage >= 85) return 88;
  if (coverage >= 70) return 76;
  if (coverage >= 50) return 62;
  return 42;
}

function recommendationFor(trustScore: number, criticalRisks: number, confidence: number): VendorComparisonRow["recommendation"] {
  if (criticalRisks > 0 || trustScore < 55) return "Do Not Approve";
  if (trustScore < 80 || confidence < 70) return "Review";
  return "Proceed";
}

function deterministicId(...parts: string[]) {
  const hash = sha256(parts.join(":"));
  return `${parts[0]}-${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

function sha256(value: unknown) {
  const serialized = typeof value === "string" ? value : stableStringify(value);
  return createHash("sha256").update(serialized).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(",")}}`;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
