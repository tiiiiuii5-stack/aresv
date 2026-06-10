import { createHmac, timingSafeEqual } from "node:crypto";

import { getGitHubAppConfig } from "@/lib/github/config";
import type { GitHubWebhookEnvelope } from "@/lib/github/types";

export function verifyGitHubWebhookSignature(rawBody: string, signatureHeader: string | null, secret = getGitHubAppConfig().webhookSecret) {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const left = Buffer.from(signatureHeader);
  const right = Buffer.from(expected);
  return left.byteLength === right.byteLength && timingSafeEqual(new Uint8Array(left), new Uint8Array(right));
}

export function parseGitHubWebhookEnvelope(input: {
  rawBody: string;
  deliveryId: string | null;
  event: string | null;
}): GitHubWebhookEnvelope {
  if (!input.deliveryId) throw new Error("GitHub delivery id is required.");
  if (!input.event) throw new Error("GitHub event is required.");
  const payload = JSON.parse(input.rawBody) as Record<string, unknown>;
  const installation = objectValue(payload.installation);
  const repository = objectValue(payload.repository);
  return {
    deliveryId: input.deliveryId,
    event: input.event,
    action: stringValue(payload.action),
    installationId: stringValue(installation.id),
    repositoryFullName: stringValue(repository.full_name),
    payload,
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return value === undefined || value === null ? undefined : String(value);
}
