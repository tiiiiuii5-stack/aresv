import { randomUUID } from "node:crypto";

import { tryDatabase } from "@/lib/prisma";
import { sanitizeMetadata } from "@/lib/services/platformSupport";
import type { EvolutionFailureType, EvolutionReport } from "@/lib/evolution/evolutionEngine";

export type EvolutionMemoryRecordInput = {
  projectId?: string | null;
  framework?: string;
  report: EvolutionReport;
};

export async function recordEvolutionMemory(input: EvolutionMemoryRecordInput) {
  const metadata = sanitizeMetadata({
    snapshotId: input.report.versionSnapshot.id,
    systemState: input.report.systemState,
    systemVerdict: input.report.systemVerdict,
    readinessScore: input.report.productionReadiness.score,
    rootCauses: input.report.causalAnalysis.rootCauses.slice(0, 10).map((rootCause) => ({
      rootNode: rootCause.rootNode.label,
      route: rootCause.rootNode.route,
      filePath: rootCause.rootNode.filePath,
      confidence: rootCause.confidence,
    })),
    memoryPatterns: input.report.learnMemory.patterns.slice(0, 10),
    futureVersions: input.report.futureVersions.map((version) => ({
      evolutionName: version.evolutionName,
      preview: version.preview,
      verdict: version.systemVerdict,
    })),
  });

  const stored = await tryDatabase(async (db) => {
    await db.$executeRawUnsafe(
      `INSERT INTO "app_telemetry_events" ("id", "projectId", "snapshotId", "analysisResultId", "eventType", "dataset", "framework", "riskLevel", "severity", "counts", "metadata")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb)`,
      randomUUID(),
      input.projectId || null,
      null,
      null,
      "evolution.loop.completed",
      "evolution_memory",
      input.framework || "unknown",
      riskLevelFor(input.report),
      highestFailureType(input.report),
      JSON.stringify({
        events: input.report.eventIngest.events.length,
        confirmedFailures: input.report.failureDetection.confirmedFailures.length,
        rootCauses: input.report.causalAnalysis.rootCauses.length,
        patches: input.report.patchPlan.candidates.length,
        approvedPatches: input.report.patchGate.approvedPatches.length,
        heldPatches: input.report.patchGate.heldPatches.length,
      }),
      JSON.stringify(metadata),
    );
    return true;
  });

  return Boolean(stored);
}

function riskLevelFor(report: EvolutionReport) {
  if (report.systemState === "BROKEN") return "critical";
  if (report.systemState === "RISKY") return "high";
  return "low";
}

function highestFailureType(report: EvolutionReport): EvolutionFailureType | "none" {
  const failures = report.failureDetection.confirmedFailures;
  if (failures.some((failure) => failure.severity === "Critical")) return "Critical";
  if (failures.some((failure) => failure.severity === "High")) return "High";
  if (failures.some((failure) => failure.severity === "Medium")) return "Medium";
  if (failures.some((failure) => failure.severity === "Future Risk")) return "Future Risk";
  return "none";
}
