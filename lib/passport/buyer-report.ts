import { loadPassportDecisionSummary } from "@/lib/passport/decision-log";
import { loadPassport } from "@/lib/passport/passport-engine";
import {
  buildDecisionExplanation,
  buildPassportPromptPipeline,
  buildTrustRegressionReport,
  createStageOutputAuditEnvelope,
} from "@/lib/passport/prompt-pipeline";
import { stableHash } from "@/lib/trust-ledger/hash";

export async function buildBuyerGradePassportReport(passportId: string) {
  const passport = await loadPassport(passportId);
  if (!passport) throw new Error("PASSPORT_NOT_FOUND");
  const decisions = await loadPassportDecisionSummary(passportId);
  const generatedAt = latestTimestamp(passport.updatedAt, decisions.decisions[0]?.timestamp, passport.createdAt);
  const previous = passport.timeline.length > 1
    ? {
        trustScore: Math.max(0, passport.trustScore - (passport.timeline.at(-1)?.deltaScore || 0)),
        qualityScore: passport.qualityScore,
        safetyScore: passport.safetyScore,
        riskFlags: passport.riskFlags,
        confidence: contractConfidence(decisions.currentStatus.decisionConfidence),
      }
    : {
        trustScore: passport.trustScore,
        qualityScore: passport.qualityScore,
        safetyScore: passport.safetyScore,
        riskFlags: passport.riskFlags,
        confidence: contractConfidence(decisions.currentStatus.decisionConfidence),
      };
  const current = {
    trustScore: passport.trustScore,
    qualityScore: passport.qualityScore,
    safetyScore: passport.safetyScore,
    riskFlags: passport.riskFlags,
    confidence: contractConfidence(decisions.currentStatus.decisionConfidence),
  };
  const scoringOutput = {
    trustScore: passport.trustScore,
    qualityScore: passport.qualityScore,
    safetyScore: passport.safetyScore,
    verdict: passport.verdict === "verified" ? "VERIFIED" : passport.verdict === "high_risk" ? "HIGH RISK" : "CAUTION",
    confidence: contractConfidence(decisions.currentStatus.decisionConfidence),
    riskConcentration: passport.riskFlags.length > 2 ? "elevated" : passport.riskFlags.length ? "moderate" : "low",
    reasoningSignals: [
      passport.summaries.trust,
      passport.summaries.quality,
      passport.summaries.safety,
    ],
    systemStabilityEstimate: passport.trustScore >= 85 ? "high" : passport.trustScore >= 70 ? "moderate" : "low",
  };
  const explanation = buildDecisionExplanation({
    verdict: scoringOutput.verdict,
    trustScore: passport.trustScore,
    qualityScore: passport.qualityScore,
    safetyScore: passport.safetyScore,
    previousTrustScore: previous.trustScore,
    decision: decisions.currentStatus.lastDecision,
    evidenceIds: passport.evidence.map((item) => item.id).slice(0, 12),
  });
  const changeHistory = buildTrustRegressionReport(previous, current);
  const pipeline = buildPassportPromptPipeline({ passportId });
  const stageOutputHashes = {
    evidenceIngestion: createStageOutputAuditEnvelope("evidence_ingestion", {
      passportId: passport.passportId,
      repoSnapshotHash: stableHash(passport.softwareIdentity),
      sbomHash: stableHash({ sbom: "UNVERIFIED", passportId: passport.passportId }),
      configHash: stableHash(passport.scores),
      buildMetadataHash: stableHash(passport.evidence),
      timestamp: generatedAt,
    }, generatedAt),
    consensusReduction: createStageOutputAuditEnvelope("consensus_reduction", {
      trustScore: passport.trustScore,
      status: passport.trustScore >= 85 ? "TRUSTED" : passport.trustScore >= 60 ? "WATCHLIST" : "BLOCKED",
      dominantRisks: passport.riskFlags.slice(0, 5),
      evaluationHashes: [stableHash(scoringOutput)],
      reducerVersion: "trust-reducer.v3",
    }, generatedAt),
    ledgerReplay: createStageOutputAuditEnvelope("ledger_replay", {
      passportId: passport.passportId,
      attestationHash: stableHash({ scoringOutput, explanation, changeHistory }),
      timestamp: generatedAt,
      previousHash: stableHash(previous),
      eventHash: stableHash(current),
      replayStatus: "REPLAYABLE",
    }, generatedAt),
  };

  const report = {
    passportId: passport.passportId,
    softwareIdentity: passport.softwareIdentity,
    trustScore: passport.trustScore,
    qualityScore: passport.qualityScore,
    safetyScore: passport.safetyScore,
    verdict: passport.verdict,
    riskBreakdown: {
      riskFlags: passport.riskFlags,
      quality: passport.scores.quality,
      safety: passport.scores.safety,
    },
    evidenceSummary: {
      count: passport.evidence.length,
      highConfidence: passport.evidence.filter((item) => item.confidence === "high").length,
      mediumConfidence: passport.evidence.filter((item) => item.confidence === "medium").length,
      lowConfidence: passport.evidence.filter((item) => item.confidence === "low").length,
      evidence: passport.evidence.slice(0, 12),
    },
    decisionRecommendation: {
      recommendedUse: passport.summaries.recommendedUse,
      trustedForProduction: decisions.currentStatus.trustedForProduction,
      decisionConfidence: decisions.currentStatus.decisionConfidence,
      lastDecision: decisions.currentStatus.lastDecision,
      explanation,
    },
    changeHistory,
    decisions,
    generatedAt,
  };

  const auditWithoutReportHash = {
    reportSchemaVersion: "buyer-passport-report.v1",
    hashAlgorithm: "sha256" as const,
    reportHashScope: "report payload excluding audit.reportHash; generatedAt is anchored to the latest passport or decision timestamp",
    pipeline: {
      name: pipeline.name,
      version: pipeline.version,
      deterministicRulesHash: stableHash(pipeline.deterministicRules),
      promptManifest: pipeline.stages.map((stage) => ({
        stage: stage.id,
        version: stage.promptVersion.version,
        fallbackVersion: stage.promptVersion.fallbackVersion,
        promptHash: stage.promptVersion.hash,
        outputSchemaHash: stableHash(stage.strictSchema),
      })),
    },
    stageOutputHashes,
  };

  return {
    ...report,
    audit: {
      ...auditWithoutReportHash,
      reportHash: stableHash({ ...report, audit: { ...auditWithoutReportHash, reportHash: null } }),
    },
  };
}

function contractConfidence(value: string): "low" | "medium" | "high" {
  if (value === "HIGH") return "high";
  if (value === "MODERATE") return "medium";
  return "low";
}

function latestTimestamp(...values: Array<string | undefined | null>) {
  const timestamps = values
    .map((value) => {
      const time = value ? new Date(value).getTime() : Number.NaN;
      return Number.isFinite(time) ? time : null;
    })
    .filter((value): value is number => value !== null);
  return new Date(Math.max(...timestamps, 0)).toISOString();
}
