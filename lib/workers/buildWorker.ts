import { JobStatus } from "@prisma/client";

import { broadcastAgentEvent, createBuildWorker, type BuildJobData } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
import { assertOwnership } from "@/lib/auth/ownership";
import { agentOrchestrator } from "@/lib/services/agentOrchestrator";
import { agentMemoryService } from "@/lib/services/agentMemory";
import { buildMutationService, type RuntimeFactory } from "@/lib/services/buildMutation";
import { getProject, type ProjectRecord } from "@/lib/project-store";

type BuildWorkerResult = {
  project: ProjectRecord;
  resultUrl: string;
};

export async function processBuildJob(data: BuildJobData, id?: string) {
  const jobId = String(id || data.jobId);
  const userId = String(data.userId || "system");
  const prompt = String(data.prompt || "");
  const action = String(data.action || "build");

  const current = await prisma.job.findUnique({ where: { id: jobId }, select: { status: true } });
  if (current?.status === JobStatus.CANCELLED) {
    return;
  }

  await updateJobStatus(jobId, JobStatus.RUNNING, 5, "Initializing");

  try {
    const generationMode = shouldGenerateProject(action, data);
    let project: ProjectRecord;
    let mutationCount = Number(data.mutationCount || 0);

    if (generationMode) {
      await updateJobStatus(jobId, JobStatus.GENERATING, 15, "Parsing intent");
      const intent = await agentOrchestrator.parseIntent(prompt, String(data.category || "custom"));

      await updateJobStatus(jobId, JobStatus.GENERATING, 50, "Generating code");
      const generated = await agentOrchestrator.generate({
        prompt,
        category: intent.category,
        userId,
      });
      project = generated.project;
      mutationCount = generated.job.mutationCount || mutationCount;
    } else {
      await updateJobStatus(jobId, JobStatus.RUNNING, 20, "Loading selected project");
      project = await loadSelectedProject(data, userId);
    }

    await updateJobStatus(jobId, generationMode ? JobStatus.GENERATING : JobStatus.BUILDING, generationMode ? 55 : 45, "Recalling patterns");
    const memories = await agentMemoryService
      .recall(userId, prompt || project.prompt || project.problem || project.name, { projectId: project.id, limit: 5 })
      .catch(() => []);

    const files = project.files.map((file) => file.path);
    let divergence: Awaited<ReturnType<typeof buildMutationService.checkDivergence>> | null = null;

    await updateJobStatus(jobId, JobStatus.BUILDING, 60, "Validating structure");
    if (generationMode) {
      divergence = await buildMutationService.checkDivergence(userId, files, { excludeJobId: jobId });
    }
    if (divergence && !divergence.allowed) {
      await updateJobStatus(jobId, JobStatus.BUILDING, 65, "Mutating architecture");
      await buildMutationService.mutateArchitecture(runtimeFactoryFrom(data.runtimeFactory), mutationCount);
    }

    await updateJobStatus(jobId, JobStatus.BUILDING, 75, "Building project");
    const buildResult = await buildProject(project);

    await updateJobStatus(jobId, JobStatus.DEPLOYING, 90, action === "deploy" ? "Deploying selected project" : "Deploying");
    const deployment = await deployProject(buildResult);

    await agentMemoryService.store({
      userId,
      projectId: project.id,
      memoryType: "success",
      content: `${actionLabel(action)} completed for ${project.name}. Routes: ${project.appPlan?.routes.map((route) => route.path).join(", ") || "none"}.`,
      metadata: {
        projectType: project.category,
        fileCount: project.files.length,
        memoryCount: memories.length,
        divergence,
      },
    }, data.traceId);

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.COMPLETED,
        progress: 100,
        currentStep: "Done",
        completedAt: new Date(),
        resultUrl: deployment.url,
        ...(generationMode ? {} : { projectId: project.id }),
        payload: {
          ...data,
          projectId: project.id,
          projectSlug: project.slug,
          resultUrl: deployment.url,
          divergence,
          buildMode: generationMode,
        },
      },
    });
  } catch (error) {
    await handleJobFailure(jobId, error, data);
  }
}

export function startBuildWorker() {
  return createBuildWorker((job) => processBuildJob(job.data, String(job.id || job.data.jobId)));
}

async function loadSelectedProject(data: BuildJobData, userId: string) {
  const action = String(data.action || "");
  const projectId = cleanString(data.projectId);
  const projectSlug = cleanString(data.projectSlug);
  if (action === "deploy" && !projectId) throw new Error("PROJECT_ID_REQUIRED");

  const projectKey = projectId || projectSlug;
  if (!projectKey) throw new Error("PROJECT_ID_REQUIRED");

  const project = await getProject(projectKey);
  if (!project) throw new Error("PROJECT_NOT_FOUND");

  const owner = await prisma.project.findUnique({
    where: { id: project.id },
    select: { userId: true, user: { select: { email: true } } },
  });
  if (!owner) throw new Error("PROJECT_NOT_FOUND");
  assertOwnership(owner, { userId, role: "", orgId: null });

  return project;
}

async function updateJobStatus(jobId: string, status: JobStatus, progress: number, step: string) {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status,
      progress,
      currentStep: step,
      startedAt: status === JobStatus.RUNNING ? new Date() : undefined,
    },
  });
  await emitJobUpdate(jobId, { status, progress, step });
}

async function handleJobFailure(jobId: string, error: unknown, data: BuildJobData) {
  const message = error instanceof Error ? error.message : String(error);
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { mutationCount: true },
  });
  const mutationCount = job?.mutationCount || 0;

  if (mutationCount < 3 && !isNonRetriableWorkerError(message)) {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.QUEUED,
        progress: 0,
        currentStep: "Queued for retry",
        mutationCount: { increment: 1 },
        errorMessage: message,
        mutationHistory: [
          ...(Array.isArray(data.mutationHistory) ? data.mutationHistory : []),
          { failedAt: new Date().toISOString(), error: message },
        ],
      },
    });
    return;
  }

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: JobStatus.FAILED,
      errorMessage: message,
      completedAt: new Date(),
      currentStep: "Failed",
    },
  });
}

function shouldGenerateProject(action: string, data: BuildJobData) {
  if (action === "deploy") return false;
  const mode = cleanString(data.mode).toLowerCase();
  return action === "build" || action === "generate" || data.buildMode === true || mode === "build";
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function actionLabel(action: string) {
  if (action === "deploy") return "Deploy";
  if (action === "generate") return "Generation";
  return "Build";
}

function isNonRetriableWorkerError(message: string) {
  return message === "PROJECT_ID_REQUIRED" || message === "PROJECT_NOT_FOUND" || /FORBIDDEN/.test(message);
}

async function buildProject(project: ProjectRecord): Promise<BuildWorkerResult> {
  if (project.buildValidation?.status === "failed") {
    throw new Error(project.buildValidation.logs.join("; ") || "Generated project failed validation.");
  }
  return {
    project,
    resultUrl: `/generated-apps?project=${project.slug}`,
  };
}

async function deployProject(result: BuildWorkerResult) {
  return { url: result.resultUrl };
}

async function emitJobUpdate(jobId: string, payload: { status: JobStatus; progress: number; step: string }) {
  broadcastAgentEvent({
    type: "status",
    message: payload.step,
    timestamp: Date.now(),
    data: { jobId, status: payload.status, progress: payload.progress, step: payload.step },
  });
}

function runtimeFactoryFrom(value: unknown): RuntimeFactory {
  if (value && typeof value === "object" && Array.isArray((value as RuntimeFactory).validationLayers)) {
    return value as RuntimeFactory;
  }
  return { frontend: "nextjs", styling: "tailwind", dataPattern: "csr", validationLayers: [] };
}
