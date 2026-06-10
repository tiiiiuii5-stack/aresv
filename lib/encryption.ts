import { createCipheriv, createDecipheriv, createHash, createSecretKey, randomBytes } from "node:crypto";

const PREFIX = "enc:v1";

export function encryptSensitiveContent(content: string, secret = encryptionSecret()) {
  const iv = toUint8Array(randomBytes(12));
  const key = createSecretKey(toUint8Array(createHash("sha256").update(secret).digest()));
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = concatBytes([toUint8Array(cipher.update(content, "utf8")), toUint8Array(cipher.final())]);
  return `${PREFIX}:${base64Url(iv)}:${base64Url(toUint8Array(cipher.getAuthTag()))}:${base64Url(encrypted)}`;
}

export function decryptSensitiveContent(content: string, secret = encryptionSecret()) {
  if (!content.startsWith(`${PREFIX}:`)) return content;
  const [, , ivRaw, tagRaw, encryptedRaw] = content.split(":");
  const key = createSecretKey(toUint8Array(createHash("sha256").update(secret).digest()));
  const decipher = createDecipheriv("aes-256-gcm", key, toUint8Array(Buffer.from(ivRaw, "base64url")));
  decipher.setAuthTag(toUint8Array(Buffer.from(tagRaw, "base64url")));
  const decrypted = concatBytes([
    toUint8Array(decipher.update(toUint8Array(Buffer.from(encryptedRaw, "base64url")))),
    toUint8Array(decipher.final()),
  ]);
  return Buffer.from(decrypted).toString("utf8");
}

function encryptionSecret() {
  const secret = process.env.ENCRYPTION_KEY || process.env.AGENT_MEMORY_ENCRYPTION_KEY;
  if (!secret) throw new Error("ENCRYPTION_KEY or AGENT_MEMORY_ENCRYPTION_KEY is required for sensitive content encryption.");
  return secret;
}

function toUint8Array(buffer: Buffer) {
  return new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
}

function concatBytes(parts: Uint8Array[]) {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function base64Url(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}
