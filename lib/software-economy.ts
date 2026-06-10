import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getAppWarehouse } from "@/lib/app-warehouse";
import { getEcosystemOS } from "@/lib/ecosystem-os";
import { listProjects } from "@/lib/project-store";

export type ProductUnitType = "app" | "plugin" | "component" | "workflow" | "template" | "agent";
export type LifecycleStage = "CREATED" | "DEPLOYED" | "USED" | "RATED" | "IMPROVED" | "REMIXED" | "PROMOTED" | "DEPRECATED";
export type MonetizationModel = "subscription" | "one-time purchase" | "usage-based" | "revenue share" | "freemium";

export type ProductUnit = {
  id: string;
  type: ProductUnitType;
  name: string;
  category: string;
  lifecycle: LifecycleStage;
  rank: number;
  rankScore: number;
  qualityGate: "accepted" | "sandboxed" | "blocked";
  metrics: {
    usage: number;
    activation: number;
    retention: number;
    engagement: number;
    conversion: number;
    performance: number;
    satisfaction: number;
    errorRate: number;
    churnRisk: number;
  };
  monetization: {
    model: MonetizationModel;
    revenue: number;
    conversionRate: number;
    upgradeTriggers: string[];
    pricingRecommendation: string;
  };
  lineage: {
    parentId?: string;
    origin: string;
    remixes: string[];
    modifications: string[];
    performanceEvolution: Array<{ version: string; score: number; note: string }>;
  };
  evolution: {
    action: "promote" | "improve" | "sandbox" | "deprecate" | "propagate";
    reason: string;
    propagationTargets: string[];
  };
};

export type SoftwareEconomySnapshot = {
  version: number;
  updatedAt: string;
  units: ProductUnit[];
  rankings: {
    apps: ProductUnit[];
    plugins: ProductUnit[];
    components: ProductUnit[];
    workflows: ProductUnit[];
    templates: ProductUnit[];
    agents: ProductUnit[];
  };
  sections: {
    topPerformingApps: ProductUnit[];
    risingPlugins: ProductUnit[];
    bestComponents: ProductUnit[];
    highConversionTemplates: ProductUnit[];
    trendingWorkflows: ProductUnit[];
    mostRemixedAssets: ProductUnit[];
    revenueLeaders: ProductUnit[];
    failedExperiments: ProductUnit[];
    deprecatedItems: ProductUnit[];
    opportunityGaps: string[];
  };
  originGraph: {
    nodes: Array<{ id: string; label: string; type: ProductUnitType; lifecycle: LifecycleStage }>;
    edges: Array<{ from: string; to: string; label: string }>;
  };
  propagationQueue: Array<{ feature: string; sourceUnit: string; targets: string[]; expectedLift: string }>;
  trendAdaptation: Array<{ trend: string; action: string; boostedUnits: string[] }>;
  qualityLoop: string[];
};

const bundledRoot = path.join(process.cwd(), "generated-apps");
const root = process.env.VERCEL ? path.join(os.tmpdir(), "ventureos-generated-apps") : bundledRoot;
const economyPath = path.join(root, "software-economy.json");

export async function getSoftwareEconomy(): Promise<SoftwareEconomySnapshot> {
  await fs.mkdir(root, { recursive: true });
  const [projects, warehouse, ecosystem] = await Promise.all([listProjects(true), getAppWarehouse(), getEcosystemOS()]);
  const units = rankUnits([
    ...projects.filter((project) => project.status !== "archived").map((project) => appUnit(project)),
    ...ecosystem.plugins.map((plugin) => assetUnit("plugin", plugin.id, plugin.name, plugin.category, plugin.qualityScore, plugin.usageCount, plugin.status, plugin.healthStatus === "healthy" ? 95 : 70)),
    ...ecosystem.components.map((component) => assetUnit("component", component.id, component.name, component.kind, component.qualityScore, component.usageCount, component.status, component.qualityScore)),
    ...ecosystem.workflows.map((workflow) => assetUnit("workflow", workflow.id, workflow.name, "workflow", workflow.qualityScore, workflow.usageCount, "recommended", workflow.qualityScore)),
    ...ecosystem.templates.map((template) => templateUnit(template)),
    ...ecosystem.agents.map((agent) => assetUnit("agent", agent.id, agent.name, "agent", agent.performanceScore, agent.runs, agent.status, agent.performanceScore)),
  ]);
  const snapshot: SoftwareEconomySnapshot = {
    version: 1,
    updatedAt: new Date().toISOString(),
    units,
    rankings: {
      apps: byType(units, "app"),
      plugins: byType(units, "plugin"),
      components: byType(units, "component"),
      workflows: byType(units, "workflow"),
      templates: byType(units, "template"),
      agents: byType(units, "agent"),
    },
    sections: buildSections(units, warehouse.apps.map((app) => app.category)),
    originGraph: buildOriginGraph(units),
    propagationQueue: propagationQueue(units),
    trendAdaptation: trendAdaptation(units),
    qualityLoop: ["collect usage data", "evaluate performance", "update rankings", "promote winners", "improve weak assets", "propagate improvements", "repeat"],
  };
  await fs.writeFile(economyPath, JSON.stringify(snapshot, null, 2));
  return snapshot;
}

function appUnit(project: Awaited<ReturnType<typeof listProjects>>[number]): ProductUnit {
  const score = project.qa?.score ?? project.qualityScore ?? 75;
  const launch = project.launchOS;
  const usage = Math.max(1, project.files.length + (project.repairs?.length ?? 0));
  const activation = launch ? 92 : 65;
  const retention = launch ? 88 : 60;
  const conversion = launch ? Math.min(92, 55 + launch.pricing.tiers.length * 10) : 40;
  const rankScore = weightedScore({ usage, activation, retention, engagement: 80, conversion, performance: score, satisfaction: score, errorRate: project.qa?.issues.length ?? 1, churnRisk: launch ? 18 : 42 });
  return {
    id: `app:${project.id}`,
    type: "app",
    name: project.launchOS?.brand.productName || project.name,
    category: project.category,
    lifecycle: lifecycle(rankScore, score, usage),
    rank: 0,
    rankScore,
    qualityGate: score >= 90 && launch ? "accepted" : score >= 75 ? "sandboxed" : "blocked",
    metrics: { usage, activation, retention, engagement: 80, conversion, performance: score, satisfaction: score, errorRate: project.qa?.issues.length ?? 0, churnRisk: launch ? 18 : 42 },
    monetization: {
      model: launch ? "subscription" : "freemium",
      revenue: launch ? conversion * 12 : 0,
      conversionRate: conversion,
      upgradeTriggers: launch?.pricing.conversionPaths ?? ["complete onboarding", "export source"],
      pricingRecommendation: launch?.pricing.upgradeLogic ?? "Attach Launch OS before monetization.",
    },
    lineage: {
      origin: "generated app",
      remixes: [],
      modifications: project.repairs?.map((repair) => `repair cycle ${repair.cycle}`) ?? [],
      performanceEvolution: [{ version: "current", score, note: project.orchestration?.ceo.approval ?? "pending CEO" }],
    },
    evolution: evolution(rankScore, score, launch ? ["templates", "builders", "future generations"] : []),
  };
}

function assetUnit(type: ProductUnitType, id: string, name: string, category: string, quality: number, usage: number, status: string, performance: number): ProductUnit {
  const errorRate = status === "deprecated" ? 8 : 0;
  const rankScore = weightedScore({ usage, activation: quality, retention: quality, engagement: Math.max(usage * 12, 70), conversion: type === "plugin" ? 78 : 66, performance, satisfaction: quality, errorRate, churnRisk: status === "deprecated" ? 70 : 20 });
  return {
    id: `${type}:${id}`,
    type,
    name,
    category,
    lifecycle: status === "deprecated" ? "DEPRECATED" : quality >= 90 ? "PROMOTED" : usage > 0 ? "USED" : "CREATED",
    rank: 0,
    rankScore,
    qualityGate: quality >= 85 && status !== "deprecated" ? "accepted" : status === "deprecated" ? "blocked" : "sandboxed",
    metrics: { usage, activation: quality, retention: quality, engagement: Math.max(usage * 12, 70), conversion: type === "plugin" ? 78 : 66, performance, satisfaction: quality, errorRate, churnRisk: status === "deprecated" ? 70 : 20 },
    monetization: { model: type === "plugin" ? "usage-based" : "freemium", revenue: Math.max(0, usage * quality), conversionRate: type === "plugin" ? 78 : 66, upgradeTriggers: ["reuse in builder", "install in workflow"], pricingRecommendation: quality >= 90 ? "Promote as default asset." : "Keep experimental until usage improves." },
    lineage: { origin: `${type} registry`, remixes: [], modifications: [], performanceEvolution: [{ version: "1.0.0", score: quality, note: status }] },
    evolution: evolution(rankScore, quality, quality >= 90 ? ["similar apps", "templates", "builders"] : []),
  };
}

function templateUnit(template: Awaited<ReturnType<typeof getEcosystemOS>>["templates"][number]): ProductUnit {
  const rankScore = weightedScore({ usage: template.usageCount, activation: template.onboardingSuccess, retention: template.retentionScore, engagement: 75, conversion: template.retentionScore, performance: template.polishScore, satisfaction: template.polishScore, errorRate: template.bugs, churnRisk: template.evolutionStatus === "archive" ? 75 : 20 });
  return {
    id: `template:${template.id}`,
    type: "template",
    name: template.name,
    category: template.category,
    lifecycle: template.evolutionStatus === "archive" ? "DEPRECATED" : template.evolutionStatus === "promote" ? "PROMOTED" : "IMPROVED",
    rank: 0,
    rankScore,
    qualityGate: template.evolutionStatus === "archive" ? "blocked" : template.evolutionStatus === "promote" ? "accepted" : "sandboxed",
    metrics: { usage: template.usageCount, activation: template.onboardingSuccess, retention: template.retentionScore, engagement: 75, conversion: template.retentionScore, performance: template.polishScore, satisfaction: template.polishScore, errorRate: template.bugs, churnRisk: template.evolutionStatus === "archive" ? 75 : 20 },
    monetization: { model: "revenue share", revenue: template.retentionScore * template.usageCount, conversionRate: template.retentionScore, upgradeTriggers: ["clone template", "combine templates"], pricingRecommendation: template.evolutionStatus === "promote" ? "Feature as high-conversion template." : "Keep out of defaults until quality improves." },
    lineage: { origin: "template evolution engine", remixes: [], modifications: [`${template.edits} edits tracked`], performanceEvolution: [{ version: "current", score: template.polishScore, note: template.evolutionStatus }] },
    evolution: evolution(rankScore, template.polishScore, template.evolutionStatus === "promote" ? ["vertical builders", "future generations"] : []),
  };
}

function weightedScore(metrics: ProductUnit["metrics"]) {
  return Math.round(metrics.activation * 0.16 + metrics.retention * 0.16 + metrics.conversion * 0.14 + metrics.performance * 0.16 + metrics.satisfaction * 0.16 + Math.min(100, metrics.usage * 10) * 0.1 + (100 - metrics.errorRate * 8) * 0.08 + (100 - metrics.churnRisk) * 0.04);
}

function lifecycle(rankScore: number, quality: number, usage: number): LifecycleStage {
  if (quality < 75) return "DEPRECATED";
  if (rankScore >= 90) return "PROMOTED";
  if (rankScore >= 84) return "IMPROVED";
  if (usage >= 3) return "USED";
  if (quality >= 90) return "RATED";
  return "CREATED";
}

function evolution(rankScore: number, quality: number, propagationTargets: string[]): ProductUnit["evolution"] {
  if (quality < 75) return { action: "deprecate", reason: "Quality is below marketplace threshold.", propagationTargets: [] };
  if (rankScore >= 90) return { action: "propagate", reason: "Performance is strong enough to become a default.", propagationTargets };
  if (rankScore >= 82) return { action: "promote", reason: "Asset is stable and useful.", propagationTargets };
  return { action: "improve", reason: "Needs more usage, retention, or conversion evidence.", propagationTargets: [] };
}

function rankUnits(units: ProductUnit[]) {
  return units
    .sort((a, b) => b.rankScore - a.rankScore)
    .map((unit, index) => ({ ...unit, rank: index + 1 }));
}

function byType(units: ProductUnit[], type: ProductUnitType) {
  return units.filter((unit) => unit.type === type).sort((a, b) => b.rankScore - a.rankScore);
}

function buildSections(units: ProductUnit[], categories: string[]): SoftwareEconomySnapshot["sections"] {
  return {
    topPerformingApps: byType(units, "app").slice(0, 6),
    risingPlugins: byType(units, "plugin").filter((unit) => unit.lifecycle !== "DEPRECATED").slice(0, 6),
    bestComponents: byType(units, "component").slice(0, 6),
    highConversionTemplates: byType(units, "template").filter((unit) => unit.metrics.conversion >= 80).slice(0, 6),
    trendingWorkflows: byType(units, "workflow").slice(0, 6),
    mostRemixedAssets: units.filter((unit) => unit.lineage.remixes.length > 0 || unit.evolution.propagationTargets.length > 0).slice(0, 6),
    revenueLeaders: [...units].sort((a, b) => b.monetization.revenue - a.monetization.revenue).slice(0, 6),
    failedExperiments: units.filter((unit) => unit.qualityGate !== "accepted").slice(0, 6),
    deprecatedItems: units.filter((unit) => unit.lifecycle === "DEPRECATED"),
    opportunityGaps: opportunityGaps(categories, units),
  };
}

function buildOriginGraph(units: ProductUnit[]): SoftwareEconomySnapshot["originGraph"] {
  const nodes = units.map((unit) => ({ id: unit.id, label: unit.name, type: unit.type, lifecycle: unit.lifecycle }));
  const edges = units.flatMap((unit) => [
    ...(unit.lineage.parentId ? [{ from: unit.lineage.parentId, to: unit.id, label: "remixed into" }] : []),
    ...unit.evolution.propagationTargets.map((target) => ({ from: unit.id, to: `target:${target}`, label: "propagates to" })),
  ]);
  return { nodes, edges };
}

function propagationQueue(units: ProductUnit[]) {
  return units
    .filter((unit) => unit.evolution.action === "propagate")
    .map((unit) => ({ feature: unit.name, sourceUnit: unit.id, targets: unit.evolution.propagationTargets, expectedLift: "Expected lift: better activation, reuse, or quality consistency." }))
    .slice(0, 8);
}

function trendAdaptation(units: ProductUnit[]) {
  const boosted = units.filter((unit) => /saas|ops|automation|creator/i.test(unit.category)).slice(0, 5).map((unit) => unit.name);
  return [
    { trend: "B2B operations automation", action: "Boost SaaS and internal ops assets.", boostedUnits: boosted },
    { trend: "Launch-ready templates", action: "Prioritize templates with Launch OS and 90+ QA.", boostedUnits: units.filter((unit) => unit.type === "template" && unit.rankScore >= 85).map((unit) => unit.name).slice(0, 5) },
    { trend: "Reusable quality gates", action: "Propagate top QA and onboarding patterns into future builders.", boostedUnits: units.filter((unit) => unit.evolution.action === "propagate").map((unit) => unit.name).slice(0, 5) },
  ];
}

function opportunityGaps(categories: string[], units: ProductUnit[]) {
  const gaps = [];
  if (!categories.some((category) => /local/i.test(category))) gaps.push("Local business retention tools are underrepresented.");
  if (!categories.some((category) => /education/i.test(category))) gaps.push("Education workflow products are underrepresented.");
  if (!units.some((unit) => unit.type === "plugin" && /payments/i.test(unit.name))) gaps.push("Payments plugin needs more adoption data.");
  if (!units.some((unit) => unit.type === "component" && /feedback/i.test(unit.name))) gaps.push("Feedback component should be promoted after more usage.");
  return gaps.length ? gaps : ["No major opportunity gaps detected."];
}
