import { tryDatabase } from "@/lib/prisma";

export type OperationsConsoleSnapshot = {
  generatedAt: string;
  eventStream: OperationEvent[];
  stateChanges: OperationStateChange[];
  queueHealth: {
    queued: number;
    running: number;
    failed: number;
    done: number;
  };
  workerHealth: Array<{ worker: string; status: string; queued: number; running: number; failed: number }>;
  failures: Array<{ id: string; type: string; retries: number; error: string; updatedAt: string }>;
};

export type OperationEvent = {
  id: string;
  event: string;
  entity: string;
  state: string;
  createdAt: string;
};

export type OperationStateChange = {
  id: string;
  entity: string;
  event: string;
  fromState: string;
  toState: string;
  createdAt: string;
};

type UsageEventRow = { id: string; event: string; metadata: unknown; createdAt: Date | string };
type JobRow = { id: string; type: string; status: string; mutationCount: number; errorMessage: string | null; updatedAt: Date | string };

export async function loadOperationsConsoleSnapshot(): Promise<OperationsConsoleSnapshot> {
  const [eventRows, jobRows] = await Promise.all([
    loadEvents(),
    loadJobs(),
  ]);
  const queueHealth = {
    queued: jobRows.filter((job) => job.status === "QUEUED").length,
    running: jobRows.filter((job) => ["RUNNING", "GENERATING", "BUILDING", "DEPLOYING"].includes(job.status)).length,
    failed: jobRows.filter((job) => job.status === "FAILED").length,
    done: jobRows.filter((job) => job.status === "COMPLETED").length,
  };
  return {
    generatedAt: new Date().toISOString(),
    eventStream: eventRows.map(rowToOperationEvent),
    stateChanges: eventRows.filter((row) => row.event === "control_plane.transition").map(rowToStateChange),
    queueHealth,
    workerHealth: ["appraisal", "scanner", "certificate", "transparency"].map((worker) => workerHealth(worker, jobRows)),
    failures: jobRows
      .filter((job) => job.status === "FAILED")
      .slice(0, 20)
      .map((job) => ({
        id: job.id,
        type: job.type,
        retries: job.mutationCount,
        error: job.errorMessage || "No error message recorded.",
        updatedAt: isoDate(job.updatedAt),
      })),
  };
}

async function loadEvents() {
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<UsageEventRow[]>(
      `SELECT "id", "event", "metadata", "createdAt"
       FROM "usage_events"
       WHERE "event" LIKE 'control_plane.%'
       ORDER BY "createdAt" DESC
       LIMIT 80`,
    ),
  );
  return rows || [];
}

async function loadJobs() {
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<JobRow[]>(
      `SELECT "id", "type", "status"::text AS "status", "mutationCount", "errorMessage", "updatedAt"
       FROM "jobs"
       WHERE "type" LIKE 'pipeline:%'
       ORDER BY "updatedAt" DESC
       LIMIT 200`,
    ),
  );
  return rows || [];
}

function rowToOperationEvent(row: UsageEventRow): OperationEvent {
  const metadata = objectValue(row.metadata);
  return {
    id: row.id,
    event: row.event,
    entity: `${stringValue(metadata.entityKind) || "entity"}:${stringValue(metadata.entityId) || "-"}`,
    state: stringValue(metadata.toState) || stringValue(metadata.state) || "-",
    createdAt: isoDate(row.createdAt),
  };
}

function rowToStateChange(row: UsageEventRow): OperationStateChange {
  const metadata = objectValue(row.metadata);
  return {
    id: row.id,
    entity: `${stringValue(metadata.entityKind) || "entity"}:${stringValue(metadata.entityId) || "-"}`,
    event: stringValue(metadata.event),
    fromState: stringValue(metadata.fromState) || "-",
    toState: stringValue(metadata.toState) || "-",
    createdAt: isoDate(row.createdAt),
  };
}

function workerHealth(worker: string, jobs: JobRow[]) {
  const workerJobs = jobs.filter((job) => job.type.toLowerCase().includes(worker.toLowerCase()));
  const queued = workerJobs.filter((job) => job.status === "QUEUED").length;
  const running = workerJobs.filter((job) => ["RUNNING", "GENERATING", "BUILDING", "DEPLOYING"].includes(job.status)).length;
  const failed = workerJobs.filter((job) => job.status === "FAILED").length;
  return {
    worker,
    queued,
    running,
    failed,
    status: failed > 0 ? "attention" : running > 0 ? "running" : queued > 0 ? "queued" : "idle",
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isoDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}
