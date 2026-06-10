import { createHash } from "node:crypto";

import { stableHash, stableStringify } from "@/lib/trust-ledger/hash";
import type { TransparencyLogEntry } from "@/lib/transparency/transparencyLog";

export const TRANSPARENCY_MERKLE_ALGORITHM = "rfc6962-sha256" as const;

export type TransparencyMerkleLeaf = {
  index: number;
  entryHash: string;
  leafHash: string;
  type: TransparencyLogEntry["type"];
  sourceId: string;
  timestamp: string;
};

export type TransparencyMerkleAuditPathItem = {
  level: number;
  direction: "left" | "right";
  hash: string;
};

export type TransparencyMerkleTree = {
  algorithm: typeof TRANSPARENCY_MERKLE_ALGORITHM;
  canonicalLeaf: "stable-json-entry-pointer-v1";
  treeSize: number;
  rootHash: string;
  emptyRootHash: string;
  leaves: TransparencyMerkleLeaf[];
};

export type TransparencyInclusionProof = {
  engine: "ventureos-transparency-proof";
  version: "1.0.0";
  proofType: "INCLUSION";
  algorithm: typeof TRANSPARENCY_MERKLE_ALGORITHM;
  canonicalLeaf: TransparencyMerkleTree["canonicalLeaf"];
  treeSize: number;
  leafIndex: number;
  entryHash: string;
  leafHash: string;
  merkleRootHash: string;
  auditPath: TransparencyMerkleAuditPathItem[];
  recomputedRootHash: string;
  verified: boolean;
  verificationRule: string;
};

export type TransparencyConsistencyProof = {
  engine: "ventureos-transparency-proof";
  version: "1.0.0";
  proofType: "CONSISTENCY";
  algorithm: typeof TRANSPARENCY_MERKLE_ALGORITHM;
  canonicalLeaf: TransparencyMerkleTree["canonicalLeaf"];
  previousTreeSize: number;
  currentTreeSize: number;
  previousMerkleRootHash: string;
  currentMerkleRootHash: string;
  proofHashes: string[];
  prefixBoundaryEntryHash: string | null;
  verifiedAgainstCurrentEntries: boolean;
  forkPrevention: {
    status: "requires_external_witnesses" | "externally_witnessed";
    reason: string;
  };
  verificationRule: string;
};

export function buildTransparencyMerkleTree(entries: TransparencyLogEntry[]): TransparencyMerkleTree {
  const leaves = entries.map((entry) => ({
    index: entry.index,
    entryHash: entry.entryHash,
    leafHash: leafHashForEntry(entry),
    type: entry.type,
    sourceId: entry.sourceId,
    timestamp: entry.timestamp,
  }));

  return {
    algorithm: TRANSPARENCY_MERKLE_ALGORITHM,
    canonicalLeaf: "stable-json-entry-pointer-v1",
    treeSize: leaves.length,
    rootHash: merkleRootFromLeafHashes(leaves.map((leaf) => leaf.leafHash)),
    emptyRootHash: emptyMerkleRoot(),
    leaves,
  };
}

export function buildInclusionProof(input: {
  entries: TransparencyLogEntry[];
  entryHash?: string | null;
  index?: number | null;
}): TransparencyInclusionProof {
  const tree = buildTransparencyMerkleTree(input.entries);
  const leafIndex = resolveLeafIndex(tree, input);
  const leaf = tree.leaves[leafIndex];
  if (!leaf) throw new Error("TRANSPARENCY_ENTRY_NOT_FOUND");
  const auditPath = inclusionPath(tree.leaves.map((item) => item.leafHash), leafIndex);
  const recomputedRootHash = recomputeInclusionRoot(leaf.leafHash, auditPath);

  return {
    engine: "ventureos-transparency-proof",
    version: "1.0.0",
    proofType: "INCLUSION",
    algorithm: tree.algorithm,
    canonicalLeaf: tree.canonicalLeaf,
    treeSize: tree.treeSize,
    leafIndex,
    entryHash: leaf.entryHash,
    leafHash: leaf.leafHash,
    merkleRootHash: tree.rootHash,
    auditPath,
    recomputedRootHash,
    verified: recomputedRootHash === tree.rootHash,
    verificationRule: "Hash the canonical leaf with prefix 0x00, then combine audit path siblings with prefix 0x01 until the Merkle root is reached.",
  };
}

export function buildConsistencyProof(input: {
  entries: TransparencyLogEntry[];
  previousTreeSize: number;
}): TransparencyConsistencyProof {
  const currentTree = buildTransparencyMerkleTree(input.entries);
  const previousTreeSize = Math.max(0, Math.min(currentTree.treeSize, Math.round(input.previousTreeSize)));
  const previousEntries = input.entries.slice(0, previousTreeSize);
  const previousTree = buildTransparencyMerkleTree(previousEntries);
  const proofHashes = previousTreeSize > 0 && previousTreeSize < currentTree.treeSize
    ? consistencySubproof(currentTree.leaves.map((leaf) => leaf.leafHash), previousTreeSize, true)
    : [];

  return {
    engine: "ventureos-transparency-proof",
    version: "1.0.0",
    proofType: "CONSISTENCY",
    algorithm: currentTree.algorithm,
    canonicalLeaf: currentTree.canonicalLeaf,
    previousTreeSize,
    currentTreeSize: currentTree.treeSize,
    previousMerkleRootHash: previousTree.rootHash,
    currentMerkleRootHash: currentTree.rootHash,
    proofHashes,
    prefixBoundaryEntryHash: previousTreeSize > 0 ? input.entries[previousTreeSize - 1]?.entryHash || null : null,
    verifiedAgainstCurrentEntries: previousTree.rootHash === merkleRootFromLeafHashes(currentTree.leaves.slice(0, previousTreeSize).map((leaf) => leaf.leafHash)),
    forkPrevention: {
      status: "requires_external_witnesses",
      reason: "A consistency proof proves a prefix relationship for this returned log view. Fork detection requires independent witnesses observing and comparing signed roots over time.",
    },
    verificationRule: "Verify the previous root from the first previousTreeSize leaves, verify the current root from all leaves, then validate the returned subtree hashes against the append-only split rule.",
  };
}

export function leafHashForEntry(entry: TransparencyLogEntry) {
  return hashLeaf(stableStringify({
    index: entry.index,
    type: entry.type,
    sourceId: entry.sourceId,
    sourceVersion: entry.sourceVersion || null,
    timestamp: entry.timestamp,
    entryHash: entry.entryHash,
  }));
}

export function merkleRootFromLeafHashes(leafHashes: string[]) {
  if (leafHashes.length === 0) return emptyMerkleRoot();
  return subtreeHash(leafHashes);
}

function resolveLeafIndex(tree: TransparencyMerkleTree, input: { entryHash?: string | null; index?: number | null }) {
  if (typeof input.index === "number" && Number.isFinite(input.index)) {
    const index = Math.round(input.index);
    if (index >= 0 && index < tree.treeSize) return index;
  }
  const cleanHash = input.entryHash?.trim();
  if (cleanHash) {
    const index = tree.leaves.findIndex((leaf) => leaf.entryHash === cleanHash || leaf.leafHash === cleanHash);
    if (index >= 0) return index;
  }
  if (tree.treeSize > 0 && input.index == null && !cleanHash) return tree.treeSize - 1;
  throw new Error("TRANSPARENCY_ENTRY_NOT_FOUND");
}

function inclusionPath(leafHashes: string[], leafIndex: number, level = 0): TransparencyMerkleAuditPathItem[] {
  if (leafHashes.length <= 1) return [];
  const split = largestPowerOfTwoLessThan(leafHashes.length);
  if (leafIndex < split) {
    return [
      ...inclusionPath(leafHashes.slice(0, split), leafIndex, level + 1),
      { level, direction: "right", hash: subtreeHash(leafHashes.slice(split)) },
    ];
  }
  return [
    ...inclusionPath(leafHashes.slice(split), leafIndex - split, level + 1),
    { level, direction: "left", hash: subtreeHash(leafHashes.slice(0, split)) },
  ];
}

function consistencySubproof(leafHashes: string[], previousTreeSize: number, completeSubtree: boolean): string[] {
  const currentTreeSize = leafHashes.length;
  if (previousTreeSize === currentTreeSize) {
    return completeSubtree ? [] : [subtreeHash(leafHashes)];
  }
  if (currentTreeSize <= 1) return [];
  const split = largestPowerOfTwoLessThan(currentTreeSize);
  if (previousTreeSize <= split) {
    return [
      ...consistencySubproof(leafHashes.slice(0, split), previousTreeSize, completeSubtree),
      subtreeHash(leafHashes.slice(split)),
    ];
  }
  return [
    ...consistencySubproof(leafHashes.slice(split), previousTreeSize - split, false),
    subtreeHash(leafHashes.slice(0, split)),
  ];
}

function recomputeInclusionRoot(leafHash: string, auditPath: TransparencyMerkleAuditPathItem[]) {
  return auditPath.reduce((current, item) => {
    if (item.direction === "left") return hashNode(item.hash, current);
    return hashNode(current, item.hash);
  }, leafHash);
}

function subtreeHash(leafHashes: string[]): string {
  if (leafHashes.length === 0) return emptyMerkleRoot();
  if (leafHashes.length === 1) return leafHashes[0];
  const split = largestPowerOfTwoLessThan(leafHashes.length);
  return hashNode(subtreeHash(leafHashes.slice(0, split)), subtreeHash(leafHashes.slice(split)));
}

function hashLeaf(canonicalLeaf: string) {
  return createHash("sha256").update(concatBytes([new Uint8Array([0x00]), utf8Bytes(canonicalLeaf)])).digest("hex");
}

function hashNode(leftHash: string, rightHash: string) {
  return createHash("sha256").update(concatBytes([new Uint8Array([0x01]), hexBytes(leftHash), hexBytes(rightHash)])).digest("hex");
}

function emptyMerkleRoot() {
  return stableHash({ empty: true, algorithm: TRANSPARENCY_MERKLE_ALGORITHM, version: "1.0.0" });
}

function largestPowerOfTwoLessThan(value: number) {
  let power = 1;
  while (power * 2 < value) power *= 2;
  return power;
}

function hexBytes(value: string) {
  const clean = value.trim();
  const output = new Uint8Array(Math.floor(clean.length / 2));
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}

function utf8Bytes(value: string) {
  return new TextEncoder().encode(value);
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
