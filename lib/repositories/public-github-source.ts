export type PublicGitHubRepositorySource = {
  source: "public_github";
  repositoryUrl: string;
  canonicalUrl: string;
  owner: string;
  repo: string;
  ref: string;
  code: string;
  files: Array<{
    path: string;
    size: number;
  }>;
  totalFilesDiscovered: number;
  filesLoaded: number;
  truncated: boolean;
  warnings: string[];
};

type GitHubRepositoryInfo = {
  default_branch?: string;
  private?: boolean;
  html_url?: string;
};

type GitHubTreeResponse = {
  truncated?: boolean;
  tree?: Array<{
    path?: string;
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

type LoadPublicGitHubRepositorySourceInput = {
  repositoryUrl: string;
  maxChars: number;
  maxFiles?: number;
  maxFileBytes?: number;
};

type ParsedGitHubRepositoryUrl = {
  owner: string;
  repo: string;
  ref?: string;
  canonicalUrl: string;
};

const GITHUB_API_BASE = "https://api.github.com";
const DEFAULT_MAX_FILES = 80;
const DEFAULT_MAX_FILE_BYTES = 120_000;

export function parsePublicGitHubRepositoryUrl(value: string): ParsedGitHubRepositoryUrl | null {
  const clean = value.trim();
  if (!clean) return null;

  const url = clean.includes("://") ? new URL(clean) : new URL(`https://github.com/${clean}`);
  if (url.hostname.toLowerCase() !== "github.com") return null;

  const parts = url.pathname.split("/").map((part) => part.trim()).filter(Boolean);
  const owner = parts[0] || "";
  const repo = (parts[1] || "").replace(/\.git$/i, "");
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null;

  const treeIndex = parts.findIndex((part) => part === "tree");
  const ref = treeIndex >= 0 ? parts[treeIndex + 1] : undefined;

  return {
    owner,
    repo,
    ref: ref && /^[A-Za-z0-9_.\-/]+$/.test(ref) ? ref : undefined,
    canonicalUrl: `https://github.com/${owner}/${repo}`,
  };
}

export async function loadPublicGitHubRepositorySource(input: LoadPublicGitHubRepositorySourceInput): Promise<PublicGitHubRepositorySource> {
  const parsed = parsePublicGitHubRepositoryUrl(input.repositoryUrl);
  if (!parsed) {
    throw new Error("Only public GitHub repository URLs are supported. Use https://github.com/owner/repo.");
  }

  const maxChars = Math.max(1_000, Math.min(input.maxChars, 250_000));
  const maxFiles = Math.max(1, Math.min(input.maxFiles || DEFAULT_MAX_FILES, 200));
  const maxFileBytes = Math.max(1_000, Math.min(input.maxFileBytes || DEFAULT_MAX_FILE_BYTES, 250_000));
  const repository = await githubRequest<GitHubRepositoryInfo>(`/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`);
  if (repository.private) {
    throw new Error("This repository is private. Connect the GitHub App or upload source files instead.");
  }

  const ref = parsed.ref || repository.default_branch || "main";
  const tree = await githubRequest<GitHubTreeResponse>(
    `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
  );
  const discovered = (tree.tree || []).filter((item) => item.type === "blob" && item.path && item.sha);
  const candidates = discovered
    .filter((item) => !ignoredRepositoryPath(String(item.path)))
    .filter((item) => sourceExtensionAllowed(String(item.path)))
    .filter((item) => Number(item.size || 0) <= maxFileBytes)
    .sort((a, b) => filePriority(String(a.path)) - filePriority(String(b.path)))
    .slice(0, maxFiles);

  const files: PublicGitHubRepositorySource["files"] = [];
  const codeParts: string[] = [];
  const warnings: string[] = [];
  let totalChars = 0;
  let truncated = Boolean(tree.truncated) || discovered.length > candidates.length;

  for (const candidate of candidates) {
    if (!candidate.sha || !candidate.path) continue;
    const content = await loadBlobContent(parsed.owner, parsed.repo, candidate.sha);
    if (!isTextContent(content)) continue;

    const header = `// FILE: ${candidate.path}\n`;
    const remaining = maxChars - totalChars - header.length;
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    const included = content.length > remaining ? content.slice(0, remaining) : content;
    if (included.length < content.length) truncated = true;

    codeParts.push(`${header}${included}`);
    files.push({ path: String(candidate.path), size: Number(candidate.size || content.length) });
    totalChars += header.length + included.length;
    if (totalChars >= maxChars) {
      truncated = true;
      break;
    }
  }

  if (files.length === 0) {
    throw new Error("No supported source files were readable from this public GitHub repository.");
  }
  if (truncated) {
    warnings.push("Repository source was capped for this review. Use the full appraisal flow or GitHub App connection for broader coverage.");
  }

  return {
    source: "public_github",
    repositoryUrl: input.repositoryUrl.trim(),
    canonicalUrl: repository.html_url || parsed.canonicalUrl,
    owner: parsed.owner,
    repo: parsed.repo,
    ref,
    code: codeParts.join("\n\n").slice(0, maxChars),
    files,
    totalFilesDiscovered: discovered.length,
    filesLoaded: files.length,
    truncated,
    warnings,
  };
}

async function loadBlobContent(owner: string, repo: string, sha: string) {
  const blob = await githubRequest<GitHubBlobResponse>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(sha)}`,
  );
  if (blob.encoding !== "base64" || !blob.content) return "";
  return Buffer.from(blob.content.replace(/\s+/g, ""), "base64").toString("utf8");
}

async function githubRequest<T>(path: string): Promise<T> {
  const token = process.env.GITHUB_PUBLIC_TOKEN?.trim();
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "VentureOS-Appraisal-Intake",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) as { message?: unknown } : {};
  if (!response.ok) {
    const message = typeof payload.message === "string" ? payload.message : `GitHub request failed with HTTP ${response.status}.`;
    throw new Error(`Public GitHub repository could not be read: ${message}`);
  }
  return payload as T;
}

function ignoredRepositoryPath(path: string) {
  return (
    /(^|\/)(node_modules|\.next|dist|build|coverage|\.git|vendor|generated-apps|tmp|temp|logs?)\//i.test(path) ||
    /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i.test(path) ||
    /\.(png|jpg|jpeg|gif|webp|ico|zip|pdf|lockb|woff2?|ttf|eot|mp4|mov|avi|bin|wasm|map)$/i.test(path)
  );
}

function sourceExtensionAllowed(path: string) {
  return (
    /\.(ts|tsx|js|jsx|mjs|cjs|json|prisma|md|mdx|yml|yaml|toml|sql|css|scss|html|txt)$/i.test(path) ||
    /(^|\/)(Dockerfile|Procfile|\.env\.example|\.env\.sample|vercel\.json|next\.config\.(js|mjs|ts))$/i.test(path)
  );
}

function filePriority(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith("package.json")) return 0;
  if (lower === ".env.example" || lower.endsWith("/.env.example")) return 1;
  if (lower.endsWith("prisma/schema.prisma")) return 2;
  if (lower.startsWith("app/api/") || lower.includes("/app/api/")) return 3;
  if (lower.startsWith("pages/api/") || lower.includes("/pages/api/")) return 4;
  if (lower.startsWith("app/") || lower.includes("/app/")) return 5;
  if (lower.startsWith("src/") || lower.includes("/src/")) return 6;
  if (lower.startsWith("lib/") || lower.includes("/lib/")) return 7;
  if (lower.startsWith("components/") || lower.includes("/components/")) return 8;
  return 20;
}

function isTextContent(value: string) {
  if (!value.trim()) return false;
  if (value.includes("\u0000")) return false;
  const suspicious = value.slice(0, 1000).match(/[\u0001-\u0008\u000E-\u001F]/g);
  return !suspicious || suspicious.length < 8;
}
