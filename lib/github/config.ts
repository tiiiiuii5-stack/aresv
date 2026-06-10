export type GitHubAppConfig = {
  appId: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
  webhookSecret: string;
  appSlug: string;
  appUrl: string;
  apiBaseUrl: string;
  webBaseUrl: string;
};

export function isGitHubAppConfigured() {
  return Boolean(
    process.env.GITHUB_APP_ID &&
      process.env.GITHUB_APP_CLIENT_ID &&
      process.env.GITHUB_APP_CLIENT_SECRET &&
      process.env.GITHUB_APP_PRIVATE_KEY &&
      process.env.GITHUB_WEBHOOK_SECRET &&
      process.env.GITHUB_APP_SLUG,
  );
}

export function getGitHubAppConfig(): GitHubAppConfig {
  return {
    appId: requiredEnv("GITHUB_APP_ID"),
    clientId: requiredEnv("GITHUB_APP_CLIENT_ID"),
    clientSecret: requiredEnv("GITHUB_APP_CLIENT_SECRET"),
    privateKey: normalizePrivateKey(requiredEnv("GITHUB_APP_PRIVATE_KEY")),
    webhookSecret: requiredEnv("GITHUB_WEBHOOK_SECRET"),
    appSlug: requiredEnv("GITHUB_APP_SLUG"),
    appUrl: appUrl(),
    apiBaseUrl: process.env.GITHUB_API_BASE_URL?.trim() || "https://api.github.com",
    webBaseUrl: process.env.GITHUB_WEB_BASE_URL?.trim() || "https://github.com",
  };
}

export function githubOAuthStateSecret() {
  return (
    process.env.GITHUB_OAUTH_STATE_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    requiredEnv("GITHUB_WEBHOOK_SECRET")
  );
}

function appUrl() {
  const value = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.VERCEL_URL;
  if (!value) throw new Error("NEXT_PUBLIC_APP_URL or APP_URL is required for GitHub callbacks.");
  const clean = value.startsWith("http") ? value : `https://${value}`;
  return clean.replace(/\/+$/, "");
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for GitHub App integration.`);
  return value;
}

function normalizePrivateKey(value: string) {
  const decoded = value.includes("BEGIN") ? value : Buffer.from(value, "base64").toString("utf8");
  return decoded.replace(/\\n/g, "\n");
}
