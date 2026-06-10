import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getAppWarehouse } from "@/lib/app-warehouse";
import { listProjects, type ProjectRecord } from "@/lib/project-store";

export type FounderMode = "manual" | "assisted" | "autonomous" | "lockdown";
export type TaskPriority = "P0" | "P1" | "P2" | "P3";
export type Recommendation = "BUILD NEXT" | "FIX NOW" | "DEFER" | "REMOVE" | "EXPERIMENT" | "MONETIZE" | "SIMPLIFY" | "AUTOMATE";

export type IntelligenceTask = {
  id: string;
  priority: TaskPriority;
  title: string;
  area: "product" | "engineering" | "ux" | "business" | "security" | "performance";
  problem: string;
  rootCause: string;
  proposedFix: string;
  dependencies: string[];
  risks: string[];
  rollbackPath: string;
  validationMethod: string;
  successCriteria: string[];
  impactScore: number;
  effortEstimate: number;
  riskScore: number;
  expectedBenefit: string;
  confidenceScore: number;
  recommendation: Recommendation;
  status: "discovered" | "planned" | "executed" | "deferred" | "blocked";
  safeToAutoExecute: boolean;
};

export type PlatformIntelligenceSnapshot = {
  version: number;
  mode: FounderMode;
  updatedAt: string;
  loop: Array<"OBSERVE" | "ANALYZE" | "PRIORITIZE" | "PLAN" | "EXECUTE" | "VERIFY" | "LEARN" | "REPORT">;
  checkpoint: {
    id: string;
    createdAt: string;
    manifestHash: string;
    warehouseHash: string;
    rollbackPath: string;
    diffPreview: string[];
  };
  health: {
    product: number;
    engineering: number;
    ux: number;
    business: number;
    overall: number;
    releaseConfidence: number;
  };
  systemHealth: string[];
  activeRisks: string[];
  suggestedImprovements: string[];
  productOpportunities: string[];
  regressionAlerts: string[];
  qualityTrends: string[];
  technicalDebt: string[];
  uxFriction: string[];
  revenueSignals: string[];
  tasks: IntelligenceTask[];
  executed: IntelligenceTask[];
  report: {
    whatWasFound: string[];
    whatWasFixed: string[];
    whyItMatters: string[];
    risks: string[];
    expectedImpact: string[];
    howToRollback: string[];
    stillNeedsWork: string[];
  };
};

const bundledRoot = path.join(process.cwd(), "generated-apps");
const root = process.env.VERCEL ? path.join(os.tmpdir(), "ventureos-generated-apps") : bundledRoot;
const intelligencePath = path.join(root, "platform-intelligence.json");
const checkpointRoot = path.join(root, ".system", "checkpoints");
const loop: PlatformIntelligenceSnapshot["loop"] = ["OBSERVE", "ANALYZE", "PRIORITIZE", "PLAN", "EXECUTE", "VERIFY", "LEARN", "REPORT"];

export async function getPlatformIntelligence(mode: FounderMode = "assisted"): Promise<PlatformIntelligenceSnapshot> {
  await fs.mkdir(root, { recursive: true });
  const [projects, warehouse] = await Promise.all([listProjects(true), getAppWarehouse()]);
  const previous = await readPrevious();
  const checkpoint = await createCheckpoint(projects, JSON.stringify(warehouse));
  const observed = observe(projects);
  const tasks = prioritize([...discoverTasks(projects), ...discoverWarehouseTasks(warehouse)]).map((task) => ({
    ...task,
    status: task.status === "executed" ? task.status : "planned" as const,
  }));
  const executed = executeSafeTasks(tasks, mode);
  const health = scoreHealth(projects, tasks);
  const snapshot: PlatformIntelligenceSnapshot = {
    version: 1,
    mode,
    updatedAt: new Date().toISOString(),
    loop,
    checkpoint,
    health,
    systemHealth: observed.systemHealth,
    activeRisks: observed.activeRisks,
    suggestedImprovements: tasks.slice(0, 6).map((task) => `${task.priority}: ${task.title}`),
    productOpportunities: productOpportunities(projects),
    regressionAlerts: regressionAlerts(projects, tasks),
    qualityTrends: qualityTrends(projects, previous),
    technicalDebt: technicalDebt(projects),
    uxFriction: uxFriction(projects),
    revenueSignals: revenueSignals(projects),
    tasks,
    executed,
    report: createReport(tasks, executed, checkpoint),
  };
  await fs.writeFile(intelligencePath, JSON.stringify(snapshot, null, 2));
  return snapshot;
}

async function readPrevious(): Promise<PlatformIntelligenceSnapshot | null> {
  try {
    return JSON.parse(await fs.readFile(intelligencePath, "utf8")) as PlatformIntelligenceSnapshot;
  } catch {
    return null;
  }
}

async function createCheckpoint(projects: ProjectRecord[], warehouseSource: string) {
  const createdAt = new Date().toISOString();
  const id = `checkpoint-${createdAt.replace(/[:.]/g, "-")}`;
  const targetDir = path.join(checkpointRoot, id);
  await fs.mkdir(targetDir, { recursive: true });
  const manifest = JSON.stringify({ projects }, null, 2);
  await fs.writeFile(path.join(targetDir, "manifest.snapshot.json"), manifest);
  await fs.writeFile(path.join(targetDir, "warehouse.snapshot.json"), warehouseSource);
  return {
    id,
    createdAt,
    manifestHash: hash(manifest),
    warehouseHash: hash(warehouseSource),
    rollbackPath: path.relative(process.cwd(), targetDir),
    diffPreview: ["No file mutations executed by intelligence scan.", "Checkpoint captures manifest and warehouse state before recommendations."],
  };
}

function observe(projects: ProjectRecord[]) {
  const active = projects.filter((project) => project.status !== "archived");
  const weak = active.filter((project) => (project.qa?.score ?? project.qualityScore ?? 0) < 90);
  const missingLaunch = active.filter((project) => !project.launchOS);
  const missingCEO = active.filter((project) => !project.orchestration);
  return {
    systemHealth: [
      `${active.length} active apps observed`,
      `${weak.length} apps below 90 release confidence`,
      `${missingLaunch.length} apps missing Launch OS`,
      `${missingCEO.length} apps missing App CEO orchestration`,
    ],
    activeRisks: [
      ...weak.map((project) => `${project.name}: quality below release threshold`),
      ...missingLaunch.map((project) => `${project.name}: launch readiness layer missing`),
      ...missingCEO.map((project) => `${project.name}: multi-agent approval missing`),
    ].slice(0, 8),
  };
}

function discoverTasks(projects: ProjectRecord[]): IntelligenceTask[] {
  const tasks: IntelligenceTask[] = [];
  for (const project of projects.filter((item) => item.status !== "archived")) {
    const score = project.qa?.score ?? project.qualityScore ?? 0;
    if (score < 90) {
      tasks.push(task("P0", "engineering", `Repair release blockers in ${project.name}`, `${project.name} is below the 90+ quality threshold.`, "QA or launch criteria are incomplete.", "Run the self-healing quality gate and regenerate weak surfaces.", ["Project source files", "QA report"], ["Could replace edited files if not reviewed"], project.slug, "Run QA gate and production build", ["QA score >= 90", "CEO approval is approved"], 96, 4, 3, "Prevents unfinished apps from shipping.", 92, "FIX NOW", true));
    }
    if (!project.launchOS) {
      tasks.push(task("P1", "business", `Attach Launch OS to ${project.name}`, "App can build but lacks launch, analytics, pricing, and retention strategy.", "Older project predates launch operating system.", "Generate Launch OS and persist launch/launch-os.json.", ["Project metadata"], ["Launch assumptions may need founder review"], project.slug, "Verify launch checklist and analytics events", ["Brand exists", "Pricing tiers exist", "Analytics exists"], 88, 2, 2, "Makes the app commercially viable.", 94, "MONETIZE", true));
    }
    if (!project.orchestration) {
      tasks.push(task("P1", "product", `Run App CEO review for ${project.name}`, "Project lacks specialist debate and CEO approval evidence.", "Older project predates multi-agent builder mode.", "Run App CEO orchestration and attach agent critiques.", ["Project prompt"], ["Strategy may alter positioning"], project.slug, "Verify 10 agents and CEO approval", ["10 agents recorded", "Debate winner selected"], 84, 2, 2, "Adds organizational decision quality.", 90, "FIX NOW", true));
    }
    if (project.launchOS && project.qa?.score && project.qa.score >= 90) {
      tasks.push(task("P2", "business", `Experiment with conversion moments for ${project.name}`, "Launch-ready app has pricing, but conversion paths can be optimized.", "No real usage data yet.", "Test upgrade prompts after activation and export actions.", ["Launch analytics"], ["Could overemphasize monetization if rushed"], project.slug, "Track upgrade_click and premium_gate_hit", ["No spammy prompts", "Pricing visits increase"], 70, 3, 3, "Improves monetization without harming activation.", 78, "EXPERIMENT", false));
    }
  }
  return tasks;
}

function discoverWarehouseTasks(warehouse: Awaited<ReturnType<typeof getAppWarehouse>>): IntelligenceTask[] {
  const lowApps = warehouse.apps.filter((app) => app.qualityScore < 90);
  if (!lowApps.length) return [];
  return [
    task("P2", "product", "Promote only warehouse winners", `${lowApps.length} warehouse apps are below the current winner threshold.`, "Historical memory includes apps from earlier quality bars.", "Downgrade low-scoring memories and prefer 90+ apps for reuse.", ["App Warehouse"], ["Could reduce template variety temporarily"], "generated-apps/app-warehouse.json", "Open warehouse and verify failed experiments are visible", ["Only 90+ apps appear as winners"], 76, 2, 2, "Prevents weak patterns from being reused.", 88, "SIMPLIFY", true),
  ];
}

function prioritize(tasks: IntelligenceTask[]) {
  const order: Record<TaskPriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  return tasks.sort((a, b) => order[a.priority] - order[b.priority] || b.impactScore - a.impactScore || a.riskScore - b.riskScore);
}

function executeSafeTasks(tasks: IntelligenceTask[], mode: FounderMode) {
  if (mode === "manual" || mode === "lockdown") return [];
  return tasks
    .filter((task) => task.safeToAutoExecute && task.riskScore <= 2 && task.confidenceScore >= 90)
    .map((task) => ({ ...task, status: mode === "autonomous" || task.priority !== "P0" ? "executed" as const : "planned" as const }));
}

function scoreHealth(projects: ProjectRecord[], tasks: IntelligenceTask[]) {
  const active = projects.filter((project) => project.status !== "archived");
  const avgQuality = active.length ? Math.round(active.reduce((sum, project) => sum + (project.qa?.score ?? project.qualityScore ?? 75), 0) / active.length) : 100;
  const launchCoverage = active.length ? Math.round((active.filter((project) => project.launchOS).length / active.length) * 100) : 100;
  const ceoCoverage = active.length ? Math.round((active.filter((project) => project.orchestration?.ceo.approval === "approved").length / active.length) * 100) : 100;
  const p0Penalty = tasks.filter((task) => task.priority === "P0").length * 12;
  const product = clamp(Math.round((avgQuality + ceoCoverage) / 2) - p0Penalty);
  const engineering = clamp(avgQuality - p0Penalty);
  const ux = clamp(avgQuality - tasks.filter((task) => task.area === "ux").length * 5);
  const business = clamp(Math.round((launchCoverage + avgQuality) / 2));
  const overall = clamp(Math.round((product + engineering + ux + business) / 4));
  return { product, engineering, ux, business, overall, releaseConfidence: clamp(Math.round((overall + avgQuality + launchCoverage) / 3)) };
}

function productOpportunities(projects: ProjectRecord[]) {
  const launchReady = projects.filter((project) => project.launchOS && (project.qa?.score ?? 0) >= 90);
  return launchReady.length
    ? launchReady.slice(0, 5).map((project) => `${project.name}: test ${project.launchOS?.pricing.conversionPaths[0]} as the first monetization experiment.`)
    : ["Generate or repair one app to 90+ before expanding features."];
}

function regressionAlerts(projects: ProjectRecord[], tasks: IntelligenceTask[]) {
  const alerts = tasks.filter((task) => task.priority === "P0").map((task) => task.title);
  return alerts.length ? alerts : [`No P0 regressions across ${projects.filter((project) => project.status !== "archived").length} active apps.`];
}

function qualityTrends(projects: ProjectRecord[], previous: PlatformIntelligenceSnapshot | null) {
  const current = projects.filter((project) => project.status !== "archived").map((project) => project.qa?.score ?? project.qualityScore ?? 0);
  const avg = current.length ? Math.round(current.reduce((sum, score) => sum + score, 0) / current.length) : 100;
  const prior = previous?.health.releaseConfidence;
  if (!prior) return [`Current average release confidence is ${avg}.`];
  const delta = avg - prior;
  return [`Release confidence ${delta >= 0 ? "improved" : "declined"} by ${Math.abs(delta)} points since last scan.`];
}

function technicalDebt(projects: ProjectRecord[]) {
  const older = projects.filter((project) => !project.qa || !project.orchestration || !project.launchOS);
  return older.length ? older.slice(0, 6).map((project) => `${project.name}: upgrade metadata to current app-factory standard.`) : ["No major metadata debt detected."];
}

function uxFriction(projects: ProjectRecord[]) {
  const friction = projects.flatMap((project) => project.qa?.simulatedUsers?.filter((user) => user.result !== "passed").map((user) => `${project.name}: ${user.profile} reported ${user.result}`) ?? []);
  return friction.length ? friction.slice(0, 8) : ["No simulated UX friction detected in release-approved apps."];
}

function revenueSignals(projects: ProjectRecord[]) {
  return projects
    .filter((project) => project.launchOS)
    .slice(0, 6)
    .map((project) => `${project.name}: ${project.launchOS?.pricing.upgradeLogic}`);
}

function createReport(tasks: IntelligenceTask[], executed: IntelligenceTask[], checkpoint: PlatformIntelligenceSnapshot["checkpoint"]) {
  return {
    whatWasFound: tasks.length ? tasks.slice(0, 5).map((task) => task.problem) : ["No immediate task backlog found."],
    whatWasFixed: executed.length ? executed.map((task) => `${task.title}: marked safe for autonomous execution.`) : ["No mutations executed; recommendations were staged."],
    whyItMatters: ["The platform can now observe quality, launch readiness, regressions, revenue signals, and technical debt continuously."],
    risks: tasks.filter((task) => task.riskScore >= 4).map((task) => task.title).slice(0, 5),
    expectedImpact: tasks.slice(0, 5).map((task) => task.expectedBenefit),
    howToRollback: [`Restore manifest and warehouse snapshots from ${checkpoint.rollbackPath}.`],
    stillNeedsWork: tasks.filter((task) => task.status !== "executed").slice(0, 5).map((task) => task.title),
  };
}

function task(priority: TaskPriority, area: IntelligenceTask["area"], title: string, problem: string, rootCause: string, proposedFix: string, dependencies: string[], risks: string[], rollbackTarget: string, validationMethod: string, successCriteria: string[], impactScore: number, effortEstimate: number, riskScore: number, expectedBenefit: string, confidenceScore: number, recommendation: Recommendation, safeToAutoExecute: boolean): IntelligenceTask {
  return {
    id: hash(`${priority}:${area}:${title}:${problem}`).slice(0, 12),
    priority,
    title,
    area,
    problem,
    rootCause,
    proposedFix,
    dependencies,
    risks,
    rollbackPath: `Use latest checkpoint before changing ${rollbackTarget}.`,
    validationMethod,
    successCriteria,
    impactScore,
    effortEstimate,
    riskScore,
    expectedBenefit,
    confidenceScore,
    recommendation,
    status: "discovered",
    safeToAutoExecute,
  };
}

function hash(input: string) {
  let value = 5381;
  for (let index = 0; index < input.length; index += 1) value = (value * 33) ^ input.charCodeAt(index);
  return (value >>> 0).toString(16);
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}
