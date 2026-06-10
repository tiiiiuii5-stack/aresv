import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";

import { stableHash, stableStringify } from "@/lib/trust-ledger/hash";
import type { PublicSigningKey, VentureOSCertificatePayload } from "@/lib/certificates/types";

type SigningMaterial = {
  keyId: string;
  privateKey: KeyObject;
  publicKeyPem: string;
  publicKey: KeyObject;
};

let cachedDevMaterial: SigningMaterial | null = null;

export function canonicalCertificatePayload(payload: VentureOSCertificatePayload) {
  return stableStringify(payload);
}

export function certificatePayloadHash(payload: VentureOSCertificatePayload) {
  return stableHash(payload);
}

export function signCertificatePayload(payload: VentureOSCertificatePayload, material = resolveSigningMaterial()) {
  const payloadHash = certificatePayloadHash(payload);
  const signature = sign(null, utf8Bytes(payloadHash), material.privateKey).toString("base64");
  return {
    payloadHash,
    signature,
    signingKeyId: material.keyId,
    publicKey: material.publicKeyPem,
    algorithm: "Ed25519" as const,
  };
}

export function signHashCommitment(payloadHash: string, material = resolveSigningMaterial()) {
  const cleanHash = payloadHash.trim();
  if (!/^[a-f0-9]{64}$/i.test(cleanHash)) throw new Error("HASH_COMMITMENT_INVALID");
  return {
    payloadHash: cleanHash,
    signature: sign(null, utf8Bytes(cleanHash), material.privateKey).toString("base64"),
    signingKeyId: material.keyId,
    publicKey: material.publicKeyPem,
    algorithm: "Ed25519" as const,
  };
}

export function verifyHashCommitment(input: {
  payloadHash: string;
  signature: string;
  publicKeyPem: string;
}) {
  const cleanHash = input.payloadHash.trim();
  if (!/^[a-f0-9]{64}$/i.test(cleanHash)) return false;
  const publicKey = createPublicKey(input.publicKeyPem);
  return verify(null, utf8Bytes(cleanHash), publicKey, base64Bytes(input.signature));
}

export function verifyCertificateSignature(input: {
  payload: VentureOSCertificatePayload;
  payloadHash: string;
  signature: string;
  publicKeyPem: string;
}) {
  const recomputedPayloadHash = certificatePayloadHash(input.payload);
  if (recomputedPayloadHash !== input.payloadHash) return { signatureValid: false, recomputedPayloadHash };
  const publicKey = createPublicKey(input.publicKeyPem);
  const signatureValid = verify(null, utf8Bytes(input.payloadHash), publicKey, base64Bytes(input.signature));
  return { signatureValid, recomputedPayloadHash };
}

export function getConfiguredPublicSigningKey(): PublicSigningKey | null {
  const publicKey = configuredPublicKeyPem();
  if (!publicKey) return null;
  return {
    id: signingKeyId(),
    algorithm: "Ed25519",
    publicKey,
    status: "ACTIVE",
  };
}

export function resolveSigningPublicKey() {
  const material = resolveSigningMaterial();
  return {
    id: material.keyId,
    algorithm: "Ed25519" as const,
    publicKey: material.publicKeyPem,
    status: "ACTIVE" as const,
  };
}

export function certificateSigningAvailable() {
  return Boolean(configuredPrivateKeyPem() && configuredPublicKeyPem()) || process.env.NODE_ENV !== "production";
}

function resolveSigningMaterial(): SigningMaterial {
  const privateKeyPem = configuredPrivateKeyPem();
  const publicKeyPem = configuredPublicKeyPem();
  if (privateKeyPem && publicKeyPem) {
    return {
      keyId: signingKeyId(),
      privateKey: createPrivateKey(privateKeyPem),
      publicKeyPem,
      publicKey: createPublicKey(publicKeyPem),
    };
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("CERTIFICATE_SIGNING_KEY_REQUIRED");
  }

  if (!cachedDevMaterial) {
    const pair = generateKeyPairSync("ed25519");
    const publicKey = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
    cachedDevMaterial = {
      keyId: "dev-ephemeral",
      privateKey: pair.privateKey,
      publicKeyPem: publicKey,
      publicKey: pair.publicKey,
    };
  }
  return cachedDevMaterial;
}

function configuredPrivateKeyPem() {
  return decodePemEnv(process.env.VENTUREOS_CERT_PRIVATE_KEY_PEM || process.env.VENTUREOS_CERT_PRIVATE_KEY_BASE64 || "");
}

function configuredPublicKeyPem() {
  return decodePemEnv(process.env.VENTUREOS_CERT_PUBLIC_KEY_PEM || process.env.VENTUREOS_CERT_PUBLIC_KEY_BASE64 || "");
}

function signingKeyId() {
  return process.env.VENTUREOS_CERT_SIGNING_KEY_ID?.trim() || "vos-key-2026-01";
}

function decodePemEnv(value: string) {
  const clean = value.trim();
  if (!clean) return "";
  if (clean.includes("-----BEGIN")) return clean.replace(/\\n/g, "\n");
  try {
    return Buffer.from(clean, "base64").toString("utf8").trim().replace(/\\n/g, "\n");
  } catch {
    return "";
  }
}

function utf8Bytes(value: string) {
  return new TextEncoder().encode(value);
}

function base64Bytes(value: string) {
  return Uint8Array.from(Buffer.from(value, "base64"));
}
