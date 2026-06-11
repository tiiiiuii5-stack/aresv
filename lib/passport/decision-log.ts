import { tryDatabase } from "@/lib/prisma";
import { loadPassport } from "@/lib/passport/passport-engine";

export type PassportDecisionType = "approved" | "rejected" | "review_requested" | "used_in_production" | "deployment_blocked" | "production_failure";

export type PassportDecisionRecord = {
  id: string;
  passportId: string;
  decision: PassportDecisionType;
  actor: string;
  context: string;
  timestamp: string;
  trustAtTime: number;
  qualityAtTime: number;
  safetyAtTime: number;
  driftDelta: number;
  reason: string;
};

export type PassportDecisionSummary = {
  passportId: string;
  currentStatus: {
    trustedForProduction: boolean;
    lastDecision: PassportDecisionType | "none";
    decisionConfidence: "HIGH" | "MODERATE" | "LIMITED";
    trustDrift: number;
  };
  counts: {
    approvals: number;
    rejections: number;
    reviewRequests: number;
    productionUses: number;
    deploymentBlocks: number;
    productionFailures: number;
  };
  decisions: PassportDecisionRecord[];
};

const DECISION_EVENT = "passport.decision.recorded";
const decisionSet = new Set<PassportDecisionType>(["approved", "rejected", "review_requested", "used_in_production", "deployment_blocked", "production_failure"]);

export async function recordPassportDecision(input: {
  passportId: string;
  decision: unknown;
  actor?: unknown;
  context?: unknown;
  reason?: unknown;
}) {
  const passportId = cleanText(input.passportId, 80);
  const decision = cleanDecision(input.decision);
  if (!passportId) throw new Error("PASSPORT_ID_REQUIRED");
  if (!decision) throw new Error("DECISION_REQUIRED");

  const passport = await loadPassport(passportId);
  if (!passport) throw new Error("PASSPORT_NOT_FOUND");

  const timestamp = new Date().toISOString();
  const record: PassportDecisionRecord = {
    id: `dec_${hashCode([passportId, decision, timestamp]).toString(16)}`,
    passportId,
    decision,
    actor: cleanText(input.actor, 120) || "anonymous",
    context: cleanText(input.context, 180) || defaultContextFor(decision),
    timestamp,
    trustAtTime: passport.trustScore,
    qualityAtTime: passport.qualityScore,
    safetyAtTime: passport.safetyScore,
    driftDelta: driftFor(decision),
    reason: cleanText(input.reason, 240) || reasonFor(decision),
  };

  await tryDatabase((db) =>
    db.usageEvent.create({
      data: {
        event: DECISION_EVENT,
        userId: record.actor,
        projectId: null,
        metadata: JSON.parse(JSON.stringify({
          passportDecision: true,
          passportId,
          decisionRecord: record,
        })),
      },
    }),
  );

  const summary = await loadPassportDecisionSummary(passportId);
  return { record, summary };
}

export async function loadPassportDecisionSummary(passportIdInput: string): Promise<PassportDecisionSummary> {
  const passportId = cleanText(passportIdInput, 80);
  const rows = await tryDatabase((db) =>
    db.usageEvent.findMany({
      where: {
        event: DECISION_EVENT,
        metadata: { path: ["passportId"], equals: passportId },
      },
      orderBy: { createdAt: "asc" },
      take: 250,
      select: { metadata: true, createdAt: true },
    }),
  );

  const decisions = (rows || [])
    .map((row) => decisionFromMetadata(row.metadata, row.createdAt))
    .filter((item): item is PassportDecisionRecord => Boolean(item));
  const counts = {
    approvals: decisions.filter((item) => item.decision === "approved").length,
    rejections: decisions.filter((item) => item.decision === "rejected").length,
    reviewRequests: decisions.filter((item) => item.decision === "review_requested").length,
    productionUses: decisions.filter((item) => item.decision === "used_in_production").length,
    deploymentBlocks: decisions.filter((item) => item.decision === "deployment_blocked").length,
    productionFailures: decisions.filter((item) => item.decision === "production_failure").length,
  };
  const lastDecision = decisions.at(-1)?.decision || "none";
  const trustDrift = decisions.reduce((sum, item) => sum + item.driftDelta, 0);
  const trustedForProduction =
    counts.productionFailures === 0 &&
    counts.deploymentBlocks === 0 &&
    (counts.approvals > 0 || counts.productionUses > 0) &&
    counts.rejections === 0;

  return {
    passportId,
    currentStatus: {
      trustedForProduction,
      lastDecision,
      decisionConfidence: confidenceFor(counts, decisions.length),
      trustDrift,
    },
    counts,
    decisions: decisions.slice().reverse(),
  };
}

function decisionFromMetadata(metadata: unknown, fallbackDate: Date): PassportDecisionRecord | null {
  const record = objectValue(objectValue(metadata).decisionRecord);
  const decision = cleanDecision(record.decision);
  const passportId = cleanText(record.passportId, 80);
  if (!passportId || !decision) return null;
  return {
    id: cleanText(record.id, 80) || `dec_${fallbackDate.getTime()}`,
    passportId,
    decision,
    actor: cleanText(record.actor, 120) || "anonymous",
    context: cleanText(record.context, 180) || defaultContextFor(decision),
    timestamp: cleanText(record.timestamp, 60) || fallbackDate.toISOString(),
    trustAtTime: numberValue(record.trustAtTime),
    qualityAtTime: numberValue(record.qualityAtTime),
    safetyAtTime: numberValue(record.safetyAtTime),
    driftDelta: numberValue(record.driftDelta),
    reason: cleanText(record.reason, 240) || reasonFor(decision),
  };
}

function cleanDecision(value: unknown): PassportDecisionType | null {
  const clean = cleanText(value, 60).toLowerCase().replace(/[\s-]+/g, "_") as PassportDecisionType;
  return decisionSet.has(clean) ? clean : null;
}

function confidenceFor(counts: PassportDecisionSummary["counts"], total: number): PassportDecisionSummary["currentStatus"]["decisionConfidence"] {
  if (counts.productionUses > 0 && counts.productionFailures === 0 && counts.approvals >= 2) return "HIGH";
  if (total >= 2 && counts.productionFailures === 0) return "MODERATE";
  return "LIMITED";
}

function driftFor(decision: PassportDecisionType) {
  if (decision === "approved") return 1;
  if (decision === "used_in_production") return 2;
  if (decision === "review_requested") return 0;
  if (decision === "rejected") return -4;
  if (decision === "deployment_blocked") return -5;
  if (decision === "production_failure") return -10;
  return 0;
}

function reasonFor(decision: PassportDecisionType) {
  const reasons: Record<PassportDecisionType, string> = {
    approved: "Software approved for the stated context.",
    rejected: "Software rejected for the stated context.",
    review_requested: "Additional review requested before trust decision.",
    used_in_production: "Software marked as used in production.",
    deployment_blocked: "Deployment blocked due to trust, safety, or quality concern.",
    production_failure: "Real-world production failure reported.",
  };
  return reasons[decision];
}

function defaultContextFor(decision: PassportDecisionType) {
  if (decision === "used_in_production" || decision === "production_failure") return "production";
  if (decision === "deployment_blocked") return "deployment";
  if (decision === "approved" || decision === "rejected") return "software trust decision";
  return "review";
}

function cleanText(value: unknown, max: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function hashCode(parts: unknown[]) {
  const source = JSON.stringify(parts);
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}
