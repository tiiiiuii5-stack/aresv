import { randomUUID } from "node:crypto";

import { JobStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse, trace, withStep } from "@/lib/diagnostics";
import { prisma } from "@/lib/prisma";
import { assertOwnership } from "@/lib/auth/ownership";
import { canAccessJob } from "@/lib/auth/job-access";
import type { AuthSession } from "@/lib/auth/session";
import { planApp } from "@/lib/app-planning-engine";
import { billingService } from "@/lib/services/billing";
import { buildMutationService } from "@/lib/services/buildMutation";
import { compileTrust, readCompiledJson } from "@/lib/trust/compiler";
import type { JobAction } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedActions = new Set<JobAction>(["generate", "verify", "repair", "preview", "build", "deploy"]);

export async function GET(request: NextRequest) {
  const traceId = createTrace("jobs.GET");
  try {
    const { session } = await compileTrust(request, { mode: "session" });
    const jobs = await withStep("jobs.GET", traceId, "list jobs", () =>
      prisma.job.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { project: { select: { userId: true, user: { select: { email: true } } } } },
      }), 15_000);
    return NextResponse.json({
      ok: true,
      traceId,
      jobs: jobs
        .filter((job) => canAccessJob(job, session))
        .map(({ project: _project, ...job }) => withMutationTracking(job)),
    });
  } catch (error) {
    return errorResponse("jobs.GET", traceId, error, statusForJobError(error));
  }
}

export async function POST(request: NextRequest) {
    const started = performance.now();
  const traceId = createTrace("jobs.POST");
  try {
    const { session } = await compileTrust(request, { mode: "session" });
    const body = await readCompiledJson(request);
    const action = String(body?.action || "build");
    const prompt = String(body?.prompt || "").trim();
    const userId = session.userId;
    const orgId = session.orgId;
    const mutationCount = Math.max(0, Number(body?.mutationCount || 0));

    trace("jobs.POST", "payload parsed", { traceId, action, promptLength: prompt.length, userId, orgId });

    if (!allowedActions.has(action as JobAction)) {
      return NextResponse.json({ ok: false, traceId, error: "Unknown job action." }, { status: 400 });
    }

    const generatesProject = action === "build" || action === "generate";
    const appPlan = generatesProject ? validateRuntimeFactoryGate(prompt, String(body?.category || "custom")) : null;
    if (appPlan && !appPlan.allowed) {
      return NextResponse.json({ ok: false, traceId, error: appPlan.error, questions: appPlan.questions }, { status: 400 });
    }
    const generatedPlan = appPlan?.allowed ? appPlan.plan : null;

    if (action === "build" || action === "generate") {
      const billingGate = await withStep("jobs.POST", traceId, "check billing limits", () => billingService.assertBuildAllowed(userId), 15_000);
      if (!billingGate.allowed) {
        return NextResponse.json({ ok: false, traceId, error: billingGate.error, billing: billingGate.status, upgradeRequired: true }, { status: 402 });
      }
    }

    const projectAccess = await withStep("jobs.POST", traceId, "verify project ownership", () =>
      verifyProjectOwnership(body, session, { requireProjectId: action === "deploy", projectIdOnly: action === "deploy" }), 15_000);

    const { addBuildJob, buildQueue } = await import("@/lib/queue");
    if (!buildQueue) {
      return NextResponse.json({ ok: false, traceId, error: "REDIS_URL is required to enqueue build jobs." }, { status: 503 });
    }

    const jobId = randomUUID();
    const modelUsed = String(body?.modelUsed || body?.model || buildMutationService.randomizeModel(mutationCount));
    const temperature = typeof body?.temperature === "number" ? body.temperature : buildMutationService.randomizeTemperature();
    const promptHash = String(body?.promptHash || buildMutationService.generatePromptHash(prompt));
    const payload = {
      ...body,
      jobId,
      traceId,
      action,
      prompt,
      userId,
      orgId,
      modelUsed,
      temperature,
      promptHash,
      mutationCount,
      projectId: projectAccess.projectId || undefined,
      projectSlug: projectAccess.projectSlug || undefined,
      appPlan: generatedPlan,
      buildMode: generatesProject,
    };

    await prisma.job.create({
      data: {
        id: jobId,
        projectId: projectAccess.projectId,
        type: action,
        status: JobStatus.QUEUED,
        queuedAt: new Date(),
        currentStep: "queued",
        progress: 0,
        payload,
        mutationCount,
        mutationHistory: Array.isArray(body?.mutationHistory) ? body.mutationHistory : [],
        modelUsed,
        temperature,
        promptHash,
      },
    });

    await addBuildJob(jobId, {
      jobId,
      traceId,
      action,
      prompt,
      userId,
      orgId,
      appName: String(body?.appName || generatedPlan?.productName || projectAccess.projectSlug || "VentureOS App"),
      projectId: projectAccess.projectId || undefined,
      projectSlug: projectAccess.projectSlug || undefined,
      projectPath: String(body?.projectPath || "") || undefined,
      category: String(body?.category || generatedPlan?.category || "custom"),
      buildMode: generatesProject,
      runtimeFactory: body?.runtimeFactory || null,
      mutationCount,
      mutationHistory: Array.isArray(body?.mutationHistory) ? body.mutationHistory : [],
      modelUsed,
      temperature,
      promptHash,
    });

    if (action === "build" || action === "generate") {
      const { processBuildJob } = await import("@/lib/workers/buildWorker");
      await withStep("jobs.POST", traceId, "process build job inline", () => processBuildJob(payload, jobId), 180_000);
    }

    if (action === "build" || action === "generate") {
      await billingService.recordBuild(userId, { jobId, action, appName: String(body?.appName || generatedPlan?.productName || "VentureOS App") }).catch((error) => {
        trace("jobs.POST", "billing usage record failed", { traceId, error: error instanceof Error ? error.message : String(error) });
      });
    }

    return NextResponse.json({
      ok: true,
      traceId,
      jobId,
      status: "queued",
      estimatedTime: "30s",
      elapsedMs: Math.round(performance.now() - started),
    }, { status: 202 });
  } catch (error) {
    return errorResponse("jobs.POST", traceId, error, statusForJobError(error));
  }
}

async function verifyProjectOwnership(body: Record<string, unknown>, session: AuthSession, options: { requireProjectId?: boolean; projectIdOnly?: boolean } = {}) {
  const projectId = cleanString(body.projectId);
  const projectSlug = options.projectIdOnly ? "" : cleanString(body.projectSlug);
  if (options.requireProjectId && !projectId) throw new Error("PROJECT_ID_REQUIRED");
  if (!projectId && !projectSlug) return { projectId: null, projectSlug: null };

  const project = projectId
    ? await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, slug: true, userId: true, user: { select: { email: true } } },
      })
    : await prisma.project.findUnique({
        where: { slug: projectSlug },
        select: { id: true, slug: true, userId: true, user: { select: { email: true } } },
      });

  if (!project) throw new Error("PROJECT_NOT_FOUND");
  if (projectSlug && project.slug !== projectSlug) throw new Error("PROJECT_REFERENCE_MISMATCH");
  assertOwnership(project, session);
  return { projectId: project.id, projectSlug: project.slug };
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function statusForJobError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  if (message === "PROJECT_NOT_FOUND") return 404;
  if (message === "PROJECT_ID_REQUIRED" || message === "PROJECT_REFERENCE_MISMATCH") return 400;
  return 500;
}

function validateRuntimeFactoryGate(prompt: string, category: string) {
  if (prompt.length < 12) {
    return {
      allowed: false,
      error: "Describe the app in at least 12 characters.",
      questions: ["Who are the real users?", "What real actions must users perform?"],
    };
  }

  const clarityQuestions = promptClarityQuestions(prompt);
  if (clarityQuestions.length) {
    return {
      allowed: false,
      error: `Spec is unclear. Answer before generation: ${clarityQuestions.join(" ")}`,
      questions: clarityQuestions,
    };
  }

  return { allowed: true, plan: planApp(prompt, category) };
}

function promptClarityQuestions(prompt: string) {
  const source = prompt.toLowerCase();
  return [
    !/\b(user|users|customer|client|admin|team|manager|staff|owner|member|seller|buyer|founder|creator|operator)\b/i.test(source)
      ? "Who are the real users?"
      : "",
    !/\b(create|edit|delete|submit|book|buy|sell|track|assign|move|deploy|generate|save|upload|approve|publish|schedule|message|checkout|manage|review)\b/i.test(source)
      ? "What real actions must users perform?"
      : "",
    !/\b(database|data|record|records|client|clients|project|projects|task|tasks|order|orders|booking|bookings|product|products|metric|metrics|post|posts|member|members|deal|deals|invoice|invoices|slot|slots|listing|listings|item|items|request|requests|review|reviews|report|reports)\b/i.test(source)
      ? "What real data or records must be stored?"
      : "",
  ].filter(Boolean);
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
