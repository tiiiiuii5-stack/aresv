import { randomUUID } from "node:crypto";

import { githubClient } from "@/lib/github/client";
import { decideGitHubGate, formatPullRequestAnalysisComment } from "@/lib/github/statuses";
import type { GitHubGateDecision, GitHubScanJobType } from "@/lib/github/types";
import { createTrace, trace, traceError } from "@/lib/diagnostics";
import { tryDatabase } from "@/lib/prisma";
import { dbOrThrow, sanitizeMetadata } from "@/lib/services/platformSupport";
import { repoScanService, type RepoScanIssue } from "@/lib/services/repoScan";
import { auditLogService } from "@/lib/services/auditLog";
import { getGitHubAppConfig } from "@/lib/github/config";

type GitHubScanContext = {
  scanJobId: string;
  repositoryId: string;
  projectId: string | null;
  userId: string;
  jobType: GitHubScanJobType;
  githubDeliveryId: string | null;
  githubEvent: string | null;
  pullRequestNumber: number | null;
  headSha: string | null;
  baseSha: string | null;
  jobMetadata: unknown;
  installationId: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  repositoryMetadata: unknown;
};

type RepoScanResult = Awaited<ReturnType<typeof repoScanService.scan>>;

export async function runGitHubScanJob(scanJobId: string) {
  const traceId = createTrace("github.scan-job");
  const context = await loadGitHubScanContext(scanJobId);
  if (!context) throw new Error("GitHub scan job not found.");

  await markScanRunning(context.scanJobId);
  trace("github.scan-job", "scan started", {
    traceId,
    scanJobId: context.scanJobId,
    repositoryId: context.repositoryId,
    jobType: context.jobType,
    repository: context.fullName,
  });

  try {
    const installationToken = await githubClient.createInstallationToken(context.installationId);
    if (context.pullRequestNumber && context.headSha) {
      await githubClient.createCommitStatus({
        installationToken: installationToken.token,
        owner: context.owner,
        repo: context.name,
        sha: context.headSha,
        state: "pending",
        description: "VentureOS is analyzing production readiness.",
        targetUrl: targetUrl(context.projectId),
      });
    }

    const ref = context.headSha || context.defaultBranch;
    const repositoryFiles = await githubClient.getRepositoryFiles({
      installationToken: installationToken.token,
      owner: context.owner,
      repo: context.name,
      ref,
    });

    const result = await repoScanService.scan({
      projectId: context.projectId,
      repository: context.fullName,
      files: repositoryFiles.files,
      blockThreshold: 75,
    });
    const criticalFindingsCount = result.issues.filter((issue) => issue.severity === "critical").length;
    const gate = decideGitHubGate({
      readinessScore: result.riskScore,
      blockingIssues: result.blockingIssues.length,
      criticalFindings: criticalFindingsCount,
      assuranceGate: result.assuranceGate,
      blockWarnings: Boolean(jsonObject(context.repositoryMetadata).blockWarnings),
    });

    await completeGitHubScanJob(context, result, gate, {
      filesScanned: repositoryFiles.files.length,
      sourceTruncated: repositoryFiles.truncated,
      ref: repositoryFiles.ref,
    });

    if (context.pullRequestNumber && context.headSha) {
      await publishPullRequestResult(context, installationToken.token, result, gate);
    }

    await auditLogService.record({
      actorId: context.userId,
      projectId: context.projectId,
      action: "github.scan.completed",
      resource: "github_repository",
      resourceId: context.repositoryId,
      outcome: "success",
      traceId,
      metadata: {
        repository: context.fullName,
        readinessScore: result.riskScore,
        status: gate.status,
        gateReasons: gate.reasons?.slice(0, 5),
        findingsCount: result.issues.length,
      },
    }).catch((error) => traceError("github.scan-job", "audit log skipped", error, { traceId }));

    return { context, result, gate };
  } catch (error) {
    await failGitHubScanJob(context, error);
    traceError("github.scan-job", "scan failed", error, { traceId, scanJobId: context.scanJobId });
    throw error;
  }
}

async function publishPullRequestResult(context: GitHubScanContext, installationToken: string, result: RepoScanResult, gate: GitHubGateDecision) {
  if (!context.pullRequestNumber || !context.headSha) return;
  await githubClient.createCommitStatus({
    installationToken,
    owner: context.owner,
    repo: context.name,
    sha: context.headSha,
    state: gate.state,
    description: gate.description,
    targetUrl: targetUrl(context.projectId),
  });

  const comment = formatPullRequestAnalysisComment({
    readinessScore: result.riskScore,
    gate,
    issues: result.issues.slice(0, 5).map((issue) => ({
      title: issue.title,
      severity: issue.severity,
      fixSuggestion: issue.fixSuggestion,
    })),
    recommendations: result.recommendations,
    assurance: {
      scanId: result.assurance.scanId,
      sourceHash: result.assurance.sourceHash,
      ruleSetHash: result.assurance.ruleSetHash,
    },
  });
  const review = await githubClient.createPullRequestReview({
    installationToken,
    owner: context.owner,
    repo: context.name,
    pullNumber: context.pullRequestNumber,
    body: comment,
  });

  await upsertPullRequestAnalysis(context, result, gate, review.id);
}

async function loadGitHubScanContext(scanJobId: string) {
  const db = dbOrThrow();
  const rows = await db.$queryRawUnsafe<GitHubScanContext[]>(
    `SELECT
       j."id" AS "scanJobId",
       j."repositoryId",
       j."projectId",
       j."userId",
       j."jobType",
       j."githubDeliveryId",
       j."githubEvent",
       j."pullRequestNumber",
       j."headSha",
       j."baseSha",
       j."metadata" AS "jobMetadata",
       r."installationId",
       r."owner",
       r."name",
       r."fullName",
       r."defaultBranch",
       r."metadata" AS "repositoryMetadata"
     FROM "github_scan_jobs" j
     JOIN "github_repositories" r ON r."id" = j."repositoryId"
     WHERE j."id" = $1 AND r."status" = 'connected'
     LIMIT 1`,
    scanJobId,
  );
  return rows[0] || null;
}

async function markScanRunning(scanJobId: string) {
  const db = dbOrThrow();
  await db.$executeRawUnsafe(
    `UPDATE "github_scan_jobs"
     SET "status" = 'running', "startedAt" = COALESCE("startedAt", CURRENT_TIMESTAMP), "attempts" = "attempts" + 1, "updatedAt" = CURRENT_TIMESTAMP
     WHERE "id" = $1`,
    scanJobId,
  );
}

async function completeGitHubScanJob(context: GitHubScanContext, result: RepoScanResult, gate: GitHubGateDecision, metadata: Record<string, unknown>) {
  const db = dbOrThrow();
  const criticalFindingsCount = result.issues.filter((issue) => issue.severity === "critical").length;
  await db.$executeRawUnsafe(
    `UPDATE "github_scan_jobs"
     SET "status" = 'completed',
       "readinessScore" = $2,
       "findingsCount" = $3,
       "criticalFindingsCount" = $4,
       "completedAt" = CURRENT_TIMESTAMP,
       "metadata" = $5::jsonb,
       "updatedAt" = CURRENT_TIMESTAMP
     WHERE "id" = $1`,
    context.scanJobId,
    result.riskScore,
    result.issues.length,
    criticalFindingsCount,
    JSON.stringify(sanitizeMetadata({
      ...metadata,
      gate,
      assuranceGate: result.assuranceGate,
      trustScoreExplanation: result.trustScoreExplanation,
      severityStandard: result.severityStandard,
      scanDiff: result.scanDiff,
      launchVerdict: result.launchVerdict,
    })),
  );
  await db.$executeRawUnsafe(
    `UPDATE "github_repositories"
     SET "scanStatus" = $2, "lastScanAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
     WHERE "id" = $1`,
    context.repositoryId,
    gate.status === "FAIL" ? "failed" : gate.status === "WARNING" ? "warning" : "passed",
  );
}

async function failGitHubScanJob(context: GitHubScanContext, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await tryDatabase(async (db) => {
    await db.$executeRawUnsafe(
      `UPDATE "github_scan_jobs"
       SET "status" = 'failed', "errorMessage" = $2, "completedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1`,
      context.scanJobId,
      message.slice(0, 500),
    );
    await db.$executeRawUnsafe(
      `UPDATE "github_repositories" SET "scanStatus" = 'failed', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
      context.repositoryId,
    );
  });
}

async function upsertPullRequestAnalysis(context: GitHubScanContext, result: RepoScanResult, gate: GitHubGateDecision, commentId?: number | string) {
  if (!context.pullRequestNumber || !context.headSha) return;
  const db = dbOrThrow();
  await db.$executeRawUnsafe(
    `INSERT INTO "github_pull_request_analyses" ("id", "repositoryId", "scanJobId", "pullRequestNumber", "headSha", "baseSha", "readinessScore", "status", "findings", "recommendations", "commentId", "statusContext", "metadata")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13::jsonb)
     ON CONFLICT ("repositoryId", "pullRequestNumber", "headSha")
     DO UPDATE SET
       "scanJobId" = EXCLUDED."scanJobId",
       "readinessScore" = EXCLUDED."readinessScore",
       "status" = EXCLUDED."status",
       "findings" = EXCLUDED."findings",
       "recommendations" = EXCLUDED."recommendations",
       "commentId" = EXCLUDED."commentId",
       "statusContext" = EXCLUDED."statusContext",
       "metadata" = EXCLUDED."metadata",
       "updatedAt" = CURRENT_TIMESTAMP`,
    randomUUID(),
    context.repositoryId,
    context.scanJobId,
    context.pullRequestNumber,
    context.headSha,
    context.baseSha,
    result.riskScore,
    gate.status,
    JSON.stringify(result.issues.slice(0, 25).map(summarizeIssue)),
    JSON.stringify(result.recommendations.slice(0, 25)),
    commentId ? String(commentId) : null,
    "VentureOS Readiness",
    JSON.stringify(sanitizeMetadata({
      shouldBlockMerge: gate.shouldBlockMerge,
      gateReasons: gate.reasons?.slice(0, 10),
      gateWarnings: gate.warnings?.slice(0, 10),
      trustScoreExplanation: gate.trustScoreExplanation,
      changeImpact: gate.changeImpact,
    })),
  );
}

function summarizeIssue(issue: RepoScanIssue) {
  return {
    id: issue.id,
    title: issue.title,
    severity: issue.severity,
    category: issue.category,
    filePath: issue.filePath,
    confidenceScore: issue.confidenceScore,
    fixSuggestion: issue.fixSuggestion,
  };
}

function targetUrl(projectId: string | null) {
  const config = getGitHubAppConfig();
  return projectId ? `${config.appUrl}/project/${encodeURIComponent(projectId)}` : `${config.appUrl}/projects`;
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return jsonObject(JSON.parse(value) as unknown);
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
