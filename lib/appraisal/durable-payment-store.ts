import { createHash, randomUUID } from "node:crypto";

import {
  assertPaidAppraisalTransition,
  type PaidAppraisalLifecycleEvent,
  lifecycleStateFromPaymentFields,
  paymentFieldsForLifecycleState,
} from "@/lib/appraisal/appraisalLifecycleStateMachine";
import { sanitizeMetadata } from "@/lib/services/platformSupport";

type KvCommand = Array<string | number>;

export type DurablePaymentRow = {
  id: string;
  stripeSessionId: string;
  status: string;
  fulfillmentStatus: string;
  userId: string;
  projectId: string | null;
  appraisalId: string | null;
  certificateId: string | null;
  offerId: string;
  amount: number;
  currency: string;
  customerEmail: string | null;
  metadata: Record<string, unknown>;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  provider: "upstash-kv";
};

export type DurablePaymentInput = {
  sessionId: string;
  userId: string;
  projectId?: string | null;
  offerId: string;
  amount: number;
  currency: string;
  customerEmail?: string | null;
  stripePaymentId?: string | null;
  stripeCustomerId?: string | null;
  metadata?: Record<string, unknown>;
  transparencyCommitment?: unknown;
};

export type DurablePaymentProbe = {
  provider: "upstash-kv";
  configured: boolean;
  reachable: boolean;
  verifiedRead: boolean;
  verifiedWrite: boolean;
  reason: string | null;
};

export type DurablePaymentMetrics = {
  available: boolean;
  provider: "upstash-kv";
  totalPayments: number;
  paidUsers: number;
  totalPaidRevenueCents: number;
  recentPayments: Array<{
    id: string;
    email: string | null;
    offerId: string;
    status: string;
    amount: number;
    currency: string;
    createdAt: string;
  }>;
};

const paymentSessionSetKey = "ventureos:payments:sessions";
const paymentRecentKey = "ventureos:payments:recent";

export async function recordDurablePaidAppraisalPayment(input: DurablePaymentInput) {
  const config = kvConfig();
  if (!config) return null;

  const now = new Date().toISOString();
  const key = paymentKey(input.sessionId);
  const existing = await readDurablePayment(input.sessionId);
  const nextLifecycleState = existing
    ? assertPaidAppraisalTransition({
        current: lifecycleStateFromPaymentFields(existing),
        event: "payment.received",
      })
    : "AWAITING_INTAKE";
  const fields = paymentFieldsForLifecycleState(nextLifecycleState);
  const row: DurablePaymentRow = {
    id: existing?.id || randomUUID(),
    stripeSessionId: input.sessionId,
    status: fields.status,
    fulfillmentStatus: fields.fulfillmentStatus,
    userId: input.userId,
    projectId: input.projectId || existing?.projectId || null,
    appraisalId: existing?.appraisalId || null,
    certificateId: existing?.certificateId || null,
    offerId: input.offerId,
    amount: Math.max(0, Math.round(Number(input.amount || 0))),
    currency: input.currency.toLowerCase(),
    customerEmail: input.customerEmail || existing?.customerEmail || null,
    metadata: sanitizeMetadata({
      ...(existing?.metadata || {}),
      ...(input.metadata || {}),
      stripePaymentId: input.stripePaymentId || null,
      stripeCustomerId: input.stripeCustomerId || null,
      lifecycleState: nextLifecycleState,
      transparencyCommitment: input.transparencyCommitment || null,
      storageProvider: "upstash-kv",
    }),
    paidAt: existing?.paidAt || now,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    provider: "upstash-kv",
  };

  const response = await kvPipeline([
    ["SET", key, JSON.stringify(row)],
    ["SADD", paymentSessionSetKey, input.sessionId],
    ["LREM", paymentRecentKey, 0, key],
    ["LPUSH", paymentRecentKey, key],
    ["LTRIM", paymentRecentKey, 0, 99],
  ]);

  return response ? row : null;
}

export async function markDurablePaymentFulfilled(input: {
  sessionId: string;
  projectId: string;
  appraisalId: string;
  certificateId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  return updateDurablePaymentLifecycle({
    sessionId: input.sessionId,
    event: "fulfillment.completed",
    projectId: input.projectId,
    appraisalId: input.appraisalId,
    certificateId: input.certificateId || null,
    metadata: input.metadata,
  });
}

export async function transitionDurablePaidAppraisalPayment(input: {
  sessionId: string;
  event: PaidAppraisalLifecycleEvent;
  metadata?: Record<string, unknown>;
}) {
  return updateDurablePaymentLifecycle({
    sessionId: input.sessionId,
    event: input.event,
    metadata: input.metadata,
  });
}

export async function probeDurablePaymentStore(): Promise<DurablePaymentProbe> {
  const config = kvConfig();
  if (!config) {
    return {
      provider: "upstash-kv",
      configured: false,
      reachable: false,
      verifiedRead: false,
      verifiedWrite: false,
      reason: "missing_kv_rest_credentials",
    };
  }

  const key = `ventureos:payments:probe:${randomUUID()}`;
  const value = JSON.stringify({ ok: true, createdAt: new Date().toISOString() });
  const response = await kvPipeline([
    ["SET", key, value, "EX", 120],
    ["GET", key],
    ["DEL", key],
  ]);
  if (!response) {
    return {
      provider: "upstash-kv",
      configured: true,
      reachable: false,
      verifiedRead: false,
      verifiedWrite: false,
      reason: "payment_ledger_probe_failed",
    };
  }

  const wrote = String(response[0]?.result || "").toUpperCase() === "OK";
  const read = response[1]?.result === value;
  const deleted = Number(response[2]?.result || 0) >= 0;
  return {
    provider: "upstash-kv",
    configured: true,
    reachable: wrote && read,
    verifiedRead: read,
    verifiedWrite: wrote && deleted,
    reason: wrote && read ? null : "payment_ledger_write_read_mismatch",
  };
}

export async function loadDurablePaymentMetrics(): Promise<DurablePaymentMetrics> {
  const config = kvConfig(true);
  if (!config) return emptyMetrics();

  const first = await kvPipeline([
    ["SMEMBERS", paymentSessionSetKey],
    ["LRANGE", paymentRecentKey, 0, 19],
  ], true);
  if (!first) return emptyMetrics();

  const sessions = Array.isArray(first[0]?.result) ? first[0].result.filter((item): item is string => typeof item === "string") : [];
  const recentKeys = Array.isArray(first[1]?.result) ? first[1].result.filter((item): item is string => typeof item === "string") : [];
  if (!sessions.length && !recentKeys.length) return { ...emptyMetrics(), available: true };

  const allKeys = sessions.map(paymentKey);
  const allRows = await readPaymentKeys(allKeys, true);
  const rows = allRows.filter(isRealPaymentRow);
  const paidUsers = new Set(rows.map((row) => row.userId).filter(Boolean)).size;
  const totalPaidRevenueCents = rows
    .filter((row) => row.status === "paid")
    .reduce((sum, row) => sum + Math.max(0, Math.round(Number(row.amount || 0))), 0);
  const recentRows = (await readPaymentKeys([...new Set(recentKeys)], true))
    .filter(isRealPaymentRow)
    .slice(0, 12);

  return {
    available: true,
    provider: "upstash-kv",
    totalPayments: rows.length,
    paidUsers,
    totalPaidRevenueCents,
    recentPayments: recentRows.map((row) => ({
      id: row.id,
      email: row.customerEmail,
      offerId: row.offerId,
      status: row.status,
      amount: row.amount,
      currency: row.currency,
      createdAt: row.createdAt,
    })),
  };
}

async function updateDurablePaymentLifecycle(input: {
  sessionId: string;
  event: PaidAppraisalLifecycleEvent;
  projectId?: string | null;
  appraisalId?: string | null;
  certificateId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const existing = await readDurablePayment(input.sessionId);
  if (!existing) return null;

  const nextLifecycleState = assertPaidAppraisalTransition({
    current: lifecycleStateFromPaymentFields(existing),
    event: input.event,
  });
  const fields = paymentFieldsForLifecycleState(nextLifecycleState);
  const row: DurablePaymentRow = {
    ...existing,
    status: fields.status,
    fulfillmentStatus: fields.fulfillmentStatus,
    projectId: input.projectId || existing.projectId,
    appraisalId: input.appraisalId || existing.appraisalId,
    certificateId: input.certificateId || existing.certificateId,
    metadata: sanitizeMetadata({
      ...existing.metadata,
      ...(input.metadata || {}),
      lifecycleEvent: input.event,
      lifecycleState: nextLifecycleState,
      storageProvider: "upstash-kv",
    }),
    updatedAt: new Date().toISOString(),
  };
  const response = await kvPipeline([["SET", paymentKey(input.sessionId), JSON.stringify(row)]]);
  return response ? row : null;
}

async function readDurablePayment(sessionId: string) {
  const rows = await readPaymentKeys([paymentKey(sessionId)]);
  return rows[0] || null;
}

async function readPaymentKeys(keys: string[], readOnly = false) {
  if (!keys.length) return [];
  const response = await kvPipeline(keys.map((key) => ["GET", key]), readOnly);
  if (!response) return [];
  return response.map((item) => parsePaymentRow(item?.result));
}

async function kvPipeline(commands: KvCommand[], readOnly = false) {
  const config = kvConfig(readOnly);
  if (!config) return null;
  const response = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return null;
  return response.json().catch(() => null) as Promise<Array<{ result?: unknown; error?: string }> | null>;
}

function parsePaymentRow(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as DurablePaymentRow;
    if (!parsed || typeof parsed.id !== "string" || typeof parsed.stripeSessionId !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function paymentKey(sessionId: string) {
  return `ventureos:payments:session:${sessionId}`;
}

function emptyMetrics(): DurablePaymentMetrics {
  return {
    available: false,
    provider: "upstash-kv",
    totalPayments: 0,
    paidUsers: 0,
    totalPaidRevenueCents: 0,
    recentPayments: [],
  };
}

function isSyntheticPayment(row: DurablePaymentRow) {
  const metadata = row.metadata || {};
  const source = String(metadata.source || "");
  return Boolean(metadata.synthetic || metadata.syntheticEvent || metadata.contractTest || metadata.testEvent) ||
    /(^|[_.:-])(test|contract|synthetic|qa|smoke)([_.:-]|$)/i.test(source) ||
    /@example\.com$|synthetic|test/i.test(row.customerEmail || "");
}

function isRealPaymentRow(row: DurablePaymentRow | null): row is DurablePaymentRow {
  return row !== null && !isSyntheticPayment(row);
}

function kvConfig(readOnly = false) {
  const url = process.env.KV_REST_API_URL?.trim() || process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = readOnly
    ? process.env.KV_REST_API_READ_ONLY_TOKEN?.trim() || process.env.KV_REST_API_TOKEN?.trim() || process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
    : process.env.KV_REST_API_TOKEN?.trim() || process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

export function durablePaymentUserHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}
