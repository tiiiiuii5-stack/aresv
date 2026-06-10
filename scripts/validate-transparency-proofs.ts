import assert from "node:assert/strict";

import dotenv from "dotenv";

import { stableHash } from "@/lib/trust-ledger/hash";
import { buildConsistencyProof, buildInclusionProof, buildTransparencyMerkleTree } from "@/lib/transparency/merkleTree";
import { buildPublicAnchorManifest, buildPublicTransparencyLog, type TransparencyLogEntry } from "@/lib/transparency/transparencyLog";

dotenv.config({ path: ".env.local", override: true });
dotenv.config();

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const publicLog = await buildPublicTransparencyLog({ limit: 10 });
  assert.equal(publicLog.verified, true);
  assert.equal(publicLog.merkleTree.algorithm, "rfc6962-sha256");
  assert.equal(publicLog.merkleTree.treeSize, publicLog.entryCount);
  assert.ok(publicLog.merkleTree.rootHash.length >= 32);

  const entries = publicLog.entries.length >= 2 ? publicLog.entries : syntheticEntries();
  const tree = buildTransparencyMerkleTree(entries);
  assert.equal(tree.treeSize, entries.length);
  assert.ok(tree.rootHash.length >= 32);

  const inclusion = buildInclusionProof({ entries, index: entries.length - 1 });
  assert.equal(inclusion.proofType, "INCLUSION");
  assert.equal(inclusion.verified, true);
  assert.equal(inclusion.merkleRootHash, tree.rootHash);
  assert.equal(inclusion.entryHash, entries[entries.length - 1]?.entryHash);

  const consistency = buildConsistencyProof({ entries, previousTreeSize: entries.length - 1 });
  assert.equal(consistency.proofType, "CONSISTENCY");
  assert.equal(consistency.currentTreeSize, entries.length);
  assert.equal(consistency.currentMerkleRootHash, tree.rootHash);
  assert.equal(consistency.verifiedAgainstCurrentEntries, true);
  assert.equal(consistency.forkPrevention.status, "requires_external_witnesses");

  const anchor = await buildPublicAnchorManifest({ limit: 10, baseUrl: "http://localhost:3002" });
  assert.equal(anchor.merkleRootHash, publicLog.merkleTree.rootHash);
  assert.equal(anchor.witnessPolicy.minimumIndependentWitnesses >= 1, true);
  assert.ok(anchor.publicationTargets.some((target) => target.type === "sigstore_rekor"));
  assert.ok(anchor.publicationTargets.some((target) => target.type === "timestamp_authority"));
  assert.ok(anchor.publicationTargets.some((target) => target.type === "blockchain_anchor"));

  console.log(JSON.stringify({
    passed: true,
    publicLog: {
      entryCount: publicLog.entryCount,
      hashChainRoot: publicLog.rootHash,
      merkleRoot: publicLog.merkleTree.rootHash,
    },
    inclusion: {
      leafIndex: inclusion.leafIndex,
      verified: inclusion.verified,
      auditPathLength: inclusion.auditPath.length,
    },
    consistency: {
      previousTreeSize: consistency.previousTreeSize,
      currentTreeSize: consistency.currentTreeSize,
      proofHashCount: consistency.proofHashes.length,
      verifiedAgainstCurrentEntries: consistency.verifiedAgainstCurrentEntries,
    },
    witnessPolicy: anchor.witnessPolicy,
  }, null, 2));
}

function syntheticEntries(): TransparencyLogEntry[] {
  const base = {
    assetId: null,
    certificateId: "vos-cert-proof-validation",
    projectId: null,
    payloadHash: null,
    sourceSnapshotHash: null,
    publicSummaryHash: null,
    privateEvidenceHash: null,
    signingKeyId: null,
    attestation: {
      status: "legacy_unsigned" as const,
      source: "legacy_row" as const,
      committedAt: null,
      payloadHash: null,
      algorithm: null,
      signingKeyId: null,
      signature: null,
      evidence: "Synthetic proof validation entry.",
    },
    evidence: {
      source: "certificate_payload" as const,
      reason: "Synthetic validation entry.",
      confidence: 0.99,
    },
    metadata: {},
  };
  const firstHash = stableHash({ validation: "first" });
  const first: TransparencyLogEntry = {
    ...base,
    index: 0,
    type: "CERTIFICATE_ISSUED",
    sourceId: "proof-validation-1",
    timestamp: "2026-01-01T00:00:00.000Z",
    previousEntryHash: stableHash({ genesis: "proof-validation" }),
    entryHash: firstHash,
  };
  return [
    first,
    {
      ...base,
      index: 1,
      type: "CERTIFICATE_SNAPSHOT",
      sourceId: "proof-validation-2",
      sourceVersion: 1,
      timestamp: "2026-01-01T00:00:01.000Z",
      previousEntryHash: firstHash,
      entryHash: stableHash({ validation: "second" }),
    },
  ];
}
