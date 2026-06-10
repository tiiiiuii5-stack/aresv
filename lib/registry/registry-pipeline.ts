import { replayEntity, type EntityReplay } from "@/lib/control-plane/replay";
import { tryDatabase } from "@/lib/prisma";
import { searchVentureOSRegistry, type RegistryAsset } from "@/lib/registry/software-registry";

export type RegistryItem = RegistryAsset & {
  registryItemId: string;
  currentState: string;
  trustScore: number;
  certificateStatus: "Active" | "Missing" | "Expired" | "Revoked" | "Superseded";
  transparencyEntries: number;
  eventCount: number;
  queueHealth: {
    queued: number;
    running: number;
    failed: number;
  };
  workerHealth: {
    appraisal: string;
    scanner: string;
    certificate: string;
    transparency: string;
  };
  replay?: EntityReplay | null;
  publicVerificationUrl: string;
};

type CountRow = { count: number | bigint };
type JobHealthRow = { status: string; count: number | bigint };

export async function buildRegistryItems(input: { query?: string; limit?: number; includeReplay?: boolean } = {}) {
  const search = await searchVentureOSRegistry({ query: input.query, limit: input.limit || 24 });
  const items = await Promise.all(search.assets.map((asset) => buildRegistryItem(asset, { includeReplay: input.includeReplay })));
  return {
    query: search.query,
    count: items.length,
    searchedBy: search.searchedBy,
    items,
  };
}

export async function buildRegistryItem(asset: RegistryAsset, options: { includeReplay?: boolean } = {}): Promise<RegistryItem> {
  const paymentEntityId = await latestPaymentIdForAsset(asset);
  const replay = options.includeReplay && paymentEntityId
    ? await replayEntity({ entityKind: "payment", entityId: paymentEntityId })
    : null;
  const projectId = asset.projectId || null;
  const [transparencyEntries, eventCount, queueHealth] = await Promise.all([
    countTransparencyEntries(asset),
    countEvents({ projectId, paymentEntityId }),
    loadQueueHealth(projectId),
  ]);
  const currentState = replay?.currentState || stateForAsset(asset);
  return {
    ...asset,
    registryItemId: asset.ventureOsId,
    currentState,
    trustScore: asset.trustScore,
    certificateStatus: certificateStatusFor(asset),
    transparencyEntries,
    eventCount,
    queueHealth,
    workerHealth: workerHealthFor(queueHealth),
    replay,
    publicVerificationUrl: asset.certificateUrl || asset.appraisalUrl || asset.passportUrl,
  };
}

async function latestPaymentIdForAsset(asset: RegistryAsset) {
  if (!asset.projectId && !asset.appraisalId && !asset.certificateId) return null;
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id"
       FROM "payments"
       WHERE ($1::text IS NOT NULL AND "projectId" = $1)
          OR ($2::text IS NOT NULL AND "appraisalId" = $2)
          OR ($3::text IS NOT NULL AND "certificateId" = $3)
       ORDER BY "updatedAt" DESC
       LIMIT 1`,
      asset.projectId || null,
      asset.appraisalId || null,
      asset.certificateId || null,
    ),
  );
  return rows?.[0]?.id || null;
}

async function countTransparencyEntries(asset: RegistryAsset) {
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<CountRow[]>(
      `SELECT (
          SELECT COUNT(*) FROM "software_certificates" c
          WHERE ($1::text IS NOT NULL AND c."certificateId" = $1)
             OR ($2::text IS NOT NULL AND c."projectId" = $2)
             OR ($3::text IS NOT NULL AND c."appraisalPublicId" = $3)
       ) + (
          SELECT COUNT(*) FROM "software_certificate_snapshots" s
          WHERE $1::text IS NOT NULL AND s."certificateId" = $1
       ) + (
          SELECT COUNT(*) FROM "project_scan_history" h
          WHERE $2::text IS NOT NULL AND h."projectId" = $2
       ) + (
          SELECT COUNT(*) FROM "software_trust_ledger_snapshots" t
          WHERE $2::text IS NOT NULL AND t."projectId" = $2
       ) AS "count"`,
      asset.certificateId || null,
      asset.projectId || null,
      asset.appraisalPublicId || null,
    ),
  );
  return numberValue(rows?.[0]?.count);
}

async function countEvents(input: { projectId?: string | null; paymentEntityId?: string | null }) {
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<CountRow[]>(
      `SELECT COUNT(*) AS "count"
       FROM "usage_events"
       WHERE ($1::text IS NOT NULL AND "projectId" = $1)
          OR ($2::text IS NOT NULL AND "metadata"->>'entityId' = $2)`,
      input.projectId || null,
      input.paymentEntityId || null,
    ),
  );
  return numberValue(rows?.[0]?.count);
}

async function loadQueueHealth(projectId?: string | null) {
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<JobHealthRow[]>(
      `SELECT "status"::text AS "status", COUNT(*) AS "count"
       FROM "jobs"
       WHERE "type" LIKE 'pipeline:%'
         AND ($1::text IS NULL OR "projectId" = $1)
       GROUP BY "status"`,
      projectId || null,
    ),
  );
  const counts = Object.fromEntries((rows || []).map((row) => [row.status, numberValue(row.count)]));
  return {
    queued: counts.QUEUED || 0,
    running: (counts.RUNNING || 0) + (counts.GENERATING || 0) + (counts.BUILDING || 0) + (counts.DEPLOYING || 0),
    failed: counts.FAILED || 0,
  };
}

function workerHealthFor(queueHealth: RegistryItem["queueHealth"]) {
  const status = queueHealth.failed > 0 ? "attention" : queueHealth.running > 0 ? "running" : queueHealth.queued > 0 ? "queued" : "idle";
  return {
    appraisal: status,
    scanner: status,
    certificate: status,
    transparency: status,
  };
}

function stateForAsset(asset: RegistryAsset) {
  if (asset.status === "VERIFIED" && asset.certificateId) return "ISSUED";
  if (asset.status === "APPRAISED") return "VERIFIED";
  return asset.status;
}

function certificateStatusFor(asset: RegistryAsset): RegistryItem["certificateStatus"] {
  if (asset.status === "EXPIRED") return "Expired";
  if (asset.status === "REVOKED") return "Revoked";
  if (asset.status === "SUPERSEDED") return "Superseded";
  return asset.certificateId ? "Active" : "Missing";
}

function numberValue(value: number | bigint | null | undefined) {
  const number = typeof value === "bigint" ? Number(value) : Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}
