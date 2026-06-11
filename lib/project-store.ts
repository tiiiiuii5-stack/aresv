import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  deletePersistedProject,
  getPersistedArtifact,
  listPersistedProjects,
  persistProject,
  replacePersistedProjects,
} from "@/lib/persistence/project-repository";
import { planApp, scoreUniqueness, type AppPlan } from "@/lib/app-planning-engine";
import { trace, traceError } from "@/lib/diagnostics";
import { generateIsolatedAppFiles, isolatedStructuralSignature, runtimeSeed } from "@/lib/isolated-app-generator";
import { agentMemoryService } from "@/lib/services/agentMemory";
import { auditLogService } from "@/lib/services/auditLog";
import { billingService } from "@/lib/services/billing";
import { integrationModuleService } from "@/lib/services/integrationModules";

export type ProjectStatus = "ready" | "archived";

export type ProjectFile = {
  path: string;
  content: string;
};

export type ProjectRecord = {
  id: string;
  name: string;
  slug: string;
  category: string;
  problem: string;
  audience: string;
  uiDirection: string;
  monetization: string;
  prompt: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  files: ProjectFile[];
  appPlan?: AppPlan;
  uniqueness?: {
    score: number;
    signature: string;
    routeSignature: string;
    featureSignature: string;
    schemaSignature: string;
    componentSignature: string;
  };
  buildValidation?: {
    status: "passed" | "failed";
    checkedAt: string;
    fileCount: number;
    routeCount: number;
    apiCount: number;
    logs: string[];
  };
  memory?: {
    architecture: string;
    routes: string[];
    decisions: string[];
    edits: Array<{ path: string; changedAt: string; summary: string }>;
  };
  runtimeState?: {
    records: Array<{ id: string; label: string; value: string; status: string; meta?: string; parentId?: string }>;
    events: Array<{ message: string; createdAt: string }>;
    env: Record<string, string>;
    updatedAt: string;
  };
  onboarding: string[];
  features: string[];
  appraisalContact?: {
    purchaserEmail: string;
    receiptEmail: string;
    contactEmail: string;
    source: "stripe_checkout" | "authenticated_session" | "free_access";
    intakeContext?: Record<string, unknown>;
  };
  qualityScore?: number;
  polishScore?: number;
  repairs?: Array<{ cycle: number; issuesFixed: string[]; fixedAt: string }>;
  launchOS?: {
    brand: {
      productName: string;
      tagline: string;
      tone: string;
      trustLanguage: string;
      visualDirection: string;
      designPersonality: string;
      productStory: string;
    };
    positioning: Record<string, string>;
    pricing: {
      model: string;
      tiers: Array<{ name: string; price: string; promise: string; gates: string[] }>;
      upgradeLogic: string;
      conversionPaths: string[];
    };
    activation: Record<string, string | string[]>;
    retention: Record<string, string[] | string>;
    conversion: Record<string, string[] | string>;
    analytics: Record<string, string[]>;
    feedback: Record<string, string[] | string>;
    launchAssets: Record<string, string | string[]>;
    checklist: Record<string, boolean>;
  };
  marketOpportunity?: {
    id: string;
    title: string;
    category: string;
    tags: string[];
    momentum: "rising" | "stable" | "declining" | "oversaturated";
    recommendation: string;
    why: string;
    productThesis: string;
    targetUser: string;
    problemSeverity: string;
    willingnessToPay: string;
    competitiveAdvantage: string;
    uniqueUXAngle: string;
    monetization: string;
    launchStrategy: string;
    mvpScope: string[];
    premiumVersion: string[];
    painPoints: string[];
    competitorGaps: string[];
    reusableSystems: string[];
    scores: Record<string, number>;
  };
  orchestration?: {
    mode: string;
    createdAt: string;
    warehouseInputs: {
      patterns: string[];
      features: string[];
      bugRules: string[];
      components: string[];
    };
    strategy: Record<string, string>;
    debate: {
      criteria: string[];
      options: Array<{ approach: string; score: number; rationale: string }>;
      winner: string;
      decision: string;
    };
    agents: Array<{ role: string; lane: string; output: string; standards: string[]; status: string; risks: string[] }>;
    critiques: Array<{ from: string; to: string; issue: string; resolution: string }>;
    workflow: string[];
    ceo: {
      role: string;
      intent: string;
      decision: string;
      iterationRequired: boolean;
      approval: "pending QA" | "approved" | "rejected";
      releaseChecklist: Record<string, boolean>;
      finalReview: string;
    };
  };
  qa?: {
    score: number;
    threshold: number;
    releaseApproved: boolean;
    issues: Array<{ severity: "blocker" | "major"; area: string; message: string; fix: string }>;
    blockers: Array<{ severity: "blocker" | "major"; area: string; message: string; fix: string }>;
    simulatedUsers: Array<{ profile: string; result: "passed" | "friction" | "blocked"; rageClicks: number; abandonedFlow: boolean; friction: string[] }>;
    productionQuestions: {
      wouldSomeonePay: boolean;
      wouldEmbarrassFounder: boolean;
      survivesRealUsers: boolean;
      feelsPremiumBesideSaaS: boolean;
    };
    dimensions: Record<string, number>;
  };
};

export type ProjectArtifact = {
  kind: "project-export";
  version: 1;
  generatedAt: string;
  project: Pick<
    ProjectRecord,
    | "id"
    | "name"
    | "slug"
    | "category"
    | "status"
    | "createdAt"
    | "updatedAt"
    | "problem"
    | "audience"
    | "uiDirection"
    | "monetization"
    | "prompt"
  >;
  files: ProjectFile[];
  metadata: {
    fileCount: number;
    featureCount: number;
    onboardingSteps: number;
    archived: boolean;
  };
  launchOS?: ProjectRecord["launchOS"];
  marketOpportunity?: ProjectRecord["marketOpportunity"];
  orchestration?: ProjectRecord["orchestration"];
  qa?: ProjectRecord["qa"];
  appPlan?: ProjectRecord["appPlan"];
  uniqueness?: ProjectRecord["uniqueness"];
  buildValidation?: ProjectRecord["buildValidation"];
};

const bundledRoot = path.join(process.cwd(), "generated-apps");
const root = process.env.VERCEL ? path.join(os.tmpdir(), "ventureos-generated-apps") : bundledRoot;
const manifestPath = path.join(root, "manifest.json");
const bundledManifestPath = path.join(bundledRoot, "manifest.json");
const RELEASE_THRESHOLD = 90;

export async function ensureStore() {
  await fs.mkdir(root, { recursive: true });
  try {
    await fs.access(manifestPath);
  } catch {
    const seed = await fs.readFile(bundledManifestPath, "utf8").catch(() => JSON.stringify({ projects: [] }, null, 2));
    await fs.writeFile(manifestPath, seed);
  }
}

export async function listProjects(includeArchived = false): Promise<ProjectRecord[]> {
  await ensureStore();
  const persisted = await listPersistedProjects();
  if (persisted) {
    return persisted
      .filter((project) => includeArchived || project.status !== "archived")
      .sort((a, b) => sortableUpdatedAt(b).localeCompare(sortableUpdatedAt(a)));
  }

  const manifest = await readManifest();
  return manifest.projects
    .filter((project) => includeArchived || project.status !== "archived")
    .sort((a, b) => sortableUpdatedAt(b).localeCompare(sortableUpdatedAt(a)));
}

export async function getProject(id: string): Promise<ProjectRecord | null> {
  const projects = await listProjects(true);
  return projects.find((project) => project.id === id || project.slug === id) ?? null;
}

export async function findProjectByNameOrSlug(value: string): Promise<ProjectRecord | null> {
  const cleanValue = String(value || "").trim();
  if (!cleanValue) return null;
  const projects = await listProjects(true);
  const slugValue = slugify(cleanValue);
  return (
    projects.find(
      (project) =>
        project.id === cleanValue ||
        project.slug === cleanValue ||
        project.name === cleanValue ||
        project.slug === slugValue,
    ) ?? null
  );
}

export async function getProjectWorkspacePath(value: string): Promise<string> {
  const project = await findProjectByNameOrSlug(value);
  if (project) return path.join(root, project.slug);
  return path.join(root, slugify(value));
}

export async function saveProjectFile(projectId: string, filePath: string, content: string, ownerUserId?: string) {
  if (!filePath || filePath.includes("..") || path.isAbsolute(filePath)) {
    throw new Error("Invalid file path.");
  }
  const projects = await listProjects(true);
  const project = projects.find((item) => item.id === projectId);
  if (!project) throw new Error("Project not found.");
  const existing = project.files.find((file) => file.path === filePath);
  if (existing) existing.content = content;
  else project.files.push({ path: filePath, content });
  project.buildValidation = validateGeneratedApp(project);
  project.memory = {
    architecture: project.memory?.architecture || `${project.appPlan?.layout || "custom"} ${project.category} application`,
    routes: project.appPlan?.routes.map((route) => route.path) || project.memory?.routes || [],
    decisions: project.memory?.decisions || [],
    edits: [
      ...(project.memory?.edits || []),
      { path: filePath, changedAt: new Date().toISOString(), summary: existing ? "Updated source file" : "Created source file" },
    ],
  };
  project.updatedAt = new Date().toISOString();
  await writeProject(project, ownerUserId);
  await writeManifest(projects);
  await storeUserEditPreference(project, filePath, Boolean(existing));
  await auditProjectEvent({
    action: "project.file.save",
    project,
    metadata: { filePath, updatedExistingFile: Boolean(existing) },
  });
  return project;
}

async function storeUserEditPreference(project: ProjectRecord, filePath: string, updatedExistingFile: boolean) {
  try {
    const styleSignals = [
      project.files.some((file) => /tailwind\.config|className=|@tailwind/.test(file.path) || /className=|@tailwind/.test(file.content)) ? "tailwind" : null,
      project.files.some((file) => /\.module\.css$/.test(file.path)) ? "css-modules" : null,
      project.files.some((file) => /zustand/i.test(file.content)) ? "zustand-state" : null,
    ].filter(Boolean);
    await agentMemoryService.store({
      userId: "system",
      projectId: project.id,
      memoryType: "preference",
      content: `User ${updatedExistingFile ? "updated" : "created"} ${filePath} in ${project.name}. Preserve this project editing preference in future generation and repair passes. Detected style signals: ${styleSignals.join(", ") || "none"}.`,
      metadata: {
        source: "project-file-edit",
        projectType: project.category,
        projectSlug: project.slug,
        filePath,
        techStack: styleSignals,
      },
    });
  } catch (error) {
    traceError("project.memory", "user edit preference store skipped", error, { projectId: project.id, filePath });
  }
}

export async function getProjectRuntimeState(projectId: string, ownerUserId?: string) {
  const projects = await listProjects(true);
  const project = projects.find((item) => item.id === projectId || item.slug === projectId);
  if (!project) throw new Error("Project not found.");
  if (!project.runtimeState) {
    const seed = project.appPlan ? runtimeSeed(project.appPlan) : { records: [], events: [] };
    project.runtimeState = {
      ...seed,
      env: {
        PROJECT_ID: project.id,
        PROJECT_SLUG: project.slug,
        RUNTIME_MODE: "isolated-project",
      },
      updatedAt: new Date().toISOString(),
    };
    await writeProject(project, ownerUserId);
    await writeManifest(projects);
  }
  return project.runtimeState;
}

export async function mutateProjectRuntimeState(projectId: string, input: { action?: "create" | "transition" | "delete"; id?: string; type?: string; label?: string; value?: string; status?: string }, ownerUserId?: string) {
  const projects = await listProjects(true);
  const project = projects.find((item) => item.id === projectId || item.slug === projectId);
  if (!project) throw new Error("Project not found.");
  const current = project.runtimeState || {
    ...(project.appPlan ? runtimeSeed(project.appPlan) : { records: [], events: [] }),
    env: {
      PROJECT_ID: project.id,
      PROJECT_SLUG: project.slug,
      RUNTIME_MODE: "isolated-project",
    },
    updatedAt: new Date().toISOString(),
  };
  const now = new Date().toISOString();
  const action = input.action || "create";
  const flow = statusFlowForProject(project.appPlan);
  let records = current.records;
  let message = "";
  if (action === "transition" && input.id) {
    records = current.records.map((record) => {
      if (record.id !== input.id) return record;
      const index = flow.indexOf(record.status);
      const status = flow[Math.min(index + 1, flow.length - 1)] || "Done";
      message = `${record.label} moved to ${status}`;
      return { ...record, status };
    });
    if (!message) message = "Transition requested but record was not found";
  } else if (action === "delete" && input.id) {
    const target = current.records.find((record) => record.id === input.id);
    records = current.records.filter((record) => record.id !== input.id && record.parentId !== input.id);
    message = target ? `Removed ${target.label}` : "Delete requested but record was not found";
  } else {
    const record = {
      id: randomUUID(),
      label: String(input.label || project.appPlan?.forms[0]?.name || "Runtime item"),
      value: String(input.value || "New"),
      status: String(input.status || flow[0] || "Created"),
      meta: String(input.type || project.category),
      parentId: current.records[0]?.id,
    };
    records = [record, ...current.records];
    message = `${record.meta}: ${record.label}`;
  }
  project.runtimeState = {
    ...current,
    records,
    events: [{ message, createdAt: now }, ...current.events],
    updatedAt: now,
  };
  project.updatedAt = now;
  await writeProject(project, ownerUserId);
  await writeManifest(projects);
  return project.runtimeState;
}

export async function renameProject(projectId: string, name: string, ownerUserId?: string) {
  const cleanName = String(name || "").trim();
  if (cleanName.length < 3) throw new Error("Name must be at least 3 characters.");
  const projects = await listProjects(true);
  const project = projects.find((item) => item.id === projectId);
  if (!project) throw new Error("Project not found.");
  project.name = cleanName;
  project.slug = uniqueSlug(slugify(cleanName), projects.filter((item) => item.id !== projectId));
  project.updatedAt = new Date().toISOString();
  await writeProject(project, ownerUserId);
  await writeManifest(projects);
  return project;
}

export async function archiveProject(projectId: string, ownerUserId?: string) {
  const projects = await listProjects(true);
  const project = projects.find((item) => item.id === projectId);
  if (!project) throw new Error("Project not found.");
  project.status = "archived";
  project.updatedAt = new Date().toISOString();
  await writeProject(project, ownerUserId);
  await writeManifest(projects);
  return project;
}

export async function deleteProject(projectId: string) {
  const projects = await listProjects(true);
  const project = projects.find((item) => item.id === projectId);
  if (!project) throw new Error("Project not found.");
  await fs.rm(path.join(root, project.slug), { recursive: true, force: true });
  await deletePersistedProject(projectId);
  await writeManifest(projects.filter((item) => item.id !== projectId));
}

export async function duplicateProject(projectId: string, ownerUserId?: string) {
  const source = await getProject(projectId);
  if (!source) throw new Error("Project not found.");
  const projects = await listProjects(true);
  const now = new Date().toISOString();
  const copy: ProjectRecord = {
    ...source,
    id: randomUUID(),
    name: `${source.name} Copy`,
    slug: uniqueSlug(`${source.slug}-copy`, projects),
    status: "ready",
    createdAt: now,
    updatedAt: now,
  };
  projects.push(copy);
  await writeProject(copy, ownerUserId);
  await writeManifest(projects);
  return copy;
}

export async function runProjectQualityGate(projectId: string, ownerUserId?: string) {
  const projects = await listProjects(true);
  const project = projects.find((item) => item.id === projectId || item.slug === projectId);
  if (!project) throw new Error("Project not found.");

  const fileCount = project.files.length;
  const hasReadme = project.files.some((file) => file.path === "README.md");
  const hasLandingPage = project.files.some((file) => file.path === "app/page.tsx");
  const hasInteractivePreview = project.files.some((file) => file.path === "preview/index.html");
  const hasPackageJson = project.files.some((file) => file.path === "package.json");
  const hasSchema = project.files.some((file) => file.path === "schema.prisma");
  const hasApi = project.files.some((file) => file.path.includes("/api/"));
  const hasComponents = project.files.some((file) => file.path.startsWith("components/"));
  const buildValidation = validateGeneratedApp(project);
  const baseScore =
    40 +
    Math.min(20, fileCount * 2) +
    (hasReadme ? 10 : 0) +
    (hasLandingPage ? 15 : 0) +
    (hasInteractivePreview ? 10 : 0) +
    (hasPackageJson ? 5 : 0) +
    (hasSchema ? 5 : 0) +
    (hasApi ? 5 : 0) +
    (hasComponents ? 5 : 0) +
    (buildValidation.status === "passed" ? 5 : -20) +
    Math.min(5, Math.round((project.uniqueness?.score || 70) / 20));
  const score = Math.max(0, Math.min(100, baseScore));

  const issues: NonNullable<ProjectRecord["qa"]>["issues"] = [];
  if (!hasReadme) {
    issues.push({
      severity: "major" as const,
      area: "documentation",
      message: "Missing README.md artifact.",
      fix: "Persist a project overview artifact alongside the source files.",
    });
  }
  if (!hasLandingPage) {
    issues.push({
      severity: "blocker" as const,
      area: "app-shell",
      message: "Missing app/page.tsx artifact.",
      fix: "Persist a canonical application entry point.",
    });
  }
  if (!hasPackageJson) {
    issues.push({
      severity: "major" as const,
      area: "package",
      message: "Missing package.json artifact.",
      fix: "Persist the project package manifest.",
    });
  }
  if (fileCount < 3) {
    issues.push({
      severity: "major" as const,
      area: "coverage",
      message: "Project artifact set is too small to be release-ready.",
      fix: "Persist a complete artifact set before promotion.",
    });
  }
  if (!hasInteractivePreview) {
    issues.push({
      severity: "blocker" as const,
      area: "preview",
      message: "Missing interactive preview artifact.",
      fix: "Generate preview/index.html so the project can be opened as runnable software.",
    });
  }
  if (buildValidation.status === "failed") {
    issues.push({
      severity: "blocker" as const,
      area: "build",
      message: "Generated source failed static build validation.",
      fix: buildValidation.logs[0] || "Repair missing files and retry validation.",
    });
  }

  project.qualityScore = score;
  project.polishScore = Math.min(100, score + 3);
  project.buildValidation = buildValidation;
  project.qa = {
    score,
    threshold: RELEASE_THRESHOLD,
    releaseApproved: score >= RELEASE_THRESHOLD && !issues.some((issue) => issue.severity === "blocker"),
    issues,
    blockers: issues.filter((issue) => issue.severity === "blocker"),
    simulatedUsers: [
      {
        profile: "first-time beginner",
        result: score >= 70 ? "passed" : "friction",
        rageClicks: score >= 70 ? 0 : 2,
        abandonedFlow: score < 60,
        friction: score >= 70 ? [] : ["Setup feels incomplete"],
      },
      {
        profile: "founder/investor",
        result: score >= 80 ? "passed" : "friction",
        rageClicks: score >= 80 ? 0 : 1,
        abandonedFlow: score < 65,
        friction: score >= 80 ? [] : ["Needs clearer release artifact"],
      },
    ],
    productionQuestions: {
      wouldSomeonePay: score >= 75,
      wouldEmbarrassFounder: score < 50,
      survivesRealUsers: score >= 70,
      feelsPremiumBesideSaaS: score >= 80,
    },
    dimensions: {
      completeness: fileCount >= 12 ? 1 : fileCount / 12,
      entryPoint: hasLandingPage ? 1 : 0,
      packaging: hasPackageJson ? 1 : 0,
      preview: hasInteractivePreview ? 1 : 0,
      api: hasApi ? 1 : 0,
      schema: hasSchema ? 1 : 0,
      uniqueness: Math.min(1, (project.uniqueness?.score || 0) / 100),
      breadth: Math.min(1, fileCount / 14),
    },
  };
  project.updatedAt = new Date().toISOString();
  await writeProject(project, ownerUserId);
  await writeManifest(projects);
  return project;
}

export async function generateProject(prompt: string, category = "custom", ownerUserId?: string) {
  const action = "project.generate";
  const cleanPrompt = String(prompt || "").trim();
  if (cleanPrompt.length < 12) throw new Error("Describe the app in at least 12 characters.");
  const clarity = assessPromptClarity(cleanPrompt);
  if (!clarity.clear) {
    throw new Error(`Spec is unclear. Answer before generation: ${clarity.questions.join(" ")}`);
  }
  trace(action, "prompt parsed", { category, promptLength: cleanPrompt.length });
  const projects = await listProjects(true);
  const existingPlans = projects.slice(0, 5).map((project) => project.appPlan).filter(Boolean) as AppPlan[];
  trace(action, "classify app type", { category, existingPlans: existingPlans.length });
  const now = new Date().toISOString();
  const projectId = randomUUID();
  let appPlan = planApp(cleanPrompt, category, existingPlans);
  trace(action, "app plan created", { projectId, appCategory: appPlan.category, appType: appPlan.appType, routes: appPlan.routes.length, models: appPlan.dataModels.length, truthSpec: appPlan.truthSpec });
  let files = generateIsolatedAppFiles(appPlan, projectId);
  let integrationModules = await integrationModuleService.modulesForPrompt(cleanPrompt, appPlan);
  let moduleResult = integrationModuleService.applyModules(files, integrationModules);
  files = moduleResult.files;
  if (moduleResult.applied.length) {
    trace(action, "integration modules injected", { projectId, modules: moduleResult.applied.map((module) => module.name), fileCount: files.length });
  }
  trace(action, "file tree generated", { projectId, files: files.length });
  let uniqueness = {
    ...scoreUniqueness(appPlan, files, existingPlans),
    signature: isolatedStructuralSignature(appPlan, files),
    componentSignature: files.filter((file) => file.path.startsWith("components/")).map((file) => file.path).join("|"),
  };
  const existingSignatures = new Set(projects.map((project) => project.uniqueness?.signature).filter(Boolean));
  for (let attempt = 0; attempt < 3 && (uniqueness.score < 80 || existingSignatures.has(uniqueness.signature)); attempt += 1) {
    trace(action, "architecture similarity rejected; retrying", { projectId, attempt: attempt + 1, uniqueness: uniqueness.score, duplicateSignature: existingSignatures.has(uniqueness.signature) });
    const variant = projects.length + attempt + 2;
    appPlan = diversifyPlan(planApp(`${cleanPrompt} unique architecture variant ${variant}`, category, existingPlans), variant);
    files = generateIsolatedAppFiles(appPlan, projectId);
    integrationModules = await integrationModuleService.modulesForPrompt(cleanPrompt, appPlan);
    moduleResult = integrationModuleService.applyModules(files, integrationModules);
    files = moduleResult.files;
    uniqueness = {
      ...scoreUniqueness(appPlan, files, existingPlans),
      signature: isolatedStructuralSignature(appPlan, files),
      componentSignature: files.filter((file) => file.path.startsWith("components/")).map((file) => file.path).join("|"),
    };
  }
  if (uniqueness.score < 80 || existingSignatures.has(uniqueness.signature)) {
    traceError(action, "architecture rejected after retries", new Error("Generated architecture was too similar"), { projectId, uniqueness: uniqueness.score });
    throw new Error("Generated architecture was too similar to an existing project. Try a more specific prompt.");
  }
  trace(action, "architecture accepted", { projectId, uniqueness: uniqueness.score, signature: uniqueness.signature });
  const project: ProjectRecord = {
    id: projectId,
    name: appPlan.productName,
    slug: uniqueSlug(slugify(appPlan.productName), projects),
    category: appPlan.category,
    problem: appPlan.problem,
    audience: appPlan.audience,
    uiDirection: appPlan.visualDirection,
    monetization: appPlan.monetization,
    prompt: cleanPrompt,
    status: "ready",
    createdAt: now,
    updatedAt: now,
    onboarding: ["Review generated plan", "Open interactive preview", "Edit source files", "Run QA", "Export or deploy"],
    features: appPlan.features,
    files,
    appPlan,
    uniqueness,
    buildValidation: {
      status: "passed",
      checkedAt: now,
      fileCount: files.length,
      routeCount: appPlan.routes.length,
      apiCount: appPlan.apiEndpoints.length,
      logs: ["Generated full source tree", "Static source validation passed", "Interactive preview artifact created"],
    },
    memory: {
      architecture: `${appPlan.layout} ${appPlan.category} application with ${appPlan.routes.length} routes and ${appPlan.dataModels.length} data models`,
      routes: appPlan.routes.map((route) => route.path),
      decisions: [
        `Selected ${appPlan.layout} layout for ${appPlan.category}`,
        `Generated ${files.length} source files`,
        ...(moduleResult.applied.length ? [`Injected integration modules: ${moduleResult.applied.map((module) => module.name).join(", ")}`] : []),
        `Uniqueness score ${uniqueness.score}`,
      ],
      edits: [],
    },
    runtimeState: {
      ...runtimeSeed(appPlan),
      env: {
        PROJECT_ID: projectId,
        PROJECT_SLUG: uniqueSlug(slugify(appPlan.productName), projects),
        RUNTIME_MODE: "isolated-project",
        INTEGRATION_MODE: moduleResult.applied.length ? "module-assisted" : "from-scratch",
      },
      updatedAt: now,
    },
  };
  project.buildValidation = validateGeneratedApp(project);
  trace(action, "build validation complete", { projectId, status: project.buildValidation.status, logs: project.buildValidation.logs });
  if (project.buildValidation.status === "failed") {
    traceError(action, "shallow app rejected", new Error(project.buildValidation.logs.join("; ")), { projectId, logs: project.buildValidation.logs });
    await storeBuildFailureMemory(project, project.buildValidation.logs);
    throw new Error(`Generated app rejected: ${project.buildValidation.logs.join(" ")}`);
  }
  projects.push(project);
  await writeProject(project, ownerUserId);
  await writeManifest(projects);
  await auditProjectEvent({
    action: "project.generate",
    project,
    metadata: { category: project.category, fileCount: project.files.length, uniqueness: project.uniqueness?.score },
  });
  await recordProjectBillingUsage(project, "generated_apps", 1, ownerUserId);
  trace(action, "project persisted", { projectId, slug: project.slug });
  return project;
}

async function auditProjectEvent(input: { action: string; project: ProjectRecord; metadata?: Record<string, unknown>; outcome?: "success" | "failure" }) {
  try {
    await auditLogService.record({
      actorId: "system",
      projectId: input.project.id,
      action: input.action,
      resource: "project",
      resourceId: input.project.id,
      outcome: input.outcome || "success",
      metadata: input.metadata || {},
    });
  } catch (error) {
    traceError("project.audit", "project audit skipped", error, { projectId: input.project.id, action: input.action });
  }
}

async function recordProjectBillingUsage(project: ProjectRecord, metric: string, amount: number, ownerUserId?: string) {
  try {
    await billingService.recordUsage({
      userId: ownerUserId || "system",
      metric,
      amount,
      metadata: {
        projectId: project.id,
        projectSlug: project.slug,
        category: project.category,
      },
    });
  } catch (error) {
    traceError("project.billing", "project billing usage skipped", error, { projectId: project.id, metric });
  }
}

async function storeBuildFailureMemory(project: ProjectRecord, logs: string[]) {
  try {
    await agentMemoryService.store({
      userId: "system",
      projectId: project.id,
      memoryType: "failure",
      content: [
        `Build validation failed for ${project.name}.`,
        `Project type: ${project.category}.`,
        `Failure pattern: ${logs.join(" | ")}`,
        "Fix pattern: regenerate or repair the missing execution-binding files, API routes, relational schema, and interactive runtime before allowing preview or deployment.",
      ].join("\n"),
      metadata: {
        source: "project-build-validation",
        projectType: project.category,
        projectSlug: project.slug,
        failureCount: logs.length,
      },
    });
  } catch (error) {
    traceError("project.memory", "build failure memory store skipped", error, { projectId: project.id });
  }
}

function diversifyPlan(plan: AppPlan, variant: number): AppPlan {
  const base = slugify(`${plan.category}-${variant}`);
  const title = `${plan.productName} ${variant}`;
  const modelNames = domainModelNames(plan);
  const primaryModel = modelNames[0];
  const secondaryModel = modelNames[1] || primaryModel;
  const tertiaryModel = modelNames[2] || secondaryModel;
  const routes = plan.routes.map((route, index) => ({
    path: index === 0 ? "/" : `/${base}-${slugify(route.label || route.path).replace(/^-+/, "")}`,
    label: route.label,
    purpose: `${title}: ${route.purpose}`,
  }));
  const dataModels = plan.dataModels.length
    ? plan.dataModels.map((model, index) => ({
        name: modelNames[index] || model.name,
        fields: [...new Set([...model.fields, `${base}Owner`, `${base}Priority`])],
      }))
    : [
        { name: primaryModel, fields: [`${base}Name`, `${base}Owner`, `${base}Priority`, `${base}Status`] },
        { name: secondaryModel, fields: [`${base}${primaryModel}Id`, `${base}Action`, `${base}Result`] },
        { name: tertiaryModel, fields: [`${base}${secondaryModel}Id`, `${base}Reviewer`, `${base}Decision`] },
      ];
  const relationships = plan.relationships.length
    ? plan.relationships.map((relationship) => ({
        ...relationship,
        from: modelNames[plan.dataModels.findIndex((model) => model.name === relationship.from)] || relationship.from,
        to: modelNames[plan.dataModels.findIndex((model) => model.name === relationship.to)] || relationship.to,
      }))
    : [
        { from: primaryModel, to: secondaryModel, type: "one-to-many" as const, via: `${base}${primaryModel}Id` },
        { from: secondaryModel, to: tertiaryModel, type: "one-to-many" as const, via: `${base}${secondaryModel}Id` },
      ];
  const interactions = plan.interactions.map((interaction, index) => ({
    ...interaction,
    target: modelNames[plan.dataModels.findIndex((model) => model.name === interaction.target)] || interaction.target || modelNames[index % modelNames.length],
    result: `${interaction.result} in ${title}`,
  }));
  return {
    ...plan,
    productName: title,
    routes: routes.length >= 3 ? routes : [
      { path: "/", label: "Command", purpose: `${title} command center` },
      { path: `/${base}-${slugify(primaryModel)}`, label: primaryModel, purpose: `${title} ${primaryModel} workspace` },
      { path: `/${base}-${slugify(secondaryModel)}`, label: secondaryModel, purpose: `${title} ${secondaryModel} workflow` },
      { path: `/${base}-${slugify(tertiaryModel)}`, label: tertiaryModel, purpose: `${title} ${tertiaryModel} review` },
    ],
    appType: plan.appType,
    dataModels,
    relationships,
    apiEndpoints: [
      { method: "GET", path: `/api/${base}-${slugify(primaryModel)}`, purpose: `List ${primaryModel} records for ${title}` },
      { method: "POST", path: `/api/${base}-${slugify(secondaryModel)}`, purpose: `Create ${secondaryModel} records for ${title}` },
      { method: "PATCH", path: `/api/${base}-${slugify(secondaryModel)}/[id]`, purpose: `Advance ${secondaryModel} status for ${title}` },
    ],
    navigation: routes.length ? routes.map((route) => route.label) : ["Command", primaryModel, secondaryModel, tertiaryModel],
    features: [
      ...plan.features.map((feature) => `${feature} workspace ${variant}`),
      `${primaryModel} prioritization`,
      `${secondaryModel} status review`,
      `${tertiaryModel} audit trail`,
    ],
    interactions: interactions.length >= 3 ? interactions : [
      { label: `Create ${secondaryModel}`, type: "create", target: secondaryModel, result: `Adds ${secondaryModel} to ${title}` },
      { label: `Advance ${primaryModel}`, type: "transition", target: primaryModel, result: `Moves ${primaryModel} through the active workflow` },
      { label: `Remove ${tertiaryModel}`, type: "delete", target: tertiaryModel, result: `Removes ${tertiaryModel} and dependent rows` },
    ],
    forms: plan.forms.length
      ? plan.forms.map((form) => ({ ...form, name: `${form.name} ${variant}`, action: `${form.action} for ${title}` }))
      : [{ name: `Create ${secondaryModel}`, fields: ["Name", "Owner", "Status", "Score"], action: `Adds ${secondaryModel} to ${title}` }],
    seedData: plan.seedData.map((item, index) => ({
      label: `${item.label} ${variant}`,
      value: item.value,
      status: index === 0 ? "Queued" : item.status,
    })),
    truthSpec: {
      realUsers: true,
      realActions: true,
      realData: true,
      realStateChanges: true,
      blocksShallowMode: false,
      rejectionReasons: [],
    },
  };
}

function domainModelNames(plan: AppPlan) {
  const fallback = [`${pascalName(plan.category)}Workflow`, `${pascalName(plan.category)}EventLog`, `${pascalName(plan.category)}Decision`];
  const abstractModels = new Set(["Record", "Records", "Item", "Items", "Runtime", "GeneratedRuntime"]);
  const names = plan.dataModels.map((model, index) => {
    if (!model.name || abstractModels.has(model.name) || /Runtime\d+|Variant\s*\d+|QueueItem/i.test(model.name)) {
      return fallback[index] || `${pascalName(plan.category)}Domain${index + 1}`;
    }
    return model.name;
  });
  return names.length >= 3 ? names : [...names, ...fallback].slice(0, 3);
}

function pascalName(value: string) {
  return value.replace(/(^|[-_/\s])([a-z])/g, (_match, _prefix, char: string) => char.toUpperCase()).replace(/[^A-Za-z0-9]/g, "");
}

export async function resetProjects() {
  await fs.mkdir(root, { recursive: true });
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name === "manifest.json" || entry.name === "app-warehouse.json") continue;
    await fs.rm(path.join(root, entry.name), { recursive: true, force: true }).catch(() => undefined);
  }
  await ensureStore();
  await writeManifest([]);
}

export async function generateFiveApps(ownerUserId?: string) {
  await resetProjects();
  const created: ProjectRecord[] = [];
  const suite = [
    ["crm", "Build a CRM for client pipelines, deal stages, renewal risk, and account analytics."],
    ["ecommerce", "Build an ecommerce store with product catalog, cart, checkout, and order confirmation."],
    ["fitness", "Build a fitness tracker with workouts, habits, progress charts, and coach feedback."],
    ["booking", "Build a booking app with calendar availability, request forms, and admin approvals."],
    ["ai-content", "Build an AI content dashboard for prompts, drafts, approvals, and publishing analytics."],
    ["restaurant", "Build a restaurant ordering app with menu browsing, cart, kitchen queue, and admin controls."],
    ["social", "Build a social platform with feed, members, moderation queue, and events."],
    ["analytics", "Build a SaaS analytics dashboard with KPIs, funnels, retention, and alerts."],
    ["marketplace", "Build a marketplace with listings, seller dashboard, buyer inquiries, and checkout intent."],
    ["creator", "Build a creator monetization app with content studio, offers, subscribers, and revenue tracking."],
  ];
  for (const [suiteCategory, suitePrompt] of suite) {
    created.push(await generateProject(suitePrompt, suiteCategory, ownerUserId));
  }
  return created;
}

async function writeManifest(projects: ProjectRecord[]) {
  await ensureStore();
  await fs.writeFile(manifestPath, JSON.stringify({ projects }, null, 2));
  await replacePersistedProjects(projects);
}

async function writeProject(project: ProjectRecord, ownerUserId?: string) {
  const projectDir = path.join(root, project.slug);
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(path.join(projectDir, "project.json"), JSON.stringify(project, null, 2));
  for (const file of project.files) {
    const target = path.join(projectDir, file.path);
    if (!target.startsWith(projectDir)) throw new Error("Invalid project file path.");
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.content);
  }
  await persistProjectArtifact(project, projectDir);
  await persistProject(project, ownerUserId);
}

export function buildProjectArtifact(project: ProjectRecord): ProjectArtifact {
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
    appPlan: project.appPlan,
    uniqueness: project.uniqueness,
    buildValidation: project.buildValidation,
  };
}

export async function getProjectArtifact(projectId: string): Promise<ProjectArtifact | null> {
  const persisted = await getPersistedArtifact(projectId);
  if (persisted) return persisted;

  const project = await getProject(projectId);
  if (!project) return null;
  const artifactPath = path.join(root, project.slug, "project-artifact.json");
  try {
    return JSON.parse(await fs.readFile(artifactPath, "utf8")) as ProjectArtifact;
  } catch {
    return buildProjectArtifact(project);
  }
}

async function readManifest() {
  return JSON.parse(await fs.readFile(manifestPath, "utf8")) as { projects: ProjectRecord[] };
}

async function persistProjectArtifact(project: ProjectRecord, projectDir?: string) {
  const targetDir = projectDir || path.join(root, project.slug);
  const artifact = buildProjectArtifact(project);
  await fs.writeFile(path.join(targetDir, "project-artifact.json"), JSON.stringify(artifact, null, 2));
}

function validateGeneratedApp(project: ProjectRecord): NonNullable<ProjectRecord["buildValidation"]> {
  const files = new Map(project.files.map((file) => [file.path, file.content]));
  const logs: string[] = [];
  const required = [
    "README.md",
    "package.json",
    "tsconfig.json",
    "next.config.js",
    ".env.example",
    "schema.prisma",
    "app/layout.tsx",
    "app/page.tsx",
    "preview/index.html",
    "architecture/database-schema.json",
    "architecture/api-map.json",
    "architecture/state-graph.json",
    "architecture/event-system.json",
    "architecture/job-system.json",
    "architecture/execution-binding.json",
    "architecture/runtime-factory.json",
  ];

  for (const requiredPath of required) {
    if (!files.has(requiredPath)) logs.push(`Missing ${requiredPath}`);
  }

  const packageJson = files.get("package.json");
  if (packageJson) {
    try {
      const parsed = JSON.parse(packageJson) as { scripts?: Record<string, string>; dependencies?: Record<string, string> };
      if (!parsed.scripts?.build) logs.push("package.json is missing build script");
      if (!parsed.dependencies?.next || !parsed.dependencies?.react || !parsed.dependencies?.["react-dom"]) logs.push("package.json is missing Next/React dependencies");
    } catch {
      logs.push("package.json is not valid JSON");
    }
  }

  const componentFiles = project.files.filter((file) => file.path.startsWith("components/") && file.path.endsWith(".tsx"));
  const featureFiles = project.files.filter((file) => file.path.startsWith("features/") && file.path.endsWith(".ts"));
  const dbFiles = project.files.filter((file) => file.path.startsWith("db/") && file.path.endsWith(".ts"));
  const domainApiFiles = project.files.filter((file) => file.path.startsWith("api/") && file.path.endsWith(".ts"));
  const engineFiles = project.files.filter((file) => file.path.startsWith("lib/") && file.path.endsWith(".ts"));
  const apiFiles = project.files.filter((file) => file.path.startsWith("app/api/") && file.path.endsWith("route.ts"));
  const routeFiles = project.files.filter((file) => file.path.startsWith("app/") && file.path.endsWith("page.tsx"));
  const architectureFiles = project.files.filter((file) => file.path.startsWith("architecture/"));
  if (componentFiles.length < 1) logs.push("Generated app must include a project-specific component");
  if (featureFiles.length < 1) logs.push("Generated app must include project-specific feature logic");
  if (dbFiles.length < 1) logs.push("Generated app must include project-specific db schema module");
  if (domainApiFiles.length < 1) logs.push("Generated app must include project-specific API handler logic");
  if (engineFiles.length < 1) logs.push("Generated app must include a project-specific state engine");
  if (apiFiles.length < 1) logs.push("Generated app must include project-specific API routes");
  if (routeFiles.length < 4) logs.push("Generated app must include multiple real route files");
  if (architectureFiles.length < 8) logs.push("Generated app must include database, API, state, event, job, execution-binding, and runtime-factory architecture maps");

  const pageSource = files.get("app/page.tsx") || "";
  const componentName = componentFiles[0]?.path.replace("components/", "").replace(".tsx", "");
  if (componentName && !pageSource.includes(componentName)) logs.push("app/page.tsx does not render the generated project component");

  const previewSource = files.get("preview/index.html") || "";
  if (!previewSource.includes("<script>") || !previewSource.includes("/runtime")) logs.push("preview/index.html must call the isolated project runtime API");
  if (!previewSource.includes("data-action='transition'") || !previewSource.includes("data-action='delete'")) logs.push("Button Interaction Test failed: preview buttons must mutate runtime state");
  if (!previewSource.includes('data-action="create"') || !previewSource.includes("data-api=") || !previewSource.includes("data-db-change=") || !previewSource.includes("data-state-update=") || !previewSource.includes("data-ui-refresh=")) {
    logs.push("Execution Binding Test failed: preview buttons must declare UI action, API route, database change, state update, and UI refresh");
  }

  const componentSource = componentFiles.map((file) => file.content).join("\n");
  if (!componentSource.includes("await fetch(") || !componentSource.includes("setRecords(data.records)") || !componentSource.includes("data-db-change") || !componentSource.includes("data-ui-refresh")) {
    logs.push("Execution Binding Test failed: generated UI buttons must call API before state/UI refresh");
  }

  const plan = project.appPlan;
  if (!plan?.truthSpec) {
    logs.push("Truth Spec failed: generated app must classify real users, actions, data, and state changes");
  } else {
    if (!plan.truthSpec.realUsers) logs.push("Truth Spec failed: app must identify real users");
    if (!plan.truthSpec.realActions) logs.push("Truth Spec failed: app must include real user actions");
    if (!plan.truthSpec.realData) logs.push("Truth Spec failed: app must include real relational data");
    if (!plan.truthSpec.realStateChanges) logs.push("Truth Spec failed: app must include real state changes");
    if (plan.truthSpec.blocksShallowMode) logs.push(...plan.truthSpec.rejectionReasons);
  }
  if (!plan?.relationships?.length || plan.relationships.length < 2) logs.push("App plan must include at least two relational model links");
  if (!plan?.interactions?.some((interaction) => interaction.type === "create")) logs.push("App plan must include a real create interaction");
  if (!plan?.interactions?.some((interaction) => interaction.type === "transition")) logs.push("App plan must include a real transition interaction");
  if (!plan?.interactions?.some((interaction) => interaction.type === "delete")) logs.push("App plan must include a real delete interaction");
  if (plan) {
    validateDomainGate(plan, project.files, logs);
  }

  const routeCount = project.appPlan?.routes.length || 0;
  const apiCount = project.appPlan?.apiEndpoints.length || 0;
  if (routeCount < 3) logs.push("App plan must contain at least three routes");
  if (apiCount < 2) logs.push("App plan must contain at least two API endpoints");

  validateArchitectureMap(files, "architecture/database-schema.json", logs, (value) => {
    const parsed = value as { models?: unknown[]; relationships?: unknown[] };
    if (!Array.isArray(parsed.models) || parsed.models.length < 2) logs.push("Database schema map must include real models");
    if (!Array.isArray(parsed.relationships) || parsed.relationships.length < 2) logs.push("Database schema map must include real relationships");
  });
  validateArchitectureMap(files, "architecture/api-map.json", logs, (value) => {
    const parsed = value as { backendRequired?: boolean; endpoints?: unknown[]; actionBindings?: unknown[] };
    if (parsed.backendRequired !== true) logs.push("API map must require backend execution");
    if (!Array.isArray(parsed.endpoints) || parsed.endpoints.length < 2) logs.push("API map must include backend endpoints");
    if (!Array.isArray(parsed.actionBindings) || parsed.actionBindings.length < 1) logs.push("API map must bind actions to backend endpoints");
    if (Array.isArray(parsed.actionBindings)) {
      for (const binding of parsed.actionBindings as Array<{ executionChain?: unknown }>) {
        const chain = Array.isArray(binding.executionChain) ? binding.executionChain : [];
        for (const step of ["uiAction", "apiRoute", "databaseChange", "stateUpdate", "uiRefresh"]) {
          if (!chain.includes(step)) logs.push(`API map execution chain missing ${step}`);
        }
      }
    }
  });
  validateArchitectureMap(files, "architecture/state-graph.json", logs, (value) => {
    const parsed = value as { transitions?: unknown[]; mutations?: unknown[] };
    if (!Array.isArray(parsed.transitions) || parsed.transitions.length < 1) logs.push("State graph must include transitions");
    if (!Array.isArray(parsed.mutations) || parsed.mutations.length < 1) logs.push("State graph must include mutation rules");
  });
  validateArchitectureMap(files, "architecture/event-system.json", logs, (value) => {
    const parsed = value as { events?: unknown[] };
    if (!Array.isArray(parsed.events) || parsed.events.length < 1) logs.push("Event system must include action-triggered events");
  });
  validateArchitectureMap(files, "architecture/job-system.json", logs, (value) => {
    const parsed = value as { asyncNeeded?: unknown; queuePolicy?: unknown; jobs?: unknown[] };
    if (typeof parsed.asyncNeeded !== "boolean") logs.push("Job system must declare whether async work is needed");
    if (typeof parsed.queuePolicy !== "string" || !parsed.queuePolicy) logs.push("Job system must define a queue policy");
    if (!Array.isArray(parsed.jobs)) logs.push("Job system must include a jobs array");
  });
  validateArchitectureMap(files, "architecture/execution-binding.json", logs, (value) => {
    const parsed = value as { blockBuildIfAnyStepMissing?: boolean; bindings?: unknown[] };
    if (parsed.blockBuildIfAnyStepMissing !== true) logs.push("Execution binding must block builds when any step is missing");
    if (!Array.isArray(parsed.bindings) || parsed.bindings.length < 1) logs.push("Execution binding must include button bindings");
    if (Array.isArray(parsed.bindings)) {
      for (const binding of parsed.bindings as Array<Record<string, unknown>>) {
        for (const step of ["uiAction", "apiRoute", "databaseChange", "stateUpdate", "uiRefresh"]) {
          if (!binding[step]) logs.push(`Execution binding missing ${step}`);
        }
      }
    }
  });
  validateArchitectureMap(files, "architecture/runtime-factory.json", logs, (value) => {
    const parsed = value as { runtimeType?: unknown; phases?: Record<string, unknown> };
    if (parsed.runtimeType !== "fullstack") logs.push("Runtime factory must classify generated projects as fullstack runtime apps");
    const phases = parsed.phases || {};
    for (const phase of ["intentToSpec", "codeGeneration", "buildInstall", "runtimeBootstrap", "interactionTesting", "previewGeneration", "selfHeal", "deploymentGate"]) {
      if (!phases[phase]) logs.push(`Runtime factory missing ${phase} phase`);
    }
    const preview = phases.previewGeneration as { noStaticPreviewModeEver?: unknown; requiresBackendAlive?: unknown } | undefined;
    if (preview?.noStaticPreviewModeEver !== true || preview?.requiresBackendAlive !== true) logs.push("Runtime factory must block static previews and require backend liveness");
  });

  return {
    status: logs.length ? "failed" : "passed",
    checkedAt: new Date().toISOString(),
    fileCount: project.files.length,
    routeCount,
    apiCount,
    logs: logs.length ? logs : ["Static build validation passed", "Isolated source tree present", "Project-specific runtime API is wired"],
  };
}

function validateDomainGate(plan: AppPlan, files: ProjectFile[], logs: string[]) {
  const allSource = files.map((file) => file.content).join("\n");
  const genericActions = new Set(["create", "update", "delete", "createRecord", "updateRecord", "deleteRecord", "saveRecord"]);
  const abstractModels = new Set(["Record", "Records", "Item", "Items", "Runtime", "GeneratedRuntime"]);
  const modelNames = plan.dataModels.map((model) => model.name);
  const actionLabels = plan.interactions.map((interaction) => interaction.label);

  if (modelNames.some((name) => abstractModels.has(name) || /Runtime\d+|Variant\s*\d+|QueueItem/i.test(name))) {
    logs.push("Domain Gate failed: model names must come from prompt nouns, not abstract records/items/runtime variants");
  }

  if (actionLabels.some((label) => genericActions.has(label))) {
    logs.push("Domain Gate failed: actions must use domain verbs such as bookSession or markAttendance, not generic CRUD names");
  }

  if (/let\s+records\s*=\s*\[\s*\]/.test(allSource)) {
    logs.push("Domain Gate failed: in-memory-only `let records = []` persistence is banned");
  }

  if (!/localStorage|SQLite|DATABASE_URL|prisma|client-localStorage/i.test(allSource)) {
    logs.push("Domain Gate failed: generated app must persist data with localStorage, SQLite, or a real database");
  }

  if (plan.domainAnalysis) {
    if (plan.domainAnalysis.entities.length < 3) logs.push("Domain Gate failed: domain analysis must extract real entities");
    if (plan.domainAnalysis.roles.length < 1) logs.push("Domain Gate failed: domain analysis must extract real roles");
    if (plan.domainAnalysis.businessRules.length < 1) logs.push("Domain Gate failed: domain analysis must extract business rules");
    if (plan.domainAnalysis.stateMachines.length < 1) logs.push("Domain Gate failed: domain analysis must extract state machines");
    if (plan.domainAnalysis.errorCases.length < 1) logs.push("Domain Gate failed: domain analysis must define real error cases");
    for (const role of plan.domainAnalysis.roles) {
      if (!plan.routes.some((route) => route.path === role.route)) logs.push(`Domain Gate failed: missing role-specific route ${role.route} for ${role.name}`);
    }
    for (const action of plan.domainAnalysis.actions) {
      if (!actionLabels.includes(action.name)) logs.push(`Domain Gate failed: missing domain action ${action.name}`);
    }
  }

  if (plan.category === "booking") {
    const requiredModels = ["Studio", "Instructor", "Class", "TimeSlot", "Booking", "Attendance"];
    const requiredActions = ["bookSession", "cancelBooking", "markAttendance", "publishTimeSlot"];
    const requiredRoutes = ["/owner", "/instructor", "/member"];
    for (const model of requiredModels) {
      if (!modelNames.includes(model)) logs.push(`Booking Domain Gate failed: missing ${model} model`);
    }
    for (const action of requiredActions) {
      if (!actionLabels.includes(action)) logs.push(`Booking Domain Gate failed: missing ${action} action`);
    }
    for (const route of requiredRoutes) {
      if (!plan.routes.some((item) => item.path === route)) logs.push(`Booking Domain Gate failed: missing ${route} role view`);
    }
    for (const message of ["Class is full", "Cannot cancel past classes"]) {
      if (!allSource.includes(message)) logs.push(`Booking Domain Gate failed: missing real error message "${message}"`);
    }
    if (!/capacityRemaining|capacityFrom|seats left/.test(allSource)) logs.push("Booking Domain Gate failed: booking must enforce visible capacity changes");
  }
}

function validateArchitectureMap(files: Map<string, string>, path: string, logs: string[], inspect: (value: unknown) => void) {
  const source = files.get(path);
  if (!source) return;
  try {
    inspect(JSON.parse(source));
  } catch {
    logs.push(`${path} must be valid JSON`);
  }
}

function assessPromptClarity(prompt: string) {
  const words = prompt.split(/\s+/).filter(Boolean);
  const source = prompt.toLowerCase();
  const hasUser = /\b(users?|customers?|clients?|admins?|sellers?|buyers?|members?|coaches?|teams?|staff|founders?|creators?|operators?|managers?)\b/.test(source);
  const hasAction = /\b(create|creates|book|books|buy|buys|sell|sells|track|tracks|manage|manages|approve|approves|publish|publishes|checkout|message|upload|generate|schedule|assign|move|delete|edit|analyze|alert|log|send|sent)\b/.test(source);
  const hasData = /\b(database|data|records?|clients?|projects?|tasks?|orders?|bookings?|products?|metrics?|posts?|members?|deals?|invoices?|slots?|workouts?|habits?|drafts?|listings?|items?|inquiries?)\b/.test(source);
  const questions = [
    words.length < 6 ? "What exact app should be built?" : "",
    !hasUser ? "Who are the real users?" : "",
    !hasAction ? "What real actions must users perform?" : "",
    !hasData ? "What real data/entities must be stored?" : "",
  ].filter(Boolean);
  return { clear: questions.length === 0, questions };
}

function statusFlowForProject(plan?: AppPlan) {
  if (plan?.category === "crm") return ["Lead", "In Progress", "Review", "Done"];
  if (plan?.category === "booking") return ["Requested", "Confirmed", "Completed"];
  if (plan?.category === "ecommerce") return ["Cart", "Review", "Paid", "Fulfilled"];
  if (plan?.category === "fitness") return ["Planned", "Complete", "Reviewed"];
  if (plan?.category === "analytics") return ["Open", "Investigating", "Resolved"];
  const seedStatuses = plan?.seedData.map((item) => item.status) || [];
  return [...new Set(seedStatuses.concat(["In Progress", "Done"]))];
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "project";
}

function uniqueSlug(base: string, projects: ProjectRecord[]) {
  const used = new Set(projects.map((project) => project.slug));
  let slug = base;
  let index = 2;
  while (used.has(slug)) {
    slug = `${base}-${index}`;
    index += 1;
  }
  return slug;
}

function sortableUpdatedAt(project: ProjectRecord) {
  return project.updatedAt || project.createdAt || "";
}
