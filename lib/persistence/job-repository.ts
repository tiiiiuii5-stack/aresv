import { JobStatus, type Prisma } from "@prisma/client";
import type { AgentJob } from "@/lib/types";
import { isDatabaseConfigured, tryDatabase } from "./database";

export async function persistJobRecord(job: AgentJob) {
  if (!isDatabaseConfigured()) return false;
  const result = await tryDatabase(async (db) => {
    const projectId = job.projectId ? (await db.project.findUnique({ where: { id: job.projectId }, select: { id: true } }))?.id ?? null : null;
    await db.job.upsert({
      where: { id: job.id },
      update: {
        projectId,
        type: job.action,
        progress: job.progress,
        status: toPersistedJobStatus(job),
        payload: job as unknown as Prisma.InputJsonValue,
        queuedAt: new Date(job.createdAt),
        startedAt: job.startedAt ? new Date(job.startedAt) : null,
        completedAt: job.finishedAt ? new Date(job.finishedAt) : null,
        currentStep: currentJobStep(job),
        errorMessage: job.error || (job.status === "failed" ? job.message : null),
        resultUrl: job.artifact?.runtimeUrl || null,
        mutationCount: job.mutationCount || 0,
        mutationHistory: (job.mutationHistory || []) as unknown as Prisma.InputJsonValue,
        modelUsed: job.modelUsed || job.model || null,
        temperature: typeof job.temperature === "number" ? job.temperature : null,
        promptHash: job.promptHash || null,
      },
      create: {
        id: job.id,
        projectId,
        type: job.action,
        progress: job.progress,
        status: toPersistedJobStatus(job),
        payload: job as unknown as Prisma.InputJsonValue,
        queuedAt: new Date(job.createdAt),
        startedAt: job.startedAt ? new Date(job.startedAt) : null,
        completedAt: job.finishedAt ? new Date(job.finishedAt) : null,
        currentStep: currentJobStep(job),
        errorMessage: job.error || (job.status === "failed" ? job.message : null),
        resultUrl: job.artifact?.runtimeUrl || null,
        mutationCount: job.mutationCount || 0,
        mutationHistory: (job.mutationHistory || []) as unknown as Prisma.InputJsonValue,
        modelUsed: job.modelUsed || job.model || null,
        temperature: typeof job.temperature === "number" ? job.temperature : null,
        promptHash: job.promptHash || null,
      },
    });
    return true;
  });
  return Boolean(result);
}

export async function listPersistedJobs(): Promise<AgentJob[] | null> {
  if (!isDatabaseConfigured()) return null;
  return tryDatabase(async (db) => {
    const jobs = await db.job.findMany({
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    });
    return jobs.map((job) => job.payload as unknown as AgentJob);
  });
}

export async function getPersistedJob(jobId: string): Promise<AgentJob | null> {
  if (!isDatabaseConfigured()) return null;
  return tryDatabase(async (db) => {
    const job = await db.job.findUnique({
      where: { id: jobId },
      select: { payload: true },
    });
    return (job?.payload as unknown as AgentJob | undefined) ?? null;
  });
}

function toPersistedJobStatus(job: AgentJob): JobStatus {
  if (job.status === "queued") return JobStatus.QUEUED;
  if (job.status === "running") {
    if (job.stage === "generating" || job.stage === "writing_files") return JobStatus.GENERATING;
    if (job.stage === "building" || job.stage === "testing" || job.stage === "fixing") return JobStatus.BUILDING;
    if (job.action === "deploy" || job.stage === "ready") return JobStatus.DEPLOYING;
    return JobStatus.RUNNING;
  }
  if (job.status === "succeeded") return JobStatus.COMPLETED;
  if (job.status === "failed") return JobStatus.FAILED;
  if (job.status === "cancelled") return JobStatus.CANCELLED;
  return JobStatus.QUEUED;
}

function currentJobStep(job: AgentJob) {
  if (job.stage && job.stage !== "idle") return job.stage;
  return job.status;
}
