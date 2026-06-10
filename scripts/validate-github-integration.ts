import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { createGitHubOAuthState, verifyGitHubOAuthState } from "@/lib/github/auth";
import { assertGitHubRepositoryPermissions, missingGitHubPermissions } from "@/lib/github/permissions";
import { decideGitHubGate, formatPullRequestAnalysisComment } from "@/lib/github/statuses";
import { parseGitHubWebhookEnvelope, verifyGitHubWebhookSignature } from "@/lib/github/webhooks";
import { buildAssuranceGate } from "@/lib/scanner/assuranceGate";

const stateSecret = "github-state-secret-for-test";
const state = createGitHubOAuthState({
  userId: "user_123",
  projectId: "project_123",
  returnTo: "/project/project_123",
  mode: "install",
  ttlMs: 60_000,
}, stateSecret);
const verified = verifyGitHubOAuthState(state, "user_123", stateSecret);
assert.equal(verified.userId, "user_123");
assert.equal(verified.projectId, "project_123");
assert.equal(verified.mode, "install");
assert.throws(() => verifyGitHubOAuthState(state, "other_user", stateSecret), /does not match/);

const rawBody = JSON.stringify({
  action: "opened",
  installation: { id: 42 },
  repository: { full_name: "acme/app" },
  pull_request: { number: 7, head: { sha: "head-sha" }, base: { sha: "base-sha" } },
});
const signature = `sha256=${createHmac("sha256", "webhook-secret").update(rawBody).digest("hex")}`;
assert.equal(verifyGitHubWebhookSignature(rawBody, signature, "webhook-secret"), true);
assert.equal(verifyGitHubWebhookSignature(rawBody, signature, "wrong-secret"), false);
const envelope = parseGitHubWebhookEnvelope({
  rawBody,
  deliveryId: "delivery-1",
  event: "pull_request",
});
assert.equal(envelope.deliveryId, "delivery-1");
assert.equal(envelope.installationId, "42");
assert.equal(envelope.repositoryFullName, "acme/app");
assert.equal(envelope.action, "opened");

assert.deepEqual(missingGitHubPermissions({
  contents: "read",
  pull_requests: "write",
  metadata: "read",
  statuses: "write",
}), []);
assert.throws(() => assertGitHubRepositoryPermissions({
  contents: "read",
  pull_requests: "read",
  metadata: "read",
  statuses: "write",
}), /permissions are incomplete/);

assert.deepEqual(decideGitHubGate({ readinessScore: 91, blockingIssues: 0, criticalFindings: 0 }), {
  status: "PASS",
  state: "success",
  shouldBlockMerge: false,
  description: "PASS: readiness 91/100",
});
assert.equal(decideGitHubGate({ readinessScore: 82, blockingIssues: 0, criticalFindings: 0 }).status, "WARNING");
assert.equal(decideGitHubGate({ readinessScore: 82, blockingIssues: 0, criticalFindings: 0, blockWarnings: true }).state, "failure");
assert.equal(decideGitHubGate({ readinessScore: 88, blockingIssues: 1, criticalFindings: 0 }).status, "FAIL");
const assuranceGate = buildAssuranceGate({
  readinessScore: 88,
  blockThreshold: 75,
  issues: [{
    id: "repo-missing-internal-api-route",
    title: "Missing internal API route",
    severity: "high",
    evidence: "Internal API call /api/checkout has no matching submitted route handler.",
    filePath: "app/page.tsx",
    blocking: true,
    confidenceScore: 92,
    fixSuggestion: "Create the missing API route.",
  }],
});
const githubAssuranceGate = decideGitHubGate({ readinessScore: 88, blockingIssues: 1, criticalFindings: 0, assuranceGate });
assert.equal(githubAssuranceGate.status, "FAIL");
assert.equal(githubAssuranceGate.state, "failure");
assert.ok(githubAssuranceGate.reasons?.some((reason) => reason.id === "repo-missing-internal-api-route"));

const comment = formatPullRequestAnalysisComment({
  readinessScore: 84,
  gate: githubAssuranceGate,
  issues: [{ title: "Missing auth validation", severity: "high", fixSuggestion: "Add middleware." }],
  recommendations: ["Add middleware.", "Add route protection."],
  assurance: { scanId: "scan_123", sourceHash: "abc1234567890", ruleSetHash: "def1234567890" },
});
assert.ok(comment.includes("VentureOS Analysis"));
assert.ok(comment.includes("Readiness Score"));
assert.ok(comment.includes("Gate Reasoning"));
assert.ok(comment.includes("What Changed And Why It Matters"));
assert.ok(comment.includes("Missing internal API route"));
assert.ok(comment.includes("scan_123"));
assert.ok(comment.includes("Missing auth validation"));
assert.ok(comment.includes("Add route protection."));

console.log(JSON.stringify({
  passed: true,
  github: {
    oauthState: "verified",
    webhookSignature: "verified",
    permissions: "verified",
    gateStatuses: ["PASS", "WARNING", "FAIL"],
  },
}, null, 2));
