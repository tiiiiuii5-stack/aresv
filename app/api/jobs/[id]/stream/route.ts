import { JobStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { createTrace } from "@/lib/diagnostics";
import { assertJobAccess } from "@/lib/auth/job-access";
import { prisma } from "@/lib/prisma";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string }>;
};

const terminalStatuses = new Set<JobStatus>([JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED]);

export async function GET(request: NextRequest, context: Context) {
  const traceId = createTrace("jobs.stream.GET");
  try {
    const { session } = await compileTrust(request, { mode: "session" });
    const { id } = await context.params;
    const accessJob = await prisma.job.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        payload: true,
        project: { select: { userId: true, user: { select: { email: true } } } },
      },
    });
    if (!accessJob) return NextResponse.json({ ok: false, traceId, error: "Job not found." }, { status: 404 });
    assertJobAccess(accessJob, session);
    return streamJob(request, id, traceId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to stream job.";
    const status = message === "UNAUTHORIZED" ? 401 : /FORBIDDEN/.test(message) ? 403 : 500;
    return NextResponse.json({ ok: false, traceId, error: message }, { status });
  }
}

function streamJob(request: NextRequest, id: string, traceId: string) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let lastSignature = "";
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      send({ type: "connected", jobId: id, traceId });

      while (!request.signal.aborted) {
        const job = await prisma.job.findUnique({
          where: { id },
          select: { status: true, progress: true, currentStep: true, resultUrl: true, errorMessage: true },
        }).catch(() => null);

        if (!job) {
          send({ type: "error", jobId: id, error: "Job not found." });
          break;
        }

        const signature = `${job.status}:${job.progress}:${job.currentStep}:${job.resultUrl || ""}:${job.errorMessage || ""}`;
        if (signature !== lastSignature) {
          lastSignature = signature;
          send({
            type: "step",
            jobId: id,
            status: job.status.toLowerCase(),
            progress: job.progress,
            step: job.currentStep,
            resultUrl: job.resultUrl,
            errorMessage: job.errorMessage,
          });
        }

        if (terminalStatuses.has(job.status)) break;
        await delay(1000);
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
