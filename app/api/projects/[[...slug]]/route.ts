import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse, trace, withStep } from "@/lib/diagnostics";
import { assertOwnership } from "@/lib/auth/ownership";
import type { AuthSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { compileTrust, readCompiledJson, requireCompiledAdmin } from "@/lib/trust/compiler";
import {
  archiveProject,
  deleteProject,
  duplicateProject,
  generateFiveApps,
  generateProject,
  getProject,
  getProjectArtifact,
  getProjectRuntimeState,
  listProjects,
  mutateProjectRuntimeState,
  renameProject,
  resetProjects,
  runProjectQualityGate,
  saveProjectFile,
} from "@/lib/project-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ slug?: string[] }>;
};

export async function GET(_request: NextRequest, context: Context) {
  const traceId = createTrace("projects.GET");
  try {
  const trust = await compileTrust(_request, { mode: "session" });
  const session = trust.session;
  const slug = (await context.params).slug || [];
  trace("projects.GET", "route parsed", { traceId, slug: slug.join("/") });

  if (slug.length === 0) {
    const projects = await withStep("projects.GET", traceId, "list projects", () => listOwnedProjects(session), 15_000);
    return NextResponse.json({ ok: true, traceId, projects });
  }

  if (slug.length === 2 && slug[1] === "download") {
    const projectAccess = await withStep("projects.GET", traceId, "verify project ownership", () => requireOwnedProject(slug[0], session), 15_000);
    const artifact = await withStep("projects.GET", traceId, "load artifact", () => getProjectArtifact(projectAccess.id), 15_000);
    if (!artifact) {
      return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
    }

    const filename = `${artifact.project.slug.replace(/[^a-z0-9-]/gi, "-")}-artifact.json`;
    return new NextResponse(JSON.stringify(artifact, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  if (slug.length === 2 && slug[1] === "runtime") {
    const projectAccess = await withStep("projects.GET", traceId, "verify project ownership", () => requireOwnedProject(slug[0], session), 15_000);
    const state = await withStep("projects.GET", traceId, "load runtime state", () => getProjectRuntimeState(projectAccess.id, session.userId), 15_000);
    return NextResponse.json({ ok: true, traceId, state });
  }

  if (slug.length === 1) {
    const projectAccess = await withStep("projects.GET", traceId, "verify project ownership", () => requireOwnedProject(slug[0], session), 15_000);
    const project = await withStep("projects.GET", traceId, "load project", () => getProject(projectAccess.id), 15_000);
    if (!project) {
      return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, traceId, project });
  }

  return NextResponse.json({ ok: false, error: "Backend route not found." }, { status: 404 });
  } catch (error) {
    return errorResponse("projects.GET", traceId, error, statusForProjectError(error));
  }
}

export async function POST(request: NextRequest, context: Context) {
  const traceId = createTrace("projects.POST");
  try {
  const trust = await compileTrust(request, { mode: "session" });
  const session = trust.session;
  const slug = (await context.params).slug || [];
  trace("projects.POST", "route parsed", { traceId, slug: slug.join("/") });
  if (slug.length !== 0) {
    if (slug.length === 2 && slug[1] === "runtime") {
      const projectAccess = await withStep("projects.POST", traceId, "verify project ownership", () => requireOwnedProject(slug[0], session), 15_000);
      const body = await readCompiledJson(request);
      trace("projects.POST", "runtime mutation payload parsed", { traceId, project: slug[0], type: body?.type, label: body?.label });
      const state = await withStep("projects.POST", traceId, "mutate runtime state", () => mutateProjectRuntimeState(projectAccess.id, body, session.userId), 15_000);
      return NextResponse.json({ ok: true, traceId, state }, { status: 201 });
    }
    return NextResponse.json({ ok: false, error: "Backend route not found." }, { status: 404 });
  }

  const body = await readCompiledJson(request);
  trace("projects.POST", "payload parsed", { traceId, action: body?.action, category: body?.category, promptLength: String(body?.prompt || "").length });

  if (body?.action === "reset") {
    await requireCompiledAdmin(trust);
    await withStep("projects.POST", traceId, "reset projects", () => resetProjects(), 30_000);
    return NextResponse.json({ ok: true, projects: [] });
  }

  if (body?.action === "generate-five") {
    await requireCompiledAdmin(trust);
    const projects = await withStep("projects.POST", traceId, "generate sample suite", () => generateFiveApps(session.userId), 30_000);
    return NextResponse.json({ ok: true, traceId, projects });
  }

  const prompt = String(body?.prompt || "");
  if (prompt.trim().length < 12) {
    return NextResponse.json({ ok: false, traceId, error: "Describe the app in at least 12 characters." }, { status: 400 });
  }
  trace("projects.POST", "generate project start", { traceId });
  const project = await generateProject(prompt, String(body?.category || "custom"), session.userId);
  trace("projects.POST", "generate project complete", { traceId });
  trace("projects.POST", "project generated", { traceId, projectId: project.id, slug: project.slug, files: project.files.length, build: project.buildValidation?.status });
  return NextResponse.json({ ok: true, traceId, project }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("Spec is unclear.")) {
      trace("projects.POST", "spec clarification required", { traceId, message });
      return NextResponse.json({ ok: false, traceId, error: message }, { status: 400 });
    }
    if (message.startsWith("Generated architecture was too similar")) {
      trace("projects.POST", "similarity gate rejected generated app", { traceId, message });
      return NextResponse.json(
        {
          ok: false,
          traceId,
          error: "Generated project was too similar to an existing project.",
          similarityGate: {
            status: "rejected",
            reason: message,
            suggestions: [
              "Add more specific user roles.",
              "Add distinct workflows or state changes.",
              "Name the data models the app must store.",
            ],
          },
        },
        { status: 400 },
      );
    }
    if (message.startsWith("Generated app rejected:")) {
      const reasons = message
        .replace(/^Generated app rejected:\s*/i, "")
        .split(/(?=(?:Execution Binding Test|Domain Gate|Static Build|API Map|Runtime Factory|Button Interaction Test|State Persistence Test|Generated source))/)
        .map((item) => item.trim())
        .filter(Boolean);
      trace("projects.POST", "quality gate rejected generated app", { traceId, reasons });
      return NextResponse.json(
        {
          ok: false,
          traceId,
          error: "Generated app failed VentureOS quality gates.",
          qualityGate: { status: "failed", reasons },
        },
        { status: 400 },
      );
    }
    return errorResponse("projects.POST", traceId, error, statusForProjectError(error));
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  const traceId = createTrace("projects.PATCH");
  try {
  const { session } = await compileTrust(request, { mode: "session" });
  const slug = (await context.params).slug || [];
  if (slug.length !== 1) {
    return NextResponse.json({ ok: false, error: "Backend route not found." }, { status: 404 });
  }

  const projectAccess = await withStep("projects.PATCH", traceId, "verify project ownership", () => requireOwnedProject(slug[0], session), 15_000);
  const id = projectAccess.id;
  const body = await readCompiledJson(request);
  trace("projects.PATCH", "payload parsed", { traceId, id, action: body?.action, path: body?.path });

  if (body?.action === "rename") {
    return NextResponse.json({ ok: true, traceId, project: await withStep("projects.PATCH", traceId, "rename project", () => renameProject(id, String(body.name || ""), session.userId), 15_000) });
  }
  if (body?.action === "archive") {
    return NextResponse.json({ ok: true, traceId, project: await withStep("projects.PATCH", traceId, "archive project", () => archiveProject(id, session.userId), 15_000) });
  }
  if (body?.action === "duplicate") {
    return NextResponse.json({ ok: true, traceId, project: await withStep("projects.PATCH", traceId, "duplicate project", () => duplicateProject(id, session.userId), 15_000) });
  }
  if (body?.action === "run-qa") {
    return NextResponse.json({ ok: true, traceId, project: await withStep("projects.PATCH", traceId, "run qa", () => runProjectQualityGate(id, session.userId), 30_000) });
  }
  if (body?.action === "save-file") {
    return NextResponse.json({ ok: true, traceId, project: await withStep("projects.PATCH", traceId, "save file", () => saveProjectFile(id, String(body.path || ""), String(body.content || ""), session.userId), 15_000) });
  }

  return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return errorResponse("projects.PATCH", traceId, error, statusForProjectError(error));
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const traceId = createTrace("projects.DELETE");
  try {
  const { session } = await compileTrust(request, { mode: "session" });
  const slug = (await context.params).slug || [];
  if (slug.length !== 1) {
    return NextResponse.json({ ok: false, error: "Backend route not found." }, { status: 404 });
  }

  const projectAccess = await withStep("projects.DELETE", traceId, "verify project ownership", () => requireOwnedProject(slug[0], session), 15_000);
  await withStep("projects.DELETE", traceId, "delete project", () => deleteProject(projectAccess.id), 15_000);
  return NextResponse.json({ ok: true, traceId });
  } catch (error) {
    return errorResponse("projects.DELETE", traceId, error, statusForProjectError(error));
  }
}

async function listOwnedProjects(session: AuthSession) {
  const projects = await listProjects();
  if (session.role === "admin") return projects;

  const owned = await prisma.project.findMany({
    where: {
      OR: [
        { userId: session.userId },
        { user: { email: session.userId } },
      ],
    },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((project) => project.id));
  return projects.filter((project) => ownedIds.has(project.id));
}

async function requireOwnedProject(value: string, session: AuthSession) {
  const project =
    (await prisma.project.findUnique({
      where: { id: value },
      select: { id: true, slug: true, userId: true, user: { select: { email: true } } },
    })) ||
    (await prisma.project.findUnique({
      where: { slug: value },
      select: { id: true, slug: true, userId: true, user: { select: { email: true } } },
    }));

  if (!project) throw new Error("Project not found.");
  assertOwnership(project, session);
  return project;
}

function statusForProjectError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  if (/Project not found/i.test(message)) return 404;
  if (/required|invalid|at least|unclear|too similar/i.test(message)) return 400;
  return 500;
}
