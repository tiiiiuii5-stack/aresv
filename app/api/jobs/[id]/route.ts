import { JobStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse, trace, withStep } from "@/lib/diagnostics";
import { assertJobAccess } from "@/lib/auth/job-access";
import { prisma } from "@/lib/prisma";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: Context) {
  const traceId = createTrace("jobs.id.GET");
  try {
    const { session } = await compileTrust(_request, { mode: "session" });
    const { id } = await context.params;
    trace("jobs.id.GET", "route parsed", { traceId, id });
    const job = await withStep("jobs.id.GET", traceId, "load job status", () => loadJobRecord(id), 10_000);
    if (!job) {
      return NextResponse.json({ ok: false, traceId, error: "Job not found." }, { status: 404 });
    }
    assertJobAccess(job, session);
    return NextResponse.json({ ok: true, traceId, ...jobStatusForClient(job) });
  } catch (error) {
    return errorResponse("jobs.id.GET", traceId, error, statusForJobIdError(error));
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const traceId = createTrace("jobs.id.DELETE");
  try {
    const { session } = await compileTrust(request, { mode: "session" });
    const { id } = await context.params;
    const job = await loadJobRecord(id);
    if (!job) {
      return NextResponse.json({ ok: false, traceId, error: "Job not found." }, { status: 404 });
    }
    assertJobAccess(job, session);

    if (!cancellableStatuses.has(job.status)) {
      return NextResponse.json({ ok: true, traceId, job: jobStatusForClient(job) });
    }

    await prisma.job.update({
      where: { id },
      data: {
        status: JobStatus.CANCELLED,
        currentStep: "Cancelled",
        completedAt: new Date(),
      },
    });

    const updatedJob = await loadJobRecord(id);
    return NextResponse.json({ ok: true, traceId, job: updatedJob ? jobStatusForClient(updatedJob) : null });
  } catch (error) {
    return errorResponse("jobs.id.DELETE", traceId, error, statusForJobIdError(error));
  }
}

const cancellableStatuses = new Set<JobStatus>([
  JobStatus.QUEUED,
  JobStatus.RUNNING,
  JobStatus.GENERATING,
  JobStatus.BUILDING,
  JobStatus.DEPLOYING,
]);

async function loadJobRecord(id: string) {
  return prisma.job.findUnique({
    where: { id },
    select: {
      id: true,
      projectId: true,
      type: true,
      payload: true,
      status: true,
      progress: true,
      currentStep: true,
      resultUrl: true,
      errorMessage: true,
      queuedAt: true,
      startedAt: true,
      completedAt: true,
      modelUsed: true,
      temperature: true,
      promptHash: true,
      mutationCount: true,
      mutationHistory: true,
      project: { select: { userId: true, user: { select: { email: true } } } },
    },
  });
}

function jobStatusForClient(job: NonNullable<Awaited<ReturnType<typeof loadJobRecord>>>) {
  return {
    jobId: job.id,
    action: job.type,
    status: statusForClient(job.status),
    progress: job.progress,
    currentStep: job.currentStep,
    resultUrl: job.resultUrl,
    errorMessage: job.errorMessage,
    queuedAt: job.queuedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    mutationTracking: {
      mutationCount: job.mutationCount,
      mutationHistory: job.mutationHistory,
      modelUsed: job.modelUsed,
      temperature: job.temperature,
      promptHash: job.promptHash,
    },
  };
}

function statusForClient(status: JobStatus) {
  return status.toLowerCase();
}

function statusForJobIdError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  return 500;
}
