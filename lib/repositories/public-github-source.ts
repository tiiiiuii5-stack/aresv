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

type GitHubTreeItem = NonNullable<GitHubTreeResponse["tree"]>[number];

type LoadPublicGitHubRepositorySourceInput = {
  repositoryUrl: string;
  maxChars: number;
  maxFiles?: number;
  maxFileBytes?: number;
  maxCharsPerFile?: number;
};

type ParsedGitHubRepositoryUrl = {
  owner: string;
  repo: string;
  ref?: string;
  canonicalUrl: string;
};

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_RAW_BASE = "https://raw.githubusercontent.com";
const DEFAULT_MAX_FILES = 80;
const DEFAULT_MAX_FILE_BYTES = 120_000;
const DEFAULT_MAX_CHARS_PER_FILE = 6_000;

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
  const maxCharsPerFile = Math.max(800, Math.min(input.maxCharsPerFile || DEFAULT_MAX_CHARS_PER_FILE, 20_000));
  const repository = await githubRequest<GitHubRepositoryInfo>(`/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`);
  if (repository.private) {
    throw new Error("This repository is private. Connect the GitHub App or upload source files instead.");
  }

  const ref = parsed.ref || repository.default_branch || "main";
  const tree = await githubRequest<GitHubTreeResponse>(
    `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
  );
  const discovered = (tree.tree || []).filter((item) => item.type === "blob" && item.path && item.sha);
  const eligible = discovered
    .filter((item) => !ignoredRepositoryPath(String(item.path)))
    .filter((item) => sourceExtensionAllowed(String(item.path)))
    .filter((item) => Number(item.size || 0) <= maxFileBytes);
  const candidates = selectRepositorySample(eligible, maxFiles);

  const files: PublicGitHubRepositorySource["files"] = [];
  const codeParts: string[] = [];
  const warnings: string[] = [];
  let totalChars = 0;
  let truncated = Boolean(tree.truncated) || discovered.length > candidates.length;

  for (const candidate of candidates) {
    if (!candidate.path) continue;
    const content = await loadRawFileContent(parsed.owner, parsed.repo, ref, candidate.path);
    if (!isTextContent(content)) continue;

    const header = `// FILE: ${candidate.path}\n`;
    const remaining = maxChars - totalChars - header.length;
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    const perFileLimit = Math.min(remaining, perFileCharacterLimit(String(candidate.path), maxCharsPerFile));
    const included = content.length > perFileLimit ? content.slice(0, perFileLimit) : content;
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

async function loadRawFileContent(owner: string, repo: string, ref: string, filePath: string) {
  const rawPath = filePath.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${GITHUB_RAW_BASE}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURI(ref)}/${rawPath}`, {
    headers: {
      Accept: "text/plain,*/*",
      "User-Agent": "VentureOS-Appraisal-Intake",
    },
  });
  if (!response.ok) return "";
  return response.text();
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

function selectRepositorySample(
  files: GitHubTreeItem[],
  maxFiles: number,
) {
  const sorted = [...files].sort((a, b) => {
    const priority = filePriority(String(a.path)) - filePriority(String(b.path));
    if (priority !== 0) return priority;
    return Number(a.size || 0) - Number(b.size || 0);
  });
  const selected = new Map<string, GitHubTreeItem>();
  const pick = (predicate: (path: string) => boolean, limit: number) => {
    for (const file of sorted) {
      if (selected.size >= maxFiles) return;
      const path = String(file.path || "");
      if (!path || selected.has(path) || !predicate(path)) continue;
      selected.set(path, file);
      if ([...selected.values()].filter((item) => predicate(String(item.path || ""))).length >= limit) return;
    }
  };

  pick((path) => filePriority(path) <= 2, Math.min(8, maxFiles));
  pick((path) => /^app\/api\//i.test(path) || /\/app\/api\//i.test(path), Math.min(18, maxFiles));
  pick((path) => /^app\/(?!api\/)/i.test(path) || /\/app\/(?!api\/)/i.test(path), Math.min(18, maxFiles));
  pick((path) => /^lib\//i.test(path) || /\/lib\//i.test(path), Math.min(18, maxFiles));
  pick((path) => /^components\//i.test(path) || /\/components\//i.test(path), Math.min(12, maxFiles));
  pick((path) => /^prisma\//i.test(path) || /\/prisma\//i.test(path), Math.min(8, maxFiles));
  pick((path) => /^docs\//i.test(path) || /\.(md|mdx)$/i.test(path), Math.min(8, maxFiles));
  pick(() => true, maxFiles);

  return [...selected.values()].slice(0, maxFiles);
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

function perFileCharacterLimit(path: string, defaultLimit: number) {
  const lower = path.toLowerCase();
  if (lower.endsWith("package.json")) return Math.max(defaultLimit, 14_000);
  if (lower.endsWith("prisma/schema.prisma")) return Math.max(defaultLimit, 14_000);
  if (lower === ".env.example" || lower.endsWith("/.env.example")) return Math.max(defaultLimit, 4_000);
  if (/(^|\/)(next\.config\.(js|mjs|ts)|vercel\.json|tsconfig\.json|postcss\.config\.(js|mjs|ts)|tailwind\.config\.(js|ts))$/i.test(path)) {
    return Math.max(defaultLimit, 6_000);
  }
  return defaultLimit;
}

function isTextContent(value: string) {
  if (!value.trim()) return false;
  if (value.includes("\u0000")) return false;
  const suspicious = value.slice(0, 1000).match(/[\u0001-\u0008\u000E-\u001F]/g);
  return !suspicious || suspicious.length < 8;
}
