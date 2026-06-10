import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse, traceError } from "@/lib/diagnostics";
import {
  createGitHubScanJob,
  findConnectedRepositoryForWebhook,
  markInstallationSuspended,
  recordGitHubWebhookDelivery,
  updateGitHubWebhookDelivery,
} from "@/lib/github/repositories";
import { parseGitHubWebhookEnvelope, verifyGitHubWebhookSignature } from "@/lib/github/webhooks";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/backendSecurity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const traceId = createTrace("github.webhook.POST");
  try {
    await enforceRateLimit(request, RATE_LIMITS.githubWebhook);
    const rawBody = await request.text();
    if (!verifyGitHubWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
      return NextResponse.json({ ok: false, traceId, error: "Invalid GitHub webhook signature." }, { status: 401 });
    }

    const envelope = parseGitHubWebhookEnvelope({
      rawBody,
      deliveryId: request.headers.get("x-github-delivery"),
      event: request.headers.get("x-github-event"),
    });
    const delivery = await recordGitHubWebhookDelivery(envelope, "received");
    if (!delivery.inserted) {
      return NextResponse.json({ ok: true, traceId, deduplicated: true });
    }

    const queued = await dispatchGitHubWebhook(envelope);
    await updateGitHubWebhookDelivery(envelope.deliveryId, queued ? "queued" : "ignored", { queued });
    return NextResponse.json({ ok: true, traceId, queued }, { status: 202 });
  } catch (error) {
    traceError("github.webhook.POST", "webhook failed", error, { traceId });
    return errorResponse("github.webhook.POST", traceId, error, statusForGitHubWebhook(error));
  }
}

async function dispatchGitHubWebhook(envelope: ReturnType<typeof parseGitHubWebhookEnvelope>) {
  if (envelope.event === "installation" && envelope.action === "suspend" && envelope.installationId) {
    await markInstallationSuspended(envelope.installationId);
    return false;
  }

  if (!["push", "pull_request"].includes(envelope.event)) return false;
  const repository = await findConnectedRepositoryForWebhook(envelope);
  if (!repository) return false;

  if (envelope.event === "pull_request") {
    if (!["opened", "synchronize", "reopened", "ready_for_review"].includes(envelope.action || "")) return false;
    const pullRequest = objectValue(envelope.payload.pull_request);
    const head = objectValue(pullRequest.head);
    const base = objectValue(pullRequest.base);
    await createGitHubScanJob({
      repositoryId: repository.id,
      projectId: repository.projectId,
      userId: repository.userId,
      jobType: "pull_request_scan",
      githubDeliveryId: envelope.deliveryId,
      githubEvent: envelope.event,
      pullRequestNumber: numberValue(pullRequest.number),
      headSha: stringValue(head.sha),
      baseSha: stringValue(base.sha),
      metadata: { action: envelope.action },
      enqueue: true,
    });
    return true;
  }

  const after = stringValue(envelope.payload.after);
  await createGitHubScanJob({
    repositoryId: repository.id,
    projectId: repository.projectId,
    userId: repository.userId,
    jobType: "repository_scan",
    githubDeliveryId: envelope.deliveryId,
    githubEvent: envelope.event,
    headSha: after || repository.defaultBranch,
    metadata: { action: envelope.action || "push" },
    enqueue: true,
  });
  return true;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return value === undefined || value === null ? null : String(value);
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function statusForGitHubWebhook(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/signature/i.test(message)) return 401;
  if (/required|JSON|delivery|event/i.test(message)) return 400;
  if (/REDIS_URL/.test(message)) return 503;
  return 500;
}
