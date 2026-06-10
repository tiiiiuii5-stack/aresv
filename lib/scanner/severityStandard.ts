export type NormalizedSeverity = "critical" | "high" | "medium" | "low" | "unknown";

export type SeverityStandardEntry = {
  severity: NormalizedSeverity;
  rank: number;
  cvssRange: string;
  sarifLevel: "error" | "warning" | "note" | "none";
  githubImpact: "failure" | "warning" | "notice" | "none";
  defaultMergePolicy: "block" | "review" | "inform";
  meaning: string;
};

export const VENTUREOS_SEVERITY_STANDARD_VERSION = "VOS-SS-2026.06";

export const VENTUREOS_SEVERITY_STANDARD: Record<NormalizedSeverity, SeverityStandardEntry> = {
  critical: {
    severity: "critical",
    rank: 4,
    cvssRange: "9.0-10.0 equivalent",
    sarifLevel: "error",
    githubImpact: "failure",
    defaultMergePolicy: "block",
    meaning: "Confirmed exploitability, production outage path, data loss path, or trust boundary failure.",
  },
  high: {
    severity: "high",
    rank: 3,
    cvssRange: "7.0-8.9 equivalent",
    sarifLevel: "error",
    githubImpact: "failure",
    defaultMergePolicy: "block",
    meaning: "Confirmed blocker for safe release, missing production dependency, unsafe mutation, or broken execution path.",
  },
  medium: {
    severity: "medium",
    rank: 2,
    cvssRange: "4.0-6.9 equivalent",
    sarifLevel: "warning",
    githubImpact: "warning",
    defaultMergePolicy: "review",
    meaning: "Confirmed reliability, maintainability, or deployment weakness that should be reviewed before scaling.",
  },
  low: {
    severity: "low",
    rank: 1,
    cvssRange: "0.1-3.9 equivalent",
    sarifLevel: "note",
    githubImpact: "notice",
    defaultMergePolicy: "inform",
    meaning: "Confirmed informational or hygiene issue with low immediate production impact.",
  },
  unknown: {
    severity: "unknown",
    rank: 0,
    cvssRange: "not mapped",
    sarifLevel: "none",
    githubImpact: "none",
    defaultMergePolicy: "inform",
    meaning: "Severity was not supplied or cannot be normalized.",
  },
};

export function normalizeSeverity(value: unknown): NormalizedSeverity {
  const clean = String(value || "").trim().toLowerCase();
  if (clean === "critical" || clean === "blocker" || clean === "fatal") return "critical";
  if (clean === "high" || clean === "major") return "high";
  if (clean === "medium" || clean === "moderate" || clean === "warning") return "medium";
  if (clean === "low" || clean === "minor" || clean === "info" || clean === "informational" || clean === "note") return "low";
  return "unknown";
}

export function severityStandardFor(value: unknown): SeverityStandardEntry {
  return VENTUREOS_SEVERITY_STANDARD[normalizeSeverity(value)];
}

export function severityRank(value: unknown) {
  return severityStandardFor(value).rank;
}

export function severitySortDescending<T extends { severity?: unknown }>(items: T[]) {
  return items.slice().sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

export function severityBreakdown(items: Array<{ severity?: unknown }>) {
  return items.reduce<Record<NormalizedSeverity, number>>(
    (totals, item) => {
      totals[normalizeSeverity(item.severity)] += 1;
      return totals;
    },
    { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 },
  );
}
