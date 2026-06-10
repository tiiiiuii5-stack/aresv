import { certificateSigningAvailable, signHashCommitment, verifyHashCommitment } from "@/lib/certificates/signing";
import { stableHash } from "@/lib/trust-ledger/hash";

export type TransparencyEventCommitment = {
  engine: "ventureos-event-commitment";
  version: "1.0.0";
  commitmentType: "ingestion_event";
  hashAlgorithm: "sha256";
  canonicalization: "stable-json-v1";
  committedAt: string;
  eventHash: string;
  signature: {
    algorithm: "Ed25519";
    signingKeyId: string;
    signature: string;
    payloadHash: string;
  } | null;
  status: "signed" | "signing_not_configured";
};

export function createTransparencyEventCommitment(event: unknown, committedAt = new Date().toISOString()): TransparencyEventCommitment {
  const eventHash = stableHash({
    engine: "ventureos-event-commitment",
    version: "1.0.0",
    commitmentType: "ingestion_event",
    committedAt,
    event,
  });
  const signature = certificateSigningAvailable() ? signHashCommitment(eventHash) : null;
  return {
    engine: "ventureos-event-commitment",
    version: "1.0.0",
    commitmentType: "ingestion_event",
    hashAlgorithm: "sha256",
    canonicalization: "stable-json-v1",
    committedAt,
    eventHash,
    signature: signature
      ? {
          algorithm: signature.algorithm,
          signingKeyId: signature.signingKeyId,
          signature: signature.signature,
          payloadHash: signature.payloadHash,
        }
      : null,
    status: signature ? "signed" : "signing_not_configured",
  };
}

export function verifyTransparencyEventCommitment(input: {
  commitment: unknown;
  publicKeyPem?: string | null;
}) {
  const commitment = commitmentValue(input.commitment);
  if (!commitment) return { verified: false, status: "missing" as const };
  if (!commitment.signature) return { verified: false, status: "unsigned" as const, eventHash: commitment.eventHash };
  if (!input.publicKeyPem) return { verified: false, status: "public_key_missing" as const, eventHash: commitment.eventHash };
  return {
    verified: verifyHashCommitment({
      payloadHash: commitment.signature.payloadHash,
      signature: commitment.signature.signature,
      publicKeyPem: input.publicKeyPem,
    }),
    status: "checked" as const,
    eventHash: commitment.eventHash,
  };
}

export function commitmentValue(value: unknown): TransparencyEventCommitment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<TransparencyEventCommitment>;
  if (record.engine !== "ventureos-event-commitment") return null;
  if (record.version !== "1.0.0") return null;
  if (!record.eventHash || typeof record.eventHash !== "string") return null;
  return record as TransparencyEventCommitment;
}
