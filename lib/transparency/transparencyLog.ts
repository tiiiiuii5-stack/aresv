import { tryDatabase } from "@/lib/prisma";
import { certificateSigningAvailable, signHashCommitment } from "@/lib/certificates/signing";
import { sanitizeMetadata } from "@/lib/services/platformSupport";
import { stableHash } from "@/lib/trust-ledger/hash";
import { commitmentValue } from "@/lib/transparency/eventCommitment";
import { buildTransparencyMerkleTree, type TransparencyMerkleTree } from "@/lib/transparency/merkleTree";

export const TRANSPARENCY_LOG_GENESIS_HASH = stableHash({ genesis: "ventureos-transparency-log", version: "1.0.0" });

export type TransparencyEntryType =
  | "CERTIFICATE_ISSUED"
  | "CERTIFICATE_SNAPSHOT"
  | "SCAN_COMMITMENT"
  | "PROJECT_SCAN"
  | "TRUST_LEDGER_SNAPSHOT";

export type TransparencyLogEntry = {
  index: number;
  type: TransparencyEntryType;
  sourceId: string;
  sourceVersion?: number;
  timestamp: string;
  assetId?: string | null;
  certificateId?: string | null;
  projectId?: string | null;
  payloadHash?: string | null;
  sourceSnapshotHash?: string | null;
  publicSummaryHash?: string | null;
  privateEvidenceHash?: string | null;
  signingKeyId?: string | null;
  previousEntryHash: string;
  entryHash: string;
  attestation: TransparencyLogEventAttestation;
  evidence: {
    source: "software_certificates" | "software_certificate_snapshots" | "certificate_payload" | "project_scan_history" | "software_trust_ledger_snapshots";
    reason: string;
    confidence: number;
  };
  metadata: Record<string, unknown>;
};

export type TransparencyLogEventAttestation = {
  status: "ingestion_signed" | "certificate_payload_signed" | "legacy_unsigned" | "signing_not_configured";
  source: "event_commitment" | "certificate_signature" | "legacy_row";
  committedAt: string | null;
  payloadHash: string | null;
  algorithm: "Ed25519" | null;
  signingKeyId: string | null;
  signature: string | null;
  evidence: string;
};

export type TransparencyLogReport = {
  engine: "ventureos-transparency-log";
  version: "1.0.0";
  generatedAt: string;
  hashAlgorithm: "sha256";
  canonicalization: "stable-json-v1";
  genesisHash: string;
  scope: "public_certificate" | "public_registry" | "project";
  certificateId?: string | null;
  projectId?: string | null;
  entryCount: number;
  rootHash: string;
  merkleTree: Pick<TransparencyMerkleTree, "algorithm" | "canonicalLeaf" | "treeSize" | "rootHash" | "emptyRootHash">;
  verified: boolean;
  entries: TransparencyLogEntry[];
  rebuild: {
    guarantee: string;
    canonicalEntryFields: string[];
    rootRule: string;
  };
  limitations: string[];
};

export type TransparencyAnchorSignature = {
  signerRole: "ventureos_system" | "customer" | "auditor" | "external_witness";
  signerName: string;
  algorithm: "Ed25519";
  signingKeyId: string;
  signature: string;
  payloadHash: string;
  status: "present" | "missing" | "not_configured";
};

export type TransparencyAnchorManifest = {
  issuer: "VentureOS";
  schemaVersion: "1.0";
  generatedAt: string;
  hashAlgorithm: "sha256";
  canonicalization: "stable-json-v1";
  scope: TransparencyLogReport["scope"];
  certificateId?: string | null;
  projectId?: string | null;
  rootHash: string;
  merkleRootHash: string;
  anchorHash: string;
  entryCount: number;
  firstEntryHash?: string | null;
  lastEntryHash?: string | null;
  logUrl: string;
  publicEndpoint: string;
  signature?: Omit<TransparencyAnchorSignature, "signerRole" | "signerName" | "status"> | null;
  signatures: TransparencyAnchorSignature[];
  signaturePolicy: {
    required: Array<TransparencyAnchorSignature["signerRole"]>;
    optional: Array<TransparencyAnchorSignature["signerRole"]>;
    satisfied: boolean;
  };
  deterministicRebuild: TransparencyLogReport["rebuild"];
  witnessPolicy: {
    minimumIndependentWitnesses: number;
    configuredIndependentWitnesses: number;
    satisfied: boolean;
    status: "not_satisfied" | "satisfied";
    reason: string;
  };
  publicationTargets: Array<{
    type: "public_endpoint" | "github_commit" | "external_witness" | "sigstore_rekor" | "timestamp_authority" | "blockchain_anchor";
    status: "published" | "ready" | "not_configured";
    evidence: string;
  }>;
};

type CertificateRow = {
  certificateId: string;
  appraisalPublicId: string;
  projectId: string | null;
  status: string;
  badgeState: string;
  payload: unknown;
  payloadHash: string;
  signingKeyId: string;
  publicSummaryHash: string;
  privateEvidenceHash: string;
  sourceSnapshotHash: string | null;
  signature: string;
  issuedAt: Date | string;
  createdAt: Date | string;
};

type CertificateSnapshotRow = {
  certificateId: string;
  version: number | bigint;
  status: string;
  payloadHash: string;
  signature: string;
  signingKeyId: string;
  changeReason: string | null;
  createdAt: Date | string;
};

type ScanHistoryRow = {
  id: string;
  scanSource: string;
  scanRefId: string | null;
  readinessScore: number | bigint;
  findingsCount: number | bigint;
  criticalFindingsCount: number | bigint;
  riskLevel: string | null;
  framework: string | null;
  metadata: unknown;
  scannedAt: Date | string;
};

type TrustLedgerRow = {
  id: string;
  snapshotHash: string;
  sourceScanId: string | null;
  sourceScanRefId: string | null;
  score: number | bigint;
  confidence: number;
  verdict: string;
  rating: string;
  evidenceCount: number | bigint;
  claimCount: number | bigint;
  metadata: unknown;
  createdAt: Date | string;
};

type DraftEntry = Omit<TransparencyLogEntry, "index" | "previousEntryHash" | "entryHash">;

export async function buildPublicTransparencyLog(input: { certificateId?: string | null; limit?: number } = {}): Promise<TransparencyLogReport> {
  const certificateId = input.certificateId?.trim() || null;
  const limit = boundedLimit(input.limit, certificateId ? 100 : 50);
  const certificates = await loadPublicCertificateRows({ certificateId, limit });
  const certificateIds = certificates.map((row) => row.certificateId);
  const snapshots = certificateIds.length ? await loadCertificateSnapshotRows(certificateIds) : [];
  const entries = chainEntries([
    ...certificates.flatMap(certificateEntries),
    ...snapshots.map(certificateSnapshotEntry),
  ]);
  const merkleTree = buildTransparencyMerkleTree(entries);

  return {
    engine: "ventureos-transparency-log",
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    hashAlgorithm: "sha256",
    canonicalization: "stable-json-v1",
    genesisHash: TRANSPARENCY_LOG_GENESIS_HASH,
    scope: certificateId ? "public_certificate" : "public_registry",
    certificateId,
    entryCount: entries.length,
    rootHash: entries[entries.length - 1]?.entryHash || stableHash({ empty: true, scope: "public_registry" }),
    merkleTree: merkleTreeSummary(merkleTree),
    verified: verifyChain(entries),
    entries,
    rebuild: rebuildContract(),
    limitations: [
      "Public transparency entries expose hashes, statuses, timestamps, and public certificate commitments only.",
      "Private source code, private findings, and user identity are not published in this log.",
    ],
  };
}

export async function buildProjectTransparencyLog(input: { projectId: string; limit?: number }): Promise<TransparencyLogReport> {
  const projectId = input.projectId.trim();
  if (!projectId) throw new Error("PROJECT_ID_REQUIRED");
  const limit = boundedLimit(input.limit, 100);
  const [certificates, scanRows, trustLedgerRows] = await Promise.all([
    loadPublicCertificateRows({ projectId, limit }),
    loadProjectScanRows(projectId, limit),
    loadTrustLedgerRows(projectId, limit),
  ]);
  const certificateIds = certificates.map((row) => row.certificateId);
  const snapshots = certificateIds.length ? await loadCertificateSnapshotRows(certificateIds) : [];
  const entries = chainEntries([
    ...scanRows.map(projectScanEntry),
    ...trustLedgerRows.map(trustLedgerEntry),
    ...certificates.flatMap(certificateEntries),
    ...snapshots.map(certificateSnapshotEntry),
  ]);
  const merkleTree = buildTransparencyMerkleTree(entries);

  return {
    engine: "ventureos-transparency-log",
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    hashAlgorithm: "sha256",
    canonicalization: "stable-json-v1",
    genesisHash: TRANSPARENCY_LOG_GENESIS_HASH,
    scope: "project",
    projectId,
    entryCount: entries.length,
    rootHash: entries[entries.length - 1]?.entryHash || stableHash({ empty: true, scope: "project", projectId }),
    merkleTree: merkleTreeSummary(merkleTree),
    verified: verifyChain(entries),
    entries,
    rebuild: rebuildContract(),
    limitations: [
      "Project transparency logs are owner-scoped and include scan/trust-ledger metadata commitments.",
      "Raw source code and private evidence payloads are represented by hashes, not exposed.",
    ],
  };
}

export async function buildPublicAnchorManifest(input: {
  certificateId?: string | null;
  limit?: number;
  baseUrl?: string;
} = {}): Promise<TransparencyAnchorManifest> {
  const log = await buildPublicTransparencyLog({ certificateId: input.certificateId, limit: input.limit });
  return anchorManifestForLog(log, input.baseUrl);
}

export function anchorManifestForLog(log: TransparencyLogReport, baseUrl = ""): TransparencyAnchorManifest {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const query = log.certificateId ? `?certificateId=${encodeURIComponent(log.certificateId)}` : "";
  const publicEndpoint = `${cleanBase}/.well-known/ventureos-transparency-anchor.json${query}`;
  const logUrl = `${cleanBase}/transparency-log${query}`;
  const firstEntryHash = log.entries[0]?.entryHash || null;
  const lastEntryHash = log.entries[log.entries.length - 1]?.entryHash || null;
  const anchorBasis = {
    issuer: "VentureOS",
    schemaVersion: "1.0",
    scope: log.scope,
    certificateId: log.certificateId || null,
    projectId: log.projectId || null,
    rootHash: log.rootHash,
    merkleRootHash: log.merkleTree.rootHash,
    entryCount: log.entryCount,
    firstEntryHash,
    lastEntryHash,
  };
  const anchorHash = stableHash(anchorBasis);
  const systemSignature = certificateSigningAvailable()
    ? signHashCommitment(anchorHash)
    : null;
  const signatures: TransparencyAnchorSignature[] = [
    systemSignature
      ? {
          signerRole: "ventureos_system",
          signerName: "VentureOS",
          algorithm: systemSignature.algorithm,
          signingKeyId: systemSignature.signingKeyId,
          signature: systemSignature.signature,
          payloadHash: systemSignature.payloadHash,
          status: "present",
        }
      : {
          signerRole: "ventureos_system",
          signerName: "VentureOS",
          algorithm: "Ed25519",
          signingKeyId: "",
          signature: "",
          payloadHash: anchorHash,
          status: "not_configured",
        },
    {
      signerRole: "customer",
      signerName: "Customer",
      algorithm: "Ed25519",
      signingKeyId: "",
      signature: "",
      payloadHash: anchorHash,
      status: "not_configured",
    },
    {
      signerRole: "auditor",
      signerName: "Auditor",
      algorithm: "Ed25519",
      signingKeyId: "",
      signature: "",
      payloadHash: anchorHash,
      status: "not_configured",
    },
  ];

  return {
    issuer: "VentureOS",
    schemaVersion: "1.0",
    generatedAt: log.generatedAt,
    hashAlgorithm: "sha256",
    canonicalization: "stable-json-v1",
    scope: log.scope,
    certificateId: log.certificateId || null,
    projectId: log.projectId || null,
    rootHash: log.rootHash,
    merkleRootHash: log.merkleTree.rootHash,
    anchorHash,
    entryCount: log.entryCount,
    firstEntryHash,
    lastEntryHash,
    logUrl,
    publicEndpoint,
    signature: systemSignature
      ? {
          algorithm: systemSignature.algorithm,
          signingKeyId: systemSignature.signingKeyId,
          signature: systemSignature.signature,
          payloadHash: systemSignature.payloadHash,
        }
      : null,
    signatures,
    signaturePolicy: {
      required: ["ventureos_system"],
      optional: ["customer", "auditor", "external_witness"],
      satisfied: Boolean(systemSignature),
    },
    deterministicRebuild: log.rebuild,
    witnessPolicy: witnessPolicy(),
    publicationTargets: [
      {
        type: "public_endpoint",
        status: "published",
        evidence: "Anchor manifest is available from a public VentureOS endpoint.",
      },
      {
        type: "github_commit",
        status: githubAnchorConfigured() ? "ready" : "not_configured",
        evidence: githubAnchorConfigured()
          ? "GitHub external anchor publishing is configured and ready."
          : "Set TRANSPARENCY_ANCHOR_GITHUB_TOKEN and TRANSPARENCY_ANCHOR_GITHUB_REPOSITORY to publish this anchor to GitHub.",
      },
      {
        type: "external_witness",
        status: witnessAnchorConfigured() ? "ready" : "not_configured",
        evidence: witnessAnchorConfigured()
          ? "External witness endpoint is configured and ready."
          : "Set TRANSPARENCY_ANCHOR_WITNESS_URL to publish this anchor to an independent witness.",
      },
      {
        type: "sigstore_rekor",
        status: rekorAnchorConfigured() ? "ready" : "not_configured",
        evidence: rekorAnchorConfigured()
          ? "Sigstore Rekor-compatible anchoring endpoint is configured and ready."
          : "Set TRANSPARENCY_ANCHOR_REKOR_URL to submit signed root events to a Rekor-compatible log.",
      },
      {
        type: "timestamp_authority",
        status: tsaAnchorConfigured() ? "ready" : "not_configured",
        evidence: tsaAnchorConfigured()
          ? "RFC 3161 timestamp authority endpoint is configured and ready."
          : "Set TRANSPARENCY_ANCHOR_TSA_URL to bind the signed root to an external timestamp authority.",
      },
      {
        type: "blockchain_anchor",
        status: blockchainAnchorConfigured() ? "ready" : "not_configured",
        evidence: blockchainAnchorConfigured()
          ? "Blockchain anchoring endpoint is configured and ready as optional redundant evidence."
          : "Set TRANSPARENCY_ANCHOR_BLOCKCHAIN_URL only when redundant blockchain anchoring is required.",
      },
    ],
  };
}

function certificateEntries(row: CertificateRow): DraftEntry[] {
  const payload = objectValue(row.payload);
  const sourceSnapshotHash = stringValue(row.sourceSnapshotHash) || stringValue(objectValue(payload.evidenceCommitment).sourceSnapshotHash);
  const assetId = stringValue(objectValue(payload.softwareAsset).publicAssetId) || row.appraisalPublicId;
  const issued: DraftEntry = {
    type: "CERTIFICATE_ISSUED",
    sourceId: row.certificateId,
    timestamp: isoDate(row.issuedAt),
    assetId,
    certificateId: row.certificateId,
    projectId: row.projectId,
    payloadHash: row.payloadHash,
    sourceSnapshotHash,
    publicSummaryHash: row.publicSummaryHash,
    privateEvidenceHash: row.privateEvidenceHash,
    signingKeyId: row.signingKeyId,
    attestation: certificateAttestation(row),
    evidence: {
      source: "software_certificates",
      reason: "Certificate registry row commits to payload, public summary, private evidence, source snapshot, and signing key hashes.",
      confidence: 0.98,
    },
    metadata: sanitizeMetadata({
      status: row.status,
      badgeState: row.badgeState,
      appraisalPublicId: row.appraisalPublicId,
    }),
  };
  const scanCommitment: DraftEntry | null = sourceSnapshotHash
    ? {
        type: "SCAN_COMMITMENT",
        sourceId: `${row.certificateId}:source-snapshot`,
        timestamp: isoDate(row.issuedAt),
        assetId,
        certificateId: row.certificateId,
        projectId: row.projectId,
        sourceSnapshotHash,
        publicSummaryHash: row.publicSummaryHash,
        privateEvidenceHash: row.privateEvidenceHash,
        attestation: certificateAttestation(row),
        evidence: {
          source: "certificate_payload",
          reason: "Signed certificate payload includes a source snapshot hash commitment.",
          confidence: 0.96,
        },
        metadata: sanitizeMetadata({
          appraisalPublicId: row.appraisalPublicId,
          payloadHash: row.payloadHash,
        }),
      }
    : null;

  return scanCommitment ? [issued, scanCommitment] : [issued];
}

function certificateSnapshotEntry(row: CertificateSnapshotRow): DraftEntry {
  return {
    type: "CERTIFICATE_SNAPSHOT",
    sourceId: row.certificateId,
    sourceVersion: numberValue(row.version),
    timestamp: isoDate(row.createdAt),
    certificateId: row.certificateId,
    payloadHash: row.payloadHash,
    signingKeyId: row.signingKeyId,
    attestation: certificateSnapshotAttestation(row),
    evidence: {
      source: "software_certificate_snapshots",
      reason: "Certificate snapshot records immutable versioned certificate state.",
      confidence: 0.98,
    },
    metadata: sanitizeMetadata({
      status: row.status,
      changeReason: row.changeReason,
    }),
  };
}

function projectScanEntry(row: ScanHistoryRow): DraftEntry {
  const metadata = objectValue(row.metadata);
  const sourceHash = stringValue(metadata.sourceHash) || stringValue(metadata.appCodeHash) || stringValue(objectValue(metadata.codeSnapshot).sourceHash);
  return {
    type: "PROJECT_SCAN",
    sourceId: row.scanRefId || row.id,
    timestamp: isoDate(row.scannedAt),
    sourceSnapshotHash: sourceHash || null,
    attestation: metadataAttestation(metadata, "Project scan history row includes a signed ingestion commitment only for scans recorded after the transparency v2 upgrade."),
    evidence: {
      source: "project_scan_history",
      reason: "Project scan history records deterministic scan metadata and regression state.",
      confidence: 0.94,
    },
    metadata: sanitizeMetadata({
      scanHistoryId: row.id,
      scanSource: row.scanSource,
      readinessScore: numberValue(row.readinessScore),
      findingsCount: numberValue(row.findingsCount),
      criticalFindingsCount: numberValue(row.criticalFindingsCount),
      riskLevel: row.riskLevel,
      framework: row.framework,
      regressionSummary: stringValue(objectValue(objectValue(metadata.regressionDetection).report).summary),
    }),
  };
}

function trustLedgerEntry(row: TrustLedgerRow): DraftEntry {
  return {
    type: "TRUST_LEDGER_SNAPSHOT",
    sourceId: row.id,
    timestamp: isoDate(row.createdAt),
    sourceSnapshotHash: row.snapshotHash,
    attestation: metadataAttestation(objectValue(row.metadata), "Trust ledger snapshot includes a signed ingestion commitment only for snapshots recorded after the transparency v2 upgrade."),
    evidence: {
      source: "software_trust_ledger_snapshots",
      reason: "Trust ledger snapshot records a hash of evidence graph, scores, and gated claims.",
      confidence: 0.95,
    },
    metadata: sanitizeMetadata({
      sourceScanId: row.sourceScanId,
      sourceScanRefId: row.sourceScanRefId,
      score: numberValue(row.score),
      confidence: Number(row.confidence || 0),
      verdict: row.verdict,
      rating: row.rating,
      evidenceCount: numberValue(row.evidenceCount),
      claimCount: numberValue(row.claimCount),
    }),
  };
}

function chainEntries(drafts: DraftEntry[]): TransparencyLogEntry[] {
  const sorted = [...drafts].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp) ||
    a.type.localeCompare(b.type) ||
    a.sourceId.localeCompare(b.sourceId) ||
    (a.sourceVersion || 0) - (b.sourceVersion || 0),
  );
  let previousEntryHash = TRANSPARENCY_LOG_GENESIS_HASH;
  return sorted.map((draft, index) => {
    const entryBasis = {
      index,
      type: draft.type,
      sourceId: draft.sourceId,
      sourceVersion: draft.sourceVersion || null,
      timestamp: draft.timestamp,
      assetId: draft.assetId || null,
      certificateId: draft.certificateId || null,
      projectId: draft.projectId || null,
      payloadHash: draft.payloadHash || null,
      sourceSnapshotHash: draft.sourceSnapshotHash || null,
      publicSummaryHash: draft.publicSummaryHash || null,
      privateEvidenceHash: draft.privateEvidenceHash || null,
      signingKeyId: draft.signingKeyId || null,
      previousEntryHash,
      attestation: draft.attestation,
      evidence: draft.evidence,
      metadata: draft.metadata,
    };
    const entryHash = stableHash(entryBasis);
    const entry: TransparencyLogEntry = {
      ...draft,
      index,
      previousEntryHash,
      entryHash,
    };
    previousEntryHash = entryHash;
    return entry;
  });
}

function verifyChain(entries: TransparencyLogEntry[]) {
  let previousEntryHash = TRANSPARENCY_LOG_GENESIS_HASH;
  for (const entry of entries) {
    const expected = stableHash({
      index: entry.index,
      type: entry.type,
      sourceId: entry.sourceId,
      sourceVersion: entry.sourceVersion || null,
      timestamp: entry.timestamp,
      assetId: entry.assetId || null,
      certificateId: entry.certificateId || null,
      projectId: entry.projectId || null,
      payloadHash: entry.payloadHash || null,
      sourceSnapshotHash: entry.sourceSnapshotHash || null,
      publicSummaryHash: entry.publicSummaryHash || null,
      privateEvidenceHash: entry.privateEvidenceHash || null,
      signingKeyId: entry.signingKeyId || null,
      previousEntryHash,
      attestation: entry.attestation,
      evidence: entry.evidence,
      metadata: entry.metadata,
    });
    if (entry.previousEntryHash !== previousEntryHash || entry.entryHash !== expected) return false;
    previousEntryHash = entry.entryHash;
  }
  return true;
}

function rebuildContract(): TransparencyLogReport["rebuild"] {
  return {
    guarantee: "Sort entries by timestamp, type, sourceId, and sourceVersion. Hash each canonical entry with the previous entry hash. The final entry hash is the hash-chain root; the RFC6962-style Merkle root is produced from the same ordered entries.",
    canonicalEntryFields: [
      "index",
      "type",
      "sourceId",
      "sourceVersion",
      "timestamp",
      "assetId",
      "certificateId",
      "projectId",
      "payloadHash",
      "sourceSnapshotHash",
      "publicSummaryHash",
      "privateEvidenceHash",
      "signingKeyId",
      "previousEntryHash",
      "attestation",
      "evidence",
      "metadata",
    ],
    rootRule: "rootHash equals the last entryHash for the hash chain. merkleTree.rootHash equals the RFC6962-style Merkle tree hash over canonical entry pointers.",
  };
}

function merkleTreeSummary(tree: TransparencyMerkleTree): TransparencyLogReport["merkleTree"] {
  return {
    algorithm: tree.algorithm,
    canonicalLeaf: tree.canonicalLeaf,
    treeSize: tree.treeSize,
    rootHash: tree.rootHash,
    emptyRootHash: tree.emptyRootHash,
  };
}

function certificateAttestation(row: CertificateRow): TransparencyLogEventAttestation {
  return {
    status: "certificate_payload_signed",
    source: "certificate_signature",
    committedAt: isoDate(row.issuedAt),
    payloadHash: row.payloadHash,
    algorithm: "Ed25519",
    signingKeyId: row.signingKeyId,
    signature: row.signature,
    evidence: "Certificate payload was signed at issue time. This is a certificate-payload signature, not a separate log-ingestion witness.",
  };
}

function certificateSnapshotAttestation(row: CertificateSnapshotRow): TransparencyLogEventAttestation {
  return {
    status: "certificate_payload_signed",
    source: "certificate_signature",
    committedAt: isoDate(row.createdAt),
    payloadHash: row.payloadHash,
    algorithm: "Ed25519",
    signingKeyId: row.signingKeyId,
    signature: row.signature,
    evidence: "Certificate snapshot was signed when the versioned snapshot was recorded.",
  };
}

function metadataAttestation(metadata: Record<string, unknown>, legacyEvidence: string): TransparencyLogEventAttestation {
  const commitment = commitmentValue(metadata.transparencyCommitment);
  if (commitment) {
    return {
      status: commitment.status === "signed" ? "ingestion_signed" : "signing_not_configured",
      source: "event_commitment",
      committedAt: commitment.committedAt,
      payloadHash: commitment.eventHash,
      algorithm: commitment.signature?.algorithm || null,
      signingKeyId: commitment.signature?.signingKeyId || null,
      signature: commitment.signature?.signature || null,
      evidence: commitment.status === "signed"
        ? "Event was signed before persistence and stored in row metadata."
        : "Event commitment was created before persistence, but signing keys were not configured.",
    };
  }
  return {
    status: "legacy_unsigned",
    source: "legacy_row",
    committedAt: null,
    payloadHash: null,
    algorithm: null,
    signingKeyId: null,
    signature: null,
    evidence: legacyEvidence,
  };
}

function witnessPolicy(): TransparencyAnchorManifest["witnessPolicy"] {
  const minimumIndependentWitnesses = Number(process.env.TRANSPARENCY_MIN_INDEPENDENT_WITNESSES || 2);
  const configuredIndependentWitnesses = configuredWitnessCount();
  const satisfied = configuredIndependentWitnesses >= minimumIndependentWitnesses;
  return {
    minimumIndependentWitnesses,
    configuredIndependentWitnesses,
    satisfied,
    status: satisfied ? "satisfied" : "not_satisfied",
    reason: satisfied
      ? "Configured independent witnesses meet the minimum witness policy."
      : "Fork detection requires independent witnesses. Configure at least two witness endpoints, or one witness plus Rekor/TSA, before claiming CT-grade anti-fork assurance.",
  };
}

function configuredWitnessCount() {
  return witnessUrls().length + (rekorAnchorConfigured() ? 1 : 0) + (tsaAnchorConfigured() ? 1 : 0);
}

function githubAnchorConfigured() {
  return Boolean(anchorEnv("TRANSPARENCY_ANCHOR_GITHUB_TOKEN", "GITHUB_TOKEN") && anchorEnv("TRANSPARENCY_ANCHOR_GITHUB_REPOSITORY"));
}

function witnessAnchorConfigured() {
  return witnessUrls().length > 0;
}

function rekorAnchorConfigured() {
  return Boolean(anchorEnv("TRANSPARENCY_ANCHOR_REKOR_URL", "SIGSTORE_REKOR_URL"));
}

function tsaAnchorConfigured() {
  return Boolean(anchorEnv("TRANSPARENCY_ANCHOR_TSA_URL"));
}

function blockchainAnchorConfigured() {
  return Boolean(anchorEnv("TRANSPARENCY_ANCHOR_BLOCKCHAIN_URL"));
}

function witnessUrls() {
  return [
    ...anchorEnv("TRANSPARENCY_ANCHOR_WITNESS_URLS").split(","),
    anchorEnv("TRANSPARENCY_ANCHOR_WITNESS_URL"),
  ].map((value) => value.trim()).filter(Boolean);
}

function anchorEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

async function loadPublicCertificateRows(input: { certificateId?: string | null; projectId?: string | null; limit: number }) {
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<CertificateRow[]>(
      `SELECT "certificateId", "appraisalPublicId", "projectId", "status", "badgeState", "payload", "payloadHash",
          "signature", "signingKeyId", "publicSummaryHash", "privateEvidenceHash", "sourceSnapshotHash", "issuedAt", "createdAt"
       FROM "software_certificates"
       WHERE ($1::text IS NULL OR "certificateId" = $1)
         AND ($2::text IS NULL OR "projectId" = $2)
       ORDER BY "issuedAt" DESC
       LIMIT $3`,
      input.certificateId || null,
      input.projectId || null,
      input.limit,
    ),
  );
  return rows || [];
}

async function loadCertificateSnapshotRows(certificateIds: string[]) {
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<CertificateSnapshotRow[]>(
      `SELECT "certificateId", "version", "status", "payloadHash", "signature", "signingKeyId", "changeReason", "createdAt"
       FROM "software_certificate_snapshots"
       WHERE "certificateId" = ANY($1::text[])
       ORDER BY "createdAt" ASC, "version" ASC`,
      certificateIds,
    ),
  );
  return rows || [];
}

async function loadProjectScanRows(projectId: string, limit: number) {
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<ScanHistoryRow[]>(
      `SELECT "id", "scanSource", "scanRefId", "readinessScore", "findingsCount", "criticalFindingsCount",
          "riskLevel", "framework", "metadata", "scannedAt"
       FROM "project_scan_history"
       WHERE "projectId" = $1
       ORDER BY "scannedAt" DESC
       LIMIT $2`,
      projectId,
      limit,
    ),
  );
  return rows || [];
}

async function loadTrustLedgerRows(projectId: string, limit: number) {
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<TrustLedgerRow[]>(
      `SELECT "id", "snapshotHash", "sourceScanId", "sourceScanRefId", "score", "confidence", "verdict",
          "rating", "evidenceCount", "claimCount", "metadata", "createdAt"
       FROM "software_trust_ledger_snapshots"
       WHERE "projectId" = $1
       ORDER BY "createdAt" DESC
       LIMIT $2`,
      projectId,
      limit,
    ),
  );
  return rows || [];
}

function boundedLimit(value: number | undefined, fallback: number) {
  const parsed = Number(value || fallback);
  return Math.max(1, Math.min(200, Math.round(Number.isFinite(parsed) ? parsed : fallback)));
}

function isoDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function numberValue(value: number | bigint | null | undefined) {
  return typeof value === "bigint" ? Number(value) : Number(value || 0);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return objectValue(JSON.parse(value) as unknown);
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
