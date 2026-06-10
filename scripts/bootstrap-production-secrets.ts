import { generateKeyPairSync, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

type EnvMap = Map<string, string>;

const envPath = path.join(process.cwd(), ".env.local");
const force = process.argv.includes("--force");
const dryRun = process.argv.includes("--dry-run");

function randomSecret(bytes = 48) {
  return randomBytes(bytes).toString("base64url");
}

function certificateKeys() {
  const pair = generateKeyPairSync("ed25519");
  const privatePem = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return {
    privateBase64: Buffer.from(privatePem, "utf8").toString("base64"),
    publicBase64: Buffer.from(publicPem, "utf8").toString("base64"),
    keyId: `vos-key-${stamp}-${randomBytes(4).toString("hex")}`,
  };
}

function parseEnv(content: string): EnvMap {
  const values: EnvMap = new Map();
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    values.set(match[1], unquote(match[2] || ""));
  }
  return values;
}

function unquote(value: string) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function quote(value: string) {
  return JSON.stringify(value);
}

function upsert(content: string, key: string, value: string, existing: EnvMap) {
  if (!force && existing.get(key)) return { content, changed: false };
  const line = `${key}=${quote(value)}`;
  const pattern = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
  if (pattern.test(content)) return { content: content.replace(pattern, line), changed: true };
  const next = content.endsWith("\n") || !content ? content : `${content}\n`;
  return { content: `${next}${line}\n`, changed: true };
}

const original = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const existing = parseEnv(original);
let content = original;
const changedKeys: string[] = [];

const requiredSecrets: Array<[string, string]> = [
  ["SESSION_SECRET", randomSecret(64)],
  ["ADMIN_SESSION_SECRET", randomSecret(64)],
  ["NEXTAUTH_SECRET", randomSecret(64)],
  ["ENCRYPTION_KEY", randomSecret(32)],
  ["AGENT_MEMORY_ENCRYPTION_KEY", randomSecret(32)],
  ["ADMIN_PASSWORD", randomSecret(24)],
];

for (const [key, value] of requiredSecrets) {
  const result = upsert(content, key, value, existing);
  content = result.content;
  if (result.changed) changedKeys.push(key);
}

const hasCertPrivate = Boolean(existing.get("VENTUREOS_CERT_PRIVATE_KEY_PEM") || existing.get("VENTUREOS_CERT_PRIVATE_KEY_BASE64"));
const hasCertPublic = Boolean(existing.get("VENTUREOS_CERT_PUBLIC_KEY_PEM") || existing.get("VENTUREOS_CERT_PUBLIC_KEY_BASE64"));
const hasCertKeyId = Boolean(existing.get("VENTUREOS_CERT_SIGNING_KEY_ID"));
if (force || !hasCertPrivate || !hasCertPublic || !hasCertKeyId) {
  const keys = certificateKeys();
  for (const [key, value] of [
    ["VENTUREOS_CERT_PRIVATE_KEY_BASE64", keys.privateBase64],
    ["VENTUREOS_CERT_PUBLIC_KEY_BASE64", keys.publicBase64],
    ["VENTUREOS_CERT_SIGNING_KEY_ID", keys.keyId],
  ] as const) {
    const result = upsert(content, key, value, existing);
    content = result.content;
    if (result.changed) changedKeys.push(key);
  }
}

if (!dryRun && changedKeys.length) writeFileSync(envPath, content);

console.log(JSON.stringify({
  ok: true,
  envFile: ".env.local",
  dryRun,
  changedKeys,
  preservedExistingKeys: Array.from(existing.keys()).filter((key) => !changedKeys.includes(key)).sort(),
  note: "Secret values were written locally but were not printed.",
}));
