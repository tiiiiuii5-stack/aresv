import { createGitHubAppJwt } from "@/lib/github/auth";
import { getGitHubAppConfig, type GitHubAppConfig } from "@/lib/github/config";
import type {
  GitHubInstallationInfo,
  GitHubInstallationToken,
  GitHubRepositoryFiles,
  GitHubRepositoryInfo,
} from "@/lib/github/types";

type GitHubListRepositoriesResponse = {
  repositories?: GitHubRepositoryInfo[];
};

type GitHubTreeResponse = {
  truncated?: boolean;
  tree?: Array<{
    path?: string;
    mode?: string;
    type?: string;
    sha?: string;
    size?: number;
  }>;
};

type GitHubBlobResponse = {
  content?: string;
  encoding?: string;
  size?: number;
};

type GitHubStatusState = "success" | "failure" | "error" | "pending";

export class GitHubClient {
  constructor(private readonly providedConfig?: GitHubAppConfig) {}

  async getInstallation(installationId: string) {
    const config = this.config();
    const token = await createGitHubAppJwt(config);
    return this.request<GitHubInstallationInfo>(`/app/installations/${encodeURIComponent(installationId)}`, {
      token,
    });
  }

  async createInstallationToken(installationId: string) {
    const config = this.config();
    const token = await createGitHubAppJwt(config);
    return this.request<GitHubInstallationToken>(`/app/installations/${encodeURIComponent(installationId)}/access_tokens`, {
      method: "POST",
      token,
    });
  }

  async listInstallationRepositories(installationToken: string) {
    const first = await this.request<GitHubListRepositoriesResponse>("/installation/repositories?per_page=100", {
      token: installationToken,
    });
    return first.repositories || [];
  }

  async getRepository(installationToken: string, owner: string, repo: string) {
    return this.request<GitHubRepositoryInfo>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
      token: installationToken,
    });
  }

  async getRepositoryFiles(input: {
    installationToken: string;
    owner: string;
    repo: string;
    ref: string;
    maxFiles?: number;
    maxFileBytes?: number;
    maxTotalBytes?: number;
  }): Promise<GitHubRepositoryFiles> {
    const maxFiles = Math.max(1, Math.min(input.maxFiles || 750, 1000));
    const maxFileBytes = Math.max(1_000, Math.min(input.maxFileBytes || 200_000, 500_000));
    const maxTotalBytes = Math.max(10_000, Math.min(input.maxTotalBytes || 1_000_000, 3_000_000));
    const tree = await this.request<GitHubTreeResponse>(
      `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/git/trees/${encodeURIComponent(input.ref)}?recursive=1`,
      { token: input.installationToken },
    );

    const blobs = (tree.tree || [])
      .filter((item) => item.type === "blob" && item.path && item.sha)
      .filter((item) => !ignoredGitHubPath(String(item.path)))
      .filter((item) => Number(item.size || 0) <= maxFileBytes)
      .slice(0, maxFiles);

    const files = [];
    let totalBytes = 0;
    let truncated = Boolean(tree.truncated) || (tree.tree || []).length > blobs.length;

    for (const blob of blobs) {
      if (totalBytes >= maxTotalBytes) {
        truncated = true;
        break;
      }
      const content = await this.getBlobContent(input.installationToken, input.owner, input.repo, String(blob.sha));
      const nextTotal = totalBytes + Buffer.byteLength(content, "utf8");
      if (nextTotal > maxTotalBytes) {
        truncated = true;
        break;
      }
      totalBytes = nextTotal;
      files.push({ path: String(blob.path), content });
    }

    return { files, truncated, ref: input.ref, source: "git-tree" };
  }

  async createCommitStatus(input: {
    installationToken: string;
    owner: string;
    repo: string;
    sha: string;
    state: GitHubStatusState;
    description: string;
    targetUrl?: string;
    context?: string;
  }) {
    return this.request<Record<string, unknown>>(
      `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/statuses/${encodeURIComponent(input.sha)}`,
      {
        method: "POST",
        token: input.installationToken,
        body: {
          state: input.state,
          description: input.description.slice(0, 140),
          target_url: input.targetUrl,
          context: input.context || "VentureOS Readiness",
        },
      },
    );
  }

  async createPullRequestReview(input: {
    installationToken: string;
    owner: string;
    repo: string;
    pullNumber: number;
    body: string;
  }) {
    return this.request<{ id?: number | string }>(
      `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/pulls/${input.pullNumber}/reviews`,
      {
        method: "POST",
        token: input.installationToken,
        body: {
          event: "COMMENT",
          body: input.body,
        },
      },
    );
  }

  private async getBlobContent(installationToken: string, owner: string, repo: string, sha: string) {
    const blob = await this.request<GitHubBlobResponse>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(sha)}`,
      { token: installationToken },
    );
    if (blob.encoding !== "base64" || !blob.content) return "";
    return Buffer.from(blob.content.replace(/\s+/g, ""), "base64").toString("utf8");
  }

  private async request<T>(path: string, input: {
    method?: string;
    token: string;
    body?: Record<string, unknown>;
  }): Promise<T> {
    const response = await fetch(`${this.config().apiBaseUrl}${path}`, {
      method: input.method || "GET",
      headers: {
        Authorization: `Bearer ${input.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(input.body ? { "Content-Type": "application/json" } : {}),
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) as Record<string, unknown> : {};
    if (!response.ok) {
      const message = typeof data.message === "string" ? data.message : `GitHub API request failed with ${response.status}.`;
      throw new Error(message);
    }
    return data as T;
  }

  private config() {
    return this.providedConfig || getGitHubAppConfig();
  }
}

export const githubClient = new GitHubClient();

function ignoredGitHubPath(path: string) {
  return (
    /(^|\/)(node_modules|\.next|dist|build|coverage|\.git|generated-apps|vendor)\//i.test(path) ||
    /\.(png|jpg|jpeg|gif|webp|ico|zip|pdf|lockb|woff2?|ttf|eot|mp4|mov|avi|bin)$/i.test(path)
  );
}
