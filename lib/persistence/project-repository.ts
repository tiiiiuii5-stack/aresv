import type { Prisma, PrismaClient } from "@prisma/client";
import type { ProjectArtifact, ProjectRecord } from "@/lib/project-store";
import { getDefaultUserId, isDatabaseConfigured, tryDatabase } from "./database";

export async function listPersistedProjects(): Promise<ProjectRecord[] | null> {
  if (!isDatabaseConfigured()) return null;
  return tryDatabase(async (db) => {
    const rows = await db.project.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        prompt: true,
        title: true,
        slug: true,
        status: true,
        category: true,
        problem: true,
        audience: true,
        uiDirection: true,
        monetization: true,
        features: true,
        onboarding: true,
        record: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return rows.map((row) => hydrateProjectRecord(row));
  });
}

export async function replacePersistedProjects(projects: ProjectRecord[], ownerUserId?: string) {
  if (!isDatabaseConfigured()) return false;
  const userId = ownerUserId ? await ensurePersistedUser(ownerUserId) : await getDefaultUserId();
  if (!userId) return false;

  const result = await tryDatabase(async (db) => {
    const existingOwners = projects.length
      ? await db.project.findMany({
          where: { id: { in: projects.map((project) => project.id) } },
          select: { id: true, userId: true },
        })
      : [];
    const ownerByProjectId = new Map(existingOwners.map((project) => [project.id, project.userId]));

    await db.$transaction(async (tx) => {
      await tx.project.deleteMany({ where: { userId } });
      for (const project of projects) {
        await upsertProjectWithClient(tx, project, ownerByProjectId.get(project.id) || userId);
      }
    });
    return true;
  });

  return Boolean(result);
}

export async function persistProject(project: ProjectRecord, ownerUserId?: string) {
  if (!isDatabaseConfigured()) return false;
  const fallbackUserId = ownerUserId ? await ensurePersistedUser(ownerUserId) : await getDefaultUserId();
  if (!fallbackUserId) return false;

  const result = await tryDatabase(async (db) => {
    const existing = ownerUserId
      ? null
      : await db.project.findUnique({
          where: { id: project.id },
          select: { userId: true },
        });
    await upsertProjectWithClient(db, project, existing?.userId || fallbackUserId);
    return true;
  });

  return Boolean(result);
}

async function ensurePersistedUser(userIdOrEmail: string) {
  const clean = userIdOrEmail.trim();
  if (!clean) return null;

  const result = await tryDatabase(async (db) => {
    const existingById = await db.user.findUnique({
      where: { id: clean },
      select: { id: true },
    });
    if (existingById) return existingById.id;

    const email = clean.includes("@") ? clean : `${clean}@ventureos.local`;
    const existingByEmail = await db.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingByEmail) return existingByEmail.id;

    const user = await db.user.create({
      data: { id: clean, email, plan: "free" },
      select: { id: true },
    });
    return user.id;
  });

  return result ?? null;
}

export async function getPersistedProjectOwner(projectId: string) {
  if (!isDatabaseConfigured()) return null;

  return tryDatabase(async (db) => {
    return db.project.findUnique({
      where: { id: projectId },
      select: { userId: true, user: { select: { email: true } } },
    });
  });
}

export async function getPersistedProjectOwnerByIdOrSlug(value: string) {
  if (!isDatabaseConfigured()) return null;

  return tryDatabase(async (db) => {
    const byId = await db.project.findUnique({
      where: { id: value },
      select: { id: true, slug: true, userId: true, user: { select: { email: true } } },
    });
    if (byId) return byId;

    return db.project.findUnique({
      where: { slug: value },
      select: { id: true, slug: true, userId: true, user: { select: { email: true } } },
    });
  });
}

export async function deletePersistedProject(projectId: string) {
  if (!isDatabaseConfigured()) return false;
  const result = await tryDatabase(async (db) => {
    await db.project.deleteMany({
      where: {
        OR: [{ id: projectId }, { slug: projectId }],
      },
    });
    return true;
  });
  return Boolean(result);
}

export async function getPersistedArtifact(projectId: string): Promise<ProjectArtifact | null> {
  if (!isDatabaseConfigured()) return null;
  return tryDatabase(async (db) => {
    const project = await db.project.findFirst({
      where: {
        OR: [{ id: projectId }, { slug: projectId }],
      },
      select: {
        record: true,
        artifacts: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { content: true },
        },
      },
    });
    if (!project) return null;
    const content = project.artifacts[0]?.content;
    if (content && typeof content === "object" && "kind" in content) return content as ProjectArtifact;
    return buildArtifact(project.record as ProjectRecord);
  });
}

type PersistenceClient = PrismaClient | Prisma.TransactionClient;

async function upsertProjectWithClient(db: PersistenceClient, project: ProjectRecord, userId: string) {
  const createdAt = new Date(project.createdAt);
  const updatedAt = new Date(project.updatedAt);
  const artifact = buildArtifact(project);

  await db.project.upsert({
    where: { id: project.id },
    update: {
      userId,
      prompt: project.prompt,
      title: project.name,
      slug: project.slug,
      status: project.status,
      category: project.category,
      problem: project.problem,
      audience: project.audience,
      uiDirection: project.uiDirection,
      monetization: project.monetization,
      features: project.features as unknown as Prisma.InputJsonValue,
      onboarding: project.onboarding as unknown as Prisma.InputJsonValue,
      record: project as unknown as Prisma.InputJsonValue,
      updatedAt,
    },
    create: {
      id: project.id,
      userId,
      prompt: project.prompt,
      title: project.name,
      slug: project.slug,
      status: project.status,
      category: project.category,
      problem: project.problem,
      audience: project.audience,
      uiDirection: project.uiDirection,
      monetization: project.monetization,
      features: project.features as unknown as Prisma.InputJsonValue,
      onboarding: project.onboarding as unknown as Prisma.InputJsonValue,
      record: project as unknown as Prisma.InputJsonValue,
      createdAt,
      updatedAt,
    },
  });

  await db.generatedApp.upsert({
    where: { id: `${project.id}:app` },
    update: {
      name: project.name,
      slug: project.slug,
      files: project.files as unknown as Prisma.InputJsonValue,
      metadata: { category: project.category, status: project.status },
    },
    create: {
      id: `${project.id}:app`,
      projectId: project.id,
      name: project.name,
      slug: project.slug,
      files: project.files as unknown as Prisma.InputJsonValue,
      metadata: { category: project.category, status: project.status },
    },
  });

  await db.artifact.upsert({
    where: { id: `${project.id}:artifact` },
    update: {
      metadata: artifact.metadata as unknown as Prisma.InputJsonValue,
      content: artifact as unknown as Prisma.InputJsonValue,
      previewUrl: project.qa?.releaseApproved ? `/generated-apps?project=${project.slug}` : null,
    },
    create: {
      id: `${project.id}:artifact`,
      projectId: project.id,
      metadata: artifact.metadata as unknown as Prisma.InputJsonValue,
      content: artifact as unknown as Prisma.InputJsonValue,
      previewUrl: project.qa?.releaseApproved ? `/generated-apps?project=${project.slug}` : null,
    },
  });

  if (project.qa) {
    await db.qAReport.create({
      data: {
        projectId: project.id,
        results: project.qa as unknown as Prisma.InputJsonValue,
        score: project.qa.score,
        issues: (project.qa.issues ?? []) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  await db.projectMemory.upsert({
    where: { projectId: project.id },
    update: {
      context: { prompt: project.prompt, category: project.category },
      decisions: (project.orchestration?.workflow ?? []) as Prisma.InputJsonValue,
      changelog: (project.repairs ?? []) as unknown as Prisma.InputJsonValue,
    },
    create: {
      projectId: project.id,
      context: { prompt: project.prompt, category: project.category },
      decisions: (project.orchestration?.workflow ?? []) as Prisma.InputJsonValue,
      changelog: (project.repairs ?? []) as unknown as Prisma.InputJsonValue,
    },
  });
}

function buildArtifact(project: ProjectRecord): ProjectArtifact {
  return {
    kind: "project-export",
    version: 1,
    generatedAt: new Date().toISOString(),
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug,
      category: project.category,
      status: project.status,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      problem: project.problem,
      audience: project.audience,
      uiDirection: project.uiDirection,
      monetization: project.monetization,
      prompt: project.prompt,
    },
    files: project.files,
    metadata: {
      fileCount: project.files.length,
      featureCount: project.features.length,
      onboardingSteps: project.onboarding.length,
      archived: project.status === "archived",
    },
    launchOS: project.launchOS,
    marketOpportunity: project.marketOpportunity,
    orchestration: project.orchestration,
    qa: project.qa,
  };
}

function hydrateProjectRecord(row: {
  id: string;
  prompt: string;
  title: string;
  slug: string;
  status: string;
  category: string;
  problem: string;
  audience: string;
  uiDirection: string;
  monetization: string;
  features: Prisma.JsonValue;
  onboarding: Prisma.JsonValue;
  record: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}): ProjectRecord {
  const record = isRecord(row.record) ? (row.record as Partial<ProjectRecord>) : {};
  const files = Array.isArray(record.files)
    ? record.files.filter((file): file is ProjectRecord["files"][number] => isRecord(file) && typeof file.path === "string" && typeof file.content === "string")
    : [];

  return {
    ...record,
    id: stringValue(record.id, row.id),
    name: stringValue(record.name, row.title, row.slug, row.id),
    slug: stringValue(record.slug, row.slug, row.id),
    category: stringValue(record.category, row.category, "custom"),
    problem: stringValue(record.problem, row.problem, ""),
    audience: stringValue(record.audience, row.audience, ""),
    uiDirection: stringValue(record.uiDirection, row.uiDirection, ""),
    monetization: stringValue(record.monetization, row.monetization, ""),
    prompt: stringValue(record.prompt, row.prompt, ""),
    status: row.status === "archived" || record.status === "archived" ? "archived" : "ready",
    createdAt: stringValue(record.createdAt, row.createdAt.toISOString()),
    updatedAt: stringValue(record.updatedAt, row.updatedAt.toISOString(), row.createdAt.toISOString()),
    files,
    onboarding: stringArray(record.onboarding, row.onboarding),
    features: stringArray(record.features, row.features),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function stringArray(...values: unknown[]) {
  for (const value of values) {
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}
