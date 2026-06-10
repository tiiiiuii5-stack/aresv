import { randomUUID } from "node:crypto";

import { JobStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse, trace, withStep } from "@/lib/diagnostics";
import { assertOwnership } from "@/lib/auth/ownership";
import type { AuthSession } from "@/lib/auth/session";
import { getProject, getProjectWorkspacePath } from "@/lib/project-store";
import { prisma } from "@/lib/prisma";
import { buildMutationService, maxMutationsPerJob } from "@/lib/services/buildMutation";
import { compileTrust, readCompiledJson, stripClientIdentity } from "@/lib/trust/compiler";
import type { JobAction } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: Context) {
  const traceId = createTrace("jobs.retry.POST");
  try {
    const { session } = await compileTrust(request, { mode: "session" });
    const { id } = await context.params;
    const body = await readCompiledJson(request);
    const userId = session.userId;
    const orgId = session.orgId;
    trace("jobs.retry.POST", "route parsed", { traceId, id, userId, orgId });

    const original = await withStep("jobs.retry.POST", traceId, "load original job", () => prisma.job.findUnique({ where: { id } }), 10_000);
    if (!original) {
      return NextResponse.json({ ok: false, traceId, error: "Job not found." }, { status: 404 });
    }
    const { addBuildJob, buildQueue } = await import("@/lib/queue");
    if (!buildQueue) {
      return NextResponse.json({ ok: false, traceId, error: "REDIS_URL is required to enqueue build jobs." }, { status: 503 });
    }

    const currentMutationCount = Number(original.mutationCount || 0);
    if (currentMutationCount >= maxMutationsPerJob()) {
      return NextResponse.json({ ok: false, traceId, error: "Max mutations reached. Try a different prompt or create a new job." }, { status: 400 });
    }

    const nextMutationCount = currentMutationCount + 1;
    const modelUsed = buildMutationService.randomizeModel(nextMutationCount);
    const temperature = buildMutationService.randomizeTemperature();
    const originalPayload = stripClientIdentity(payloadObject(original.payload));
    const projectAccess = await withStep("jobs.retry.POST", traceId, "verify project ownership", () => verifyRetryProjectOwnership(original, originalPayload, session), 10_000);
    const prompt = String(body?.prompt || originalPayload.prompt || "");
    const promptHash = buildMutationService.generatePromptHash(prompt);
    const mutationRecord = {
      retryOf: original.id,
      mutationCount: nextMutationCount,
      modelUsed,
      temperature,
      promptHash,
      mutatedAt: new Date().toISOString(),
    };
    const mutationHistory = [
      ...(Array.isArray(original.mutationHistory) ? original.mutationHistory : []),
      mutationRecord,
    ];

    const projectReference = String(body?.projectPath || projectAccess.projectSlug || projectAccess.projectId || originalPayload.projectPath || originalPayload.appName || "").trim();
    const projectPath = projectReference
      ? String(body?.projectPath || originalPayload.projectPath || "") || (await withStep("jobs.retry.POST", traceId, "resolve project workspace", () => getProjectWorkspacePath(projectReference), 10_000))
      : undefined;
    const project = projectAccess.projectId || projectAccess.projectSlug ? await getProject(String(projectAccess.projectId || projectAccess.projectSlug)) : null;
    const divergenceResult = project?.files?.length
      ? await withStep("jobs.retry.POST", traceId, "check retry divergence", () =>
        buildMutationService.checkDivergence(userId, project.files.map((file) => file.path), {
          excludeJobId: original.id,
        }), 10_000)
      : undefined;

    const retryJobId = randomUUID();
    const action = String(original.type || originalPayload.action || "build") as JobAction;
    const retryPayload = {
      ...originalPayload,
      traceId,
      jobId: retryJobId,
      retryOf: original.id,
      action,
      userId,
      orgId,
      appName: String(body?.appName || originalPayload.appName || ""),
      prompt,
      model: modelUsed,
      modelUsed,
      temperature,
      promptHash,
      mutationCount: nextMutationCount,
      mutationHistory,
      divergenceResult,
      mode: String(body?.mode || originalPayload.mode || ""),
      projectId: projectAccess.projectId || undefined,
      projectSlug: projectAccess.projectSlug || undefined,
      projectPath,
    };

    const retryJob = await withStep("jobs.retry.POST", traceId, "create mutated retry", async () => {
      const created = await prisma.job.create({
        data: {
          id: retryJobId,
          projectId: projectAccess.projectId,
          type: action,
          status: JobStatus.QUEUED,
          queuedAt: new Date(),
          currentStep: "queued",
          progress: 0,
          payload: retryPayload,
          mutationCount: nextMutationCount,
          mutationHistory,
          modelUsed,
          temperature,
          promptHash,
        },
      });

      await addBuildJob(retryJobId, retryPayload);
      return created;
    }, 15_000);

    return NextResponse.json({
      ok: true,
      traceId,
      retryOf: original.id,
      job: withMutationTracking(retryJob),
      mutationTracking: mutationTrackingFor(retryJob),
    }, { status: 201 });
  } catch (error) {
    return errorResponse("jobs.retry.POST", traceId, error, statusForJobError(error));
  }
}

function payloadObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function verifyRetryProjectOwnership(original: { projectId: string | null }, originalPayload: Record<string, unknown>, session: AuthSession) {
  const projectId = cleanString(original.projectId);
  const projectSlug = cleanString(originalPayload.projectSlug);
  if (!projectId && !projectSlug) throw new Error("JOB_OWNERSHIP_UNVERIFIABLE");

  const filters = [
    projectId ? { id: projectId } : null,
    projectSlug ? { slug: projectSlug } : null,
  ].filter(Boolean) as Array<{ id: string } | { slug: string }>;

  const project = await prisma.project.findFirst({
    where: { OR: filters },
    select: { id: true, slug: true, userId: true },
  });

  if (!project) throw new Error("PROJECT_NOT_FOUND");
  assertOwnership(project, session);
  return { projectId: project.id, projectSlug: project.slug };
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function statusForJobError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message) || message === "JOB_OWNERSHIP_UNVERIFIABLE") return 403;
  if (message === "PROJECT_NOT_FOUND") return 404;
  return 500;
}

function withMutationTracking<T extends object>(job: T) {
  return {
    ...job,
    mutationTracking: mutationTrackingFor(job),
  };
}

function mutationTrackingFor(job: object) {
  const data = job as Record<string, unknown>;
  return {
    mutationCount: Number(data.mutationCount || 0),
    mutationHistory: Array.isArray(data.mutationHistory) ? data.mutationHistory : [],
    modelUsed: data.modelUsed || data.model || null,
    temperature: typeof data.temperature === "number" ? data.temperature : null,
    promptHash: data.promptHash || null,
    divergenceResult: data.divergenceResult || null,
  };
}
