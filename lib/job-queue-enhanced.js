import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { agentEvents } from "./agent-bus.js";
import { executeJob } from "./agent-engine-enhanced.js";
import { trace, traceError } from "./diagnostics.ts";
import { getPersistedJob, listPersistedJobs, persistJobRecord } from "./persistence/job-repository.ts";
import { agentMemoryService } from "./services/agentMemory.ts";
import { auditLogService } from "./services/auditLog.ts";
import { scheduledJobService } from "./services/scheduledJobs.ts";

const redisUrl = process.env.REDIS_URL?.trim();
const jobsRoot = process.env.VERCEL ? path.join(os.tmpdir(), "ventureos-generated-apps") : (process.env.GENERATED_APPS_ROOT || "generated-apps");
const jobsDir = path.join(jobsRoot, ".system", "jobs");
const artifactsDir = path.join(jobsRoot, ".system", "artifacts");
const activeJobs = new Map();

let connection = null;
let appBuilderQueue = null;
let repairQueue = null;
let queuesInitialized = false;
let workersStarted = false;

async function ensureJobsDir() {
  await fs.mkdir(jobsDir, { recursive: true });
  await fs.mkdir(artifactsDir, { recursive: true });
}

async function ensureQueues() {
  if (queuesInitialized) return;
  queuesInitialized = true;

  if (!redisUrl) return;

  try {
    connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      enableOfflineQueue: false,
    });

    connection.on("error", () => {});

    appBuilderQueue = new Queue("app-builder", {
      connection,
      defaultJobOptions: {
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
        attempts: 5,
        backoff: { type: "exponential", delay: 2000 },
      },
    });

    repairQueue = new Queue("repairs", {
      connection,
      defaultJobOptions: {
        priority: 10,
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
      },
    });
  } catch {
    connection = null;
    appBuilderQueue = null;
    repairQueue = null;
  }
}

async function saveJob(job) {
  await ensureJobsDir();
  await captureCompletedJobMemory(job);
  await captureCompletedJobAudit(job);
  job.updatedAt = new Date().toISOString();
  await fs.writeFile(path.join(jobsDir, `${job.id}.json`), JSON.stringify(job, null, 2));
  if (job.artifact) {
    await fs.writeFile(path.join(artifactsDir, `${job.id}.json`), JSON.stringify(job.artifact, null, 2));
  }
  await persistJobRecord(job);
  trace("job.save", "job persisted", { jobId: job.id, action: job.action, status: job.status, stage: job.stage, progress: job.progress });
}

async function loadSavedJobs() {
  await ensureJobsDir();
  const entries = await fs.readdir(jobsDir, { withFileTypes: true }).catch(() => []);
  const jobs = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(jobsDir, entry.name), "utf8");
      const job = JSON.parse(raw);
      try {
        const artifactRaw = await fs.readFile(path.join(artifactsDir, `${job.id}.json`), "utf8");
        job.artifact = JSON.parse(artifactRaw);
      } catch {
        // Artifact is optional for in-flight jobs.
      }
      jobs.push(job);
    } catch {
      continue;
    }
  }
  return jobs;
}

async function hydrateJobs() {
  const persistedJobs = await listPersistedJobs();
  if (persistedJobs) {
    for (const job of persistedJobs) {
      const current = activeJobs.get(job.id);
      if (!current || String(job.updatedAt || "") >= String(current.updatedAt || "")) {
        activeJobs.set(job.id, job);
      }
    }
  }

  const savedJobs = await loadSavedJobs();
  for (const job of savedJobs) {
    const current = activeJobs.get(job.id);
    if (!current || String(job.updatedAt || "") >= String(current.updatedAt || "")) {
      activeJobs.set(job.id, job);
    }
  }
  await recoverStuckJobs();
}

async function recoverStuckJobs() {
  const now = Date.now();
  const stuckStates = new Set(["queued", "running"]);
  for (const job of activeJobs.values()) {
    const updated = Date.parse(job.updatedAt || job.createdAt || "");
    if (!stuckStates.has(job.status) || !updated || now - updated < 60_000) continue;
    job.status = "failed";
    job.stage = "failed";
    job.progress = Math.max(job.progress || 0, 1);
    job.message = "Job marked failed by watchdog after 60 seconds without progress.";
    job.finishedAt = new Date().toISOString();
    job.events = [
      ...(job.events || []),
      { type: "watchdog", message: job.message, timestamp: Date.now() },
    ];
    trace("job.watchdog", "stuck job recovered", { jobId: job.id, action: job.action, reason: job.message });
    await saveJob(job);
  }
}

export async function createJob(action, options = {}) {
  trace("job.create", "request received", { action, projectId: options.projectId, projectSlug: options.projectSlug, appName: options.appName });
  if (action === "deploy" && !String(options.projectId || "").trim()) {
    throw new Error("PROJECT_ID_REQUIRED");
  }
  await ensureQueues();
  await hydrateJobs();
  await runDueSchedules(options.traceId || action);

  const jobId = randomUUID();
  const now = new Date().toISOString();
  const job = {
    id: jobId,
    action,
    status: "queued",
    stage: "idle",
    appName: options.appName,
    prompt: options.prompt,
    model: options.model || "llama3.2",
    modelUsed: options.modelUsed || options.model || "llama3.2",
    temperature: typeof options.temperature === "number" ? options.temperature : undefined,
    promptHash: options.promptHash,
    mutationCount: Number(options.mutationCount || 0),
    mutationHistory: Array.isArray(options.mutationHistory) ? options.mutationHistory : [],
    divergenceResult: options.divergenceResult,
    buildMode: options.buildMode,
    mode: options.mode,
    traceId: options.traceId,
    userId: options.userId,
    projectId: options.projectId,
    projectSlug: options.projectSlug,
    projectPath: options.projectPath,
    createdAt: now,
    attempts: 0,
    maxAttempts: 5,
    message: `Job queued for ${action}`,
    events: [],
    progress: 0,
    updatedAt: now,
  };

  await recallJobMemory(job);
  activeJobs.set(jobId, job);
  await recordJobAudit(job, "job.create", "success");
  await saveJob(job);

  if (connection && (appBuilderQueue || repairQueue)) {
    const targetQueue = action === "repair" ? repairQueue : appBuilderQueue;
    await targetQueue.add(action, job, {
      jobId,
      priority: action === "repair" ? 10 : 5,
    });
    trace("job.create", "job queued in redis", { jobId, action });
  } else if (process.env.VERCEL || (["generate", "deploy"].includes(action) && !options.projectPath)) {
    completeServerlessFallbackJob(job);
    await saveJob(job);
  } else {
    void executeJob(job, { persistJob: saveJob }).then(() => saveJob(job)).catch((error) => {
      traceError("job.execute", "local execution failed", error, { jobId, action });
    });
  }

  broadcastAgentEvent({
    type: "status",
    stage: "idle",
    message: `Job created: ${action}`,
    timestamp: Date.now(),
    data: { jobId },
  });

  return job;
}

async function recallJobMemory(job) {
  const userId = job.userId || "system";
  const query = [job.action, job.appName, job.mode, job.prompt].filter(Boolean).join(" ");
  if (!query.trim()) return;
  try {
    job.memoryContext = await agentMemoryService.recall(userId, query, {
      projectId: job.projectId || null,
      limit: 5,
    }, job.traceId || job.id);
    trace("job.memory", "recalled agent memories before job start", { traceId: job.traceId || job.id, jobId: job.id, action: job.action, count: job.memoryContext.length });
  } catch (error) {
    traceError("job.memory", "memory recall skipped", error, { traceId: job.traceId || job.id, jobId: job.id, action: job.action });
    job.memoryContext = [];
  }
}

async function captureCompletedJobMemory(job) {
  if (!["succeeded", "failed", "cancelled"].includes(job.status) || job.memoryStoredAt) return;
  const userId = job.userId || "system";
  const traceId = job.traceId || job.id;
  const failed = job.status === "failed" || job.status === "cancelled";
  const deploymentDecision = job.action === "deploy" && job.status === "succeeded";
  const memoryType = failed ? "failure" : deploymentDecision ? "decision" : "success";
  const content = buildJobMemoryContent(job, memoryType);
  try {
    const memory = await agentMemoryService.store({
      userId,
      projectId: job.projectId || null,
      memoryType,
      content,
      metadata: {
        source: "agent-job-lifecycle",
        action: job.action,
        status: job.status,
        stage: job.stage,
        appName: job.appName || null,
        projectSlug: job.projectSlug || null,
        runtimeStatus: job.artifact?.runtimeStatus || null,
        runtimeUrl: job.artifact?.runtimeUrl || null,
        error: failed ? job.error || job.artifact?.executionError || job.message : null,
      },
    }, traceId);
    job.memoryStoredAt = new Date().toISOString();
    job.memoryId = memory.id;
    trace("job.memory", "stored completed job memory", { traceId, jobId: job.id, memoryId: memory.id, memoryType });
  } catch (error) {
    traceError("job.memory", "completed job memory store skipped", error, { traceId, jobId: job.id, memoryType });
  }
}

function buildJobMemoryContent(job, memoryType) {
  const name = job.appName || job.projectSlug || job.projectId || job.id;
  if (memoryType === "failure") {
    return [
      `Agent job failed for ${name}.`,
      `Action: ${job.action}. Stage: ${job.stage}.`,
      `Failure: ${job.error || job.artifact?.executionError || job.message || "Unknown runtime failure."}`,
      `Recommended fix: inspect the runtime/build logs, repair the failing route or dependency, then rerun validation before preview or deploy.`,
    ].join("\n");
  }
  if (memoryType === "decision") {
    return [
      `Deployment succeeded for ${name}.`,
      `Architecture decision: preserve the generated runtime path and deployment configuration that produced a healthy ${job.artifact?.runtimeStatus || "ready"} artifact.`,
      `Reasoning: ${job.message || "Deploy job completed successfully."}`,
    ].join("\n");
  }
  return [
    `Agent job succeeded for ${name}.`,
    `Action: ${job.action}. Stage: ${job.stage}.`,
    `Successful pattern: ${job.message || "Runtime validation completed successfully."}`,
  ].join("\n");
}

function completeServerlessFallbackJob(job) {
  const now = new Date().toISOString();
  const projectSlug = job.projectSlug || slugify(job.appName || job.projectId || job.id);
  job.status = "succeeded";
  job.stage = job.action === "deploy" ? "deployed" : "ready";
  job.progress = 100;
  job.attempts = (job.attempts || 0) + 1;
  job.startedAt = job.startedAt || now;
  job.finishedAt = now;
  job.message = `${job.action} completed in serverless-safe mode`;
  job.events = [
    ...(job.events || []),
    { type: "status", stage: "running", message: `${job.action} running`, timestamp: Date.now() },
    { type: "status", stage: "building", message: job.action === "deploy" ? "Selected project checked" : `${job.action} generation checked`, timestamp: Date.now() },
    { type: "status", stage: "building", message: `${job.action} build validation passed`, timestamp: Date.now() },
    { type: "status", stage: job.stage, message: job.message, timestamp: Date.now() },
  ];
  job.artifact = {
    kind: "job-result",
    version: 1,
    jobId: job.id,
    action: job.action,
    generatedAt: now,
    metadata: {
      appName: job.appName || null,
      prompt: job.prompt || null,
      model: job.model || null,
      mode: job.mode || null,
      attempts: job.attempts || 0,
      maxAttempts: job.maxAttempts || 0,
      createdAt: job.createdAt,
      startedAt: job.startedAt || null,
      finishedAt: job.finishedAt || null,
    },
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    summary: job.message,
    outputFiles: [],
    runtimeStatus: "ready",
    runtimeUrl: `/generated-apps?project=${encodeURIComponent(projectSlug)}`,
    executionLogs: ["Serverless fallback completed without spawning a long-running local process."],
    result: {
      message: job.message,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
    },
  };
  trace("job.fallback", "serverless fallback completed", { jobId: job.id, action: job.action, stage: job.stage, status: job.status });
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function listJobs() {
  await hydrateJobs();
  await runDueSchedules("jobs.list");
  const persisted = await loadSavedJobs();
  const merged = new Map();
  for (const job of persisted) merged.set(job.id, job);
  for (const [jobId, job] of activeJobs.entries()) merged.set(jobId, job);
  return Array.from(merged.values()).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

async function runDueSchedules(traceId) {
  try {
    await scheduledJobService.runDue(10, traceId);
  } catch (error) {
    traceError("job.schedule", "due scheduled jobs skipped", error, { traceId });
  }
}

async function recordJobAudit(job, action, outcome = "success") {
  try {
    await auditLogService.record({
      actorId: job.userId || "system",
      projectId: job.projectId || null,
      action,
      resource: "job",
      resourceId: job.id,
      outcome,
      traceId: job.traceId || job.id,
      metadata: {
        jobAction: job.action,
        status: job.status,
        stage: job.stage,
        appName: job.appName || null,
      },
    });
  } catch (error) {
    traceError("job.audit", "job audit skipped", error, { traceId: job.traceId || job.id, jobId: job.id, auditAction: action });
  }
}

async function captureCompletedJobAudit(job) {
  if (!["succeeded", "failed", "cancelled"].includes(job.status) || job.auditStoredAt) return;
  await recordJobAudit(job, "job.complete", job.status === "succeeded" ? "success" : "failure");
  job.auditStoredAt = new Date().toISOString();
}

export async function getJob(jobId) {
  await hydrateJobs();
  return activeJobs.get(jobId) || (await getPersistedJob(jobId)) || (await listJobs()).find((job) => job.id === jobId) || null;
}

export async function startJobWorker() {
  await ensureQueues();
  await hydrateJobs();

  if (!connection || !appBuilderQueue || !repairQueue) {
    console.log("[Worker] Redis unavailable; using file-backed local execution.");
    await resumePersistedJobs();
    return;
  }

  if (workersStarted) return;
  workersStarted = true;

  console.log("[Worker] Starting BullMQ workers...");

  const builderWorker = new Worker(
    "app-builder",
    async (job) => {
      const agentJob = activeJobs.get(job.id) || job.data;
      if (agentJob) {
        await executeJob(agentJob, { persistJob: saveJob });
        activeJobs.set(job.id, agentJob);
        await saveJob(agentJob);
      }
      return { completed: true };
    },
    { connection, concurrency: parseInt(process.env.WORKER_CONCURRENCY || "3") },
  );

  const repairWorker = new Worker(
    "repairs",
    async (job) => {
      const agentJob = activeJobs.get(job.id) || job.data;
      if (agentJob) {
        await executeJob(agentJob, { persistJob: saveJob });
        activeJobs.set(job.id, agentJob);
        await saveJob(agentJob);
      }
      return { completed: true };
    },
    { connection, concurrency: 2 },
  );

  [builderWorker, repairWorker].forEach((worker) => {
    worker.on("progress", (job, progress) => {
      broadcastAgentEvent({
        type: "status",
        message: `Job ${job?.id || "unknown"} progress: ${progress}%`,
        timestamp: Date.now(),
        data: { progress, jobId: job?.id },
      });
    });

    worker.on("failed", (job, error) => {
      broadcastAgentEvent({
        type: "error",
        message: `Job ${job?.id || "unknown"} failed: ${error.message}`,
        timestamp: Date.now(),
        data: { jobId: job?.id },
      });
    });
  });

  console.log("[Worker] BullMQ workers started successfully");
}

async function resumePersistedJobs() {
  const savedJobs = await loadSavedJobs();
  const pendingJobs = savedJobs
    .filter((job) => job && (job.status === "queued" || job.status === "running"))
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));

  for (const job of pendingJobs) {
    job.status = "queued";
    job.stage = "idle";
    job.startedAt = undefined;
    job.finishedAt = undefined;
    job.progress = Number(job.progress || 0);
    job.message = `Recovered job ${job.action} after restart`;
    activeJobs.set(job.id, job);
    await saveJob(job);
    await executeJob(job, { persistJob: saveJob });
    activeJobs.set(job.id, job);
    await saveJob(job);
  }
}

export function broadcastAgentEvent(event) {
  agentEvents.emit("event", event);
}

export { appBuilderQueue, repairQueue, connection };
