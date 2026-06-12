import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { listProjects, type ProjectRecord } from "@/lib/project-store";

export type QualityScores = {
  polish: number;
  usability: number;
  uxClarity: number;
  visualQuality: number;
  responsiveness: number;
  architectureQuality: number;
  trustworthiness: number;
  featureCompleteness: number;
  launchReadiness: number;
  monetizationReadiness: number;
  overall: number;
};

export type MemoryItem = {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  score: number;
  status: "promoted" | "testing" | "downgraded" | "fixed";
  evidence: string[];
  reusableAsset?: string;
  updatedAt: string;
};

export type BugMemory = MemoryItem & {
  issue: string;
  rootCause: string;
  fix: string;
  prevention: string;
};

export type AppMemory = {
  id: string;
  projectId: string;
  appName: string;
  category: string;
  audience: string;
  problemSolved: string;
  features: string[];
  onboarding: string[];
  layoutStructure: string;
  uxFlow: string;
  monetizationLogic: string;
  componentChoices: string[];
  designDirection: string;
  performedWell: string[];
  failed: string[];
  polishScore: number;
  qualityScore: number;
  scores: QualityScores;
  generatedFiles: string[];
  architecture: string;
  promptsUsed: string[];
  outputs: string[];
  revisions: string[];
  fixes: string[];
  actions: string[];
  tags: string[];
  version: number;
  updatedAt: string;
  orchestration?: ProjectRecord["orchestration"];
  launchOS?: ProjectRecord["launchOS"];
};

export type WarehouseSnapshot = {
  version: number;
  updatedAt: string;
  apps: AppMemory[];
  designMemory: MemoryItem[];
  featureMemory: MemoryItem[];
  bugMemory: BugMemory[];
  generationMemory: MemoryItem[];
  qualityMemory: MemoryItem[];
  componentMemory: MemoryItem[];
  patternMemory: MemoryItem[];
};

const bundledRoot = path.join(process.cwd(), "generated-apps");
const root = process.env.VERCEL ? path.join(os.tmpdir(), "ventureos-generated-apps") : bundledRoot;
const warehousePath = path.join(root, "app-warehouse.json");

export async function getAppWarehouse(query = "", filter = "all"): Promise<WarehouseSnapshot> {
  await ensureWarehouse();
  const raw = normalizeWarehouse(JSON.parse(await fs.readFile(warehousePath, "utf8")) as Partial<WarehouseSnapshot>);
  const projects = await listProjects(true);
  const snapshot = syncProjectApps(raw, projects);
  if (snapshot.apps.length !== raw.apps.length || snapshot.updatedAt !== raw.updatedAt) {
    await writeWarehouse(snapshot);
  }

  const term = query.trim().toLowerCase();
  if (!term && filter === "all") return snapshot;

  return {
    ...snapshot,
    apps: snapshot.apps.filter((app) => matchesApp(app, term, filter)),
  };
}

export function scoreProject(project: ProjectRecord): QualityScores {
  if (project.qa?.dimensions) {
    const dimensions = project.qa.dimensions;
    return {
      polish: dimensions.visualPolish ?? project.polishScore ?? project.qa.score,
      usability: dimensions.usability ?? project.qa.score,
      uxClarity: dimensions.ux ?? project.qa.score,
      visualQuality: dimensions.visualPolish ?? project.qa.score,
      responsiveness: dimensions.responsiveness ?? project.qa.score,
      architectureQuality: dimensions.architecture ?? project.qa.score,
      trustworthiness: dimensions.trustworthiness ?? project.qa.score,
      featureCompleteness: dimensions.featureCompleteness ?? project.qa.score,
      launchReadiness: dimensions.launchReadiness ?? project.qa.score,
      monetizationReadiness: dimensions.monetization ?? project.qa.score,
      overall: project.qa.score,
    };
  }
  const files = project.files.map((file) => file.path);
  const source = project.files.map((file) => file.content).join("\n").toLowerCase();

  // Enterprise-grade detection logic
  const hasAppRoute = files.some((file) => file === "app/page.tsx");
  const hasOnboarding = project.onboarding.length >= 3 || files.some((file) => file.includes("onboarding"));
  const hasPackage = files.includes("package.json");
  const hasWorkingActions = /onclick|href=|form|button/.test(source);
  const hasValidation = /required|invalid|error|zod|validate|yup|\\.safeparse/i.test(source);
  const hasResponsive = /md:|lg:|grid|flex-wrap/.test(source);
  const hasPremiumVisuals = /shadow|ring|rounded|transition|loading|skeleton|animate-|opacity-/i.test(source);
  const hasMonetization = project.monetization.length > 8;
  const hasTrust = /export|download|security|privacy|review|status|ready|audit|logging|checksum/i.test(source);
  const hasAccessibility = /aria-|role=|tabindex|alt=|aria-label/i.test(source);
  const hasErrorHandling = /errorboundary|try\s*{|catch\s*\(|\\.catch\(/i.test(source);
  const hasTypeSafety = /interface\s+[A-Z]|type\s+[A-Z]\s*=|:\s*[A-Z][a-z]+/i.test(source);
  const hasSanitization = /dompurify|sanitize|escapehtml/i.test(source);

  const featureDepth = Math.min(18, project.features.length * 3);

  const polish = clampScore(60 + (hasPremiumVisuals ? 15 : 0) + (hasResponsive ? 10 : 0) + (hasAccessibility ? 15 : 0));
  const usability = clampScore(70 + (hasWorkingActions ? 10 : 0) + (hasOnboarding ? 8 : 0) + (hasValidation ? 5 : 0));
  const uxClarity = clampScore(74 + (project.problem.length > 20 ? 7 : 0) + (project.audience.length > 8 ? 6 : 0) + (hasOnboarding ? 5 : 0));
  const visualQuality = clampScore(72 + (hasPremiumVisuals ? 14 : 0) + (project.uiDirection.includes("dashboard") ? 4 : 0));
  const responsiveness = clampScore(70 + (hasResponsive ? 17 : 0));
  const architectureQuality = clampScore(70 + (hasAppRoute ? 6 : 0) + (hasPackage ? 6 : 0) + Math.min(10, files.length * 2));
  const trustworthiness = clampScore(65 + (hasTrust ? 15 : 0) + (hasValidation ? 10 : 0) + (hasSanitization ? 10 : 0));
  const featureCompleteness = clampScore(68 + featureDepth + (hasWorkingActions ? 5 : 0));
  const launchReadiness = clampScore(70 + (hasPackage ? 7 : 0) + (hasAppRoute ? 7 : 0) + (hasValidation ? 4 : 0));
  const monetizationReadiness = clampScore(50 + (hasMonetization ? 25 : 0) + (source.includes("stripe") || source.includes("paddle") ? 25 : 0));

  // Enterprise Hardening Penalties
  const overallPenalty = (!hasErrorHandling ? 8 : 0) + (!hasTypeSafety ? 7 : 0) + (!hasAccessibility ? 5 : 0);
  
  const values = [polish, usability, uxClarity, visualQuality, responsiveness, architectureQuality, trustworthiness, featureCompleteness, launchReadiness, monetizationReadiness];
  const overall = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) - overallPenalty;

  return { polish, usability, uxClarity, visualQuality, responsiveness, architectureQuality, trustworthiness, featureCompleteness, launchReadiness, monetizationReadiness, overall };
}

export function generationGuidance(snapshot: WarehouseSnapshot) {
  const patterns = snapshot.patternMemory.filter((item) => item.status === "promoted").slice(0, 6).map((item) => item.title);
  const bugs = snapshot.bugMemory.slice(0, 5).map((item) => item.prevention);
  const components = snapshot.componentMemory.filter((item) => item.status === "promoted").slice(0, 6).map((item) => item.title);
  return { patterns, bugs, components, threshold: 90 };
}

async function ensureWarehouse() {
  await fs.mkdir(root, { recursive: true });
  try {
    await fs.access(warehousePath);
  } catch {
    const projects = await listProjects(true);
    await writeWarehouse(syncProjectApps(seedWarehouse(), projects));
  }
}

async function writeWarehouse(snapshot: WarehouseSnapshot) {
  await fs.writeFile(warehousePath, JSON.stringify(snapshot, null, 2));
}

function syncProjectApps(snapshot: WarehouseSnapshot, projects: ProjectRecord[]): WarehouseSnapshot {
  const existing = new Map(snapshot.apps.map((app) => [app.projectId, app]));
  const apps = projects.map((project) => {
    const scores = scoreProject(project);
    const known = existing.get(project.id);
    const failed = scores.overall < 90 ? ["Quality threshold missed; auto-improvement required before promotion."] : [];
    return {
      id: known?.id ?? `app-${project.id}`,
      projectId: project.id,
      appName: project.name,
      category: project.category,
      audience: project.audience,
      problemSolved: project.problem,
      features: project.features,
      onboarding: project.onboarding,
      layoutStructure: inferLayout(project),
      uxFlow: project.onboarding.join(" -> ") || "Prompt -> dashboard -> export",
      monetizationLogic: project.monetization,
      componentChoices: inferComponents(project),
      designDirection: project.uiDirection,
      performedWell: promotedStrengths(scores),
      failed,
      polishScore: scores.polish,
      qualityScore: scores.overall,
      scores,
      generatedFiles: project.files.map((file) => file.path),
      architecture: "Next.js App Router project with persisted source files and exportable package metadata.",
      promptsUsed: [project.prompt],
      outputs: project.files.map((file) => file.path),
      revisions: known?.revisions ?? [],
      fixes: scores.overall >= 90 ? ["Passed warehouse launch-readiness threshold."] : ["Needs richer interactions, validation, or responsive polish."],
      actions: ["duplicate", "remix", "evolve", "fork", "combine"],
      tags: Array.from(new Set([project.category, ...project.features.map((feature) => feature.toLowerCase())])),
      version: known?.version ?? 1,
      updatedAt: project.updatedAt,
      orchestration: project.orchestration,
      launchOS: project.launchOS,
    };
  });

  return { ...snapshot, apps, updatedAt: new Date().toISOString() };
}

function seedWarehouse(): WarehouseSnapshot {
  const now = new Date().toISOString();
  const item = (id: string, title: string, summary: string, tags: string[], score: number, evidence: string[], reusableAsset?: string): MemoryItem => ({
    id,
    title,
    summary,
    tags,
    score,
    status: score >= 88 ? "promoted" : "testing",
    evidence,
    reusableAsset,
    updatedAt: now,
  });

  return {
    version: 1,
    updatedAt: now,
    apps: [],
    designMemory: [
      item("design-dashboard-density", "Dense SaaS dashboard grid", "Compact metrics, tables, and action rails create a premium operational feel.", ["dashboard", "saas", "layout"], 92, ["Used by OpsLedger style generations", "Improves scan speed for business apps"], "Metric cards + action table + risk rail"),
      item("design-onboarding-steps", "Guided setup checklist", "Short step-based onboarding increases clarity without a marketing landing page.", ["onboarding", "activation"], 90, ["Keeps the first session action-oriented"], "Goal -> workflow -> data -> dashboard"),
      item("design-empty-states", "Actionable empty states", "Empty states must explain the next action and include a working command.", ["empty-state", "ux"], 88, ["Prevents dead screens"], "Dashed panel with primary action"),
    ],
    featureMemory: [
      item("feature-search-filter", "Search and filters", "Reusable search/filter controls for dashboards, lists, and warehouses.", ["search", "dashboard", "reuse"], 91, ["Appears across generated project management flows"], "Controlled input + tag filter + result count"),
      item("feature-export-source", "Export-ready source", "Generated apps include package metadata and source files that can be downloaded.", ["export", "files"], 89, ["Current builder download flow works"], "Download route + persisted files"),
      item("feature-onboarding", "Working onboarding", "Generated products should include a short setup path connected to the main dashboard.", ["onboarding", "activation"], 90, ["Common activation need"], "Setup checklist + progress state"),
    ],
    bugMemory: [
      {
        ...item("bug-buttons-without-actions", "Buttons without handlers", "Static buttons make generated apps feel fake.", ["buttons", "interaction", "regression"], 100, ["Observed in early generated app shells"], "Interaction validator"),
        status: "fixed",
        issue: "Generated buttons rendered but did not perform an action.",
        rootCause: "UI shell generation did not require event handlers or navigation targets.",
        fix: "Require every button to bind onClick, submit, href, or disabled loading state.",
        prevention: "Before generation, apply the rule: never generate buttons without action binding.",
      },
      {
        ...item("bug-blank-pages", "Blank generated pages", "Pages without data, loading, and empty states fail launch readiness.", ["routing", "quality"], 98, ["Prevented by required app/page.tsx checks"], "Route completeness validator"),
        status: "fixed",
        issue: "Generated route existed but rendered an empty shell.",
        rootCause: "Missing default content and state wiring.",
        fix: "Require meaningful first screen, empty state, and action path.",
        prevention: "Score launch readiness below 85 when app/page.tsx or core content is missing.",
      },
    ],
    generationMemory: [
      item("generation-reuse-first", "Reuse before regenerate", "Check warehouse winners, features, components, and bug rules before creating new files.", ["generation", "memory"], 95, ["Matches self-improving factory objective"], "Warehouse guidance block"),
      item("generation-quality-loop", "85+ auto-improvement loop", "Score outputs across ten quality dimensions and revise anything below threshold.", ["quality", "qa"], 93, ["Prevents shallow MVP output"], "Quality scoring engine"),
    ],
    qualityMemory: [
      item("quality-threshold", "Launch threshold 85", "Apps under 85 are treated as needing improvement before promotion.", ["quality", "launch"], 95, ["Codifies warehouse quality gate"], "Ten-dimension scorecard"),
      item("quality-action-binding", "Required interactions", "Forms, buttons, filters, and exports need functional handlers or route targets.", ["qa", "interaction"], 94, ["Prevents fake controls"], "Interaction validator"),
    ],
    componentMemory: [
      item("component-command-header", "Command header", "Primary navigation with builder, dashboard, generated apps, and warehouse links.", ["navigation", "layout"], 88, ["Keeps factory areas discoverable"], "Header nav system"),
      item("component-metric-card", "Metric card system", "Reusable compact cards for scores, counts, health, and readiness.", ["metrics", "dashboard"], 91, ["Used by dashboard and warehouse"], "Label + value + optional delta"),
      item("component-warehouse-card", "Warehouse memory card", "Reusable inventory card for apps, features, components, and patterns.", ["warehouse", "cards"], 90, ["Supports search, compare, preview, and remix"], "Score + status + evidence"),
    ],
    patternMemory: [
      item("pattern-fork-remix-evolve", "Fork, remix, evolve actions", "Winning apps should become raw material for future generations.", ["remix", "generation"], 94, ["Core app factory behavior"], "Action model"),
      item("pattern-promote-downgrade", "Promote or downgrade by evidence", "Repeated success raises pattern rank; removals and failures lower it.", ["learning", "evolution"], 93, ["Captures user edits and outcomes"], "Pattern evolution rules"),
    ],
  };
}

function normalizeWarehouse(snapshot: Partial<WarehouseSnapshot>): WarehouseSnapshot {
  const seed = seedWarehouse();
  return {
    version: snapshot.version ?? seed.version,
    updatedAt: snapshot.updatedAt ?? seed.updatedAt,
    apps: snapshot.apps ?? [],
    designMemory: snapshot.designMemory ?? seed.designMemory,
    featureMemory: snapshot.featureMemory ?? seed.featureMemory,
    bugMemory: snapshot.bugMemory ?? seed.bugMemory,
    generationMemory: snapshot.generationMemory ?? seed.generationMemory,
    qualityMemory: snapshot.qualityMemory ?? seed.qualityMemory,
    componentMemory: snapshot.componentMemory ?? seed.componentMemory,
    patternMemory: snapshot.patternMemory ?? seed.patternMemory,
  };
}

function matchesApp(app: AppMemory, term: string, filter: string) {
  const inFilter = filter === "all" || app.tags.includes(filter) || app.category === filter || (filter === "winning" && app.qualityScore >= 85);
  if (!term) return inFilter;
  const haystack = [app.appName, app.category, app.audience, app.problemSolved, app.designDirection, app.monetizationLogic, ...app.features, ...app.tags].join(" ").toLowerCase();
  return inFilter && haystack.includes(term);
}

function inferLayout(project: ProjectRecord) {
  const source = project.files.map((file) => file.content).join(" ");
  if (source.includes("grid")) return "Responsive grid with metric cards and primary workspace panels.";
  if (source.includes("dashboard")) return "Dashboard-first layout with onboarding and operational views.";
  return "Focused product workspace with primary action area and supporting details.";
}

function inferComponents(project: ProjectRecord) {
  const components = ["App shell", "Metric cards", "Primary actions"];
  if (project.features.some((feature) => feature.toLowerCase().includes("search"))) components.push("Search controls");
  if (project.onboarding.length) components.push("Onboarding checklist");
  if (project.files.some((file) => file.path.includes("package"))) components.push("Export package");
  return components;
}

function promotedStrengths(scores: QualityScores) {
  const strengths = [];
  if (scores.polish >= 85) strengths.push("Premium visual polish");
  if (scores.responsiveness >= 85) strengths.push("Responsive layout");
  if (scores.architectureQuality >= 85) strengths.push("Clean file architecture");
  if (scores.featureCompleteness >= 85) strengths.push("Feature-complete workflow");
  if (scores.monetizationReadiness >= 85) strengths.push("Monetization path");
  return strengths.length ? strengths : ["Persisted app record ready for remixing"];
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
