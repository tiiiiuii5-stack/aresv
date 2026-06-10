import { tryDatabase } from "@/lib/prisma";

type CountRow = {
  name: string | null;
  category?: string | null;
  severity?: string | null;
  title?: string | null;
  analyses?: bigint | number | null;
  count?: bigint | number | null;
  total?: bigint | number | null;
  affectedAnalyses?: bigint | number | null;
  avgSecurityScore?: number | string | null;
  avgFailureScore?: number | string | null;
  avgReadinessScore?: number | string | null;
  criticalCount?: bigint | number | null;
  highCount?: bigint | number | null;
  repairAttempts?: bigint | number | null;
};

export type AggregatedInsightResponse<T> = {
  ok: true;
  generatedAt: string;
  source: "telemetry";
  aggregationOnly: true;
  dataAvailable: boolean;
  summary: Record<string, unknown>;
  results: T[];
};

export class IntelligenceAggregationService {
  async failurePatterns() {
    const data = await tryDatabase(async (db) => {
      const [summary, patterns] = await Promise.all([
        db.$queryRawUnsafe<Array<{ totalAnalyses: bigint; totalFailureEvents: bigint; repairAttempts: bigint }>>(
          `SELECT
            COUNT(DISTINCT ar."id")::bigint AS "totalAnalyses",
            COALESCE(SUM(jsonb_array_length(ar."failureEvents")), 0)::bigint AS "totalFailureEvents",
            COUNT(ra."id")::bigint AS "repairAttempts"
           FROM "analysis_results" ar
           LEFT JOIN "repair_attempts" ra ON ra."analysisResultId" = ar."id"`,
        ),
        db.$queryRawUnsafe<CountRow[]>(
          `SELECT
            COALESCE(event->>'type', 'unknown') AS name,
            COALESCE(event->>'category', 'unknown') AS category,
            COALESCE(event->>'severity', 'unknown') AS severity,
            COUNT(*)::bigint AS count,
            COUNT(DISTINCT ar."id")::bigint AS "affectedAnalyses"
           FROM "analysis_results" ar
           CROSS JOIN LATERAL jsonb_array_elements(ar."failureEvents") AS event
           GROUP BY name, category, severity
           ORDER BY count DESC, "affectedAnalyses" DESC
           LIMIT 25`,
        ),
      ]);

      const totalAnalyses = toNumber(summary[0]?.totalAnalyses);
      return {
        summary: {
          totalAnalyses,
          totalFailureEvents: toNumber(summary[0]?.totalFailureEvents),
          repairAttempts: toNumber(summary[0]?.repairAttempts),
        },
        results: patterns.map((row) => ({
          failureType: row.name || "unknown",
          category: row.category || "unknown",
          severity: row.severity || "unknown",
          occurrences: toNumber(row.count),
          affectedAnalyses: toNumber(row.affectedAnalyses),
          affectedRate: rate(toNumber(row.affectedAnalyses), totalAnalyses),
        })),
      };
    });

    return response(data, { totalAnalyses: 0, totalFailureEvents: 0, repairAttempts: 0 });
  }

  async securityTrends() {
    const data = await tryDatabase(async (db) => {
      const [summary, vulnerabilities, severity] = await Promise.all([
        db.$queryRawUnsafe<Array<{ totalAnalyses: bigint; avgSecurityScore: number | string | null; criticalAnalyses: bigint }>>(
          `SELECT
            COUNT(*)::bigint AS "totalAnalyses",
            AVG("securityScore") AS "avgSecurityScore",
            COUNT(*) FILTER (WHERE "riskLevel" = 'critical')::bigint AS "criticalAnalyses"
           FROM "analysis_results"`,
        ),
        db.$queryRawUnsafe<CountRow[]>(
          `SELECT
            issue->>'id' AS name,
            issue->>'title' AS title,
            issue->>'category' AS category,
            issue->>'severity' AS severity,
            COUNT(*)::bigint AS count,
            COUNT(DISTINCT ar."id")::bigint AS "affectedAnalyses"
           FROM "analysis_results" ar
           CROSS JOIN LATERAL jsonb_array_elements(ar."issues") AS issue
           GROUP BY name, title, category, severity
           ORDER BY count DESC, "affectedAnalyses" DESC
           LIMIT 25`,
        ),
        db.$queryRawUnsafe<CountRow[]>(
          `SELECT
            issue->>'severity' AS name,
            COUNT(*)::bigint AS count
           FROM "analysis_results" ar
           CROSS JOIN LATERAL jsonb_array_elements(ar."issues") AS issue
           GROUP BY name
           ORDER BY count DESC`,
        ),
      ]);

      const totalAnalyses = toNumber(summary[0]?.totalAnalyses);
      return {
        summary: {
          totalAnalyses,
          averageSecurityScore: rounded(summary[0]?.avgSecurityScore),
          criticalAnalysisRate: rate(toNumber(summary[0]?.criticalAnalyses), totalAnalyses),
          severityBreakdown: Object.fromEntries(severity.map((row) => [row.name || "unknown", toNumber(row.count)])),
        },
        results: vulnerabilities.map((row) => ({
          vulnerability: row.name || "unknown",
          title: row.title || "Unknown vulnerability",
          category: row.category || "unknown",
          severity: row.severity || "unknown",
          occurrences: toNumber(row.count),
          affectedAnalyses: toNumber(row.affectedAnalyses),
          affectedRate: rate(toNumber(row.affectedAnalyses), totalAnalyses),
        })),
      };
    });

    return response(data, { totalAnalyses: 0, averageSecurityScore: 0, criticalAnalysisRate: 0, severityBreakdown: {} });
  }

  async frameworkBenchmarks() {
    const data = await tryDatabase(async (db) => {
      const rows = await db.$queryRawUnsafe<CountRow[]>(
        `SELECT
          s."framework" AS name,
          COUNT(ar."id")::bigint AS analyses,
          AVG(ar."securityScore") AS "avgSecurityScore",
          AVG(ar."failureScore") AS "avgFailureScore",
          AVG(ar."readinessScore") AS "avgReadinessScore",
          COUNT(*) FILTER (WHERE ar."riskLevel" = 'critical')::bigint AS "criticalCount",
          COUNT(*) FILTER (WHERE ar."riskLevel" = 'high')::bigint AS "highCount",
          COUNT(ra."id")::bigint AS "repairAttempts"
         FROM "app_snapshots" s
         JOIN "analysis_results" ar ON ar."snapshotId" = s."id"
         LEFT JOIN "repair_attempts" ra ON ra."analysisResultId" = ar."id"
         GROUP BY s."framework"
         ORDER BY analyses DESC, "avgSecurityScore" DESC
         LIMIT 50`,
      );

      const results = rows.map((row) => {
        const analyses = toNumber(row.analyses);
        const avgSecurityScore = rounded(row.avgSecurityScore);
        const avgFailureScore = rounded(row.avgFailureScore);
        const avgReadinessScore = rounded(row.avgReadinessScore);
        return {
          framework: row.name || "unknown",
          analyses,
          averageSecurityScore: avgSecurityScore,
          averageFailureScore: avgFailureScore,
          averageReadinessScore: avgReadinessScore,
          criticalRate: rate(toNumber(row.criticalCount), analyses),
          highRiskRate: rate(toNumber(row.criticalCount) + toNumber(row.highCount), analyses),
          repairAttempts: toNumber(row.repairAttempts),
          reliabilityScore: clamp(Math.round(avgSecurityScore * 0.45 + avgReadinessScore * 0.35 + (100 - avgFailureScore) * 0.2)),
        };
      });

      return {
        summary: {
          frameworksCompared: results.length,
          totalAnalyses: results.reduce((sum, item) => sum + item.analyses, 0),
        },
        results,
      };
    });

    return response(data, { frameworksCompared: 0, totalAnalyses: 0 });
  }

  async moduleBenchmarks() {
    const data = await tryDatabase(async (db) => {
      const rows = await db.$queryRawUnsafe<CountRow[]>(
        `SELECT
          module_name AS name,
          COUNT(ar."id")::bigint AS analyses,
          AVG(ar."securityScore") AS "avgSecurityScore",
          AVG(ar."failureScore") AS "avgFailureScore",
          AVG(ar."readinessScore") AS "avgReadinessScore",
          COUNT(*) FILTER (WHERE ar."riskLevel" IN ('critical', 'high'))::bigint AS "highCount",
          COUNT(*) FILTER (WHERE ar."riskLevel" = 'critical')::bigint AS "criticalCount",
          COUNT(ra."id")::bigint AS "repairAttempts"
         FROM "app_snapshots" s
         CROSS JOIN LATERAL jsonb_array_elements_text(s."modules") AS module_name
         JOIN "analysis_results" ar ON ar."snapshotId" = s."id"
         LEFT JOIN "repair_attempts" ra ON ra."analysisResultId" = ar."id"
         GROUP BY module_name
         ORDER BY analyses DESC, "highCount" DESC
         LIMIT 75`,
      );

      const results = rows.map((row) => {
        const analyses = toNumber(row.analyses);
        const avgFailureScore = rounded(row.avgFailureScore);
        return {
          module: row.name || "unknown",
          analyses,
          averageSecurityScore: rounded(row.avgSecurityScore),
          averageFailureScore: avgFailureScore,
          averageReadinessScore: rounded(row.avgReadinessScore),
          highRiskRate: rate(toNumber(row.highCount), analyses),
          criticalRate: rate(toNumber(row.criticalCount), analyses),
          repairAttempts: toNumber(row.repairAttempts),
          failureCorrelationIndex: clamp(Math.round(avgFailureScore + rate(toNumber(row.highCount), analyses) * 40)),
        };
      });

      return {
        summary: {
          modulesCompared: results.length,
          totalModuleOccurrences: results.reduce((sum, item) => sum + item.analyses, 0),
        },
        results,
      };
    });

    return response(data, { modulesCompared: 0, totalModuleOccurrences: 0 });
  }
}

export const intelligenceAggregationService = new IntelligenceAggregationService();

function response<T>(data: { summary: Record<string, unknown>; results: T[] } | null, fallbackSummary: Record<string, unknown>): AggregatedInsightResponse<T> {
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    source: "telemetry",
    aggregationOnly: true,
    dataAvailable: Boolean(data),
    summary: data?.summary || fallbackSummary,
    results: data?.results || [],
  };
}

function toNumber(value: bigint | number | string | null | undefined) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return Number(value) || 0;
  return 0;
}

function rounded(value: bigint | number | string | null | undefined) {
  return Math.round(toNumber(value) * 10) / 10;
}

function rate(count: number, total: number) {
  if (!total) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}
