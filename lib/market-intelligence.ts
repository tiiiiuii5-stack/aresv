import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getAppWarehouse } from "@/lib/app-warehouse";
import { listProjects } from "@/lib/project-store";

export type Momentum = "rising" | "stable" | "declining" | "oversaturated";
export type BuildRecommendation = "Build now" | "Wait" | "Too crowded" | "High monetization" | "Fast MVP" | "Strong retention" | "Likely to fail";

export type OpportunityScore = {
  demand: number;
  monetization: number;
  usefulness: number;
  differentiation: number;
  retention: number;
  virality: number;
  implementationComplexity: number;
  launchSpeed: number;
  founderAttractiveness: number;
  defensibility: number;
  overall: number;
};

export type MarketOpportunity = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  momentum: Momentum;
  recommendation: BuildRecommendation;
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
  scores: OpportunityScore;
};

export type MarketIntelligenceSnapshot = {
  version: number;
  updatedAt: string;
  opportunities: MarketOpportunity[];
  painPointDatabase: Array<{ id: string; phrase: string; severity: number; segment: string; productAngle: string; tags: string[] }>;
  competitorGaps: Array<{ id: string; market: string; strengths: string[]; weaknesses: string[]; gaps: string[]; pricingOpportunity: string }>;
  risingNiches: Array<{ name: string; momentum: Momentum; whyNow: string; underservedUsers: string[]; tags: string[] }>;
  signalSummary: string[];
};

const bundledRoot = path.join(process.cwd(), "generated-apps");
const root = process.env.VERCEL ? path.join(os.tmpdir(), "ventureos-generated-apps") : bundledRoot;
const marketPath = path.join(root, "market-intelligence.json");
const threshold = 80;

export async function getMarketIntelligence(query = "", filter = "all"): Promise<MarketIntelligenceSnapshot> {
  await fs.mkdir(root, { recursive: true });
  const [projects, warehouse] = await Promise.all([listProjects(true), getAppWarehouse()]);
  const snapshot = buildMarketSnapshot(projects, warehouse);
  await fs.writeFile(marketPath, JSON.stringify(snapshot, null, 2));
  const term = query.trim().toLowerCase();
  if (!term && filter === "all") return snapshot;
  return {
    ...snapshot,
    opportunities: snapshot.opportunities.filter((opportunity) => {
      const inFilter = filter === "all" || opportunity.tags.includes(filter) || opportunity.category === filter || opportunity.recommendation === filter;
      if (!term) return inFilter;
      const haystack = [opportunity.title, opportunity.category, opportunity.productThesis, opportunity.targetUser, ...opportunity.tags, ...opportunity.painPoints].join(" ").toLowerCase();
      return inFilter && haystack.includes(term);
    }),
  };
}

export async function evaluateOpportunity(prompt: string, category = "custom"): Promise<MarketOpportunity> {
  const warehouse = await getAppWarehouse();
  return opportunityFromPrompt(prompt, category, warehouse.patternMemory.map((pattern) => pattern.title), warehouse.componentMemory.map((component) => component.title));
}

function buildMarketSnapshot(projects: Awaited<ReturnType<typeof listProjects>>, warehouse: Awaited<ReturnType<typeof getAppWarehouse>>): MarketIntelligenceSnapshot {
  const seed = seedOpportunities(warehouse.patternMemory.map((pattern) => pattern.title), warehouse.componentMemory.map((component) => component.title));
  const generated = projects
    .filter((project) => project.status !== "archived")
    .map((project) => opportunityFromPrompt(project.prompt || project.problem, project.category, warehouse.patternMemory.map((pattern) => pattern.title), project.features));
  const opportunities = dedupe([...seed, ...generated]).sort((a, b) => b.scores.overall - a.scores.overall);
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    opportunities,
    painPointDatabase: painPoints(),
    competitorGaps: competitorGaps(),
    risingNiches: risingNiches(),
    signalSummary: [
      "Bias toward rising and underserved categories with expensive repeated pain.",
      "Prefer business, creator, operations, and automation pain before novelty consumer ideas.",
      "Reject crowded ideas unless the UX angle, monetization, or workflow automation is materially better.",
      "Use App Warehouse winners to accelerate execution and avoid rebuilding solved systems.",
    ],
  };
}

function opportunityFromPrompt(prompt: string, category: string, patterns: string[], reusableSystems: string[]): MarketOpportunity {
  const lower = prompt.toLowerCase();
  const business = /business|client|agency|team|ops|crm|revenue|invoice|sales|support|workflow/.test(lower);
  const creator = /creator|content|newsletter|video|podcast|publish|audience/.test(lower);
  const local = /local|restaurant|salon|clinic|contractor|store|appointment/.test(lower);
  const automation = /automate|manual|hours|repetitive|spreadsheet|follow-up|reminder/.test(lower);
  const ai = /\bai\b|prompt|chat|model|agent/.test(lower);
  const categoryLabel = business ? "B2B operations" : creator ? "creator economy" : local ? "local business" : ai ? "AI workflows" : automation ? "automation" : category;
  const scores = scoreOpportunity({ business, creator, local, automation, ai, prompt });
  const title = nameOpportunity(prompt, categoryLabel);
  const recommendation = recommend(scores, categoryLabel);
  return {
    id: hash(`${title}:${prompt}`).slice(0, 12),
    title,
    category: categoryLabel,
    tags: [categoryLabel, business ? "saas" : "", creator ? "creator" : "", local ? "local" : "", automation ? "automation" : "", ai ? "ai" : ""].filter(Boolean),
    momentum: momentumFor(categoryLabel),
    recommendation,
    why: explainRecommendation(recommendation, scores),
    productThesis: `A focused product for ${audienceFor(categoryLabel)} that turns ${prompt.toLowerCase()} into a measurable, repeatable workflow.`,
    targetUser: audienceFor(categoryLabel),
    problemSeverity: business || automation ? "high: repeated work costs time or revenue" : "medium: pain needs sharper proof of frequency",
    willingnessToPay: business ? "high if it saves team time or protects revenue" : creator || local ? "medium-high if tied to income or bookings" : "medium",
    competitiveAdvantage: "faster onboarding, clearer workflow, better launch analytics, and reusable warehouse-backed UX systems",
    uniqueUXAngle: "dashboard-first command center with first-value onboarding and visible progress",
    monetization: business ? "team subscription with automation and reporting gates" : creator ? "creator pro plan with publishing and export gates" : local ? "monthly operator plan with reminders and bookings" : "freemium with premium workflows",
    launchStrategy: "launch with a narrow pain point, prove first value in under three minutes, then test upgrade triggers after activation",
    mvpScope: ["guided onboarding", "core dashboard", "search/filter", "saved workflow", "analytics events", "feedback capture"],
    premiumVersion: ["automation", "team/shared workflows", "advanced analytics", "exports", "integrations"],
    painPoints: matchedPain(lower),
    competitorGaps: matchedGaps(categoryLabel),
    reusableSystems: reusableSystems.slice(0, 6).concat(patterns.slice(0, 3)),
    scores,
  };
}

function scoreOpportunity(flags: { business: boolean; creator: boolean; local: boolean; automation: boolean; ai: boolean; prompt: string }): OpportunityScore {
  const lengthSignal = flags.prompt.length > 80 ? 6 : 0;
  const demand = clamp(58 + (flags.business ? 18 : 0) + (flags.creator ? 12 : 0) + (flags.local ? 10 : 0) + (flags.automation ? 12 : 0) + lengthSignal);
  const monetization = clamp(55 + (flags.business ? 24 : 0) + (flags.local ? 16 : 0) + (flags.creator ? 14 : 0) + (flags.automation ? 10 : 0));
  const usefulness = clamp(60 + (flags.automation ? 18 : 0) + (flags.business ? 14 : 0) + lengthSignal);
  const differentiation = clamp(58 + (flags.automation ? 12 : 0) + (flags.ai ? -4 : 0) + (flags.business ? 8 : 0));
  const retention = clamp(55 + (flags.business ? 18 : 0) + (flags.creator ? 12 : 0) + (flags.local ? 10 : 0) + (flags.automation ? 12 : 0));
  const virality = clamp(45 + (flags.creator ? 18 : 0) + (flags.local ? 8 : 0) + (flags.business ? 4 : 0));
  const implementationComplexity = clamp(82 - (flags.ai ? 14 : 0) - (flags.business ? 8 : 0));
  const launchSpeed = clamp(72 + (flags.automation ? 8 : 0) - (flags.ai ? 8 : 0));
  const founderAttractiveness = clamp(60 + (flags.business ? 18 : 0) + (flags.creator ? 12 : 0) + (flags.automation ? 12 : 0));
  const defensibility = clamp(50 + (flags.business ? 14 : 0) + (flags.automation ? 10 : 0) + (flags.ai ? -5 : 0));
  const values = [demand, monetization, usefulness, differentiation, retention, virality, implementationComplexity, launchSpeed, founderAttractiveness, defensibility];
  const overall = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  return { demand, monetization, usefulness, differentiation, retention, virality, implementationComplexity, launchSpeed, founderAttractiveness, defensibility, overall };
}

function seedOpportunities(patterns: string[], reusable: string[]): MarketOpportunity[] {
  return [
    opportunityFromPrompt("Boutique agencies waste hours tracking client follow-ups, renewal risk, and upgrade opportunities across spreadsheets.", "B2B operations", patterns, reusable),
    opportunityFromPrompt("Creators struggle to turn raw ideas into a repeatable publishing pipeline with feedback and monetization signals.", "creator economy", patterns, reusable),
    opportunityFromPrompt("Local service businesses lose bookings because reminders, reviews, and repeat visits are handled manually.", "local business", patterns, reusable),
    opportunityFromPrompt("Small teams hate ugly internal ops tools but tolerate them because custom dashboards are expensive.", "Internal Ops", patterns, reusable),
    opportunityFromPrompt("Ecommerce operators repeatedly miss support trends, refund patterns, and product content gaps.", "ecommerce support", patterns, reusable),
    opportunityFromPrompt("Teachers waste time turning lesson notes into practice workflows, progress checks, and parent updates.", "education", patterns, reusable),
  ];
}

function painPoints() {
  return [
    { id: "pain-followups", phrase: "I waste hours chasing follow-ups", severity: 92, segment: "agencies and sales teams", productAngle: "CRM follow-up command center", tags: ["b2b", "automation"] },
    { id: "pain-spreadsheets", phrase: "this workflow lives in an ugly spreadsheet", severity: 88, segment: "operations teams", productAngle: "internal ops builder", tags: ["ops", "saas"] },
    { id: "pain-content", phrase: "I have ideas but no publishing rhythm", severity: 82, segment: "creators", productAngle: "creator pipeline studio", tags: ["creator"] },
    { id: "pain-local-reminders", phrase: "customers forget to come back", severity: 84, segment: "local businesses", productAngle: "retention reminder system", tags: ["local", "retention"] },
    { id: "pain-manual-reports", phrase: "reports take too long to assemble", severity: 86, segment: "consultants and teams", productAngle: "automated report workspace", tags: ["automation", "b2b"] },
  ];
}

function competitorGaps() {
  return [
    { id: "gap-crm", market: "CRM tools", strengths: ["large ecosystems", "reporting"], weaknesses: ["heavy setup", "clutter", "expensive seats"], gaps: ["faster onboarding", "niche agency workflows", "clear renewal risk"], pricingOpportunity: "lightweight team plan below enterprise CRM pricing" },
    { id: "gap-creator", market: "creator planning tools", strengths: ["calendars", "templates"], weaknesses: ["weak feedback loops", "generic dashboards"], gaps: ["idea-to-revenue pipeline", "content performance rituals"], pricingOpportunity: "creator pro plan tied to publishing cadence" },
    { id: "gap-local", market: "local business tools", strengths: ["booking", "reviews"], weaknesses: ["fragmented UX", "low automation"], gaps: ["repeat visit workflows", "simple retention dashboards"], pricingOpportunity: "monthly operator plan" },
    { id: "gap-ops", market: "internal tools", strengths: ["flexibility"], weaknesses: ["ugly UX", "builder complexity"], gaps: ["premium defaults", "ready-made workflows"], pricingOpportunity: "template-driven team subscriptions" },
  ];
}

function risingNiches() {
  return [
    { name: "B2B operations automation", momentum: "rising" as const, whyNow: "Teams need leverage without hiring more coordinators.", underservedUsers: ["agencies", "customer success", "consultants"], tags: ["b2b", "automation"] },
    { name: "Creator business tooling", momentum: "rising" as const, whyNow: "More creators operate like small media companies.", underservedUsers: ["newsletter writers", "video creators", "course creators"], tags: ["creator"] },
    { name: "Local business retention", momentum: "stable" as const, whyNow: "Small operators need simple repeat-customer systems.", underservedUsers: ["salons", "clinics", "contractors"], tags: ["local"] },
    { name: "Generic AI wrappers", momentum: "oversaturated" as const, whyNow: "Crowded unless paired with a concrete workflow and data loop.", underservedUsers: ["niche workflows only"], tags: ["ai"] },
  ];
}

function dedupe(items: MarketOpportunity[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.title}:${item.category}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function recommend(scores: OpportunityScore, category: string): BuildRecommendation {
  if (scores.overall >= threshold && scores.monetization >= 80) return "Build now";
  if (scores.monetization >= 85) return "High monetization";
  if (scores.retention >= 82) return "Strong retention";
  if (scores.launchSpeed >= 82) return "Fast MVP";
  if (momentumFor(category) === "oversaturated") return "Too crowded";
  if (scores.overall < 65) return "Likely to fail";
  return "Wait";
}

function explainRecommendation(recommendation: BuildRecommendation, scores: OpportunityScore) {
  if (recommendation === "Build now") return `Opportunity clears ${threshold}+ with strong demand, monetization, retention, and launch speed.`;
  if (recommendation === "Too crowded") return "Market is crowded; build only with a sharper niche workflow or distribution edge.";
  if (recommendation === "Likely to fail") return "Scores are weak across demand, differentiation, or monetization.";
  return `Best signal: ${recommendation}. Overall score is ${scores.overall}/100.`;
}

function momentumFor(category: string): Momentum {
  const value = category.toLowerCase();
  if (value.includes("ai") && !value.includes("workflow")) return "oversaturated";
  if (value.includes("b2b") || value.includes("automation") || value.includes("creator")) return "rising";
  if (value.includes("local") || value.includes("education")) return "stable";
  return "stable";
}

function audienceFor(category: string) {
  const value = category.toLowerCase();
  if (value.includes("b2b")) return "small teams, agencies, and operators";
  if (value.includes("creator")) return "creators building repeatable content businesses";
  if (value.includes("local")) return "local service business owners";
  if (value.includes("ai")) return "knowledge workers with repeated AI workflows";
  return "users with repeated operational pain";
}

function matchedPain(lower: string) {
  return painPoints().filter((pain) => pain.tags.some((tag) => lower.includes(tag)) || lower.includes("hours") || lower.includes("manual")).map((pain) => pain.phrase).slice(0, 4);
}

function matchedGaps(category: string) {
  return competitorGaps().filter((gap) => category.toLowerCase().includes(gap.market.split(" ")[0].toLowerCase()) || category.toLowerCase().includes("b2b") || category.toLowerCase().includes("ops")).flatMap((gap) => gap.gaps).slice(0, 4);
}

function nameOpportunity(prompt: string, category: string) {
  const words = prompt.replace(/[^a-z0-9 ]/gi, " ").split(/\s+/).filter((word) => word.length > 4 && !/create|premium|hours|across|because|there|their/.test(word.toLowerCase()));
  const base = words.slice(0, 2).map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");
  return base || category;
}

function hash(input: string) {
  let value = 5381;
  for (let index = 0; index < input.length; index += 1) value = (value * 33) ^ input.charCodeAt(index);
  return (value >>> 0).toString(16);
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
