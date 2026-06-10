import { createHash, randomUUID } from "node:crypto";

import { JobStatus, type Prisma } from "@prisma/client";

import type { ControlPlaneEventName, ControlPlaneEntityKind } from "@/lib/control-plane/kernel";
import { getPrisma } from "@/lib/prisma";
import { sanitizeMetadata } from "@/lib/services/platformSupport";

export type PipelineJobStatus = "queued" | "running" | "failed" | "done";

export type PipelineJob = {
  id: string;
  type: string;
  entityId: string;
  entityKind: ControlPlaneEntityKind;
  projectId?: string | null;
  payload: Record<string, unknown>;
  retries: number;
  maxRetries: number;
  status: PipelineJobStatus;
  createdAt: string;
  updatedAt: string;
  lastError?: string | null;
};

export type PipelineJobInput = {
  type: string;
  entityId: string;
  entityKind: ControlPlaneEntityKind;
  projectId?: string | null;
  payload?: Record<string, unknown>;
  retries?: number;
  maxRetries?: number;
  idempotencyKey?: string | null;
};

export type PipelineWorker = (job: PipelineJob) => Promise<PipelineWorkerResult | void>;

export type PipelineWorkerResult = {
  event?: ControlPlaneEventName | null;
  context?: Record<string, unknown>;
};

export type PipelineResultDispatcher = (job: PipelineJob, result: PipelineWorkerResult) => Promise<void>;

const memoryQueue: PipelineJob[] = [];

export async function enqueuePipelineJob(input: PipelineJobInput): Promise<PipelineJob> {
  const now = new Date().toISOString();
  const job: PipelineJob = {
    id: input.idempotencyKey ? stablePipelineJobId(input.idempotencyKey) : `pipe_${randomUUID()}`,
    type: cleanJobType(input.type),
    entityId: requiredClean(input.entityId, "entityId"),
    entityKind: input.entityKind,
    projectId: cleanOptional(input.projectId),
    payload: sanitizeMetadata(input.payload || {}),
    retries: Math.max(0, Math.floor(input.retries || 0)),
    maxRetries: Math.max(0, Math.floor(input.maxRetries ?? 3)),
    status: "queued",
    createdAt: now,
    updatedAt: now,
    lastError: null,
  };

  const db = getPrisma();
  if (!db) {
    const existing = memoryQueue.find((item) => item.id === job.id);
    if (existing) return existing;
    memoryQueue.push(job);
    return job;
  }

  try {
    await db.job.create({
      data: {
        id: job.id,
        projectId: job.projectId || null,
        type: persistedType(job.type),
        payload: toPrismaJson(job),
        status: JobStatus.QUEUED,
        currentStep: "queued",
        mutationCount: job.retries,
      },
    });
  } catch (error) {
    const existing = await db.job.findUnique({ where: { id: job.id } });
    if (existing) return fromPrismaJob(existing);
    throw error;
  }

  return job;
}

export async function runNextPipelineJob(
  workerMap: Record<string, PipelineWorker>,
  options: { dispatchResult?: PipelineResultDispatcher } = {},
): Promise<PipelineJob | null> {
  const job = await claimNextJob();
  if (!job) return null;

  const worker = workerMap[job.type];
  if (!worker) {
    return failJob(job, new Error(`PIPELINE_WORKER_NOT_FOUND:${job.type}`));
  }

  try {
    const result = await worker(job);
    if (result?.event) {
      await (options.dispatchResult || dispatchWorkerResult)(job, result);
    }
    return completeJob(job, result?.context || {});
  } catch (error) {
    return failJob(job, error);
  }
}

async function dispatchWorkerResult(job: PipelineJob, result: PipelineWorkerResult) {
  if (!result.event) return;
  const { controlPlane } = await import("@/lib/control-plane");
  await controlPlane.dispatch({
    name: result.event,
    entityKind: job.entityKind,
    entityId: job.entityId,
    projectId: job.projectId || null,
    traceId: stringOrNull(job.payload.traceId),
    context: {
      ...job.payload,
      ...(result.context || {}),
      pipelineJobId: job.id,
      pipelineJobType: job.type,
    },
  });
}

export async function runPipelineQueue(workerMap: Record<string, PipelineWorker>, options: { maxJobs?: number; idleDelayMs?: number; dispatchResult?: PipelineResultDispatcher } = {}) {
  const maxJobs = Math.max(1, Math.floor(options.maxJobs || 1));
  const processed: PipelineJob[] = [];

  while (processed.length < maxJobs) {
    const job = await runNextPipelineJob(workerMap, { dispatchResult: options.dispatchResult });
    if (!job) break;
    processed.push(job);
    if (options.idleDelayMs) await delay(options.idleDelayMs);
  }

  return processed;
}

export function snapshotMemoryPipeline() {
  return memoryQueue.map((job) => ({ ...job, payload: { ...job.payload } }));
}

async function claimNextJob(): Promise<PipelineJob | null> {
  const db = getPrisma();
  if (!db) {
    const job = memoryQueue.find((item) => item.status === "queued");
    if (!job) return null;
    job.status = "running";
    job.updatedAt = new Date().toISOString();
    return { ...job, payload: { ...job.payload } };
  }

  const row = await db.job.findFirst({
    where: {
      type: { startsWith: "pipeline:" },
      status: JobStatus.QUEUED,
    },
    orderBy: { queuedAt: "asc" },
  });
  if (!row) return null;

  const claimed = await db.job.update({
    where: { id: row.id },
    data: {
      status: JobStatus.RUNNING,
      startedAt: new Date(),
      currentStep: "running",
    },
  });
  return fromPrismaJob(claimed);
}

async function completeJob(job: PipelineJob, result: Record<string, unknown>) {
  const completed = { ...job, status: "done" as const, updatedAt: new Date().toISOString(), lastError: null };
  const db = getPrisma();
  if (!db) {
    replaceMemoryJob(completed);
    return completed;
  }

  await db.job.update({
    where: { id: job.id },
    data: {
      status: JobStatus.COMPLETED,
      progress: 100,
      currentStep: "done",
      completedAt: new Date(),
      payload: toPrismaJson({ ...completed, result: sanitizeMetadata(result) }),
    },
  });
  return completed;
}

async function failJob(job: PipelineJob, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const nextRetries = job.retries + 1;
  const shouldRetry = nextRetries <= job.maxRetries;
  const failed = {
    ...job,
    retries: nextRetries,
    status: shouldRetry ? "queued" as const : "failed" as const,
    updatedAt: new Date().toISOString(),
    lastError: message,
  };

  const db = getPrisma();
  if (!db) {
    replaceMemoryJob(failed);
    return failed;
  }

  await db.job.update({
    where: { id: job.id },
    data: {
      status: shouldRetry ? JobStatus.QUEUED : JobStatus.FAILED,
      currentStep: shouldRetry ? "queued_for_retry" : "failed",
      errorMessage: message,
      completedAt: shouldRetry ? undefined : new Date(),
      mutationCount: nextRetries,
      payload: toPrismaJson(failed),
    },
  });

  return failed;
}

function replaceMemoryJob(job: PipelineJob) {
  const index = memoryQueue.findIndex((item) => item.id === job.id);
  if (index >= 0) memoryQueue[index] = job;
  else memoryQueue.push(job);
}

function fromPrismaJob(row: {
  id: string;
  type: string;
  projectId: string | null;
  payload: unknown;
  status: JobStatus;
  mutationCount: number;
  createdAt: Date;
  updatedAt: Date;
  errorMessage: string | null;
}): PipelineJob {
  const payload = objectPayload(row.payload);
  return {
    id: row.id,
    type: cleanJobType(String(payload.type || row.type.replace(/^pipeline:/, ""))),
    entityId: requiredClean(String(payload.entityId || ""), "entityId"),
    entityKind: entityKindFrom(payload.entityKind),
    projectId: row.projectId || cleanOptional(payload.projectId),
    payload: objectPayload(payload.payload || payload),
    retries: Math.max(0, Math.floor(Number(payload.retries ?? row.mutationCount ?? 0))),
    maxRetries: Math.max(0, Math.floor(Number(payload.maxRetries ?? 3))),
    status: pipelineStatusFor(row.status),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastError: row.errorMessage || stringOrNull(payload.lastError),
  };
}

function pipelineStatusFor(status: JobStatus): PipelineJobStatus {
  if (status === JobStatus.COMPLETED) return "done";
  if (status === JobStatus.FAILED || status === JobStatus.CANCELLED) return "failed";
  if (status === JobStatus.RUNNING || status === JobStatus.GENERATING || status === JobStatus.BUILDING || status === JobStatus.DEPLOYING) return "running";
  return "queued";
}

function toPrismaJson(job: PipelineJob | Record<string, unknown>) {
  return sanitizeMetadata(job as Record<string, unknown>) as Prisma.InputJsonValue;
}

function persistedType(type: string) {
  return `pipeline:${cleanJobType(type)}`;
}

function stablePipelineJobId(value: string) {
  return `pipe_${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}

function cleanJobType(value: unknown) {
  const clean = String(value || "").trim().replace(/[^a-zA-Z0-9_.:-]/g, "-").slice(0, 120);
  if (!clean) throw new Error("PIPELINE_JOB_TYPE_REQUIRED");
  return clean;
}

function requiredClean(value: unknown, label: string) {
  const clean = String(value || "").trim().slice(0, 180);
  if (!clean) throw new Error(`PIPELINE_${label.toUpperCase()}_REQUIRED`);
  return clean;
}

function cleanOptional(value: unknown) {
  const clean = String(value || "").trim().slice(0, 180);
  return clean || null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function objectPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function entityKindFrom(value: unknown): ControlPlaneEntityKind {
  const clean = String(value || "");
  if (["payment", "project", "appraisal", "certificate", "scan", "system"].includes(clean)) return clean as ControlPlaneEntityKind;
  return "system";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
