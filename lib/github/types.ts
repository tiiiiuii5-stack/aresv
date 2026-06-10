import type { RepoFile } from "@/lib/services/repoScan";

export type GitHubPermissionLevel = "none" | "read" | "write" | "admin";

export type GitHubAppPermissions = {
  contents?: GitHubPermissionLevel;
  pull_requests?: GitHubPermissionLevel;
  metadata?: GitHubPermissionLevel;
  statuses?: GitHubPermissionLevel;
  [key: string]: unknown;
};

export type GitHubInstallationAccount = {
  id: number | string;
  login: string;
  type: string;
};

export type GitHubInstallationInfo = {
  id: number | string;
  account: GitHubInstallationAccount;
  permissions: GitHubAppPermissions;
  repository_selection?: string;
};

export type GitHubRepositoryInfo = {
  id: number | string;
  name: string;
  full_name: string;
  owner: { login: string };
  default_branch: string;
  private: boolean;
  permissions?: Record<string, boolean>;
};

export type GitHubInstallationToken = {
  token: string;
  expires_at: string;
  permissions?: GitHubAppPermissions;
  repository_selection?: string;
};

export type GitHubConnectedRepository = {
  id: string;
  userId: string;
  projectId: string | null;
  installationDbId: string;
  installationId: string;
  githubRepositoryId: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  permissions: Record<string, unknown>;
  status: string;
  scanStatus: string;
  lastScanAt: string | null;
  metadata: Record<string, unknown>;
};

export type GitHubScanJobType = "repository_scan" | "pull_request_scan" | "installation_sync";

export type GitHubScanQueueData = {
  scanJobId: string;
  repositoryId: string;
  jobType: GitHubScanJobType;
  traceId?: string;
};

export type GitHubRepositoryFiles = {
  files: RepoFile[];
  truncated: boolean;
  ref: string;
  source: "git-tree";
};

export type GitHubGateStatus = "PASS" | "WARNING" | "FAIL";

export type GitHubGateDecision = {
  status: GitHubGateStatus;
  state: "success" | "failure" | "error" | "pending";
  description: string;
  shouldBlockMerge: boolean;
  reasons?: Array<{
    id: string;
    title: string;
    severity: string;
    evidence?: string;
    filePath?: string;
  }>;
  warnings?: Array<{
    id: string;
    title: string;
    severity: string;
    evidence?: string;
  }>;
  trustScoreExplanation?: unknown;
  severityStandard?: unknown;
  changeImpact?: unknown;
};

export type GitHubWebhookEnvelope = {
  deliveryId: string;
  event: string;
  action?: string;
  installationId?: string;
  repositoryFullName?: string;
  payload: Record<string, unknown>;
};
