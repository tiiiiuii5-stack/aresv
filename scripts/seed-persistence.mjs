import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { config as loadEnv } from "dotenv";
import { readFile } from "node:fs/promises";
import path from "node:path";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.log("DATABASE_URL is not set. Skipping database seed; file store remains the active fallback.");
  process.exit(0);
}

const adapter = new PrismaPg({ connectionString: normalizedDatabaseUrl(databaseUrl) });
const prisma = new PrismaClient({ adapter });
const manifestPath = path.join(process.cwd(), "generated-apps", "manifest.json");

function buildArtifact(project) {
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
    files: project.files || [],
    metadata: {
      fileCount: project.files?.length || 0,
      featureCount: project.features?.length || 0,
      onboardingSteps: project.onboarding?.length || 0,
      archived: project.status === "archived",
    },
    launchOS: project.launchOS,
    marketOpportunity: project.marketOpportunity,
    orchestration: project.orchestration,
    qa: project.qa,
  };
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const user = await prisma.user.upsert({
    where: { email: "owner@ventureos.local" },
    update: {},
    create: { email: "owner@ventureos.local", plan: "founder" },
  });

  for (const project of manifest.projects || []) {
    const artifact = buildArtifact(project);
    await prisma.project.upsert({
      where: { id: project.id },
      update: {
        userId: user.id,
        prompt: project.prompt,
        title: project.name,
        slug: project.slug,
        status: project.status,
        category: project.category,
        problem: project.problem,
        audience: project.audience,
        uiDirection: project.uiDirection,
        monetization: project.monetization,
        features: project.features || [],
        onboarding: project.onboarding || [],
        record: project,
        updatedAt: new Date(project.updatedAt),
      },
      create: {
        id: project.id,
        userId: user.id,
        prompt: project.prompt,
        title: project.name,
        slug: project.slug,
        status: project.status,
        category: project.category,
        problem: project.problem,
        audience: project.audience,
        uiDirection: project.uiDirection,
        monetization: project.monetization,
        features: project.features || [],
        onboarding: project.onboarding || [],
        record: project,
        createdAt: new Date(project.createdAt),
        updatedAt: new Date(project.updatedAt),
      },
    });

    await prisma.generatedApp.upsert({
      where: { id: `${project.id}:app` },
      update: {
        name: project.name,
        slug: project.slug,
        files: project.files || [],
        metadata: { category: project.category, status: project.status },
      },
      create: {
        id: `${project.id}:app`,
        projectId: project.id,
        name: project.name,
        slug: project.slug,
        files: project.files || [],
        metadata: { category: project.category, status: project.status },
      },
    });

    await prisma.artifact.upsert({
      where: { id: `${project.id}:artifact` },
      update: { metadata: artifact.metadata, content: artifact },
      create: {
        id: `${project.id}:artifact`,
        projectId: project.id,
        metadata: artifact.metadata,
        content: artifact,
      },
    });
  }

  console.log(`Seeded ${manifest.projects?.length || 0} projects into persistent storage.`);
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

function normalizedDatabaseUrl(value) {
  const url = new URL(value);
  if (url.searchParams.get("sslmode") === "require") {
    url.searchParams.set("sslmode", "verify-full");
  }
  return url.toString();
}
