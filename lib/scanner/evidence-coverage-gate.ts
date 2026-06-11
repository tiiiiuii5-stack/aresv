export type EvidenceCoverageInput = {
  inputSource: "public_github_repository" | "pasted_code" | "submitted_source";
  inputLength: number;
  inputLimit: number;
  inputTruncated: boolean;
  repository?: {
    filesLoaded: number;
    totalFilesDiscovered: number;
    truncated: boolean;
  } | null;
};

export type EvidenceCoverageAssessment = {
  source: EvidenceCoverageInput["inputSource"];
  level: "thin" | "limited" | "partial" | "broad" | "complete";
  confidence: number;
  coverageRatio: number | null;
  filesLoaded: number | null;
  totalFilesDiscovered: number | null;
  inputLength: number;
  inputLimit: number;
  inputTruncated: boolean;
  repositoryTruncated: boolean;
  scoreCap: number;
  scoreCapped: boolean;
  warnings: string[];
};

export type EvidenceAdjustedScores = {
  securityScore: number;
  failureScore: number;
  productionReadinessScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  rawScores: {
    securityScore: number;
    failureScore: number;
    productionReadinessScore: number;
    riskLevel: string;
  };
};

export function assessEvidenceCoverage(input: EvidenceCoverageInput): EvidenceCoverageAssessment {
  if (input.repository) {
    const filesLoaded = Math.max(0, Math.round(input.repository.filesLoaded || 0));
    const totalFilesDiscovered = Math.max(filesLoaded, Math.round(input.repository.totalFilesDiscovered || 0));
    const coverageRatio = totalFilesDiscovered > 0 ? filesLoaded / totalFilesDiscovered : null;
    const repositoryTruncated = Boolean(input.repository.truncated);
    const capped = repositoryTruncated || input.inputTruncated;

    let level: EvidenceCoverageAssessment["level"] = "complete";
    let confidence = 90;
    let scoreCap = 85;

    if (coverageRatio == null || coverageRatio < 0.05) {
      level = "thin";
      confidence = 25;
      scoreCap = 55;
    } else if (coverageRatio < 0.15) {
      level = "limited";
      confidence = 40;
      scoreCap = 65;
    } else if (coverageRatio < 0.35) {
      level = "partial";
      confidence = 55;
      scoreCap = 72;
    } else if (coverageRatio < 0.8 || capped) {
      level = "broad";
      confidence = 72;
      scoreCap = 80;
    }

    const warnings = [];
    if (repositoryTruncated) {
      warnings.push(`Repository evidence was capped: ${filesLoaded} of ${totalFilesDiscovered} discovered file(s) were included.`);
    }
    if (input.inputTruncated) {
      warnings.push(`Source input was capped at ${input.inputLimit.toLocaleString()} characters.`);
    }
    if (scoreCap < 100) {
      warnings.push(`Readiness scores are capped at ${scoreCap}/100 because evidence coverage is ${level}.`);
    }

    return {
      source: input.inputSource,
      level,
      confidence,
      coverageRatio,
      filesLoaded,
      totalFilesDiscovered,
      inputLength: input.inputLength,
      inputLimit: input.inputLimit,
      inputTruncated: input.inputTruncated,
      repositoryTruncated,
      scoreCap,
      scoreCapped: scoreCap < 100,
      warnings,
    };
  }

  const inputLength = Math.max(0, Math.round(input.inputLength || 0));
  let level: EvidenceCoverageAssessment["level"] = "limited";
  let confidence = 45;
  let scoreCap = 65;

  if (input.inputTruncated) {
    level = "thin";
    confidence = 30;
    scoreCap = 58;
  } else if (inputLength >= 20_000) {
    level = "partial";
    confidence = 60;
    scoreCap = 75;
  } else if (inputLength >= 4_000) {
    level = "limited";
    confidence = 45;
    scoreCap = 68;
  } else {
    level = "thin";
    confidence = 30;
    scoreCap = 58;
  }

  const warnings = [
    `Submitted source evidence is ${level}; no repository-wide file inventory was available.`,
    `Readiness scores are capped at ${scoreCap}/100 for preview evidence.`,
  ];

  return {
    source: input.inputSource,
    level,
    confidence,
    coverageRatio: null,
    filesLoaded: null,
    totalFilesDiscovered: null,
    inputLength,
    inputLimit: input.inputLimit,
    inputTruncated: input.inputTruncated,
    repositoryTruncated: false,
    scoreCap,
    scoreCapped: true,
    warnings,
  };
}

export function applyEvidenceCoverageGate(
  scores: {
    securityScore: number;
    failureScore: number;
    productionReadinessScore: number;
    riskLevel: string;
  },
  coverage: EvidenceCoverageAssessment,
): EvidenceAdjustedScores {
  const securityScore = clampScore(Math.min(Number(scores.securityScore || 0), coverage.scoreCap));
  const productionReadinessScore = clampScore(Math.min(Number(scores.productionReadinessScore || 0), coverage.scoreCap));
  return {
    securityScore,
    failureScore: clampScore(100 - securityScore),
    productionReadinessScore,
    riskLevel: riskLevelForEvidenceAdjustedScore(productionReadinessScore, coverage),
    rawScores: {
      securityScore: clampScore(scores.securityScore),
      failureScore: clampScore(scores.failureScore),
      productionReadinessScore: clampScore(scores.productionReadinessScore),
      riskLevel: String(scores.riskLevel || "unknown"),
    },
  };
}

function riskLevelForEvidenceAdjustedScore(score: number, coverage: EvidenceCoverageAssessment): EvidenceAdjustedScores["riskLevel"] {
  if (coverage.level === "thin") return "high";
  if (score < 45) return "critical";
  if (score < 70) return "high";
  if (coverage.level === "complete" && score >= 85) return "low";
  if (score < 88 || coverage.level === "limited") return "medium";
  return "low";
}

function clampScore(value: unknown) {
  const number = Math.round(Number(value || 0));
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number));
}
