import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getAppWarehouse } from "@/lib/app-warehouse";
import { listProjects } from "@/lib/project-store";

export type RegistryStatus = "recommended" | "experimental" | "deprecated";
export type HealthStatus = "healthy" | "watch" | "blocked";

export type EcosystemPlugin = {
  id: string;
  name: string;
  category: string;
  version: string;
  description: string;
  installLogic: string[];
  configuration: Record<string, string>;
  dependencies: string[];
  dependencyValidation: string[];
  rollbackPath: string;
  tests: string[];
  healthStatus: HealthStatus;
  docs: string;
  compatibleBuilders: string[];
  usageCount: number;
  qualityScore: number;
  status: RegistryStatus;
};

export type VerticalBuilder = {
  id: string;
  name: string;
  description: string;
  defaults: {
    uxPatterns: string[];
    layouts: string[];
    onboarding: string[];
    monetization: string[];
    navigation: string[];
    dashboards: string[];
    analytics: string[];
    permissions: string[];
  };
  warehousePatterns: string[];
  recommendedPlugins: string[];
  qualityScore: number;
  usageCount: number;
};

export type MarketplaceComponent = {
  id: string;
  name: string;
  kind: "ui" | "functional";
  tags: string[];
  qualityScore: number;
  usageCount: number;
  docs: string;
  examples: string[];
  compatibility: string[];
  responsiveness: string;
  accessibility: string;
  tests: string[];
  status: RegistryStatus;
};

export type AgentDefinition = {
  id: string;
  name: string;
  purpose: string;
  enabled: boolean;
  chainsWith: string[];
  customizable: boolean;
  performanceScore: number;
  runs: number;
  retireIfBelow: number;
  status: RegistryStatus;
};

export type WorkflowDefinition = {
  id: string;
  name: string;
  objective: string;
  steps: string[];
  dependencies: string[];
  expectedOutcomes: string[];
  validationChecks: string[];
  usageCount: number;
  qualityScore: number;
};

export type TeamMember = {
  id: string;
  name: string;
  role: "founder" | "developer" | "designer" | "QA" | "marketer" | "reviewer";
  permissions: string[];
  owns: string[];
  approvals: string[];
};

export type KnowledgeEntry = {
  id: string;
  title: string;
  type: "best-practice" | "bug" | "decision" | "onboarding-win" | "failed-experiment" | "prompt" | "launch-playbook" | "design-system";
  summary: string;
  tags: string[];
  version: number;
  source: string;
  reusableIn: string[];
};

export type EcosystemSnapshot = {
  version: number;
  updatedAt: string;
  modes: Array<{ name: string; description: string; qualityBias: string; speed: string }>;
  plugins: EcosystemPlugin[];
  builders: VerticalBuilder[];
  components: MarketplaceComponent[];
  agents: AgentDefinition[];
  workflows: WorkflowDefinition[];
  team: TeamMember[];
  templates: Array<{
    id: string;
    name: string;
    category: string;
    usageCount: number;
    bugs: number;
    edits: number;
    retentionScore: number;
    polishScore: number;
    onboardingSuccess: number;
    evolutionStatus: "promote" | "watch" | "archive";
  }>;
  knowledge: KnowledgeEntry[];
  releaseStatus: {
    pluginCompatibility: boolean;
    componentStability: boolean;
    regressionSafety: boolean;
    responsiveUI: boolean;
    warehouseReuse: boolean;
    launchReadiness: boolean;
    documentationQuality: boolean;
    score: number;
  };
};

const bundledRoot = path.join(process.cwd(), "generated-apps");
const root = process.env.VERCEL ? path.join(os.tmpdir(), "ventureos-generated-apps") : bundledRoot;
const ecosystemPath = path.join(root, "ecosystem-os.json");

export async function getEcosystemOS(): Promise<EcosystemSnapshot> {
  await fs.mkdir(root, { recursive: true });
  const [projects, warehouse] = await Promise.all([listProjects(true), getAppWarehouse()]);
  const previous = await readPrevious();
  const snapshot = evolveEcosystem(seedEcosystem(), previous, projects, warehouse);
  await fs.writeFile(ecosystemPath, JSON.stringify(snapshot, null, 2));
  return snapshot;
}

async function readPrevious(): Promise<EcosystemSnapshot | null> {
  try {
    return JSON.parse(await fs.readFile(ecosystemPath, "utf8")) as EcosystemSnapshot;
  } catch {
    return null;
  }
}

function evolveEcosystem(base: EcosystemSnapshot, previous: EcosystemSnapshot | null, projects: Awaited<ReturnType<typeof listProjects>>, warehouse: Awaited<ReturnType<typeof getAppWarehouse>>): EcosystemSnapshot {
  const activeProjects = projects.filter((project) => project.status !== "archived");
  const warehouseComponentNames = new Set(warehouse.componentMemory.map((component) => component.title));
  const components = base.components.map((component) => ({
    ...component,
    usageCount: activeProjects.filter((project) => project.features.some((feature) => component.tags.some((tag) => feature.toLowerCase().includes(tag)))).length + (warehouseComponentNames.has(component.name) ? 1 : 0),
  }));
  const templates = activeProjects.map((project) => {
    const quality = project.qa?.score ?? project.qualityScore ?? 75;
    return {
      id: project.id,
      name: project.name,
      category: project.category,
      usageCount: Math.max(1, previous?.templates.find((template) => template.id === project.id)?.usageCount ?? 1),
      bugs: project.qa?.issues?.length ?? 0,
      edits: project.repairs?.length ?? 0,
      retentionScore: project.launchOS ? 90 : 65,
      polishScore: project.polishScore ?? quality,
      onboardingSuccess: project.onboarding.length >= 3 ? 92 : 55,
      evolutionStatus: quality >= 90 && project.launchOS ? "promote" as const : quality < 75 ? "archive" as const : "watch" as const,
    };
  });
  const releaseStatus = computeReleaseStatus(base, components, templates, warehouse.apps.length);
  return {
    ...base,
    updatedAt: new Date().toISOString(),
    components,
    templates,
    knowledge: mergeKnowledge(base.knowledge, warehouse),
    releaseStatus,
  };
}

function computeReleaseStatus(base: EcosystemSnapshot, components: MarketplaceComponent[], templates: EcosystemSnapshot["templates"], warehouseApps: number) {
  const pluginCompatibility = base.plugins.every((plugin) => plugin.healthStatus !== "blocked");
  const componentStability = components.filter((component) => component.status !== "deprecated").every((component) => component.qualityScore >= 85);
  const regressionSafety = templates.every((template) => template.bugs === 0 || template.evolutionStatus !== "promote");
  const responsiveUI = components.every((component) => component.responsiveness.includes("mobile") || component.status === "experimental");
  const warehouseReuse = warehouseApps > 0;
  const launchReadiness = templates.length === 0 || templates.some((template) => template.evolutionStatus === "promote");
  const documentationQuality = base.plugins.every((plugin) => plugin.docs.length > 20) && components.every((component) => component.docs.length > 20);
  const values = [pluginCompatibility, componentStability, regressionSafety, responsiveUI, warehouseReuse, launchReadiness, documentationQuality];
  return { pluginCompatibility, componentStability, regressionSafety, responsiveUI, warehouseReuse, launchReadiness, documentationQuality, score: Math.round((values.filter(Boolean).length / values.length) * 100) };
}

function mergeKnowledge(base: KnowledgeEntry[], warehouse: Awaited<ReturnType<typeof getAppWarehouse>>) {
  const generated: KnowledgeEntry[] = [
    ...warehouse.bugMemory.map((bug) => ({ id: `knowledge-${bug.id}`, title: bug.title, type: "bug" as const, summary: `${bug.issue} Fix: ${bug.fix}`, tags: bug.tags, version: 1, source: "App Warehouse bug memory", reusableIn: ["QA", "generation", "repair"] })),
    ...warehouse.patternMemory.map((pattern) => ({ id: `knowledge-${pattern.id}`, title: pattern.title, type: "best-practice" as const, summary: pattern.summary, tags: pattern.tags, version: 1, source: "App Warehouse pattern memory", reusableIn: ["builders", "components", "workflows"] })),
  ];
  const byId = new Map([...base, ...generated].map((entry) => [entry.id, entry]));
  return Array.from(byId.values());
}

function seedEcosystem(): EcosystemSnapshot {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    modes: [
      { name: "Quick Build", description: "Fast MVP generation with core gates.", qualityBias: "speed with minimum safety", speed: "fast" },
      { name: "Premium Build", description: "High polish, launch-ready app creation.", qualityBias: "visual and UX polish", speed: "slower" },
      { name: "Startup Mode", description: "Business, growth, onboarding, and monetization first.", qualityBias: "commercial viability", speed: "balanced" },
      { name: "Scale Mode", description: "Architecture, reliability, permissions, and performance.", qualityBias: "stability", speed: "deliberate" },
      { name: "Experiment Mode", description: "Rapid test surfaces and growth ideas.", qualityBias: "learning velocity", speed: "fast" },
      { name: "Repair Mode", description: "Fix broken apps and regressions first.", qualityBias: "risk reduction", speed: "targeted" },
    ],
    plugins: [
      plugin("auth-core", "Auth Systems", "authentication", "Signup, login, logout, sessions, account settings, and protected route scaffolds.", ["Install auth routes", "Add account settings", "Validate protected screens"], ["SESSION_SECRET"], ["session route present", "logout action bound"], ["Remove auth routes and session config"], ["signup flow", "login flow", "logout flow"], ["SaaS Builder", "Marketplace Builder", "Internal Ops Builder"]),
      plugin("analytics-core", "Analytics", "analytics", "Activation, engagement, retention, conversion, and quality event tracking.", ["Add event schema", "Wire launch metrics", "Persist analytics plan"], ["ANALYTICS_WRITE_KEY optional"], ["event list present", "quality events present"], ["Remove analytics config and event calls"], ["activation event", "conversion event", "rage click event"], ["SaaS Builder", "Creator Tool Builder", "Community Builder"]),
      plugin("payments-core", "Payments", "payments", "Pricing tiers, premium gates, checkout readiness, and billing settings.", ["Create pricing model", "Add premium gates", "Validate upgrade prompts"], ["PAYMENTS_PROVIDER optional"], ["tiers defined", "rollback plan defined"], ["Disable gates and restore free plan"], ["pricing render", "upgrade trigger"], ["SaaS Builder", "Marketplace Builder", "Ecommerce Helper Builder"]),
      plugin("exports-core", "Export Systems", "exports", "Downloadable source, reports, CSV, and launch asset exports.", ["Add export route", "Validate file boundaries", "Add user feedback"], [], ["download route present"], ["Remove export route"], ["download source", "invalid path guard"], ["Internal Ops Builder", "Productivity Builder"]),
      plugin("search-core", "Search Systems", "search", "Reusable search, filters, result counts, and empty-state recovery.", ["Install search controls", "Bind filter state", "Add empty state"], [], ["query state present", "empty state present"], ["Remove search component"], ["search no results", "clear query"], ["All builders"]),
    ],
    builders: [
      builder("saas", "SaaS Builder", "Pricing, onboarding, account, billing, dashboard, analytics, and invite-ready SaaS defaults.", ["dashboard grid", "pricing page", "account settings"], ["auth-core", "analytics-core", "payments-core"]),
      builder("marketplace", "Marketplace Builder", "Supply/demand profiles, listings, search, trust, payments, and admin defaults.", ["listing grid", "trust cards", "admin queue"], ["auth-core", "payments-core", "search-core"]),
      builder("creator", "Creator Tool Builder", "Editor-first workflows, publishing calendar, asset previews, and creator monetization.", ["editor workspace", "content pipeline", "preview panel"], ["analytics-core", "exports-core"]),
      builder("ai-tool", "AI Tool Builder", "Prompt workspace, streaming states, safety notices, history, and usage limits.", ["chat workspace", "history", "usage meter"], ["analytics-core", "auth-core"]),
      builder("community", "Community Builder", "Profiles, feeds, moderation, notifications, discovery, and engagement loops.", ["feed", "member cards", "moderation queue"], ["auth-core", "search-core"]),
      builder("internal-ops", "Internal Ops Builder", "Dense dashboards, tables, approvals, audit trails, and export workflows.", ["ops dashboard", "approval queue", "audit log"], ["exports-core", "search-core"]),
    ],
    components: [
      component("nav-system", "Navigation System", "ui", ["navigation", "layout"], "Responsive header/sidebar navigation with active states.", ["Builder header", "Dashboard nav"], ["Next App Router", "Tailwind"], "mobile and desktop responsive", "keyboard reachable links", ["route link render"], "recommended", 93),
      component("metric-card", "Metric Card System", "ui", ["metrics", "dashboard"], "Compact score and KPI cards with stable dimensions.", ["Quality score", "Release confidence"], ["Next", "React"], "mobile grid responsive", "semantic text and contrast", ["score render"], "recommended", 92),
      component("onboarding-checklist", "Onboarding Checklist", "functional", ["onboarding", "activation"], "Guided setup checklist connected to first value.", ["Launch setup", "Account setup"], ["React state", "local persistence"], "mobile stacked", "button labels are explicit", ["toggle step", "persist state"], "recommended", 94),
      component("pricing-table", "Pricing Table", "ui", ["pricing", "conversion"], "Tiered pricing with gates, upgrade logic, and trust copy.", ["Free/Pro/Team"], ["Launch OS"], "mobile cards", "clear plan buttons", ["tier render"], "recommended", 90),
      component("search-filter", "Search and Filter Controls", "functional", ["search", "filters"], "Controlled search with no-results recovery.", ["Metric search", "Warehouse search"], ["React state"], "mobile input full-width", "labelled input", ["query filters results"], "recommended", 91),
      component("feedback-widget", "Feedback Widget", "functional", ["feedback", "learning"], "Collects bug, confusion, feature request, and unmet expectation signals.", ["After export", "Empty state"], ["Warehouse memory"], "mobile modal", "clear categories", ["submit feedback"], "experimental", 84),
    ],
    agents: [
      agent("ux-reviewer", "UX Reviewer", "Finds friction, confusing navigation, weak empty states, and onboarding gaps.", ["QA Break Tester", "Accessibility Reviewer"], 91),
      agent("accessibility-reviewer", "Accessibility Reviewer", "Checks keyboard paths, labels, contrast, and semantic structure.", ["UX Reviewer", "Frontend Engineer"], 89),
      agent("growth-optimizer", "Growth Optimizer", "Improves activation, retention, conversion, and referral moments.", ["Monetization Advisor", "Landing Page Writer"], 92),
      agent("refactor-agent", "Refactor Agent", "Finds duplicated logic, bloated components, weak naming, and fragile APIs.", ["API Architect", "Performance Optimizer"], 87),
      agent("api-architect", "API Architect", "Designs typed, stable, secure API and persistence contracts.", ["Security Engineer", "Refactor Agent"], 90),
      agent("performance-optimizer", "Performance Optimizer", "Reduces render cost and improves perceived speed.", ["Frontend Engineer"], 88),
      agent("monetization-advisor", "Monetization Advisor", "Designs pricing, upgrade triggers, and value-based gates.", ["Growth Optimizer"], 91),
      agent("qa-break-tester", "QA Break Tester", "Attacks buttons, routes, persistence, onboarding, and responsive states.", ["UX Reviewer", "Security Engineer"], 94),
    ],
    workflows: [
      workflow("launch-saas-mvp", "Launch SaaS MVP", "Ship a SaaS with onboarding, pricing, analytics, and QA approval.", ["Select SaaS Builder", "Install auth/analytics/payments", "Run App CEO", "Run QA", "Create Launch OS"], ["saas builder", "auth-core"], ["90+ score", "pricing live", "launch assets ready"], ["build", "type-check", "QA approved"]),
      workflow("improve-onboarding", "Improve Onboarding", "Reduce activation friction and increase first value completion.", ["Review drop-off", "Simplify steps", "Add progress", "Retest beginner user"], ["analytics-core"], ["higher onboarding success"], ["simulated beginner passes"]),
      workflow("fix-broken-app", "Fix Broken App", "Diagnose and repair regressions before release.", ["Run QA", "Identify blockers", "Repair", "Retest", "Record bug memory"], ["QA Break Tester"], ["zero blockers"], ["QA score >= 90"]),
      workflow("premium-ui-pass", "Premium UI Pass", "Improve hierarchy, spacing, contrast, and responsive polish.", ["Audit surfaces", "Apply component system", "Mobile check", "CEO review"], ["UX Reviewer"], ["premium feel"], ["visual score >= 90"]),
      workflow("growth-audit", "Growth Audit", "Improve activation, conversion, retention, and recommendation moments.", ["Review Launch OS", "Inspect pricing triggers", "Add feedback loop", "Retest"], ["growth-optimizer"], ["clear upgrade path"], ["conversion events present"]),
    ],
    team: [
      { id: "founder", name: "Founder", role: "founder", permissions: ["approve release", "change mode", "assign owners"], owns: ["strategy", "release status"], approvals: ["launch", "pricing"] },
      { id: "developer", name: "Developer", role: "developer", permissions: ["edit code", "run QA", "install plugins"], owns: ["architecture", "APIs"], approvals: ["technical review"] },
      { id: "designer", name: "Designer", role: "designer", permissions: ["review UI", "approve visual system"], owns: ["components", "UX"], approvals: ["premium UI pass"] },
      { id: "qa", name: "QA", role: "QA", permissions: ["block release", "write regression"], owns: ["quality gates"], approvals: ["QA pass"] },
      { id: "marketer", name: "Marketer", role: "marketer", permissions: ["edit launch assets", "review positioning"], owns: ["GTM", "pricing copy"], approvals: ["launch messaging"] },
      { id: "reviewer", name: "Reviewer", role: "reviewer", permissions: ["comment", "compare versions"], owns: ["release notes"], approvals: ["changelog"] },
    ],
    templates: [],
    knowledge: [
      { id: "knowledge-no-dead-buttons", title: "No dead buttons", type: "best-practice", summary: "Every button must bind to a handler, route, submit action, or explicit disabled state.", tags: ["qa", "buttons"], version: 1, source: "Bug memory", reusableIn: ["QA", "Frontend", "Plugins"] },
      { id: "knowledge-launch-before-ship", title: "Launch before ship", type: "launch-playbook", summary: "A launch-ready app needs brand, positioning, pricing, analytics, retention, conversion, feedback, and GTM assets.", tags: ["launch", "growth"], version: 1, source: "Launch OS", reusableIn: ["Startup Mode", "Premium Build"] },
    ],
    releaseStatus: {
      pluginCompatibility: true,
      componentStability: true,
      regressionSafety: true,
      responsiveUI: true,
      warehouseReuse: true,
      launchReadiness: true,
      documentationQuality: true,
      score: 100,
    },
  };
}

function plugin(id: string, name: string, category: string, description: string, installLogic: string[], dependencies: string[], dependencyValidation: string[], rollback: string[], tests: string[], compatibleBuilders: string[]): EcosystemPlugin {
  return { id, name, category, version: "1.0.0", description, installLogic, configuration: Object.fromEntries(dependencies.map((dep) => [dep, "optional or environment-provided"])), dependencies, dependencyValidation, rollbackPath: rollback.join(" -> "), tests, healthStatus: "healthy", docs: `${name} plugin: ${description}`, compatibleBuilders, usageCount: 0, qualityScore: 90, status: "recommended" };
}

function builder(id: string, name: string, description: string, layouts: string[], plugins: string[]): VerticalBuilder {
  return { id, name, description, defaults: { uxPatterns: ["guided onboarding", "actionable empty states", "searchable dashboard"], layouts, onboarding: ["goal", "workflow", "first value"], monetization: ["free", "pro", "team"], navigation: ["dashboard", "settings", "pricing"], dashboards: ["metrics", "activity", "readiness"], analytics: ["activation", "engagement", "conversion"], permissions: ["owner", "member", "viewer"] }, warehousePatterns: ["Guided setup checklist", "Dense SaaS dashboard grid"], recommendedPlugins: plugins, qualityScore: 90, usageCount: 0 };
}

function component(id: string, name: string, kind: MarketplaceComponent["kind"], tags: string[], docs: string, examples: string[], compatibility: string[], responsiveness: string, accessibility: string, tests: string[], status: RegistryStatus, qualityScore: number): MarketplaceComponent {
  return { id, name, kind, tags, qualityScore, usageCount: 0, docs, examples, compatibility, responsiveness, accessibility, tests, status };
}

function agent(id: string, name: string, purpose: string, chainsWith: string[], score: number): AgentDefinition {
  return { id, name, purpose, enabled: true, chainsWith, customizable: true, performanceScore: score, runs: 0, retireIfBelow: 75, status: score >= 88 ? "recommended" : "experimental" };
}

function workflow(id: string, name: string, objective: string, steps: string[], dependencies: string[], expectedOutcomes: string[], validationChecks: string[]): WorkflowDefinition {
  return { id, name, objective, steps, dependencies, expectedOutcomes, validationChecks, usageCount: 0, qualityScore: 90 };
}
