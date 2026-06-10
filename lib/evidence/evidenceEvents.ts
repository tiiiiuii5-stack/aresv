import { createHash, randomUUID } from "node:crypto";

import { certificateSigningAvailable, signHashCommitment, verifyHashCommitment } from "@/lib/certificates/signing";
import { tryDatabase } from "@/lib/prisma";
import { sanitizeMetadata } from "@/lib/services/platformSupport";
import { stableHash } from "@/lib/trust-ledger/hash";
import type { MonetizationContext } from "@/lib/services/intelligenceMonetization";
import { mapEvidenceToControls, summarizeControlMappings, type EvidenceControlMapping } from "@/lib/evidence/controlMapping";

export const evidenceEventTypes = [
  "commit.observed",
  "pull_request.updated",
  "build.completed",
  "test.completed",
  "scan.completed",
  "security_report.produced",
  "artifact.produced",
  "deploy.completed",
  "control.reviewed",
] as const;

export type EvidenceEventType = typeof evidenceEventTypes[number];

export type EvidenceArtifact = {
  name: string;
  artifactType: "source" | "sbom" | "build" | "test" | "scan" | "security_report" | "deployment" | "other";
  mediaType: string;
  hashAlgorithm: "sha256";
  digest: string;
  sizeBytes: number | null;
  uri: string | null;
};

export type CanonicalEvidenceEvent = {
  schemaVersion: "vos.evidence.event.v1";
  eventType: EvidenceEventType;
  source: {
    provider: string;
    repository: string | null;
    workflow: string | null;
    runId: string | null;
    job: string | null;
    sourceEventId: string | null;
  };
  subject: {
    projectId: string | null;
    assetId: string | null;
    commitSha: string | null;
    branch: string | null;
    pullRequest: string | null;
    environment: string | null;
  };
  result: {
    status: "success" | "failure" | "cancelled" | "skipped" | "unknown";
    conclusion: string | null;
    startedAt: string | null;
    completedAt: string | null;
  };
  artifacts: EvidenceArtifact[];
  controls: string[];
  provenance: {
    receivedAt: string;
    actorUserId: string;
    teamId: string | null;
    apiKeyId: string;
    verificationStatus: "API_KEY_BOUND";
    rawPayloadStored: false;
    userAgentHash: string | null;
  };
  metadata: Record<string, unknown>;
};

export type EvidenceReceipt = {
  schemaVersion: "vos.evidence.receipt.v1";
  eventId: string;
  eventHash: string;
  sourceDedupKey: string;
  canonicalization: "stable-json-v1";
  hashAlgorithm: "sha256";
  signedAt: string;
  signing: {
    algorithm: "Ed25519";
    signingKeyId: string;
    publicKey: string;
    signature: string;
    payloadHash: string;
  };
  storage: {
    dataset: "evidence_ops";
    persistence: "app_telemetry_events";
    stored: boolean;
  };
  verification: {
    status: "SIGNED";
    claim: "VentureOS signed that this canonical evidence event was submitted by an authenticated API principal.";
    limitations: string[];
  };
};

export type StoredEvidenceEvent = {
  storageId: string;
  createdAt: string;
  canonicalEvent: CanonicalEvidenceEvent;
  receipt: EvidenceReceipt;
  controlMappings: EvidenceControlMapping[];
};

type EvidenceEventBody = {
  eventType?: unknown;
  source?: unknown;
  subject?: unknown;
  result?: unknown;
  artifacts?: unknown;
  controls?: unknown;
  metadata?: unknown;
  projectId?: unknown;
  idempotencyKey?: unknown;
};

type EvidenceEventRow = {
  id: string;
  eventType: string;
  metadata: unknown;
  createdAt: Date | string;
};

export async function recordEvidenceEvent(input: {
  body: EvidenceEventBody;
  metering: MonetizationContext;
  projectId?: string | null;
  userAgent?: string | null;
}) {
  if (!certificateSigningAvailable()) throw new Error("EVIDENCE_SIGNING_KEY_REQUIRED");
  const receivedAt = new Date().toISOString();
  const canonicalEvent = canonicalEventFor(input.body, input.metering, input.projectId || null, receivedAt, input.userAgent || null);
  const eventHash = eventHashFor(canonicalEvent);
  const sourceDedupKey = sourceDedupKeyFor(canonicalEvent, input.body.idempotencyKey);
  const eventId = `vos_evt_${stableHash(["evidence-event", canonicalEvent.provenance.actorUserId, sourceDedupKey, eventHash]).slice(0, 24)}`;
  const existing = await loadExistingByDedupKey(sourceDedupKey);
  if (existing) {
    const stored = storedEventFromRow(existing);
    if (stored?.receipt.eventHash === eventHash) {
      return { stored, duplicate: true, conflict: false };
    }
    throw new Error("EVIDENCE_DEDUP_CONFLICT");
  }

  const signature = signHashCommitment(eventHash);
  const receipt: EvidenceReceipt = {
    schemaVersion: "vos.evidence.receipt.v1",
    eventId,
    eventHash,
    sourceDedupKey,
    canonicalization: "stable-json-v1",
    hashAlgorithm: "sha256",
    signedAt: receivedAt,
    signing: {
      algorithm: signature.algorithm,
      signingKeyId: signature.signingKeyId,
      publicKey: signature.publicKey,
      signature: signature.signature,
      payloadHash: signature.payloadHash,
    },
    storage: {
      dataset: "evidence_ops",
      persistence: "app_telemetry_events",
      stored: false,
    },
    verification: {
      status: "SIGNED",
      claim: "VentureOS signed that this canonical evidence event was submitted by an authenticated API principal.",
      limitations: [
        "This receipt proves ingestion and signature, not semantic truth of the CI provider output.",
        "Artifact digests are client-submitted unless the ingestion adapter recomputed them from bytes.",
      ],
    },
  };
  const controlMappings = mapEvidenceToControls(canonicalEvent.eventType, canonicalEvent.controls);
  const metadata = evidenceMetadata({ canonicalEvent, receipt: { ...receipt, storage: { ...receipt.storage, stored: true } }, controlMappings });
  const storageId = await tryDatabase(async (db) => {
    const id = randomUUID();
    await db.$executeRawUnsafe(
      `INSERT INTO "app_telemetry_events" ("id", "projectId", "snapshotId", "analysisResultId", "eventType", "dataset", "framework", "riskLevel", "severity", "counts", "metadata")
       VALUES ($1, $2, NULL, NULL, $3, 'evidence_ops', $4, $5, $6, $7::jsonb, $8::jsonb)`,
      id,
      input.projectId || null,
      canonicalEvent.eventType,
      canonicalEvent.source.provider,
      canonicalEvent.result.status,
      severityForStatus(canonicalEvent.result.status),
      JSON.stringify({ artifactCount: canonicalEvent.artifacts.length, controlCount: controlMappings.length }),
      JSON.stringify(metadata),
    );
    return id;
  });
  if (!storageId) throw new Error("EVIDENCE_STORAGE_UNAVAILABLE");
  const stored: StoredEvidenceEvent = {
    storageId,
    createdAt: receivedAt,
    canonicalEvent,
    receipt: { ...receipt, storage: { ...receipt.storage, stored: true } },
    controlMappings,
  };
  return { stored, duplicate: false, conflict: false };
}

export async function loadEvidenceReceipt(eventId: string) {
  const clean = eventId.trim();
  if (!clean) throw new Error("EVIDENCE_EVENT_ID_REQUIRED");
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<EvidenceEventRow[]>(
      `SELECT "id", "eventType", "metadata", "createdAt"
       FROM "app_telemetry_events"
       WHERE "dataset" = 'evidence_ops'
         AND "metadata"->'receipt'->>'eventId' = $1
       ORDER BY "createdAt" DESC
       LIMIT 1`,
      clean,
    ),
  );
  const stored = rows?.[0] ? storedEventFromRow(rows[0]) : null;
  return stored;
}

export async function loadEvidenceEventsForPacket(input: {
  userId: string;
  projectId?: string | null;
  repository?: string | null;
  since?: string | null;
  until?: string | null;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(500, Math.round(input.limit || 100)));
  const since = validDateOrNull(input.since) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const until = validDateOrNull(input.until) || new Date();
  const repository = input.repository?.trim().toLowerCase() || null;
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<EvidenceEventRow[]>(
      `SELECT "id", "eventType", "metadata", "createdAt"
       FROM "app_telemetry_events"
       WHERE "dataset" = 'evidence_ops'
         AND "metadata"->'canonicalEvent'->'provenance'->>'actorUserId' = $1
         AND ($2::text IS NULL OR "projectId" = $2)
         AND ($3::text IS NULL OR LOWER(COALESCE("metadata"->'canonicalEvent'->'source'->>'repository', '')) = $3)
         AND "createdAt" >= $4
         AND "createdAt" <= $5
       ORDER BY "createdAt" ASC, "id" ASC
       LIMIT $6`,
      input.userId,
      input.projectId || null,
      repository,
      since,
      until,
      limit,
    ),
  );
  return (rows || []).map(storedEventFromRow).filter((item): item is StoredEvidenceEvent => Boolean(item));
}

export function buildAuditPacket(input: {
  events: StoredEvidenceEvent[];
  generatedBy: string;
  projectId?: string | null;
  repository?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}) {
  const generatedAt = new Date().toISOString();
  const packetBase = {
    schemaVersion: "vos.audit-packet.v1",
    packetType: "evidence_ops_ci_audit_packet",
    generatedAt,
    generatedBy: input.generatedBy,
    scope: {
      projectId: input.projectId || null,
      repository: input.repository || null,
      periodStart: input.periodStart || null,
      periodEnd: input.periodEnd || null,
    },
    summary: {
      evidenceEventCount: input.events.length,
      signedReceiptCount: input.events.filter((event) => event.receipt.signing.signature).length,
      artifactCount: input.events.reduce((sum, event) => sum + event.canonicalEvent.artifacts.length, 0),
      controlCount: summarizeControlMappings(input.events).length,
      failedEvidenceCount: input.events.filter((event) => event.canonicalEvent.result.status === "failure").length,
    },
    controlSummary: summarizeControlMappings(input.events),
    evidenceEvents: input.events,
    auditorNotes: [
      "This packet is evidence inventory, not a SOC2 or ISO27001 certification.",
      "Each event receipt can be verified without trusting the VentureOS database.",
      "Control mappings are audit-workflow hints and require auditor judgment.",
    ],
  };
  const packetHash = stableHash({ domain: "ventureos-audit-packet-v1", packet: packetBase });
  return {
    ...packetBase,
    verification: {
      packetHash,
      hashAlgorithm: "sha256",
      canonicalization: "stable-json-v1",
      verifierEndpoint: "/api/verify",
      requiredChecks: ["packet_hash", "event_hashes", "event_signatures", "control_mapping_inventory"],
    },
  };
}

export function verifyEvidencePacket(input: unknown) {
  const packet = objectValue(input);
  const verification = objectValue(packet.verification);
  const expectedPacketHash = stringValue(verification.packetHash);
  const packetWithoutVerification = { ...packet };
  delete packetWithoutVerification.verification;
  const recomputedPacketHash = stableHash({ domain: "ventureos-audit-packet-v1", packet: packetWithoutVerification });
  const events = Array.isArray(packet.evidenceEvents) ? packet.evidenceEvents : [];
  const eventResults = events.map(verifyStoredEventObject);
  const errors = [
    ...(expectedPacketHash && expectedPacketHash === recomputedPacketHash ? [] : ["PACKET_HASH_MISMATCH"]),
    ...eventResults.flatMap((result) => result.errors.map((error) => `${result.eventId || "unknown"}:${error}`)),
  ];
  return {
    ok: errors.length === 0,
    schemaVersion: "vos.packet-verification.v1",
    packetHash: expectedPacketHash || null,
    recomputedPacketHash,
    eventCount: events.length,
    validEventCount: eventResults.filter((result) => result.ok).length,
    errors,
    eventResults,
  };
}

export function verifyStoredEventObject(value: unknown) {
  const record = objectValue(value);
  const canonicalEvent = objectValue(record.canonicalEvent) as CanonicalEvidenceEvent;
  const receipt = objectValue(record.receipt) as EvidenceReceipt;
  const eventId = stringValue(receipt.eventId);
  const errors: string[] = [];
  const recomputedEventHash = eventHashFor(canonicalEvent);
  if (recomputedEventHash !== receipt.eventHash) errors.push("EVENT_HASH_MISMATCH");
  const signature = objectValue(receipt.signing);
  const publicKey = stringValue(signature.publicKey);
  const signatureValue = stringValue(signature.signature);
  const payloadHash = stringValue(signature.payloadHash);
  if (!publicKey || !signatureValue || !payloadHash) {
    errors.push("EVENT_SIGNATURE_MISSING");
  } else if (payloadHash !== receipt.eventHash) {
    errors.push("EVENT_SIGNATURE_PAYLOAD_MISMATCH");
  } else if (!verifyHashCommitment({ payloadHash, signature: signatureValue, publicKeyPem: publicKey })) {
    errors.push("EVENT_SIGNATURE_INVALID");
  }
  return {
    ok: errors.length === 0,
    eventId,
    eventHash: receipt.eventHash || null,
    recomputedEventHash,
    errors,
  };
}

function canonicalEventFor(
  body: EvidenceEventBody,
  metering: MonetizationContext,
  projectId: string | null,
  receivedAt: string,
  userAgent: string | null,
): CanonicalEvidenceEvent {
  rejectUnknownFields(body, ["eventType", "source", "subject", "result", "artifacts", "controls", "metadata", "projectId", "idempotencyKey"]);
  const eventType = eventTypeValue(body.eventType);
  const source = objectValue(body.source);
  const subject = objectValue(body.subject);
  const result = objectValue(body.result);
  const metadata = sanitizeMetadata(body.metadata || {});
  const sourceRepository = cleanRepository(source.repository || subject.repository);
  const projectSubject = projectId || cleanText(subject.projectId, 120) || null;
  return {
    schemaVersion: "vos.evidence.event.v1",
    eventType,
    source: {
      provider: cleanToken(source.provider, "github_actions", 60),
      repository: sourceRepository,
      workflow: cleanText(source.workflow, 120),
      runId: cleanText(source.runId || source.run_id, 100),
      job: cleanText(source.job, 100),
      sourceEventId: cleanText(source.sourceEventId || source.deliveryId || source.delivery_id, 160),
    },
    subject: {
      projectId: projectSubject,
      assetId: cleanText(subject.assetId || subject.asset_id, 120),
      commitSha: cleanCommit(subject.commitSha || subject.commit_sha || source.commitSha || source.commit_sha),
      branch: cleanText(subject.branch || source.branch, 120),
      pullRequest: cleanText(subject.pullRequest || subject.pull_request || source.pullRequest || source.pull_request, 60),
      environment: cleanText(subject.environment || result.environment, 80),
    },
    result: {
      status: statusValue(result.status || result.conclusion),
      conclusion: cleanText(result.conclusion, 160),
      startedAt: isoOrNull(result.startedAt || result.started_at),
      completedAt: isoOrNull(result.completedAt || result.completed_at),
    },
    artifacts: artifactList(body.artifacts),
    controls: stringList(body.controls, 40, 80),
    provenance: {
      receivedAt,
      actorUserId: metering.userId,
      teamId: metering.teamId,
      apiKeyId: metering.apiKeyId,
      verificationStatus: "API_KEY_BOUND",
      rawPayloadStored: false,
      userAgentHash: userAgent ? hashShort(userAgent) : null,
    },
    metadata,
  };
}

function evidenceMetadata(input: { canonicalEvent: CanonicalEvidenceEvent; receipt: EvidenceReceipt; controlMappings: EvidenceControlMapping[] }) {
  return {
    schemaVersion: "vos.evidence.telemetry.v1",
    userId: input.canonicalEvent.provenance.actorUserId,
    teamId: input.canonicalEvent.provenance.teamId,
    repository: input.canonicalEvent.source.repository,
    canonicalEvent: input.canonicalEvent,
    receipt: input.receipt,
    controlMappings: input.controlMappings,
  };
}

function storedEventFromRow(row: EvidenceEventRow): StoredEvidenceEvent | null {
  const metadata = objectValue(row.metadata);
  const canonicalEvent = objectValue(metadata.canonicalEvent) as CanonicalEvidenceEvent;
  const receipt = objectValue(metadata.receipt) as EvidenceReceipt;
  if (!canonicalEvent.schemaVersion || !receipt.eventId) return null;
  return {
    storageId: row.id,
    createdAt: isoDate(row.createdAt),
    canonicalEvent,
    receipt,
    controlMappings: Array.isArray(metadata.controlMappings) ? metadata.controlMappings as EvidenceControlMapping[] : [],
  };
}

function eventHashFor(canonicalEvent: CanonicalEvidenceEvent) {
  return stableHash({ domain: "ventureos-evidence-event-v1", canonicalEvent });
}

function sourceDedupKeyFor(canonicalEvent: CanonicalEvidenceEvent, idempotencyKey: unknown) {
  return stableHash({
    domain: "ventureos-evidence-dedup-v1",
    userId: canonicalEvent.provenance.actorUserId,
    projectId: canonicalEvent.subject.projectId,
    eventType: canonicalEvent.eventType,
    repository: canonicalEvent.source.repository,
    sourceEventId: canonicalEvent.source.sourceEventId,
    runId: canonicalEvent.source.runId,
    commitSha: canonicalEvent.subject.commitSha,
    status: canonicalEvent.result.status,
    idempotencyKey: cleanText(idempotencyKey, 120),
  });
}

async function loadExistingByDedupKey(sourceDedupKey: string) {
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<EvidenceEventRow[]>(
      `SELECT "id", "eventType", "metadata", "createdAt"
       FROM "app_telemetry_events"
       WHERE "dataset" = 'evidence_ops'
         AND "metadata"->'receipt'->>'sourceDedupKey' = $1
       ORDER BY "createdAt" ASC
       LIMIT 1`,
      sourceDedupKey,
    ),
  );
  return rows?.[0] || null;
}

function eventTypeValue(value: unknown): EvidenceEventType {
  const clean = cleanToken(value, "", 80) as EvidenceEventType;
  if (!evidenceEventTypes.includes(clean)) throw new Error("EVIDENCE_EVENT_TYPE_INVALID");
  return clean;
}

function statusValue(value: unknown): CanonicalEvidenceEvent["result"]["status"] {
  const clean = cleanToken(value, "unknown", 40);
  if (clean === "passed" || clean === "ok") return "success";
  if (clean === "failed" || clean === "error") return "failure";
  if (clean === "cancelled" || clean === "canceled") return "cancelled";
  if (clean === "skipped") return "skipped";
  if (clean === "success" || clean === "failure" || clean === "unknown") return clean;
  return "unknown";
}

function artifactList(value: unknown): EvidenceArtifact[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).map((item, index) => {
    const record = objectValue(item);
    const digest = cleanDigest(record.digest || record.hash);
    if (!digest) throw new Error("EVIDENCE_ARTIFACT_DIGEST_INVALID");
    return {
      name: cleanText(record.name, 120) || `artifact-${index + 1}`,
      artifactType: artifactType(record.artifactType || record.type),
      mediaType: cleanText(record.mediaType || record.media_type, 120) || "application/octet-stream",
      hashAlgorithm: "sha256",
      digest,
      sizeBytes: numberOrNull(record.sizeBytes || record.size_bytes),
      uri: cleanUri(record.uri || record.url),
    };
  });
}

function artifactType(value: unknown): EvidenceArtifact["artifactType"] {
  const clean = cleanToken(value, "other", 60);
  if (clean === "source" || clean === "sbom" || clean === "build" || clean === "test" || clean === "scan" || clean === "security_report" || clean === "deployment") return clean;
  return "other";
}

function rejectUnknownFields(value: Record<string, unknown>, allowed: string[]) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw new Error(`EVIDENCE_UNKNOWN_FIELD:${key}`);
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stringList(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item, maxLength)).filter(Boolean).slice(0, maxItems) as string[];
}

function cleanText(value: unknown, maxLength: number) {
  return String(value || "").trim().replace(/\u0000/g, "").slice(0, maxLength) || null;
}

function cleanToken(value: unknown, fallback: string, maxLength: number) {
  const clean = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, maxLength);
  return clean || fallback;
}

function cleanRepository(value: unknown) {
  const clean = String(value || "").trim().replace(/^https:\/\/github\.com\//i, "").replace(/\.git$/i, "");
  if (!clean) return null;
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(clean) ? clean.toLowerCase() : clean.slice(0, 180).toLowerCase();
}

function cleanCommit(value: unknown) {
  const clean = String(value || "").trim().toLowerCase();
  return /^[a-f0-9]{7,64}$/.test(clean) ? clean : null;
}

function cleanDigest(value: unknown) {
  const clean = String(value || "").trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(clean) ? clean : "";
}

function cleanUri(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    url.username = "";
    url.password = "";
    url.hash = "";
    return url.toString().slice(0, 500);
  } catch {
    return null;
  }
}

function isoOrNull(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function validDateOrNull(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

function severityForStatus(status: CanonicalEvidenceEvent["result"]["status"]) {
  if (status === "failure") return "high";
  if (status === "cancelled") return "medium";
  return "info";
}

function hashShort(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}
