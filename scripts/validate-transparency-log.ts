import assert from "node:assert/strict";

import dotenv from "dotenv";

import { buildPublicTransparencyLog } from "@/lib/transparency/transparencyLog";
import { buildPublicAnchorManifest } from "@/lib/transparency/transparencyLog";

dotenv.config({ path: ".env.local", override: true });
dotenv.config();

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const emptyLog = await buildPublicTransparencyLog({ certificateId: "vos-cert-validation-missing", limit: 10 });
  assert.equal(emptyLog.engine, "ventureos-transparency-log");
  assert.equal(emptyLog.scope, "public_certificate");
  assert.equal(emptyLog.entryCount, 0);
  assert.equal(emptyLog.verified, true);
  assert.ok(emptyLog.rootHash.length >= 32);

  const publicLog = await buildPublicTransparencyLog({ limit: 10 });
  assert.equal(publicLog.engine, "ventureos-transparency-log");
  assert.equal(publicLog.verified, true);
  assert.equal(publicLog.hashAlgorithm, "sha256");
  assert.equal(publicLog.canonicalization, "stable-json-v1");
  assert.ok(publicLog.genesisHash.length >= 32);
  assert.equal(publicLog.merkleTree.algorithm, "rfc6962-sha256");
  assert.equal(publicLog.merkleTree.treeSize, publicLog.entryCount);
  assert.ok(publicLog.merkleTree.rootHash.length >= 32);
  assert.ok(publicLog.rebuild.canonicalEntryFields.includes("previousEntryHash"));
  assert.equal(publicLog.entries.length, publicLog.entryCount);
  assert.ok(publicLog.rootHash.length >= 32);

  for (const entry of publicLog.entries) {
    assert.equal(typeof entry.index, "number");
    assert.ok(entry.entryHash.length >= 32);
    assert.ok(entry.previousEntryHash.length >= 32);
    assert.ok(entry.evidence.confidence >= 0.9);
  }

  const anchor = await buildPublicAnchorManifest({ limit: 10, baseUrl: "http://localhost:3002" });
  assert.equal(anchor.issuer, "VentureOS");
  assert.equal(anchor.rootHash, publicLog.rootHash);
  assert.equal(anchor.hashAlgorithm, "sha256");
  assert.equal(anchor.canonicalization, "stable-json-v1");
  assert.equal(anchor.merkleRootHash, publicLog.merkleTree.rootHash);
  assert.ok(anchor.anchorHash.length >= 32);
  assert.equal(anchor.signaturePolicy.required[0], "ventureos_system");
  assert.ok(anchor.signatures.some((signature) => signature.signerRole === "ventureos_system"));
  assert.ok(anchor.deterministicRebuild.canonicalEntryFields.includes("entryHash") === false);
  assert.equal(anchor.publicationTargets[0]?.type, "public_endpoint");
  assert.equal(anchor.publicationTargets[0]?.status, "published");
  assert.ok(anchor.publicationTargets.some((target) => target.type === "sigstore_rekor"));
  assert.ok(anchor.publicationTargets.some((target) => target.type === "timestamp_authority"));
  assert.ok(anchor.publicationTargets.some((target) => target.type === "blockchain_anchor"));
  assert.equal(anchor.witnessPolicy.status, anchor.witnessPolicy.satisfied ? "satisfied" : "not_satisfied");
  if (anchor.signature) {
    assert.equal(anchor.signature.payloadHash, anchor.anchorHash);
    assert.equal(anchor.signature.algorithm, "Ed25519");
    assert.ok(anchor.signature.signingKeyId);
    assert.ok(anchor.signature.signature.length > 40);
  }

  console.log(JSON.stringify({
    passed: true,
    emptyLog: {
      entryCount: emptyLog.entryCount,
      verified: emptyLog.verified,
      rootHash: emptyLog.rootHash,
    },
    publicLog: {
      entryCount: publicLog.entryCount,
      verified: publicLog.verified,
      rootHash: publicLog.rootHash,
      latestTypes: publicLog.entries.slice(-5).map((entry) => entry.type),
    },
    anchor: {
      anchorHash: anchor.anchorHash,
      signed: Boolean(anchor.signature),
      targets: anchor.publicationTargets.map((target) => `${target.type}:${target.status}`),
    },
  }, null, 2));
}
