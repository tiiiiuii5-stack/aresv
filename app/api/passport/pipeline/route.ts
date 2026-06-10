import { NextRequest } from "next/server";

import { createTrace } from "@/lib/diagnostics";
import {
  buildDecisionExplanation,
  buildPassportPromptPipeline,
  buildTrustRegressionReport,
  createStageObservabilityRecord,
  evaluateGoldenDataset,
  getPassportPipelineStage,
  goldenDataset,
  securityNormalizeInput,
  validatePipelineOutput,
  type PassportPipelineStageId,
} from "@/lib/passport/prompt-pipeline";
import { enforceRateLimit, jsonResponse, readJsonBody, secureErrorResponse } from "@/lib/security/backendSecurity";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rateLimit = { name: "passport-pipeline", limit: 60, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const traceId = createTrace("passport.pipeline.GET");
  try {
    await compileTrust(request, { mode: "publicRead", reason: "passport prompt pipeline lookup" });
    const limit = await enforceRateLimit(request, rateLimit);
    const stage = request.nextUrl.searchParams.get("stage") as PassportPipelineStageId | null;
    const source = request.nextUrl.searchParams.get("source") || undefined;
    const passportId = request.nextUrl.searchParams.get("passportId") || undefined;
    if (stage) {
      const result = getPassportPipelineStage(stage, { source, passportId });
      if (!result) return jsonResponse({ ok: false, traceId, error: "Unknown pipeline stage." }, { status: 404, headers: limit.headers });
      return jsonResponse({ ok: true, traceId, stage: result }, { headers: limit.headers });
    }
    return jsonResponse({ ok: true, traceId, pipeline: buildPassportPromptPipeline({ source, passportId }) }, { headers: limit.headers });
  } catch (error) {
    return secureErrorResponse("passport.pipeline.GET", traceId, error, { fallbackStatus: 400 });
  }
}

export async function POST(request: NextRequest) {
  const traceId = createTrace("passport.pipeline.POST");
  try {
    await compileTrust(request, { mode: "publicNonPersistent", reason: "passport prompt pipeline build or validation" });
    const limit = await enforceRateLimit(request, rateLimit);
    const body = await readJsonBody<{
      mode?: unknown;
      stage?: PassportPipelineStageId;
      source?: unknown;
      repoOrUrlOrCode?: unknown;
      evidencePack?: unknown;
      previousScan?: unknown;
      newScan?: unknown;
      passportId?: unknown;
      evaluations?: unknown;
      trustState?: unknown;
      attestation?: unknown;
      previousLedgerEvent?: unknown;
      output?: unknown;
      outputs?: Array<{ id: string; trustScore: number; qualityScore: number; safetyScore: number; verdict: string; riskFlags?: string[] }>;
      validate?: unknown;
    }>(request, { maxBytes: 80_000 });
    const mode = String(body.mode || "").trim();
    if (mode === "golden_dataset") {
      return jsonResponse({ ok: true, traceId, dataset: goldenDataset() }, { headers: limit.headers });
    }
    if (mode === "evaluate_golden_dataset") {
      return jsonResponse({ ok: true, traceId, evaluation: evaluateGoldenDataset(Array.isArray(body.outputs) ? body.outputs : []) }, { headers: limit.headers });
    }
    if (mode === "security_normalizer") {
      return jsonResponse({ ok: true, traceId, normalized: securityNormalizeInput(body.source || body.repoOrUrlOrCode) }, { headers: limit.headers });
    }
    if (mode === "observability" && body.stage) {
      return jsonResponse({ ok: true, traceId, observability: createStageObservabilityRecord({ stage: body.stage, inputText: body.source || body.repoOrUrlOrCode, outputText: body.output }) }, { headers: limit.headers });
    }
    if (mode === "decision_explainability") {
      const source = objectValue(body.output);
      return jsonResponse({ ok: true, traceId, explanation: buildDecisionExplanation({
        verdict: String(source.verdict || "CAUTION"),
        trustScore: Number(source.trustScore || 0),
        qualityScore: Number(source.qualityScore || 0),
        safetyScore: Number(source.safetyScore || 0),
        previousTrustScore: source.previousTrustScore === undefined ? undefined : Number(source.previousTrustScore),
        decision: String(source.decision || ""),
        evidenceIds: Array.isArray(source.evidenceIds) ? source.evidenceIds.map(String) : [],
      }) }, { headers: limit.headers });
    }
    if (mode === "trust_regression") {
      return jsonResponse({ ok: true, traceId, report: buildTrustRegressionReport(objectValue(body.previousScan), objectValue(body.newScan)) }, { headers: limit.headers });
    }
    if (body.validate && body.stage) {
      return jsonResponse({ ok: true, traceId, validation: validatePipelineOutput(body.stage, body.output) }, { headers: limit.headers });
    }
    if (body.stage) {
      const stage = getPassportPipelineStage(body.stage, body);
      if (!stage) return jsonResponse({ ok: false, traceId, error: "Unknown pipeline stage." }, { status: 404, headers: limit.headers });
      return jsonResponse({ ok: true, traceId, stage }, { headers: limit.headers });
    }
    return jsonResponse({ ok: true, traceId, pipeline: buildPassportPromptPipeline(body) }, { headers: limit.headers });
  } catch (error) {
    return secureErrorResponse("passport.pipeline.POST", traceId, error, { fallbackStatus: 400 });
  }
}

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}
