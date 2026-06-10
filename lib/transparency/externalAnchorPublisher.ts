import type { TransparencyAnchorManifest } from "@/lib/transparency/transparencyLog";
import { stableHash } from "@/lib/trust-ledger/hash";

export type ExternalAnchorTarget = "github_commit" | "external_witness" | "sigstore_rekor" | "timestamp_authority" | "blockchain_anchor";

export type ExternalAnchorPublishResult = {
  target: ExternalAnchorTarget;
  status: "published" | "already_published" | "not_configured" | "failed";
  evidence: string;
  url?: string;
  commitSha?: string;
  witnessId?: string;
  receiptHash?: string;
  receipt?: Record<string, unknown>;
  publishedAt: string;
};

export type ExternalAnchorPublishReport = {
  engine: "ventureos-external-anchor-publisher";
  version: "1.0.0";
  generatedAt: string;
  anchorHash: string;
  rootHash: string;
  certificateId?: string | null;
  results: ExternalAnchorPublishResult[];
};

export async function publishExternalAnchor(input: {
  manifest: TransparencyAnchorManifest;
  targets?: ExternalAnchorTarget[];
}): Promise<ExternalAnchorPublishReport> {
  const targets = input.targets?.length ? input.targets : ["github_commit", "external_witness", "sigstore_rekor", "timestamp_authority", "blockchain_anchor"];
  const results: ExternalAnchorPublishResult[] = [];
  for (const target of targets) {
    if (target === "github_commit") results.push(await publishGitHubAnchor(input.manifest));
    if (target === "external_witness") results.push(...await publishWitnessAnchors(input.manifest));
    if (target === "sigstore_rekor") results.push(await publishRekorAnchor(input.manifest));
    if (target === "timestamp_authority") results.push(await publishTimestampAuthorityAnchor(input.manifest));
    if (target === "blockchain_anchor") results.push(await publishBlockchainAnchor(input.manifest));
  }

  return {
    engine: "ventureos-external-anchor-publisher",
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    anchorHash: input.manifest.anchorHash,
    rootHash: input.manifest.rootHash,
    certificateId: input.manifest.certificateId || null,
    results,
  };
}

async function publishGitHubAnchor(manifest: TransparencyAnchorManifest): Promise<ExternalAnchorPublishResult> {
  const token = env("TRANSPARENCY_ANCHOR_GITHUB_TOKEN") || env("GITHUB_TOKEN");
  const repository = env("TRANSPARENCY_ANCHOR_GITHUB_REPOSITORY");
  if (!token || !repository) {
    return result("github_commit", "not_configured", "GitHub anchoring requires TRANSPARENCY_ANCHOR_GITHUB_TOKEN and TRANSPARENCY_ANCHOR_GITHUB_REPOSITORY.");
  }

  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    return result("github_commit", "failed", "TRANSPARENCY_ANCHOR_GITHUB_REPOSITORY must be formatted as owner/repo.");
  }

  const branch = env("TRANSPARENCY_ANCHOR_GITHUB_BRANCH") || "main";
  const prefix = (env("TRANSPARENCY_ANCHOR_GITHUB_PATH_PREFIX") || ".ventureos/transparency-anchors").replace(/^\/+|\/+$/g, "");
  const scope = manifest.certificateId ? `certificates/${safePath(manifest.certificateId)}` : "registry";
  const filePath = `${prefix}/${scope}/${manifest.anchorHash}.json`;
  const apiBase = env("GITHUB_API_BASE_URL") || "https://api.github.com";
  const content = JSON.stringify(manifest, null, 2);
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  const url = `${apiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`;

  try {
    const existing = await fetch(`${url}?ref=${encodeURIComponent(branch)}`, {
      headers: githubHeaders(token),
    });
    if (existing.ok) {
      const body = await existing.json() as { html_url?: string };
      return result("github_commit", "already_published", "Anchor manifest already exists in the configured GitHub repository.", body.html_url);
    }
    if (existing.status !== 404) {
      return result("github_commit", "failed", `GitHub existing-anchor lookup failed with ${existing.status}.`);
    }

    const response = await fetch(url, {
      method: "PUT",
      headers: githubHeaders(token, true),
      body: JSON.stringify({
        message: `Anchor VentureOS transparency root ${manifest.anchorHash.slice(0, 12)}`,
        content: Buffer.from(content, "utf8").toString("base64"),
        branch,
      }),
    });
    const body = await response.json().catch(() => ({})) as {
      content?: { html_url?: string };
      commit?: { sha?: string };
      message?: string;
    };
    if (!response.ok) {
      return result("github_commit", "failed", typeof body.message === "string" ? body.message : `GitHub publish failed with ${response.status}.`);
    }
    return {
      ...result("github_commit", "published", "Anchor manifest was committed to the configured GitHub repository.", body.content?.html_url),
      commitSha: body.commit?.sha,
    };
  } catch (error) {
    return result("github_commit", "failed", `GitHub anchor publish failed: ${messageFor(error)}`);
  }
}

async function publishWitnessAnchors(manifest: TransparencyAnchorManifest): Promise<ExternalAnchorPublishResult[]> {
  const witnessUrls = configuredWitnessUrls();
  if (!witnessUrls.length) {
    return [
      result("external_witness", "not_configured", "External witness anchoring requires TRANSPARENCY_ANCHOR_WITNESS_URL or TRANSPARENCY_ANCHOR_WITNESS_URLS."),
    ];
  }
  return Promise.all(witnessUrls.map((url) => publishWitnessAnchor(manifest, url)));
}

async function publishWitnessAnchor(manifest: TransparencyAnchorManifest, witnessUrl: string): Promise<ExternalAnchorPublishResult> {
  if (!witnessUrl) {
    return result("external_witness", "not_configured", "External witness anchoring requires TRANSPARENCY_ANCHOR_WITNESS_URL.");
  }

  try {
    const response = await fetch(witnessUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env("TRANSPARENCY_ANCHOR_WITNESS_TOKEN") ? { Authorization: `Bearer ${env("TRANSPARENCY_ANCHOR_WITNESS_TOKEN")}` } : {}),
      },
      body: JSON.stringify(manifest),
    });
    const body = await response.json().catch(() => ({})) as { id?: string; witnessId?: string; url?: string; message?: string };
    if (!response.ok) {
      return result("external_witness", "failed", typeof body.message === "string" ? body.message : `Witness publish failed with ${response.status}.`);
    }
    return {
      ...result("external_witness", "published", "Anchor manifest was accepted by the configured external witness.", body.url),
      witnessId: body.witnessId || body.id,
      receiptHash: stableHash(body),
      receipt: publicReceipt(body),
    };
  } catch (error) {
    return result("external_witness", "failed", `External witness publish failed: ${messageFor(error)}`);
  }
}

async function publishRekorAnchor(manifest: TransparencyAnchorManifest): Promise<ExternalAnchorPublishResult> {
  const rekorUrl = env("TRANSPARENCY_ANCHOR_REKOR_URL") || env("SIGSTORE_REKOR_URL");
  if (!rekorUrl) {
    return result("sigstore_rekor", "not_configured", "Sigstore Rekor anchoring requires TRANSPARENCY_ANCHOR_REKOR_URL.");
  }
  const endpoint = rekorUrl.replace(/\/+$/, "");
  const url = /\/api\/v[12]\/log\/entries$/.test(endpoint) ? endpoint : `${endpoint}/api/v1/log/entries`;
  const publicKeyPem = configuredPublicKeyPem();
  const body = {
    apiVersion: "0.0.1",
    kind: "hashedrekord",
    spec: {
      data: { hash: { algorithm: "sha256", value: manifest.anchorHash } },
      signature: manifest.signature && publicKeyPem
        ? {
            content: manifest.signature.signature,
            publicKey: { content: Buffer.from(publicKeyPem, "utf8").toString("base64") },
          }
        : undefined,
    },
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env("TRANSPARENCY_ANCHOR_REKOR_TOKEN") ? { Authorization: `Bearer ${env("TRANSPARENCY_ANCHOR_REKOR_TOKEN")}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const responseBody = await response.json().catch(() => ({})) as Record<string, unknown> & { message?: string };
    if (!response.ok) {
      return result("sigstore_rekor", "failed", typeof responseBody.message === "string" ? responseBody.message : `Rekor publish failed with ${response.status}.`);
    }
    return {
      ...result("sigstore_rekor", "published", "Signed anchor hash was submitted to the configured Rekor-compatible transparency log.", url),
      witnessId: stringField(responseBody, "uuid") || stringField(responseBody, "logID") || stringField(responseBody, "integratedTime"),
      receiptHash: stableHash(responseBody),
      receipt: publicReceipt(responseBody),
    };
  } catch (error) {
    return result("sigstore_rekor", "failed", `Rekor anchor publish failed: ${messageFor(error)}`);
  }
}

async function publishTimestampAuthorityAnchor(manifest: TransparencyAnchorManifest): Promise<ExternalAnchorPublishResult> {
  const tsaUrl = env("TRANSPARENCY_ANCHOR_TSA_URL");
  if (!tsaUrl) {
    return result("timestamp_authority", "not_configured", "RFC 3161 timestamp anchoring requires TRANSPARENCY_ANCHOR_TSA_URL.");
  }

  try {
    const requestBody = timestampRequestDer(manifest.anchorHash);
    const response = await fetch(tsaUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/timestamp-query",
        Accept: "application/timestamp-reply, application/timestamp-response, application/octet-stream",
      },
      body: requestBody,
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!response.ok || bytes.length === 0) {
      return result("timestamp_authority", "failed", `Timestamp authority returned ${response.status}.`);
    }
    return {
      ...result("timestamp_authority", "published", "RFC 3161 timestamp authority returned a timestamp reply for the signed anchor hash.", tsaUrl),
      receiptHash: stableHash({ responseHash: stableHash(bytes.toString("base64")), byteLength: bytes.length }),
      receipt: {
        contentType: response.headers.get("content-type") || "unknown",
        responseHash: stableHash(bytes.toString("base64")),
        byteLength: bytes.length,
        verificationStatus: "token_received_unparsed",
      },
    };
  } catch (error) {
    return result("timestamp_authority", "failed", `Timestamp authority publish failed: ${messageFor(error)}`);
  }
}

async function publishBlockchainAnchor(manifest: TransparencyAnchorManifest): Promise<ExternalAnchorPublishResult> {
  const blockchainUrl = env("TRANSPARENCY_ANCHOR_BLOCKCHAIN_URL");
  if (!blockchainUrl) {
    return result("blockchain_anchor", "not_configured", "Blockchain anchoring requires TRANSPARENCY_ANCHOR_BLOCKCHAIN_URL and is optional redundancy.");
  }
  try {
    const response = await fetch(blockchainUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env("TRANSPARENCY_ANCHOR_BLOCKCHAIN_TOKEN") ? { Authorization: `Bearer ${env("TRANSPARENCY_ANCHOR_BLOCKCHAIN_TOKEN")}` } : {}),
      },
      body: JSON.stringify({
        anchorHash: manifest.anchorHash,
        merkleRootHash: manifest.merkleRootHash,
        rootHash: manifest.rootHash,
        certificateId: manifest.certificateId || null,
        generatedAt: manifest.generatedAt,
      }),
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown> & { message?: string; transactionUrl?: string; txHash?: string };
    if (!response.ok) {
      return result("blockchain_anchor", "failed", typeof body.message === "string" ? body.message : `Blockchain anchor failed with ${response.status}.`);
    }
    return {
      ...result("blockchain_anchor", "published", "Anchor hash was accepted by the configured blockchain anchoring service.", stringField(body, "transactionUrl") || stringField(body, "url")),
      witnessId: stringField(body, "txHash") || stringField(body, "transactionHash"),
      receiptHash: stableHash(body),
      receipt: publicReceipt(body),
    };
  } catch (error) {
    return result("blockchain_anchor", "failed", `Blockchain anchor publish failed: ${messageFor(error)}`);
  }
}

function result(target: ExternalAnchorTarget, status: ExternalAnchorPublishResult["status"], evidence: string, url?: string): ExternalAnchorPublishResult {
  return {
    target,
    status,
    evidence,
    url,
    publishedAt: new Date().toISOString(),
  };
}

function githubHeaders(token: string, json = false) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function safePath(value: string) {
  return value.replace(/[^a-z0-9_.-]/gi, "_").slice(0, 120);
}

function env(name: string) {
  return process.env[name]?.trim() || "";
}

function configuredPublicKeyPem() {
  return decodePemEnv(env("VENTUREOS_CERT_PUBLIC_KEY_PEM") || env("VENTUREOS_CERT_PUBLIC_KEY_BASE64"));
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

function configuredWitnessUrls() {
  return [
    ...env("TRANSPARENCY_ANCHOR_WITNESS_URLS").split(","),
    env("TRANSPARENCY_ANCHOR_WITNESS_URL"),
  ].map((value) => value.trim()).filter(Boolean);
}

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function publicReceipt(value: Record<string, unknown>) {
  const copy = { ...value };
  delete copy.token;
  delete copy.accessToken;
  delete copy.authorization;
  return copy;
}

function stringField(value: Record<string, unknown>, key: string) {
  const field = value[key];
  return typeof field === "string" && field.trim() ? field.trim() : "";
}

function timestampRequestDer(anchorHash: string) {
  const hashBytes = hexBytes(anchorHash);
  const sha256Algorithm = derSequence(derOid(new Uint8Array([0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01])), derNull());
  const messageImprint = derSequence(sha256Algorithm, derOctetString(hashBytes));
  return derSequence(derInteger(new Uint8Array([0x01])), messageImprint, derBoolean(true));
}

function derSequence(...parts: Uint8Array[]) {
  return derTag(0x30, concatBytes(parts));
}

function derInteger(value: Uint8Array) {
  const positive = value.length && (value[0] & 0x80) ? concatBytes([new Uint8Array([0x00]), value]) : value;
  return derTag(0x02, positive);
}

function derOid(value: Uint8Array) {
  return derTag(0x06, value);
}

function derNull() {
  return new Uint8Array([0x05, 0x00]);
}

function derOctetString(value: Uint8Array) {
  return derTag(0x04, value);
}

function derBoolean(value: boolean) {
  return derTag(0x01, new Uint8Array([value ? 0xff : 0x00]));
}

function derTag(tag: number, value: Uint8Array) {
  return concatBytes([new Uint8Array([tag]), derLength(value.length), value]);
}

function derLength(length: number): Uint8Array {
  if (length < 128) return new Uint8Array([length]);
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>= 8;
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function hexBytes(value: string) {
  const clean = value.trim();
  const output = new Uint8Array(Math.floor(clean.length / 2));
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}

function concatBytes(chunks: Uint8Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
