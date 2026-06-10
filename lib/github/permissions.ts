import type { GitHubAppPermissions, GitHubPermissionLevel } from "@/lib/github/types";

const requiredPermissions = {
  contents: "read",
  pull_requests: "write",
  metadata: "read",
  statuses: "write",
} satisfies Record<string, GitHubPermissionLevel>;

export function missingGitHubPermissions(permissions: GitHubAppPermissions) {
  return Object.entries(requiredPermissions)
    .filter(([name, level]) => !permissionMeets(permissions[name], level))
    .map(([name, level]) => ({ name, required: level, actual: String(permissions[name] || "none") }));
}

export function assertGitHubRepositoryPermissions(permissions: GitHubAppPermissions) {
  const missing = missingGitHubPermissions(permissions);
  if (missing.length) {
    throw new Error(`GitHub App permissions are incomplete: ${missing.map((item) => `${item.name}:${item.required}`).join(", ")}`);
  }
}

function permissionMeets(actual: unknown, required: GitHubPermissionLevel) {
  const rank = { none: 0, read: 1, write: 2, admin: 3 } satisfies Record<GitHubPermissionLevel, number>;
  const clean = typeof actual === "string" && actual in rank ? actual as GitHubPermissionLevel : "none";
  return rank[clean] >= rank[required];
}
