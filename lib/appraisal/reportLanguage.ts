import type { AppraisalEvidenceCoverage, AppraisalEvidenceItem, AppraisalLaunchVerdict } from "@/lib/appraisal/types";

export type ReportAuthorityLevel = "self_attested" | "system_observed" | "third_party_validated" | "not_verified";

export type ReportBoundary = {
  authorityLevel: ReportAuthorityLevel;
  label: string;
  allowedVerbs: string[];
  blockedVerbs: string[];
  statement: string;
};

export type ReportClaim = {
  id: string;
  layer: "source" | "inference" | "narrative";
  authorityLevel: ReportAuthorityLevel;
  text: string;
  evidenceIds: string[];
};

export type ReportLanguageContract = {
  voice: "observational";
  boundaries: ReportBoundary[];
  claims: {
    observed: ReportClaim[];
    inferred: ReportClaim[];
    notVerified: ReportClaim[];
  };
  prohibitedPhrases: string[];
};

const prohibitedPhrases = [
  "verified by us",
  "we confirmed",
  "we assessed",
  "we verified",
  "audit-grade",
  "production ready signals",
  "high confidence",
];

const replacements: Array<[RegExp, string]> = [
  [/\b[Vv]erified by us\b/g, "observed in submitted evidence"],
  [/\b[Ww]e confirmed\b/g, "VentureOS observed"],
  [/\b[Ww]e assessed\b/g, "VentureOS evaluated"],
  [/\b[Ww]e verified\b/g, "VentureOS observed"],
  [/\b[Hh]igh confidence\b/g, "supported by evidence"],
  [/\b[Pp]roduction ready signals\b/g, "readiness indicators"],
  [/\bconfirmed by scan evidence\b/g, "observed in scan evidence"],
  [/\b[Vv]erified claims\b/g, "Observed evidence"],
  [/\b[Vv]erified\b/g, "Observed"],
];

export function buildReportLanguageContract(input: {
  coverage: AppraisalEvidenceCoverage;
  evidence: AppraisalEvidenceItem[];
  verdict: AppraisalLaunchVerdict;
}): ReportLanguageContract {
  return {
    voice: "observational",
    prohibitedPhrases,
    boundaries: [
      {
        authorityLevel: "system_observed",
        label: "Observed evidence",
        allowedVerbs: ["observed", "recorded", "detected", "computed", "linked"],
        blockedVerbs: ["certified", "guaranteed", "audited", "confirmed"],
        statement: "VentureOS reports observations from submitted source evidence, stored scan metadata, signed records, and configured external data sources.",
      },
      {
        authorityLevel: "self_attested",
        label: "Submitted context",
        allowedVerbs: ["submitted", "provided", "declared"],
        blockedVerbs: ["independently verified", "audited"],
        statement: "Repository URLs, pasted source, uploaded files, owner context, and business claims are treated as submitted context unless independently linked to durable evidence.",
      },
      {
        authorityLevel: "not_verified",
        label: "Not verified",
        allowedVerbs: ["not observed", "not measured", "requires external validation"],
        blockedVerbs: ["verified", "confirmed", "proven"],
        statement: "Runtime behavior, legal ownership, financial value, production traffic, compliance status, and private systems outside submitted evidence are not verified by this report.",
      },
    ],
    claims: {
      observed: input.coverage.verifiedClaims.map((text, index) => ({
        id: `observed:${index + 1}`,
        layer: "source",
        authorityLevel: "system_observed",
        text: neutralizeReportText(text),
        evidenceIds: input.evidence.slice(0, 3).map((item) => item.id),
      })),
      inferred: [
        {
          id: "inference:readiness-verdict",
          layer: "inference",
          authorityLevel: "system_observed",
          text: neutralizeReportText(`Launch verdict ${input.verdict} is computed from readiness score, risk severity, and evidence coverage.`),
          evidenceIds: input.evidence.slice(0, 5).map((item) => item.id),
        },
      ],
      notVerified: [...input.coverage.unverifiedClaims, ...input.coverage.unknowns].map((text, index) => ({
        id: `not-verified:${index + 1}`,
        layer: "source",
        authorityLevel: "not_verified",
        text: neutralizeReportText(text),
        evidenceIds: [],
      })),
    },
  };
}

export function neutralizeReportText(value: string) {
  let output = String(value || "").replace(/\s+/g, " ").trim();
  for (const [pattern, replacement] of replacements) {
    output = output.replace(pattern, replacement);
  }
  return output;
}

export function assertNeutralReportLanguage(value: unknown) {
  const text = JSON.stringify(value || {}, (key, nested) => key === "prohibitedPhrases" ? undefined : nested).toLowerCase();
  const found = prohibitedPhrases.filter((phrase) => text.includes(phrase));
  if (found.length) throw new Error(`REPORT_LANGUAGE_BOUNDARY_VIOLATION:${found.join(",")}`);
}
