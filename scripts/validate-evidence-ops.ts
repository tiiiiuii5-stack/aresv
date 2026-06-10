import assert from "node:assert/strict";

import { signHashCommitment } from "@/lib/certificates/signing";
import { mapEvidenceToControls } from "@/lib/evidence/controlMapping";
import {
  buildAuditPacket,
  verifyEvidencePacket,
  verifyStoredEventObject,
  type CanonicalEvidenceEvent,
  type StoredEvidenceEvent,
} from "@/lib/evidence/evidenceEvents";
import { stableHash } from "@/lib/trust-ledger/hash";

const canonicalEvent: CanonicalEvidenceEvent = {
  schemaVersion: "vos.evidence.event.v1",
  eventType: "test.completed",
  source: {
    provider: "github_actions",
    repository: "stackdigitz-netizen/ventureos",
    workflow: "ci",
    runId: "1001",
    job: "test",
    sourceEventId: "1001.1",
  },
  subject: {
    projectId: "project_test",
    assetId: "VOS-2026-TEST",
    commitSha: "abcdef1234567890",
    branch: "main",
    pullRequest: null,
    environment: "ci",
  },
  result: {
    status: "success",
    conclusion: "passed",
    startedAt: "2026-06-07T20:00:00.000Z",
    completedAt: "2026-06-07T20:02:00.000Z",
  },
  artifacts: [
    {
      name: "junit.xml",
      artifactType: "test",
      mediaType: "application/xml",
      hashAlgorithm: "sha256",
      digest: "a".repeat(64),
      sizeBytes: 2048,
      uri: null,
    },
  ],
  controls: ["SOC2:CC8.1"],
  provenance: {
    receivedAt: "2026-06-07T20:03:00.000Z",
    actorUserId: "user_test",
    teamId: null,
    apiKeyId: "api_key_test",
    verificationStatus: "API_KEY_BOUND",
    rawPayloadStored: false,
    userAgentHash: "validation",
  },
  metadata: { validation: true },
};

const eventHash = stableHash({ domain: "ventureos-evidence-event-v1", canonicalEvent });
const signature = signHashCommitment(eventHash);
const storedEvent: StoredEvidenceEvent = {
  storageId: "telemetry_test",
  createdAt: canonicalEvent.provenance.receivedAt,
  canonicalEvent,
  receipt: {
    schemaVersion: "vos.evidence.receipt.v1",
    eventId: "vos_evt_validation",
    eventHash,
    sourceDedupKey: stableHash({ validation: "dedupe" }),
    canonicalization: "stable-json-v1",
    hashAlgorithm: "sha256",
    signedAt: canonicalEvent.provenance.receivedAt,
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
      stored: true,
    },
    verification: {
      status: "SIGNED",
      claim: "VentureOS signed that this canonical evidence event was submitted by an authenticated API principal.",
      limitations: ["validation fixture"],
    },
  },
  controlMappings: mapEvidenceToControls(canonicalEvent.eventType, canonicalEvent.controls),
};

const eventVerification = verifyStoredEventObject(storedEvent);
assert.equal(eventVerification.ok, true);

const packet = buildAuditPacket({
  events: [storedEvent],
  generatedBy: "user_test",
  projectId: "project_test",
  repository: "stackdigitz-netizen/ventureos",
  periodStart: "2026-06-07T00:00:00.000Z",
  periodEnd: "2026-06-08T00:00:00.000Z",
});
const packetVerification = verifyEvidencePacket(packet);
assert.equal(packetVerification.ok, true);
assert.equal(packetVerification.eventCount, 1);
assert.equal(packet.summary.evidenceEventCount, 1);
assert.ok(packet.controlSummary.some((item) => item.framework === "SOC2" && item.controlId === "CC8.1"));

const tampered = structuredClone(packet);
tampered.evidenceEvents[0].canonicalEvent.result.status = "failure";
const tamperedVerification = verifyEvidencePacket(tampered);
assert.equal(tamperedVerification.ok, false);
assert.ok(tamperedVerification.errors.some((error) => error.includes("EVENT_HASH_MISMATCH") || error === "PACKET_HASH_MISMATCH"));

console.log("EvidenceOps validation passed", {
  eventHash,
  packetHash: packet.verification.packetHash,
  controlMappings: packet.controlSummary.length,
});
