import { createHash, randomUUID } from "node:crypto";

import { tryDatabase } from "@/lib/prisma";
import { sanitizeMetadata } from "@/lib/services/platformSupport";
import type { AnalyzeAppResult, IntelligenceIssue, SeverityBreakdown } from "@/lib/services/intelligenceAnalysis";

export type RepairAttemptInput = {
  attemptNumber?: number;
  strategy?: string;
  status?: string;
  beforeScore?: number;
  afterScore?: number;
  issuesBefore?: unknown[];
  issuesAfter?: unknown[];
  changes?: unknown[];
  metadata?: Record<string, unknown>;
};

export type AppTelemetryInput = {
  projectId?: string | null;
  source: string;
  framework: string;
  modules: string[];
  result: AnalyzeAppResult;
  appMetadata?: Record<string, unknown>;
  validationResults?: Record<string, unknown>;
  failureEvents?: unknown[];
  repairAttempts?: RepairAttemptInput[];
};

export async function recordAppTelemetry(input: AppTelemetryInput) {
  const snapshotId = randomUUID();
  const analysisResultId = randomUUID();
  const appCodeHash = hashValue(input.source);
  const structure = extractStructure(input.source);
  const issues = input.result.vulnerabilities.length > 0 ? input.result.vulnerabilities : input.result.issues;
  const failureEvents = normalizeFailureEvents(input.failureEvents, issues);
  const metadata = anonymizeMetadata(input.appMetadata || {});

  const stored = await tryDatabase(async (db) => {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO "app_snapshots" ("id", "projectId", "appCodeHash", "framework", "modules", "structure", "metadata", "sourceLength")
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8)`,
        snapshotId,
        input.projectId || null,
        appCodeHash,
        input.framework,
        JSON.stringify(input.modules),
        JSON.stringify(structure),
        JSON.stringify(metadata),
        input.source.length,
      );

      await tx.$executeRawUnsafe(
        `INSERT INTO "analysis_results" ("id", "projectId", "snapshotId", "securityScore", "failureScore", "readinessScore", "riskLevel", "severityBreakdown", "issues", "failureEvents", "validationResults", "recommendations", "metadata")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb)`,
        analysisResultId,
        input.projectId || null,
        snapshotId,
        input.result.securityScore,
        input.result.failureScore,
        input.result.productionReadinessScore,
        input.result.riskLevel,
        JSON.stringify(input.result.severityBreakdown),
        JSON.stringify(issues.map(summarizeIssue)),
        JSON.stringify(failureEvents),
        JSON.stringify(sanitizeMetadata(input.validationResults || {})),
        JSON.stringify(input.result.recommendations),
        JSON.stringify(
          sanitizeMetadata({
            anonymized: true,
            datasets: ["ai_failure_patterns", "security_intelligence", "builder_comparison"],
            issueCount: issues.length,
            moduleCount: input.modules.length,
            failureIntelligence: {
              predictionCount: input.result.failureIntelligence.predictionCount,
              failureProbabilityScore: input.result.failureIntelligence.failureProbabilityScore,
              releaseRisk: input.result.failureIntelligence.releaseRisk,
              launchDecision: input.result.failureIntelligence.launchDecision,
            },
            failureReport: {
              pipeline: input.result.failureReport.pipeline,
              generatedAfter: input.result.failureReport.generatedAfter,
              releaseDecision: input.result.failureReport.releaseDecision,
              highestRiskMode: input.result.failureReport.highestRiskMode,
            },
            externalIntelligence: {
              engine: input.result.externalIntelligence.engine,
              networkAccess: input.result.externalIntelligence.networkAccess,
              sources: input.result.externalIntelligence.sources,
              vulnerabilityCount: input.result.externalIntelligence.vulnerabilities.length,
            },
          }),
        ),
      );

      await tx.$executeRawUnsafe(
        `INSERT INTO "app_telemetry_events" ("id", "projectId", "snapshotId", "analysisResultId", "eventType", "dataset", "framework", "riskLevel", "severity", "counts", "metadata")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb)`,
        randomUUID(),
        input.projectId || null,
        snapshotId,
        analysisResultId,
        "analysis.completed",
        "security_intelligence",
        input.framework,
        input.result.riskLevel,
        highestSeverity(input.result.severityBreakdown),
        JSON.stringify({
          vulnerabilities: issues.length,
          failureEvents: failureEvents.length,
          repairAttempts: input.repairAttempts?.length || 0,
          ...input.result.severityBreakdown,
        }),
        JSON.stringify(
          sanitizeMetadata({
            appCodeHash,
            structureCounts: structure.counts,
            failureIntelligence: {
              predictionCount: input.result.failureIntelligence.predictionCount,
              releaseRisk: input.result.failureIntelligence.releaseRisk,
            },
            failureReport: {
              pipeline: input.result.failureReport.pipeline,
              releaseDecision: input.result.failureReport.releaseDecision,
            },
            externalIntelligence: {
              networkAccess: input.result.externalIntelligence.networkAccess,
              sources: input.result.externalIntelligence.sources,
              vulnerabilityCount: input.result.externalIntelligence.vulnerabilities.length,
            },
            aggregated: true,
          }),
        ),
      );

      for (const attempt of input.repairAttempts || []) {
        await tx.$executeRawUnsafe(
          `INSERT INTO "repair_attempts" ("id", "snapshotId", "analysisResultId", "attemptNumber", "strategy", "status", "beforeScore", "afterScore", "issuesBefore", "issuesAfter", "changes", "metadata")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb)`,
          randomUUID(),
          snapshotId,
          analysisResultId,
          attempt.attemptNumber ?? 1,
          attempt.strategy || "unspecified",
          attempt.status || "unknown",
          attempt.beforeScore ?? null,
          attempt.afterScore ?? null,
          JSON.stringify(attempt.issuesBefore || []),
          JSON.stringify(attempt.issuesAfter || []),
          JSON.stringify(attempt.changes || []),
          JSON.stringify(anonymizeMetadata(attempt.metadata || {})),
        );
      }
    });

    return { snapshotId, analysisResultId, appCodeHash };
  });

  return stored;
}

function summarizeIssue(issue: IntelligenceIssue) {
  return {
    id: issue.id,
    category: issue.category,
    severity: issue.severity,
    title: issue.title,
    evidence: issue.evidence,
    fixSuggestion: issue.fixSuggestion,
    confidenceScore: issue.confidenceScore,
    filePath: issue.filePath,
    location: issue.location,
    codeSnippet: issue.codeSnippet,
    explanation: issue.explanation,
  };
}

function normalizeFailureEvents(inputEvents: unknown[] | undefined, issues: IntelligenceIssue[]) {
  const explicitEvents = Array.isArray(inputEvents) ? inputEvents.map((event) => sanitizeEvent(event)) : [];
  const inferredEvents = issues
    .filter((issue) => issue.severity === "critical" || issue.severity === "high")
    .map((issue) => ({
      type: "security_validation_failure",
      category: issue.category,
      severity: issue.severity,
      detector: issue.id,
    }));
  return [...explicitEvents, ...inferredEvents];
}

function sanitizeEvent(event: unknown) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return { type: String(event || "unknown") };
  return sanitizeMetadata(event);
}

function extractStructure(source: string) {
  const routeMatches = [...source.matchAll(/(?:app|pages)\/([A-Za-z0-9_[\]\-/]+)\/(?:page|route)\.(?:tsx?|jsx?)/g)].map((match) => match[1]);
  const apiRoutes = [...source.matchAll(/(?:app\/api|pages\/api)\/([A-Za-z0-9_[\]\-/]+)(?:\/route)?\.(?:tsx?|jsx?)/g)].map((match) => match[1]);
  const components = [...source.matchAll(/(?:function|const)\s+([A-Z][A-Za-z0-9_]*)/g)].map((match) => match[1]);
  const models = [...source.matchAll(/\bmodel\s+([A-Z][A-Za-z0-9_]*)/g)].map((match) => match[1]);
  const handlers = [...source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g)].map((match) => match[1]);

  return {
    routes: unique(routeMatches).slice(0, 100),
    apiRoutes: unique(apiRoutes).slice(0, 100),
    components: unique(components).slice(0, 100),
    models: unique(models).slice(0, 100),
    handlers: unique(handlers),
    counts: {
      routes: unique(routeMatches).length,
      apiRoutes: unique(apiRoutes).length,
      components: unique(components).length,
      models: unique(models).length,
      handlers: handlers.length,
    },
  };
}

function anonymizeMetadata(metadata: Record<string, unknown>) {
  const sanitized = sanitizeMetadata(metadata);
  const anonymized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sanitized)) {
    if (/user|email|project|team|owner|actor|customer/i.test(key)) {
      anonymized[`${key}Hash`] = hashValue(String(value));
    } else {
      anonymized[key] = value;
    }
  }
  return anonymized;
}

function highestSeverity(breakdown: SeverityBreakdown) {
  if (breakdown.critical > 0) return "critical";
  if (breakdown.high > 0) return "high";
  if (breakdown.medium > 0) return "medium";
  if (breakdown.low > 0) return "low";
  return "none";
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
