import path from "node:path";
import os from "node:os";
import { broadcastAgentEvent } from "./job-queue-enhanced.js";
import { runProjectRuntime } from "./execution-runtime/runner.js";

function buildJobArtifact(job, runtimeResult = null) {
  return {
    kind: "job-result",
    version: 1,
    jobId: job.id,
    action: job.action,
    generatedAt: new Date().toISOString(),
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
    runtimeStatus: runtimeResult?.status ?? job.artifact?.runtimeStatus ?? "running",
    runtimeUrl: runtimeResult?.url ?? job.artifact?.runtimeUrl,
    runtimePort: runtimeResult?.port ?? job.artifact?.runtimePort,
    executionLogs: runtimeResult?.logs ?? job.artifact?.executionLogs ?? [],
    executionError: runtimeResult?.error ?? job.artifact?.executionError,
    result: {
      message: job.message,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
    },
  };
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function resolveProjectPath(job) {
  if (job.projectPath) return job.projectPath;
  const baseRoot = process.env.VERCEL ? path.join(os.tmpdir(), "ventureos-generated-apps") : path.join(process.cwd(), "generated-apps");
  const slug = job.projectSlug || slugify(job.appName || job.mode || job.id);
  return path.join(baseRoot, slug);
}

export async function executeJob(job, options = {}) {
  const persistJob = typeof options.persistJob === "function" ? options.persistJob : null;
  job.status = "running";
  job.startedAt = new Date().toISOString();
  job.attempts = (job.attempts || 0) + 1;
  job.updatedAt = new Date().toISOString();

  broadcastAgentEvent({
    type: "status",
    stage: "planning",
    message: `Starting ${job.action} for ${job.appName}`,
    timestamp: Date.now(),
    data: { jobId: job.id },
  });

  try {
    if (persistJob) await persistJob(job);
    job.artifact = buildJobArtifact(job);

    broadcastAgentEvent({
      type: "status",
      stage: "testing",
      message: `Job ${job.id} artifact created; starting runtime validation`,
      timestamp: Date.now(),
      data: { jobId: job.id },
    });

    try {
      const runtimeResult = await runProjectRuntime(resolveProjectPath(job), {
        runtimeId: job.id,
        timeoutMs: Number(process.env.RUNTIME_TIMEOUT_MS || 20000),
        installTimeoutMs: Number(process.env.RUNTIME_INSTALL_TIMEOUT_MS || 300000),
      });

      job.artifact = buildJobArtifact(job, runtimeResult);

      if (runtimeResult.status === "ready") {
        job.status = "succeeded";
        job.stage = "ready";
        job.progress = 100;
        job.message = `${job.action} completed successfully`;
        job.finishedAt = new Date().toISOString();
        broadcastAgentEvent({
          type: "status",
          stage: "ready",
          message: `Runtime ready for ${job.id}`,
          timestamp: Date.now(),
          data: { jobId: job.id, runtimeStatus: runtimeResult.status, runtimeUrl: runtimeResult.url },
        });
      } else {
        job.status = "failed";
        job.stage = "failed";
        job.progress = 100;
        job.error = runtimeResult.error || "Runtime validation failed.";
        job.message = `Runtime validation failed for ${job.action}`;
        job.finishedAt = new Date().toISOString();
        broadcastAgentEvent({
          type: "error",
          stage: "fixing",
          message: `Runtime validation failed for ${job.id}`,
          timestamp: Date.now(),
          data: { jobId: job.id, runtimeStatus: runtimeResult.status, runtimeUrl: runtimeResult.url },
        });
      }
    } catch (runtimeError) {
      const runtimeMessage = runtimeError instanceof Error ? runtimeError.message : "Runtime validation failed.";
      job.status = "failed";
      job.stage = "failed";
      job.progress = 100;
      job.error = runtimeMessage;
      job.message = `Runtime validation failed for ${job.action}`;
      job.finishedAt = new Date().toISOString();
      job.artifact = buildJobArtifact(job, {
        status: "failed",
        url: job.artifact?.runtimeUrl,
        port: job.artifact?.runtimePort,
        logs: job.artifact?.executionLogs || [],
        error: runtimeMessage,
      });
      broadcastAgentEvent({
        type: "error",
        stage: "fixing",
        message: runtimeMessage,
        timestamp: Date.now(),
        data: { jobId: job.id },
      });
    }

    job.artifact = buildJobArtifact(job, {
      status: job.artifact?.runtimeStatus || "running",
      url: job.artifact?.runtimeUrl,
      port: job.artifact?.runtimePort,
      logs: job.artifact?.executionLogs || [],
      error: job.artifact?.executionError,
    });

    if (persistJob) await persistJob(job);
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : 'Unknown error';
    job.finishedAt = new Date().toISOString();
    job.artifact = buildJobArtifact(job);

    broadcastAgentEvent({
      type: "error",
      message: `Job ${job.id} failed: ${job.error}`,
      timestamp: Date.now(),
      data: { jobId: job.id },
    });
    if (persistJob) await persistJob(job);
  }
}

export async function generateSafeModeFallback(appDir) {
  throw new Error(`Safe mode fallback is not implemented for ${appDir}.`);
}
