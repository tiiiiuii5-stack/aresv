import { randomUUID } from "node:crypto";

import { encryptedGitHubToken, type GitHubOAuthTokenResponse } from "@/lib/github/auth";
import { githubClient } from "@/lib/github/client";
import { assertGitHubRepositoryPermissions } from "@/lib/github/permissions";
import type {
  GitHubConnectedRepository,
  GitHubInstallationInfo,
  GitHubRepositoryInfo,
  GitHubScanJobType,
  GitHubWebhookEnvelope,
} from "@/lib/github/types";
import { tryDatabase } from "@/lib/prisma";
import type { AuthSession } from "@/lib/auth/session";
import { dbOrThrow, sanitizeMetadata } from "@/lib/services/platformSupport";
import { recordProjectRepositoryLink, resolveWorkspaceProjectIdForUser } from "@/lib/services/projectWorkspace";

export type GitHubInstallationRow = {
  id: string;
  userId: string;
  installationId: string;
  accountLogin: string;
  accountId: string;
  accountType: string;
  repositorySelection: string | null;
  permissions: unknown;
  status: string;
  metadata: unknown;
};

export type GitHubRepositoryRow = GitHubConnectedRepository;

export type GitHubScanJobRow = {
  id: string;
  repositoryId: string;
  projectId: string | null;
  userId: string;
  jobType: GitHubScanJobType;
  status: string;
  githubDeliveryId: string | null;
  githubEvent: string | null;
  pullRequestNumber: number | null;
  headSha: string | null;
  baseSha: string | null;
  readinessScore: number | null;
  findingsCount: number | null;
  criticalFindingsCount: number | null;
  errorMessage: string | null;
  attempts: number;
  metadata: unknown;
};

export async function recordGitHubInstallation(input: {
  session: AuthSession;
  installation: GitHubInstallationInfo;
  oauth?: GitHubOAuthTokenResponse | null;
}) {
  assertGitHubRepositoryPermissions(input.installation.permissions || {});
  const db = dbOrThrow();
  const installationId = String(input.installation.id);
  const account = input.installation.account;
  const rows = await db.$queryRawUnsafe<GitHubInstallationRow[]>(
    `INSERT INTO "github_installations" ("id", "userId", "installationId", "accountLogin", "accountId", "accountType", "repositorySelection", "permissions", "userAccessToken", "userRefreshToken", "userTokenExpiresAt", "refreshTokenExpiresAt", "status", "metadata")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, 'active', $13::jsonb)
     ON CONFLICT ("installationId")
     DO UPDATE SET
       "userId" = EXCLUDED."userId",
       "accountLogin" = EXCLUDED."accountLogin",
       "accountId" = EXCLUDED."accountId",
       "accountType" = EXCLUDED."accountType",
       "repositorySelection" = EXCLUDED."repositorySelection",
       "permissions" = EXCLUDED."permissions",
       "userAccessToken" = COALESCE(EXCLUDED."userAccessToken", "github_installations"."userAccessToken"),
       "userRefreshToken" = COALESCE(EXCLUDED."userRefreshToken", "github_installations"."userRefreshToken"),
       "userTokenExpiresAt" = COALESCE(EXCLUDED."userTokenExpiresAt", "github_installations"."userTokenExpiresAt"),
       "refreshTokenExpiresAt" = COALESCE(EXCLUDED."refreshTokenExpiresAt", "github_installations"."refreshTokenExpiresAt"),
       "status" = 'active',
       "metadata" = EXCLUDED."metadata",
       "updatedAt" = CURRENT_TIMESTAMP
     RETURNING "id", "userId", "installationId", "accountLogin", "accountId", "accountType", "repositorySelection", "permissions", "status", "metadata"`,
    randomUUID(),
    input.session.userId,
    installationId,
    account.login,
    String(account.id),
    account.type,
    input.installation.repository_selection || null,
    JSON.stringify(input.installation.permissions || {}),
    encryptedGitHubToken(input.oauth?.access_token),
    encryptedGitHubToken(input.oauth?.refresh_token),
    expiryDate(input.oauth?.expires_in),
    expiryDate(input.oauth?.refresh_token_expires_in),
    JSON.stringify(sanitizeMetadata({ source: "github_app_callback" })),
  );
  return rows[0];
}

export async function listGitHubInstallations(userId: string) {
  const db = dbOrThrow();
  return db.$queryRawUnsafe<GitHubInstallationRow[]>(
    `SELECT "id", "userId", "installationId", "accountLogin", "accountId", "accountType", "repositorySelection", "permissions", "status", "metadata"
     FROM "github_installations"
     WHERE "userId" = $1 AND "status" = 'active'
     ORDER BY "updatedAt" DESC`,
    userId,
  );
}

export async function listConnectedGitHubRepositories(userId: string) {
  const db = dbOrThrow();
  const rows = await db.$queryRawUnsafe<GitHubRepositoryDbRow[]>(
    `SELECT "id", "userId", "projectId", "installationDbId", "installationId", "githubRepositoryId", "owner", "name", "fullName", "defaultBranch", "private", "permissions", "status", "scanStatus", "lastScanAt", "metadata"
     FROM "github_repositories"
     WHERE "userId" = $1 AND "status" = 'connected'
     ORDER BY "updatedAt" DESC`,
    userId,
  );
  return rows.map(normalizeRepositoryRow);
}

export async function listInstallableGitHubRepositories(userId: string, installationId: string) {
  const installation = await requireUserInstallation(userId, installationId);
  const token = await githubClient.createInstallationToken(installation.installationId);
  assertGitHubRepositoryPermissions(token.permissions || jsonObject(installation.permissions));
  return githubClient.listInstallationRepositories(token.token);
}

export async function connectGitHubRepository(input: {
  session: AuthSession;
  projectId?: string | null;
  installationId: string;
  repositoryFullName?: string | null;
  githubRepositoryId?: string | null;
  autoScan?: boolean;
}) {
  const projectId = input.projectId
    ? await resolveWorkspaceProjectIdForUser(input.projectId, input.session.userId)
    : null;
  if (input.projectId && !projectId) throw new Error("PROJECT_NOT_FOUND");

  const installation = await requireUserInstallation(input.session.userId, input.installationId);
  const token = await githubClient.createInstallationToken(installation.installationId);
  assertGitHubRepositoryPermissions(token.permissions || jsonObject(installation.permissions));
  const repository = await resolveRepository(token.token, input);
  const row = await upsertConnectedRepository({
    session: input.session,
    projectId,
    installationDbId: installation.id,
    installationId: installation.installationId,
    repository,
    permissions: token.permissions || jsonObject(installation.permissions),
  });

  if (projectId) {
    await recordProjectRepositoryLink({
      projectId,
      repository: row.fullName,
      branch: row.defaultBranch,
      metadata: {
        provider: "github_app",
        githubRepositoryId: row.githubRepositoryId,
        installationId: row.installationId,
      },
    });
  }

  const scanJob = input.autoScan === false
    ? null
    : await createGitHubScanJob({
      repositoryId: row.id,
      projectId: row.projectId,
      userId: row.userId,
      jobType: "repository_scan",
      githubEvent: "repository.connected",
      headSha: row.defaultBranch,
      metadata: { reason: "repository_connected" },
      enqueue: true,
    });

  return { repository: row, scanJob };
}

export async function disconnectGitHubRepository(userId: string, repositoryId: string) {
  const db = dbOrThrow();
  const rows = await db.$queryRawUnsafe<GitHubRepositoryDbRow[]>(
    `UPDATE "github_repositories"
     SET "status" = 'disconnected', "scanStatus" = 'idle', "disconnectedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
     WHERE "id" = $1 AND "userId" = $2
     RETURNING "id", "userId", "projectId", "installationDbId", "installationId", "githubRepositoryId", "owner", "name", "fullName", "defaultBranch", "private", "permissions", "status", "scanStatus", "lastScanAt", "metadata"`,
    repositoryId,
    userId,
  );
  if (!rows[0]) throw new Error("GitHub repository not found.");
  return normalizeRepositoryRow(rows[0]);
}

export async function createGitHubScanJob(input: {
  repositoryId: string;
  projectId?: string | null;
  userId: string;
  jobType: GitHubScanJobType;
  githubDeliveryId?: string | null;
  githubEvent?: string | null;
  pullRequestNumber?: number | null;
  headSha?: string | null;
  baseSha?: string | null;
  metadata?: Record<string, unknown>;
  enqueue?: boolean;
}) {
  const db = dbOrThrow();
  const scanJobId = randomUUID();
  const rows = await db.$queryRawUnsafe<GitHubScanJobRow[]>(
    `INSERT INTO "github_scan_jobs" ("id", "repositoryId", "projectId", "userId", "jobType", "status", "githubDeliveryId", "githubEvent", "pullRequestNumber", "headSha", "baseSha", "metadata")
     VALUES ($1, $2, $3, $4, $5, 'queued', $6, $7, $8, $9, $10, $11::jsonb)
     RETURNING "id", "repositoryId", "projectId", "userId", "jobType", "status", "githubDeliveryId", "githubEvent", "pullRequestNumber", "headSha", "baseSha", "readinessScore", "findingsCount", "criticalFindingsCount", "errorMessage", "attempts", "metadata"`,
    scanJobId,
    input.repositoryId,
    input.projectId || null,
    input.userId,
    input.jobType,
    input.githubDeliveryId || null,
    input.githubEvent || null,
    input.pullRequestNumber || null,
    input.headSha || null,
    input.baseSha || null,
    JSON.stringify(sanitizeMetadata(input.metadata || {})),
  );
  await db.$executeRawUnsafe(
    `UPDATE "github_repositories" SET "scanStatus" = 'queued', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
    input.repositoryId,
  );
  if (input.enqueue !== false) {
    const { enqueueGitHubScanJob } = await import("@/lib/github/queue");
    await enqueueGitHubScanJob({
      scanJobId,
      repositoryId: input.repositoryId,
      jobType: input.jobType,
    });
  }
  return rows[0];
}

export async function findConnectedRepositoryForWebhook(envelope: GitHubWebhookEnvelope) {
  if (!envelope.installationId || !envelope.repositoryFullName) return null;
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<GitHubRepositoryDbRow[]>(
      `SELECT "id", "userId", "projectId", "installationDbId", "installationId", "githubRepositoryId", "owner", "name", "fullName", "defaultBranch", "private", "permissions", "status", "scanStatus", "lastScanAt", "metadata"
       FROM "github_repositories"
       WHERE "installationId" = $1 AND "fullName" = $2 AND "status" = 'connected'
       LIMIT 1`,
      envelope.installationId,
      envelope.repositoryFullName,
    ),
  );
  return rows?.[0] ? normalizeRepositoryRow(rows[0]) : null;
}

export async function recordGitHubWebhookDelivery(envelope: GitHubWebhookEnvelope, status: "received" | "ignored" | "queued" | "processed" | "failed") {
  const db = dbOrThrow();
  const rows = await db.$queryRawUnsafe<Array<{ deliveryId: string; inserted: boolean }>>(
    `INSERT INTO "github_webhook_deliveries" ("deliveryId", "event", "action", "installationId", "repositoryFullName", "status", "metadata")
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT ("deliveryId") DO NOTHING
     RETURNING "deliveryId", true AS "inserted"`,
    envelope.deliveryId,
    envelope.event,
    envelope.action || null,
    envelope.installationId || null,
    envelope.repositoryFullName || null,
    status,
    JSON.stringify(sanitizeMetadata({ receivedAt: new Date().toISOString() })),
  );
  return { inserted: Boolean(rows[0]?.inserted), deliveryId: envelope.deliveryId };
}

export async function updateGitHubWebhookDelivery(deliveryId: string, status: "ignored" | "queued" | "processed" | "failed", metadata: Record<string, unknown> = {}) {
  await tryDatabase((db) =>
    db.$executeRawUnsafe(
      `UPDATE "github_webhook_deliveries"
       SET "status" = $2, "processedAt" = CURRENT_TIMESTAMP, "metadata" = $3::jsonb, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "deliveryId" = $1`,
      deliveryId,
      status,
      JSON.stringify(sanitizeMetadata(metadata)),
    ),
  );
}

export async function markInstallationSuspended(installationId: string) {
  await tryDatabase((db) =>
    db.$executeRawUnsafe(
      `UPDATE "github_installations" SET "status" = 'suspended', "updatedAt" = CURRENT_TIMESTAMP WHERE "installationId" = $1`,
      installationId,
    ),
  );
}

async function requireUserInstallation(userId: string, installationId: string) {
  const db = dbOrThrow();
  const rows = await db.$queryRawUnsafe<GitHubInstallationRow[]>(
    `SELECT "id", "userId", "installationId", "accountLogin", "accountId", "accountType", "repositorySelection", "permissions", "status", "metadata"
     FROM "github_installations"
     WHERE "userId" = $1 AND "installationId" = $2 AND "status" = 'active'
     LIMIT 1`,
    userId,
    installationId,
  );
  if (!rows[0]) throw new Error("GitHub installation not found.");
  return rows[0];
}

async function resolveRepository(installationToken: string, input: {
  repositoryFullName?: string | null;
  githubRepositoryId?: string | null;
}) {
  const repositories = await githubClient.listInstallationRepositories(installationToken);
  const repository = repositories.find((item) =>
    (input.githubRepositoryId && String(item.id) === input.githubRepositoryId) ||
    (input.repositoryFullName && item.full_name.toLowerCase() === input.repositoryFullName.toLowerCase())
  );
  if (!repository) throw new Error("GitHub repository is not available to this installation.");
  return repository;
}

async function upsertConnectedRepository(input: {
  session: AuthSession;
  projectId: string | null;
  installationDbId: string;
  installationId: string;
  repository: GitHubRepositoryInfo;
  permissions: Record<string, unknown>;
}) {
  const db = dbOrThrow();
  const rows = await db.$queryRawUnsafe<GitHubRepositoryDbRow[]>(
    `INSERT INTO "github_repositories" ("id", "userId", "projectId", "installationDbId", "installationId", "githubRepositoryId", "owner", "name", "fullName", "defaultBranch", "private", "permissions", "status", "scanStatus", "metadata")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, 'connected', 'idle', $13::jsonb)
     ON CONFLICT ("installationId", "githubRepositoryId")
     DO UPDATE SET
       "userId" = EXCLUDED."userId",
       "projectId" = EXCLUDED."projectId",
       "owner" = EXCLUDED."owner",
       "name" = EXCLUDED."name",
       "fullName" = EXCLUDED."fullName",
       "defaultBranch" = EXCLUDED."defaultBranch",
       "private" = EXCLUDED."private",
       "permissions" = EXCLUDED."permissions",
       "status" = 'connected',
       "disconnectedAt" = NULL,
       "metadata" = EXCLUDED."metadata",
       "updatedAt" = CURRENT_TIMESTAMP
     RETURNING "id", "userId", "projectId", "installationDbId", "installationId", "githubRepositoryId", "owner", "name", "fullName", "defaultBranch", "private", "permissions", "status", "scanStatus", "lastScanAt", "metadata"`,
    randomUUID(),
    input.session.userId,
    input.projectId,
    input.installationDbId,
    input.installationId,
    String(input.repository.id),
    input.repository.owner.login,
    input.repository.name,
    input.repository.full_name,
    input.repository.default_branch,
    input.repository.private,
    JSON.stringify(input.permissions),
    JSON.stringify(sanitizeMetadata({ repositoryPermissions: input.repository.permissions || {} })),
  );
  return normalizeRepositoryRow(rows[0]);
}

function expiryDate(seconds?: number) {
  return seconds ? new Date(Date.now() + seconds * 1000) : null;
}

type GitHubRepositoryDbRow = Omit<GitHubConnectedRepository, "lastScanAt" | "metadata" | "permissions"> & {
  lastScanAt: Date | string | null;
  metadata: unknown;
  permissions: unknown;
};

function normalizeRepositoryRow(row: GitHubRepositoryDbRow): GitHubConnectedRepository {
  return {
    ...row,
    lastScanAt: row.lastScanAt ? isoDate(row.lastScanAt) : null,
    metadata: jsonObject(row.metadata),
    permissions: jsonObject(row.permissions),
  };
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

function isoDate(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
