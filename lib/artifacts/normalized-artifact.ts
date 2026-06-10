import { badgeLabelFor } from "@/lib/appraisal/badge";
import type {
  AppraisalEvidenceCoverage,
  AppraisalEvidenceSource,
  AppraisalLaunchVerdict,
  SoftwareAppraisal,
} from "@/lib/appraisal/types";
import type {
  CertificateHistoryItem,
  CertificateStatus,
  CertificateVerificationResult,
  SignedCertificate,
} from "@/lib/certificates/types";
import { ventureOsIdForAsset } from "@/lib/registry/asset-id";
import type { VentureOSPassport } from "@/lib/registry/software-registry";

export type NormalizedArtifactStatus = "verified" | "risk" | "danger" | "unknown";

export type NormalizedArtifactMetric = {
  label: string;
  value: string | number;
  detail?: string;
  status?: NormalizedArtifactStatus;
};

export type NormalizedArtifactAction = {
  label: string;
  href?: string;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  copyValue?: string;
  copySuccessMessage?: string;
};

export type NormalizedArtifactEvidenceSection = {
  title: string;
  items: string[];
  status?: NormalizedArtifactStatus;
  fallback?: string;
};

export type NormalizedArtifactRisk = {
  id: string;
  title: string;
  severity?: string;
  category?: string;
  summary?: string;
  confidence?: number;
  impact?: string;
};

export type NormalizedArtifactTimelineItem = {
  id: string;
  timestamp?: string;
  type?: string;
  title: string;
  status?: NormalizedArtifactStatus;
  href?: string;
  metrics?: NormalizedArtifactMetric[];
  detail?: string;
};

export type NormalizedArtifact = {
  purposeLabel: string;
  assetName: string;
  assetId: string;
  statusLabel: string;
  status: NormalizedArtifactStatus;
  trustScore: number | string;
  trustRating?: string;
  generatedAt?: string;
  headerActions: NormalizedArtifactAction[];
  trustOverview: {
    rating: string;
    score: number | string;
    status: NormalizedArtifactStatus;
    rows: NormalizedArtifactMetric[];
    actions: NormalizedArtifactAction[];
  };
  evidenceCoverage: {
    metric: NormalizedArtifactMetric;
    sections: NormalizedArtifactEvidenceSection[];
  };
  riskSummary: {
    risks: NormalizedArtifactRisk[];
  };
  metadata: {
    items: NormalizedArtifactMetric[];
    actions?: NormalizedArtifactAction[];
  };
  timeline: {
    items: NormalizedArtifactTimelineItem[];
    status?: {
      label: string;
      status?: NormalizedArtifactStatus;
    };
    emptyState?: string;
  };
  linkedArtifacts: {
    status: NormalizedArtifactStatus;
    metadata: NormalizedArtifactMetric[];
    actions: NormalizedArtifactAction[];
  };
};

export function normalizeAppraisalArtifact(appraisal: SoftwareAppraisal, certificate: SignedCertificate | null): NormalizedArtifact {
  const summary = appraisal.publicSummary;
  const decision = decisionFor(summary.launchVerdict);
  const coverage = summary.evidenceCoverage;
  const evidenceSources = summary.evidenceSources || [];
  const badgePath = `/api/appraisals/${encodeURIComponent(summary.publicId)}/badge`;
  const publicReportUrl = `/appraisal/${encodeURIComponent(summary.publicId)}`;
  const certificateUrl = certificate ? `/certificate/${encodeURIComponent(certificate.certificateId)}` : null;
  const assetId = ventureOsIdForAsset({ publicAssetId: summary.publicId, createdAt: summary.generatedAt });
  const passportUrl = `/passport/${encodeURIComponent(assetId)}`;
  const trustRating = trustRatingForGrade(summary.grade, coverage.score);
  const riskExposure = riskExposureFor(summary.technicalRiskScore);
  const appraisalValue = summary.technicalValue.available === false ? "Not verified" : summary.technicalValue.label;
  const verificationStatus = certificate ? "VERIFIED" : "REPORT ISSUED";
  const unknowns = uniqueList([...coverage.unknowns, ...summary.unknowns]).slice(0, 6);
  const notClaimed = uniqueList([...coverage.unverifiedClaims, ...summary.unverifiedClaims]).slice(0, 6);
  const verifiedClaims = uniqueList(coverage.verifiedClaims).slice(0, 6);

  return {
    purposeLabel: "Verified System Report",
    assetName: summary.appName,
    assetId,
    statusLabel: summary.launchVerdict.replace(/_/g, " "),
    status: decision.status,
    trustScore: summary.readinessScore,
    trustRating,
    generatedAt: formatDate(summary.generatedAt),
    headerActions: compactActions([
      { label: "Verification Registry", href: "/registry", variant: "outline" },
      { label: "Passport", href: passportUrl, variant: "outline" },
      certificateUrl ? { label: "Signed Verification Badge", href: certificateUrl, variant: "default" } : null,
    ]),
    trustOverview: {
      rating: trustRating,
      score: summary.readinessScore,
      status: decision.status,
      rows: [
        { label: "Verdict", value: decision.answer, status: decision.status },
        { label: "Risk Exposure", value: riskExposure, status: statusForRisk(riskExposure) },
        { label: "Evidence", value: `${coverage.score}/100 ${coverage.level}`, status: statusForCoverage(coverage.score) },
        { label: "Registry", value: badgeLabelFor(summary.badgeState) },
        { label: "Signed Verification Badge", value: verificationStatus, status: certificate ? "verified" : "risk" },
      ],
      actions: compactActions([
        certificateUrl ? { label: "Verify Badge", href: certificateUrl, variant: "default" } : null,
        { label: "Copy Report Link", copyValue: publicReportUrl, copySuccessMessage: "Report link copied.", variant: "outline" },
      ]),
    },
    evidenceCoverage: {
      metric: {
        label: "Coverage Score",
        value: `${coverage.score}/100`,
        detail: coverage.scoreCapped
          ? `Readiness capped at ${coverage.scoreCap}/100 because submitted evidence was incomplete.`
          : `No evidence cap was applied. Score cap ${coverage.scoreCap}/100.`,
        status: statusForCoverage(coverage.score),
      },
      sections: [
        { title: "Observed Evidence", items: verifiedClaims, status: "verified", fallback: "Stored public report evidence is available." },
        { title: "Unknowns", items: unknowns, status: "risk", fallback: "No unknowns were recorded for this artifact." },
        { title: "Not Claimed", items: notClaimed, status: "danger", fallback: "No unsupported claims were recorded." },
        ...sourceSections(evidenceSources, "Generate a new report to attach external evidence source statuses."),
      ],
    },
    riskSummary: {
      risks: summary.topRisks.map((risk) => ({
        id: risk.id,
        title: risk.title,
        severity: risk.severity,
        category: risk.category,
        summary: risk.publicSummary,
        confidence: risk.confidence,
        impact: `+${risk.fixImpact} score impact`,
      })),
    },
    metadata: {
      items: [
        { label: "Asset ID", value: assetId },
        { label: "Report ID", value: summary.publicId },
        { label: "Scope", value: scopeLabel(coverage.scope) },
        { label: "Technical Value Opinion", value: appraisalValue, status: summary.technicalValue.available === false ? "unknown" : "verified" },
        { label: "Repair Estimate", value: summary.repairCost.label, status: summary.repairCost.available === false ? "unknown" : "verified" },
        { label: "Value Basis", value: appraisalValue, status: summary.technicalValue.available === false ? "unknown" : "verified" },
      ],
    },
    timeline: {
      items: compactTimeline([
        {
          id: `${summary.publicId}:generated`,
          timestamp: formatDate(summary.generatedAt),
          type: "REPORT",
          title: "Verified system report generated",
          status: decision.status,
          metrics: [
            { label: "Score", value: summary.readinessScore },
            { label: "Evidence", value: `${coverage.score}%` },
          ],
        },
        certificate
          ? {
              id: `${certificate.certificateId}:issued`,
              timestamp: formatDate(certificate.issuedAt),
              type: "ATTESTATION",
              title: "Signed Verification Badge issued",
              status: "verified",
              href: certificateUrl || undefined,
              metrics: [{ label: "Status", value: certificate.status }],
            }
          : null,
      ]),
    },
    linkedArtifacts: {
      status: certificate ? "verified" : "risk",
      metadata: [
        { label: "Passport", value: assetId },
        { label: "Badge", value: badgePath },
        { label: "Disclaimer", value: summary.disclaimer },
      ],
      actions: [
        { label: "Open Passport", href: passportUrl, variant: "default" },
        certificateUrl
          ? { label: "Verify Signed Verification Badge", href: certificateUrl, variant: "outline" }
          : { label: "Generate New Report", href: "/software-appraisal", variant: "outline" },
        { label: "Copy Badge URL", copyValue: certificate?.badgeUrl || badgePath, copySuccessMessage: "Badge URL copied.", variant: "outline" },
      ],
    },
  };
}

export function normalizeCertificateArtifact(
  certificate: SignedCertificate,
  verification: CertificateVerificationResult,
  history: CertificateHistoryItem[],
): NormalizedArtifact {
  const payload = certificate.payload;
  const coverage = payload.evidenceCommitment.evidenceCoverage || fallbackEvidenceCoverage();
  const sourceStates = payload.evidenceCommitment.externalDataSources || [];
  const badgeEmbed = `<a href="${certificate.verificationUrl}" rel="noopener" target="_blank"><img src="${certificate.badgeUrl}" alt="VentureOS Signed Verification Badge for ${payload.softwareAsset.name}" /></a>`;
  const assetId = ventureOsIdForAsset({ publicAssetId: payload.softwareAsset.publicAssetId, createdAt: payload.issuedAt });
  const passportUrl = `/passport/${encodeURIComponent(assetId)}`;
  const appraisalUrl = `/appraisal/${encodeURIComponent(payload.appraisal.publicId)}`;
  const transparencyUrl = `/transparency-log?certificateId=${encodeURIComponent(certificate.certificateId)}`;
  const trustRating = trustRatingForGrade(payload.appraisal.grade, coverage.score);
  const chainStatus = verification.valid ? "VERIFIED" : "FAILED";
  const chainStatusValue = verification.valid ? "verified" : "danger";

  return {
    purposeLabel: "Signed Verification Badge",
    assetName: payload.softwareAsset.name,
    assetId,
    statusLabel: chainStatus,
    status: chainStatusValue,
    trustScore: payload.appraisal.readinessScore,
    trustRating,
    generatedAt: formatDate(certificate.issuedAt),
    headerActions: [
      { label: "Verification Registry", href: "/registry", variant: "outline" },
      { label: "Transparency", href: transparencyUrl, variant: "outline" },
      { label: "Passport", href: passportUrl, variant: "outline" },
      { label: "Verified Report", href: appraisalUrl, variant: "default" },
    ],
    trustOverview: {
      rating: trustRating,
      score: payload.appraisal.readinessScore,
      status: chainStatusValue,
      rows: [
        { label: "Signature", value: verification.signatureValid ? "VALID" : "INVALID", status: verification.signatureValid ? "verified" : "danger" },
        { label: "Registry Match", value: verification.registryMatch ? "MATCHED" : "MISMATCH", status: verification.registryMatch ? "verified" : "danger" },
        { label: "Badge Status", value: certificate.status, status: statusForCertificate(certificate.status) },
        { label: "Evidence", value: `${coverage.score}/100 ${coverage.level}`, status: statusForCoverage(coverage.score) },
        { label: "Signing Key", value: certificate.signingKeyId },
      ],
      actions: [
        { label: "Copy Verify Link", copyValue: certificate.verificationUrl, copySuccessMessage: "Verification link copied.", variant: "outline" },
        { label: "Copy Badge Embed", copyValue: badgeEmbed, copySuccessMessage: "Badge embed copied.", variant: "outline" },
      ],
    },
    evidenceCoverage: {
      metric: {
        label: "Evidence Coverage",
        value: `${coverage.score}/100`,
        detail: `${scopeLabel(coverage.scope)} evidence scope. Score cap ${coverage.scoreCap}/100${coverage.scoreCapped ? " was applied" : " was not applied"}.`,
        status: statusForCoverage(coverage.score),
      },
      sections: [
        { title: "Observed Evidence", items: coverage.verifiedClaims, status: "verified", fallback: "Stored verification payload is available." },
        { title: "Unknowns", items: coverage.unknowns, status: "risk", fallback: "No unknowns were recorded for this artifact." },
        { title: "Not Claimed", items: coverage.unverifiedClaims, status: "danger", fallback: "No unsupported claims were recorded." },
        ...sourceSections(sourceStates, "The private evidence hash still commits to the original report evidence."),
      ],
    },
    riskSummary: {
      risks: payload.publicClaims.topRisks.map((risk, index) => ({
        id: `certificate-risk:${index}:${risk}`,
        title: risk,
        severity: "Medium",
        category: "Verification Claim",
        summary: "Committed in the public signed verification payload.",
      })),
    },
    metadata: {
      items: [
        { label: "Asset ID", value: assetId },
        { label: "Badge ID", value: certificate.certificateId },
        { label: "Badge Status", value: certificate.status, status: statusForCertificate(certificate.status) },
        { label: "Payload Hash", value: shortHash(certificate.payloadHash) },
        { label: "Recomputed Hash", value: shortHash(verification.recomputedPayloadHash), status: verification.registryMatch ? "verified" : "danger" },
        { label: "Public Summary Hash", value: shortHash(payload.evidenceCommitment.publicSummaryHash) },
        { label: "Private Evidence Hash", value: shortHash(payload.evidenceCommitment.privateEvidenceHash) },
        { label: "Source Snapshot Hash", value: shortHash(payload.evidenceCommitment.sourceSnapshotHash || "none") },
      ],
      actions: [
        { label: "Copy Payload Hash", copyValue: certificate.payloadHash, copySuccessMessage: "Payload hash copied.", variant: "outline" },
        { label: "Copy Recomputed Hash", copyValue: verification.recomputedPayloadHash, copySuccessMessage: "Recomputed hash copied.", variant: "outline" },
      ],
    },
    timeline: {
      items: [
        {
          id: `${certificate.certificateId}:issued`,
          timestamp: formatDate(certificate.issuedAt),
          type: "VERIFICATION",
          title: "Signed Verification Badge issued",
          status: statusForCertificate(certificate.status),
          metrics: [{ label: "Status", value: certificate.status }],
        },
        ...history.slice(0, 5).map(historyItemFor),
      ],
      emptyState: "No public history events are attached to this asset yet.",
    },
    linkedArtifacts: {
      status: chainStatusValue,
      metadata: [
        { label: "Badge URL", value: certificate.badgeUrl },
        { label: "Verified Report", value: payload.appraisal.publicId },
        { label: "Signed Verification Badge", value: certificate.certificateId },
        { label: "Transparency Log", value: transparencyUrl },
      ],
      actions: [
        { label: "Open Passport", href: passportUrl, variant: "default" },
        { label: "Open Verified Report", href: appraisalUrl, variant: "outline" },
        { label: "Open Transparency Log", href: transparencyUrl, variant: "outline" },
        { label: "Copy Badge Embed", copyValue: badgeEmbed, copySuccessMessage: "Badge embed copied.", variant: "outline" },
      ],
    },
  };
}

export function normalizePassportArtifact(passport: VentureOSPassport): NormalizedArtifact {
  const asset = passport.asset;
  const latestEvent = passport.timeline[passport.timeline.length - 1] || null;
  const riskExposure = riskExposureForReadiness(asset.readinessScore);
  const scoreDelta = `${passport.improvement.delta >= 0 ? "+" : ""}${passport.improvement.delta}`;

  return {
    purposeLabel: "Software Passport",
    assetName: asset.name,
    assetId: asset.ventureOsId,
    statusLabel: asset.status,
    status: statusForAsset(asset.status),
    trustScore: asset.readinessScore,
    trustRating: asset.trustRating,
    generatedAt: formatDate(asset.lastVerification),
    headerActions: compactActions([
      { label: "Verification Registry", href: "/registry", variant: "outline" },
      asset.certificateUrl ? { label: "Signed Verification Badge", href: asset.certificateUrl, variant: "outline" } : null,
      { label: "Verified Report", href: asset.appraisalUrl, variant: "default" },
    ]),
    trustOverview: {
      rating: asset.trustRating,
      score: asset.readinessScore,
      status: statusForAsset(asset.status),
      rows: [
        { label: "State", value: asset.status, status: statusForAsset(asset.status) },
        { label: "Risk Exposure", value: riskExposure, status: statusForRisk(riskExposure) },
        { label: "Evidence", value: `${asset.evidenceCoverage}/100 ${asset.evidenceCoverageLevel}`, status: statusForCoverage(asset.evidenceCoverage) },
        { label: "Score Change", value: scoreDelta, status: statusForTrend(passport.improvement.direction) },
        { label: "Latest Event", value: latestEvent ? latestEvent.type : "None recorded" },
      ],
      actions: compactActions([
        asset.certificateUrl ? { label: "Verify Badge", href: asset.certificateUrl, variant: "outline" } : null,
        { label: "Open Verified Report", href: asset.appraisalUrl, variant: "default" },
      ]),
    },
    evidenceCoverage: {
      metric: {
        label: "Evidence Coverage",
        value: `${asset.evidenceCoverage}/100`,
        detail: `${asset.evidenceCoverageLevel} coverage, last verified ${formatDate(asset.lastVerification)}.`,
        status: statusForCoverage(asset.evidenceCoverage),
      },
      sections: [
        {
          title: "Observed Evidence",
          items: [
            `Permanent asset ID ${asset.ventureOsId}`,
            `Public report ${asset.appraisalPublicId}`,
            asset.certificateId ? `Signed Verification Badge ${asset.certificateId}` : "No Signed Verification Badge is attached.",
          ],
          status: asset.certificateId ? "verified" : "risk",
        },
        {
          title: "Unknowns",
          items: [
            asset.repository ? `Repository: ${asset.repository}` : "Repository was not present in the public registry record.",
            asset.domain ? `Domain: ${asset.domain}` : "Domain was not present in the public registry record.",
          ],
          status: asset.repository || asset.domain ? "verified" : "unknown",
        },
        {
          title: "Not Claimed",
          items: [
            `${passport.timeline.length} public events recorded.`,
            `${passport.improvement.firstScore} to ${passport.improvement.latestScore}: ${passport.improvement.direction.toLowerCase()}.`,
          ],
          status: statusForTrend(passport.improvement.direction),
        },
      ],
    },
    riskSummary: {
      risks: passportRisks(passport, riskExposure),
    },
    metadata: {
      items: [
        { label: "Asset ID", value: asset.ventureOsId },
        { label: "Public Asset ID", value: asset.publicAssetId },
        { label: "Report ID", value: asset.appraisalPublicId },
        { label: "Badge ID", value: asset.certificateId || "Not issued", status: asset.certificateId ? "verified" : "unknown" },
        { label: "Repository", value: asset.repository || "Unknown" },
        { label: "Domain", value: asset.domain || "Unknown" },
      ],
    },
    timeline: {
      items: passport.timeline.map(timelineItemFor),
      status: { label: passport.improvement.direction, status: statusForTrend(passport.improvement.direction) },
    },
    linkedArtifacts: {
      status: statusForAsset(asset.status),
      metadata: [
        { label: "Verified Report", value: asset.appraisalPublicId },
        { label: "Signed Verification Badge", value: asset.certificateId || "Not issued" },
        { label: "Events", value: String(passport.timeline.length) },
        { label: "Score Change", value: scoreDelta, status: statusForTrend(passport.improvement.direction) },
      ],
      actions: compactActions([
        { label: "Open Verified Report", href: asset.appraisalUrl, variant: "default" },
        asset.certificateUrl ? { label: "Verify Badge", href: asset.certificateUrl, variant: "outline" } : null,
        { label: "Search Verification Registry", href: "/registry", variant: "outline" },
      ]),
    },
  };
}

function decisionFor(verdict: AppraisalLaunchVerdict) {
  if (verdict === "READY") return { answer: "YES", status: "verified" as const };
  if (verdict === "RISKY") return { answer: "NOT YET", status: "risk" as const };
  return { answer: "NO", status: "danger" as const };
}

function sourceSections(sources: AppraisalEvidenceSource[], missingEvidence: string): NormalizedArtifactEvidenceSection[] {
  if (!sources.length) {
    return [
      {
        title: "Source-state Register",
        items: [missingEvidence],
        status: "unknown",
      },
    ];
  }
  return sources.map((source) => ({
    title: source.label,
    status: sourceStatus(source.status),
    items: compactStrings([source.evidence, source.checkedAt ? `Checked ${formatDate(source.checkedAt)}` : ""]),
  }));
}

function historyItemFor(item: CertificateHistoryItem): NormalizedArtifactTimelineItem {
  return {
    id: `${item.version}:${item.payloadHash}`,
    timestamp: formatDate(item.createdAt),
    type: `Version ${item.version}`,
    title: item.changeReason || item.status,
    status: statusForCertificate(item.status),
    detail: shortHash(item.payloadHash),
    metrics: [{ label: "Status", value: item.status }],
  };
}

function timelineItemFor(item: VentureOSPassport["timeline"][number]): NormalizedArtifactTimelineItem {
  return {
    id: item.id,
    timestamp: formatDate(item.timestamp),
    type: item.type,
    title: item.label,
    status: statusForAsset(item.status),
    href: item.href,
    metrics: [
      { label: "Score", value: item.readinessScore },
      { label: "Evidence", value: `${item.evidenceCoverage}%` },
    ],
  };
}

function passportRisks(passport: VentureOSPassport, riskExposure: string): NormalizedArtifactRisk[] {
  const asset = passport.asset;
  const risks: NormalizedArtifactRisk[] = [];
  if (riskExposure !== "Low") {
    risks.push({
      id: "readiness-exposure",
      title: `${riskExposure} readiness exposure`,
      severity: riskExposure === "High" ? "High" : "Medium",
      category: "Readiness",
      summary: `Current readiness is ${asset.readinessScore}/100.`,
      impact: "Review before transaction use",
    });
  }
  if (!asset.certificateId) {
    risks.push({
      id: "missing-certificate",
      title: "No Signed Verification Badge attached",
      severity: "Medium",
      category: "Verification",
      summary: "The asset has a public report record, but no Signed Verification Badge is attached.",
      impact: "Issue badge",
    });
  }
  if (passport.improvement.direction === "DECLINING") {
    risks.push({
      id: "declining-score",
      title: "Trust score declined over public history",
      severity: "High",
      category: "History",
      summary: `${passport.improvement.firstScore} to ${passport.improvement.latestScore}.`,
      impact: "Investigate regression",
    });
  }
  return risks;
}

function trustRatingForGrade(grade: string, coverageScore: number) {
  if (grade === "A" && coverageScore >= 90) return "AA";
  if (grade === "A") return "A";
  if (grade === "B") return "BBB";
  if (grade === "C") return "BB";
  if (grade === "D") return "B";
  return "CCC";
}

function riskExposureFor(score: number) {
  if (score <= 25) return "Low";
  if (score <= 55) return "Moderate";
  if (score <= 75) return "Elevated";
  return "High";
}

function riskExposureForReadiness(score: number) {
  if (score >= 85) return "Low";
  if (score >= 70) return "Moderate";
  if (score >= 50) return "Elevated";
  return "High";
}

function statusForRisk(riskExposure: string): NormalizedArtifactStatus {
  if (riskExposure === "Low") return "verified";
  if (riskExposure === "Moderate" || riskExposure === "Elevated") return "risk";
  return "danger";
}

function statusForAsset(status: VentureOSPassport["asset"]["status"]): NormalizedArtifactStatus {
  if (status === "VERIFIED") return "verified";
  if (status === "REVOKED") return "danger";
  if (status === "APPRAISED" || status === "SUPERSEDED" || status === "EXPIRED") return "risk";
  return "unknown";
}

function statusForCertificate(status: CertificateStatus): NormalizedArtifactStatus {
  if (status === "ACTIVE") return "verified";
  if (status === "SUPERSEDED" || status === "EXPIRED") return "risk";
  return "danger";
}

function statusForCoverage(score: number): NormalizedArtifactStatus {
  if (score >= 85) return "verified";
  if (score >= 60) return "risk";
  return "danger";
}

function statusForTrend(direction: VentureOSPassport["improvement"]["direction"]): NormalizedArtifactStatus {
  if (direction === "IMPROVING") return "verified";
  if (direction === "DECLINING") return "danger";
  return "unknown";
}

function sourceStatus(status: string): NormalizedArtifactStatus {
  if (status === "available") return "verified";
  if (status === "unavailable") return "danger";
  if (status === "not_configured") return "risk";
  return "unknown";
}

function scopeLabel(scope: AppraisalEvidenceCoverage["scope"]) {
  if (scope === "full_repository") return "full repository";
  if (scope === "repository_linked") return "repository linked";
  if (scope === "partial_submission") return "partial submission";
  return "stored scan only";
}

function fallbackEvidenceCoverage(): AppraisalEvidenceCoverage {
  return {
    score: 50,
    level: "limited",
    scope: "stored_scan_only",
    scoreCap: 75,
    scoreCapped: false,
    reasons: ["This attestation predates evidence coverage scoring."],
    verifiedClaims: ["Stored attestation payload is available."],
    unverifiedClaims: ["Evidence coverage was not recorded for this attestation."],
    unknowns: ["Generate a new report to attach evidence scope and score-cap metadata."],
  };
}

function compactActions(values: Array<NormalizedArtifactAction | null>): NormalizedArtifactAction[] {
  return values.filter((value): value is NormalizedArtifactAction => Boolean(value));
}

function compactTimeline(values: Array<NormalizedArtifactTimelineItem | null>): NormalizedArtifactTimelineItem[] {
  return values.filter((value): value is NormalizedArtifactTimelineItem => Boolean(value));
}

function compactStrings(values: string[]) {
  return values.filter((value) => value.trim().length > 0);
}

function uniqueList(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function shortHash(value: string) {
  if (!value || value === "none") return value || "none";
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
