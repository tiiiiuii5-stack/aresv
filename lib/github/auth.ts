import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { importPKCS8, SignJWT } from "jose";

import { getGitHubAppConfig, githubOAuthStateSecret, type GitHubAppConfig } from "@/lib/github/config";
import { decryptSensitiveContent, encryptSensitiveContent } from "@/lib/encryption";

export type GitHubOAuthStatePayload = {
  nonce: string;
  userId: string;
  projectId?: string | null;
  returnTo?: string | null;
  mode: "install" | "oauth";
  expiresAt: number;
};

export type GitHubOAuthTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

export async function createGitHubAppJwt(config: GitHubAppConfig = getGitHubAppConfig(), now = Math.floor(Date.now() / 1000)) {
  const key = await importPKCS8(config.privateKey, "RS256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 9 * 60)
    .setIssuer(config.appId)
    .sign(key);
}

export function createGitHubOAuthState(input: Omit<GitHubOAuthStatePayload, "nonce" | "expiresAt"> & { ttlMs?: number }, secret = githubOAuthStateSecret()) {
  const payload: GitHubOAuthStatePayload = {
    nonce: randomBytes(18).toString("base64url"),
    userId: input.userId,
    projectId: input.projectId || null,
    returnTo: input.returnTo || null,
    mode: input.mode,
    expiresAt: Date.now() + Math.max(60_000, Math.min(input.ttlMs || 10 * 60_000, 30 * 60_000)),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signState(encoded, secret)}`;
}

export function verifyGitHubOAuthState(state: string, expectedUserId: string, secret = githubOAuthStateSecret()): GitHubOAuthStatePayload {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature || !safeEqual(signature, signState(encoded, secret))) throw new Error("Invalid GitHub OAuth state.");
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as GitHubOAuthStatePayload;
  if (payload.expiresAt < Date.now()) throw new Error("GitHub OAuth state expired.");
  if (payload.userId !== expectedUserId) throw new Error("GitHub OAuth state does not match the signed-in user.");
  return payload;
}

export async function exchangeGitHubOAuthCode(code: string, config: GitHubAppConfig = getGitHubAppConfig()): Promise<GitHubOAuthTokenResponse> {
  const response = await fetch(`${config.webBaseUrl}/login/oauth/access_token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
    }),
  });
  const result = await response.json().catch(() => ({})) as GitHubOAuthTokenResponse;
  if (!response.ok || result.error) {
    throw new Error(result.error_description || result.error || "GitHub OAuth token exchange failed.");
  }
  return result;
}

export function encryptedGitHubToken(token?: string | null) {
  return token ? encryptSensitiveContent(token) : null;
}

export function decryptedGitHubToken(token?: string | null) {
  return token ? decryptSensitiveContent(token) : null;
}

function signState(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.byteLength === rightBuffer.byteLength && timingSafeEqual(new Uint8Array(leftBuffer), new Uint8Array(rightBuffer));
}
