import { createHash } from "node:crypto";

import type { HistoricalEvidence, ProjectScanFinding, ProjectScanSnapshot } from "@/lib/evolution/projectHistory";

export type VerificationStatus = "VERIFIED" | "PARTIAL" | "FAILED";
export type VerificationSignalStatus = "PASSED" | "IMPROVED" | "FAILED" | "CHANGED" | "UNCHANGED" | "UNAVAILABLE";

export type VerificationSignal = {
  status: VerificationSignalStatus;
  reason: string;
  confidence: number;
};

export type FixVerificationResult = {
  recommendationId: string;
  issueId: string;
  title: string;
  recommendation: string;
  status: VerificationStatus;
  confidence: number;
  evidence: HistoricalEvidence[];
  checks: {
    scanResult: VerificationSignal;
    codeDiff: VerificationSignal;
  };
  affectedFiles: string[];
};

export type FixVerificationReport = {
  engine: "ventureos-fix-verification";
  version: "1.0.0";
  generatedAt: string;
  verifiedFixes: FixVerificationResult[];
  partialFixes: FixVerificationResult[];
  failedFixes: FixVerificationResult[];
  confidence: number;
};

export type FixVerificationInput = {
  previousScan: ProjectScanSnapshot | null;
  currentScan: ProjectScanSnapshot | null;
};

export function verifyRecommendedFixes(input: FixVerificationInput): FixVerificationReport {
  if (!input.previousScan || !input.currentScan) {
    return emptyReport();
  }

  const currentByFingerprint = new Map((input.currentScan?.findings || []).map((finding) => [finding.fingerprint, finding]));
  const verifiedFixes: FixVerificationResult[] = [];
  const partialFixes: FixVerificationResult[] = [];
  const failedFixes: FixVerificationResult[] = [];

  for (const previous of input.previousScan.findings || []) {
    if (!previous.fixSuggestion) continue;
    const current = currentByFingerprint.get(previous.fingerprint) || null;
    const result = verificationFor(previous, current, input.previousScan, input.currentScan);
    if (result.status === "VERIFIED") verifiedFixes.push(result);
    else if (result.status === "PARTIAL") partialFixes.push(result);
    else failedFixes.push(result);
  }

  const total = verifiedFixes.length + partialFixes.length + failedFixes.length;
  return {
    engine: "ventureos-fix-verification",
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    verifiedFixes: sortResults(verifiedFixes),
    partialFixes: sortResults(partialFixes),
    failedFixes: sortResults(failedFixes),
    confidence: total === 0 ? 0 : boundedConfidence((verifiedFixes.length * 0.92 + partialFixes.length * 0.78 + failedFixes.length * 0.88) / total),
  };
}

function verificationFor(previous: ProjectScanFinding, current: ProjectScanFinding | null, previousScan: ProjectScanSnapshot, currentScan: ProjectScanSnapshot): FixVerificationResult {
  const scanResult = scanSignal(previous, current);
  const codeDiff = codeDiffSignal(previous, previousScan, currentScan);
  const status = statusFor(scanResult, codeDiff);
  const baseConfidence = confidenceFor(status, scanResult, codeDiff, previous, current);
  return result(previous, current, status, baseConfidence, scanResult, codeDiff);
}

function scanSignal(previous: ProjectScanFinding, current: ProjectScanFinding | null): VerificationSignal {
  if (!current) {
    return {
      status: "PASSED",
      reason: "Previously recommended finding fingerprint is absent from the latest scan summary.",
      confidence: 0.9,
    };
  }

  if (severityRank(current.severity) < severityRank(previous.severity)) {
    return {
      status: "IMPROVED",
      reason: "Recommended finding still exists, but latest severity is lower than the previous scan.",
      confidence: 0.78,
    };
  }

  return {
    status: "FAILED",
    reason: "Recommended finding fingerprint is still present in the latest scan summary.",
    confidence: 0.88,
  };
}

function codeDiffSignal(previous: ProjectScanFinding, previousScan: ProjectScanSnapshot, currentScan: ProjectScanSnapshot): VerificationSignal {
  const previousCode = previousScan.codeSnapshot || null;
  const currentCode = currentScan.codeSnapshot || null;
  if (!previousCode || !currentCode) {
    return {
      status: "UNAVAILABLE",
      reason: "No stored code snapshot metadata was available for both compared scans.",
      confidence: 0,
    };
  }

  const affectedPath = normalizePath(previous.filePath || "");
  const previousFileHash = affectedPath ? previousCode.fileHashes?.[affectedPath] : undefined;
  const currentFileHash = affectedPath ? currentCode.fileHashes?.[affectedPath] : undefined;
  if (affectedPath && previousFileHash && currentFileHash) {
    if (previousFileHash !== currentFileHash) {
      return {
        status: "CHANGED",
        reason: `Stored code hash changed for affected file ${affectedPath}.`,
        confidence: 0.82,
      };
    }
    return {
      status: "UNCHANGED",
      reason: `Stored code hash is unchanged for affected file ${affectedPath}.`,
      confidence: 0.82,
    };
  }

  if (affectedPath && previousFileHash && !currentFileHash) {
    return {
      status: "CHANGED",
      reason: `Affected file ${affectedPath} was present in the previous code snapshot and absent from the latest code snapshot.`,
      confidence: 0.78,
    };
  }

  if (previousCode.sourceHash && currentCode.sourceHash) {
    if (previousCode.sourceHash !== currentCode.sourceHash) {
      return {
        status: "CHANGED",
        reason: "Stored source hash changed between the previous and latest scan snapshots.",
        confidence: 0.66,
      };
    }
    return {
      status: "UNCHANGED",
      reason: "Stored source hash is unchanged between the previous and latest scan snapshots.",
      confidence: 0.66,
    };
  }

  return {
    status: "UNAVAILABLE",
    reason: "Stored code snapshot metadata did not include comparable file or source hashes.",
    confidence: 0,
  };
}

function statusFor(scanResult: VerificationSignal, codeDiff: VerificationSignal): VerificationStatus {
  if (scanResult.status === "PASSED") {
    return codeDiff.status === "UNCHANGED" ? "PARTIAL" : "VERIFIED";
  }
  if (scanResult.status === "IMPROVED") return "PARTIAL";
  return "FAILED";
}

function confidenceFor(status: VerificationStatus, scanResult: VerificationSignal, codeDiff: VerificationSignal, previous: ProjectScanFinding, current: ProjectScanFinding | null) {
  const codeWeight = codeDiff.status === "UNAVAILABLE" ? 0 : codeDiff.confidence;
  const base =
    codeDiff.status === "UNAVAILABLE"
      ? scanResult.confidence
      : status === "VERIFIED"
        ? scanResult.confidence * 0.65 + codeWeight * 0.35
        : status === "PARTIAL"
          ? scanResult.confidence * 0.7 + codeWeight * 0.3
          : scanResult.confidence * 0.72 + codeWeight * 0.28;
  return boundedConfidence(base + (previous.evidence || current?.evidence ? 0.03 : 0) + (previous.filePath || current?.filePath ? 0.02 : 0));
}

function result(
  previous: ProjectScanFinding,
  current: ProjectScanFinding | null,
  status: VerificationStatus,
  confidence: number,
  scanResult: VerificationSignal,
  codeDiff: VerificationSignal,
): FixVerificationResult {
  const evidenceItems = [
    {
      source: "project_scan_history",
      reason: scanResult.reason,
      confidence: boundedConfidence(scanResult.confidence),
    },
  ];
  if (codeDiff.status !== "UNAVAILABLE") {
    evidenceItems.push({
      source: "code_diff",
      reason: codeDiff.reason,
      confidence: boundedConfidence(codeDiff.confidence),
    });
  }

  return {
    recommendationId: recommendationId(previous),
    issueId: previous.fingerprint,
    title: current?.title || previous.title,
    recommendation: previous.fixSuggestion || "",
    status,
    confidence,
    evidence: evidenceItems,
    checks: {
      scanResult,
      codeDiff,
    },
    affectedFiles: unique([previous.filePath, current?.filePath].map(normalizePath).filter(Boolean)),
  };
}

function recommendationId(finding: ProjectScanFinding) {
  return `rec_${createHash("sha256").update(`${finding.fingerprint}:${finding.fixSuggestion || ""}`).digest("hex").slice(0, 16)}`;
}

function sortResults(results: FixVerificationResult[]) {
  return results
    .slice()
    .sort((a, b) => severityRank(b.status === "FAILED" ? "high" : b.status === "PARTIAL" ? "medium" : "low") - severityRank(a.status === "FAILED" ? "high" : a.status === "PARTIAL" ? "medium" : "low") || a.title.localeCompare(b.title));
}

function emptyReport(): FixVerificationReport {
  return {
    engine: "ventureos-fix-verification",
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    verifiedFixes: [],
    partialFixes: [],
    failedFixes: [],
    confidence: 0,
  };
}

function severityRank(value: string) {
  const clean = value.trim().toLowerCase();
  if (clean === "critical") return 4;
  if (clean === "high") return 3;
  if (clean === "medium") return 2;
  if (clean === "low") return 1;
  return 0;
}

function boundedConfidence(value: number) {
  return Math.max(0, Math.min(0.99, Number(value.toFixed(2))));
}

function normalizePath(value: unknown) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "").trim().toLowerCase();
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}
