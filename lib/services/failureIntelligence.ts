import type { IntelligenceIssue, SecuritySeverity, SeverityBreakdown } from "@/lib/services/intelligenceAnalysis";

export type FailureMode =
  | "identity-compromise"
  | "data-loss"
  | "payment-or-billing-break"
  | "deployment-failure"
  | "runtime-break"
  | "fake-workflow"
  | "availability-risk"
  | "trust-regression";

export type FailureHorizon = "launch" | "first_24_hours" | "first_week" | "scale";

export type FailureEvidence = {
  issueId: string;
  title: string;
  severity: SecuritySeverity;
  category: IntelligenceIssue["category"];
  filePath?: string;
  location?: IntelligenceIssue["location"];
  codeSnippet?: string;
  confidenceScore?: number;
};

export type FailurePrediction = {
  id: string;
  title: string;
  mode: FailureMode;
  severity: SecuritySeverity;
  probabilityScore: number;
  impactScore: number;
  confidenceScore: number;
  horizon: FailureHorizon;
  productionScenario: string;
  userVisibleSymptom: string;
  businessImpact: string;
  evidenceChain: FailureEvidence[];
  detectionSignals: string[];
  preventionSteps: string[];
  owner: "security" | "backend" | "frontend" | "data" | "devops" | "product";
};

export type FailureIntelligenceReport = {
  engine: "ventureos-failure-intelligence";
  engineVersion: "1.0.0";
  generatedAt: string;
  predictionCount: number;
  failureProbabilityScore: number;
  releaseRisk: SecuritySeverity;
  launchDecision: "block" | "review" | "monitor" | "proceed";
  topPredictions: FailurePrediction[];
  failureModeBreakdown: Record<FailureMode, number>;
  timeline: Array<{
    horizon: FailureHorizon;
    riskScore: number;
    likelyFailures: string[];
  }>;
  guardrails: string[];
  summary: string;
};

export type FailureIntelligenceInput = {
  issues: IntelligenceIssue[];
  framework: string;
  modules: string[];
  securityScore: number;
  severityBreakdown: SeverityBreakdown;
  source?: string;
  validationResults?: Record<string, unknown>;
  failureEvents?: unknown[];
  context?: "app_analysis" | "repo_scan" | "public_demo";
};

type FailurePattern = {
  id: string;
  mode: FailureMode;
  title: string;
  owner: FailurePrediction["owner"];
  issueMatchers: RegExp[];
  categoryMatchers?: Array<IntelligenceIssue["category"]>;
  scenario: string;
  symptom: string;
  impact: string;
  detectionSignals: string[];
  preventionSteps: string[];
  horizon: FailureHorizon;
};

const failureModes: FailureMode[] = [
  "identity-compromise",
  "data-loss",
  "payment-or-billing-break",
  "deployment-failure",
  "runtime-break",
  "fake-workflow",
  "availability-risk",
  "trust-regression",
];

const severityScore = {
  critical: 100,
  high: 82,
  medium: 58,
  low: 32,
} satisfies Record<SecuritySeverity, number>;

const patterns: FailurePattern[] = [
  {
    id: "identity-takeover",
    mode: "identity-compromise",
    title: "Users can bypass identity or permission checks in production",
    owner: "security",
    issueMatchers: [/auth/i, /authorization/i, /admin/i, /role/i, /ui-only protection/i, /fake auth/i, /request-controlled/i],
    categoryMatchers: ["auth"],
    scenario: "A user directly calls a backend route or modifies client state and reaches protected data or privileged actions.",
    symptom: "Accounts, admin panels, or private records become accessible without the expected login or role.",
    impact: "Customer trust and account isolation fail, creating a launch-blocking security incident.",
    detectionSignals: ["Unexpected 200 responses on protected routes", "Role changes without matching audit trail", "Access from users with no server session"],
    preventionSteps: ["Resolve identity from the server session only", "Add route-level auth guards before data fetches", "Validate ownership before every mutation"],
    horizon: "launch",
  },
  {
    id: "customer-data-loss",
    mode: "data-loss",
    title: "Saved customer work can disappear or fork across sessions",
    owner: "data",
    issueMatchers: [/fake persistence/i, /localStorage/i, /sessionStorage/i, /database schema/i, /migrations/i, /no migrations/i, /db/i],
    categoryMatchers: ["db"],
    scenario: "The UI reports a successful save, but the mutation is backed by browser state, missing migrations, or incomplete database writes.",
    symptom: "Records vanish after refresh, do not appear for teammates, or fail after deployment.",
    impact: "Users lose confidence because the app cannot reliably preserve operational data.",
    detectionSignals: ["Saved records missing after refresh", "Database tables absent in production", "Divergent data across browser sessions"],
    preventionSteps: ["Persist mutations through server routes", "Commit and deploy additive migrations", "Add read-after-write checks to critical flows"],
    horizon: "first_24_hours",
  },
  {
    id: "payment-flow-break",
    mode: "payment-or-billing-break",
    title: "Payment or billing operations can fail or be spoofed",
    owner: "backend",
    issueMatchers: [/stripe/i, /checkout/i, /billing/i, /payment/i, /webhook/i, /signature/i],
    categoryMatchers: ["api"],
    scenario: "A payment route or webhook reaches business logic without the expected signature, session, or customer binding.",
    symptom: "Users can reach another customer portal, upgrades do not apply, or forged webhook events change plans.",
    impact: "Revenue, subscriptions, and customer entitlements become unreliable.",
    detectionSignals: ["Webhook events without signature verification", "Portal sessions created from client identity", "Plan changes without Stripe event parity"],
    preventionSteps: ["Verify webhook signatures before parsing business data", "Bind Stripe customers to server session user IDs", "Reject client-supplied billing identity"],
    horizon: "launch",
  },
  {
    id: "deployment-blocker",
    mode: "deployment-failure",
    title: "The app is likely to fail during production deployment",
    owner: "devops",
    issueMatchers: [/deployment/i, /localhost/i, /env/i, /lockfile/i, /serverless/i, /filesystem/i, /health/i, /ci/i],
    categoryMatchers: ["deployment"],
    scenario: "Build or runtime code depends on local-only services, missing environment contracts, mutable serverless disk, or nondeterministic dependencies.",
    symptom: "Preview works locally but production deploys fail, boot with missing config, or lose files between invocations.",
    impact: "Launch stalls because the app cannot be promoted or remains unstable immediately after promotion.",
    detectionSignals: ["Production logs show missing env variables", "localhost fetches from serverless functions", "Dependency versions drift between builds"],
    preventionSteps: ["Use environment-driven production URLs", "Commit lockfiles and .env.example", "Move durable writes to database or object storage"],
    horizon: "launch",
  },
  {
    id: "runtime-chain-break",
    mode: "runtime-break",
    title: "Critical user actions can break at runtime",
    owner: "backend",
    issueMatchers: [/phantom api/i, /missing backend/i, /runtime/i, /execution/i, /route/i, /api/i, /no-op/i],
    categoryMatchers: ["api"],
    scenario: "A visible workflow calls an endpoint or handler chain that is missing, placeholder-only, or disconnected from data.",
    symptom: "Buttons appear interactive but return 404/500, silently do nothing, or show success without completing the workflow.",
    impact: "Users hit broken primary flows during the first real use session.",
    detectionSignals: ["404s from UI fetches", "No database mutation after success toast", "Console-only or alert-only action handlers"],
    preventionSteps: ["Map every UI action to an API route", "Return explicit success/error feedback", "Test the full UI to API to data chain"],
    horizon: "first_24_hours",
  },
  {
    id: "fake-workflow-conversion",
    mode: "fake-workflow",
    title: "The app can look finished while core workflows are placeholders",
    owner: "product",
    issueMatchers: [/no-op/i, /placeholder/i, /stub/i, /fake implementation/i, /ui-only/i, /missing backend/i],
    categoryMatchers: ["frontend"],
    scenario: "The first screen presents a complete workflow, but production users cannot complete the promised action.",
    symptom: "Customers click primary actions and see placeholder feedback, no durable result, or no error path.",
    impact: "Launch conversion drops because the product feels deceptive or unfinished.",
    detectionSignals: ["Primary CTA only logs or alerts", "Form submit prevents default without a request", "No success/error state tied to backend response"],
    preventionSteps: ["Disable incomplete actions with clear labels", "Connect forms to backend routes", "Show loading, success, and failure states for every action"],
    horizon: "first_week",
  },
  {
    id: "availability-regression",
    mode: "availability-risk",
    title: "Traffic or repeated use can degrade the application",
    owner: "devops",
    issueMatchers: [/rate limit/i, /dangerous code execution/i, /upload/i, /generate/i, /ai/i, /openai/i, /anthropic/i, /gemini/i],
    categoryMatchers: ["api"],
    scenario: "Sensitive or expensive routes accept repeated requests without enough execution safety.",
    symptom: "Costs spike, queues jam, external provider calls exhaust quota, or the app times out under launch traffic.",
    impact: "The app becomes unreliable or expensive at the moment demand increases.",
    detectionSignals: ["Repeated expensive route calls from the same source", "Provider quota errors", "Build or scan queue backlog"],
    preventionSteps: ["Rate-limit expensive routes", "Validate payload size before work starts", "Queue long-running jobs with retry and timeout policy"],
    horizon: "scale",
  },
  {
    id: "trust-regression",
    mode: "trust-regression",
    title: "AI-generated changes can reintroduce unsafe trust boundaries",
    owner: "security",
    issueMatchers: [/body\.userId/i, /body\.role/i, /owner/i, /permission/i, /secret/i, /auth/i],
    scenario: "A generated route or UI layer trusts request-controlled identity, secrets, or authorization inputs again.",
    symptom: "New code passes visual tests while weakening server-authoritative identity or exposing credentials.",
    impact: "Security posture regresses silently as new AI-generated features are added.",
    detectionSignals: ["Request body includes identity fields", "Client modules reference private env names", "Ownership checks missing near mutations"],
    preventionSteps: ["Run the trust compiler on every backend route", "Strip client identity fields before processing", "Fail scans when mutations lack ownership evidence"],
    horizon: "first_week",
  },
];

export function buildFailureIntelligence(input: FailureIntelligenceInput): FailureIntelligenceReport {
  const issues = normalizeIssues(input.issues);
  const predictions = normalizePredictions([
    ...patterns
      .map((pattern) => predictionForPattern(pattern, issues, input))
      .filter((prediction): prediction is FailurePrediction => Boolean(prediction)),
    ...compoundPredictions(issues, input),
  ]);
  const topPredictions = predictions.slice(0, 8);
  const failureProbabilityScore = scoreReport(topPredictions, input);
  const releaseRisk = releaseRiskFor(failureProbabilityScore, topPredictions, input.severityBreakdown);

  return {
    engine: "ventureos-failure-intelligence",
    engineVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    predictionCount: predictions.length,
    failureProbabilityScore,
    releaseRisk,
    launchDecision: launchDecisionFor(releaseRisk, topPredictions),
    topPredictions,
    failureModeBreakdown: modeBreakdown(predictions),
    timeline: timelineFor(topPredictions),
    guardrails: guardrailsFor(topPredictions),
    summary: summaryFor(topPredictions, releaseRisk, failureProbabilityScore),
  };
}

export function summarizeFailureIntelligence(report: FailureIntelligenceReport) {
  return {
    engine: report.engine,
    engineVersion: report.engineVersion,
    predictionCount: report.predictionCount,
    failureProbabilityScore: report.failureProbabilityScore,
    releaseRisk: report.releaseRisk,
    launchDecision: report.launchDecision,
    topFailureModes: report.topPredictions.slice(0, 3).map((prediction) => prediction.mode),
    topPredictions: report.topPredictions.slice(0, 3).map((prediction) => ({
      id: prediction.id,
      title: prediction.title,
      mode: prediction.mode,
      probabilityScore: prediction.probabilityScore,
      impactScore: prediction.impactScore,
      confidenceScore: prediction.confidenceScore,
      horizon: prediction.horizon,
    })),
  };
}

function predictionForPattern(pattern: FailurePattern, issues: IntelligenceIssue[], input: FailureIntelligenceInput): FailurePrediction | null {
  const matches = issues.filter((issue) => matchesPattern(issue, pattern));
  if (matches.length === 0) return null;
  const evidenceChain = matches.slice(0, 4).map(toEvidence);
  const severity = highestIssueSeverity(matches);
  const probabilityScore = probabilityFor(matches, input);
  const impactScore = impactFor(matches, pattern.mode);
  const confidenceScore = confidenceFor(matches);

  return {
    id: pattern.id,
    title: pattern.title,
    mode: pattern.mode,
    severity,
    probabilityScore,
    impactScore,
    confidenceScore,
    horizon: pattern.horizon,
    productionScenario: pattern.scenario,
    userVisibleSymptom: pattern.symptom,
    businessImpact: pattern.impact,
    evidenceChain,
    detectionSignals: pattern.detectionSignals,
    preventionSteps: pattern.preventionSteps,
    owner: pattern.owner,
  };
}

function compoundPredictions(issues: IntelligenceIssue[], input: FailureIntelligenceInput): FailurePrediction[] {
  const predictions: FailurePrediction[] = [];
  const highImpactIssues = issues.filter((issue) => severityRank(issue.severity) >= severityRank("high"));
  const hasFrontendIssue = issues.some((issue) => issue.category === "frontend");
  const hasApiIssue = issues.some((issue) => issue.category === "api");
  const hasDataIssue = issues.some((issue) => issue.category === "db");
  const hasDeploymentIssue = issues.some((issue) => issue.category === "deployment");

  if (hasFrontendIssue && hasApiIssue && highImpactIssues.length >= 2) {
    predictions.push({
      id: "compound-broken-product-loop",
      title: "Primary product loop can break across UI, API, and feedback states",
      mode: "runtime-break",
      severity: highestIssueSeverity(highImpactIssues),
      probabilityScore: clamp(72 + highImpactIssues.length * 4),
      impactScore: 86,
      confidenceScore: confidenceFor(highImpactIssues),
      horizon: "first_24_hours",
      productionScenario: "The app renders a usable workflow, but user actions cross a weak UI/API boundary and fail before data changes are durable.",
      userVisibleSymptom: "Users click through the main flow and see stale UI, missing records, or a failed request after the page looked ready.",
      businessImpact: "The launch appears polished but fails on first hands-on customer validation.",
      evidenceChain: highImpactIssues.slice(0, 4).map(toEvidence),
      detectionSignals: ["UI fetch failures", "No matching backend mutation", "Success feedback without durable data"],
      preventionSteps: ["Trace every primary action from UI to route to data write", "Add smoke tests for each launch workflow", "Keep incomplete actions disabled until connected"],
      owner: "backend",
    });
  }

  if (hasDataIssue && hasDeploymentIssue) {
    const evidenceIssues = issues.filter((issue) => issue.category === "db" || issue.category === "deployment");
    predictions.push({
      id: "compound-data-deploy-drift",
      title: "Production data layer can drift from the generated app",
      mode: "data-loss",
      severity: highestIssueSeverity(evidenceIssues),
      probabilityScore: probabilityFor(evidenceIssues, input),
      impactScore: 88,
      confidenceScore: confidenceFor(evidenceIssues),
      horizon: "launch",
      productionScenario: "The generated app expects tables, environment variables, or persistence behavior that production deployment does not guarantee.",
      userVisibleSymptom: "Writes fail, records do not appear, or deployment succeeds with a nonfunctional data layer.",
      businessImpact: "Operators cannot trust the app for real customer workflows after launch.",
      evidenceChain: evidenceIssues.slice(0, 4).map(toEvidence),
      detectionSignals: ["Missing migration logs", "Prisma/runtime table errors", "Environment validation failures"],
      preventionSteps: ["Run migrations before promotion", "Validate required environment variables during boot", "Add read-after-write deployment smoke tests"],
      owner: "data",
    });
  }

  if (input.failureEvents && input.failureEvents.length > 0 && highImpactIssues.length > 0) {
    predictions.push({
      id: "observed-failure-recurrence",
      title: "Observed failures are likely to recur without structural fixes",
      mode: "trust-regression",
      severity: highestIssueSeverity(highImpactIssues),
      probabilityScore: clamp(80 + Math.min(12, input.failureEvents.length * 3)),
      impactScore: 82,
      confidenceScore: confidenceFor(highImpactIssues),
      horizon: "first_week",
      productionScenario: "The scan includes explicit failure events and matching high-impact findings, so retrying the same workflow is likely to fail again.",
      userVisibleSymptom: "The same class of issue reappears after repair attempts or repeated user actions.",
      businessImpact: "Engineering time is spent on repeated fixes instead of removing the underlying failure mode.",
      evidenceChain: highImpactIssues.slice(0, 4).map(toEvidence),
      detectionSignals: ["Repeated failure events", "Repair attempts with unchanged high-severity issue count", "Same detector firing across scans"],
      preventionSteps: ["Fix the root execution path instead of symptoms", "Add regression tests around the failing flow", "Compare each repair attempt against the previous scan"],
      owner: "product",
    });
  }

  return predictions;
}

function matchesPattern(issue: IntelligenceIssue, pattern: FailurePattern) {
  const haystack = `${issue.id} ${issue.title} ${issue.evidence} ${issue.fixSuggestion} ${issue.explanation || ""}`;
  return pattern.issueMatchers.some((matcher) => matcher.test(haystack)) || Boolean(pattern.categoryMatchers?.includes(issue.category));
}

function normalizePredictions(predictions: FailurePrediction[]) {
  const bestById = new Map<string, FailurePrediction>();
  for (const prediction of predictions) {
    const existing = bestById.get(prediction.id);
    if (!existing || predictionRank(prediction) > predictionRank(existing)) {
      bestById.set(prediction.id, prediction);
    }
  }
  return [...bestById.values()].sort((a, b) => predictionRank(b) - predictionRank(a));
}

function normalizeIssues(issues: IntelligenceIssue[]) {
  return issues.filter((issue) => (issue.confidenceScore ?? 75) >= 75);
}

function toEvidence(issue: IntelligenceIssue): FailureEvidence {
  return {
    issueId: issue.id,
    title: issue.title,
    severity: issue.severity,
    category: issue.category,
    filePath: issue.filePath,
    location: issue.location,
    codeSnippet: issue.codeSnippet,
    confidenceScore: issue.confidenceScore,
  };
}

function scoreReport(predictions: FailurePrediction[], input: FailureIntelligenceInput) {
  if (predictions.length === 0) return Math.max(0, Math.min(25, 100 - input.securityScore));
  const weighted = predictions.reduce((sum, prediction) => sum + prediction.probabilityScore * 0.45 + prediction.impactScore * 0.35 + prediction.confidenceScore * 0.2, 0);
  const average = weighted / predictions.length;
  const severityBoost = input.severityBreakdown.critical > 0 ? 12 : input.severityBreakdown.high > 0 ? 7 : 0;
  return clamp(Math.round(average + severityBoost));
}

function probabilityFor(issues: IntelligenceIssue[], input: FailureIntelligenceInput) {
  const issueBase = Math.max(...issues.map((issue) => severityScore[issue.severity]), 30);
  const confidenceAverage = confidenceFor(issues);
  const issueCountBoost = Math.min(14, issues.length * 3);
  const sourceBoost = input.context === "repo_scan" ? 4 : 0;
  return clamp(Math.round(issueBase * 0.55 + confidenceAverage * 0.35 + issueCountBoost + sourceBoost));
}

function impactFor(issues: IntelligenceIssue[], mode: FailureMode) {
  const base = Math.max(...issues.map((issue) => severityScore[issue.severity]), 32);
  const modeBoost = mode === "identity-compromise" || mode === "payment-or-billing-break" || mode === "data-loss" ? 10 : mode === "deployment-failure" ? 7 : 3;
  return clamp(base + modeBoost);
}

function confidenceFor(issues: IntelligenceIssue[]) {
  if (issues.length === 0) return 0;
  return clamp(Math.round(issues.reduce((sum, issue) => sum + (issue.confidenceScore ?? 75), 0) / issues.length));
}

function highestIssueSeverity(issues: IntelligenceIssue[]): SecuritySeverity {
  return issues.reduce<SecuritySeverity>((highest, issue) => (severityRank(issue.severity) > severityRank(highest) ? issue.severity : highest), "low");
}

function releaseRiskFor(score: number, predictions: FailurePrediction[], breakdown: SeverityBreakdown): SecuritySeverity {
  if (breakdown.critical > 0 || predictions.some((prediction) => prediction.severity === "critical") || score >= 88) return "critical";
  if (breakdown.high > 0 || predictions.some((prediction) => prediction.severity === "high") || score >= 68) return "high";
  if (breakdown.medium > 0 || score >= 42) return "medium";
  return "low";
}

function launchDecisionFor(risk: SecuritySeverity, predictions: FailurePrediction[]): FailureIntelligenceReport["launchDecision"] {
  if (risk === "critical" || predictions.some((prediction) => prediction.horizon === "launch" && prediction.impactScore >= 90)) return "block";
  if (risk === "high") return "review";
  if (risk === "medium") return "monitor";
  return "proceed";
}

function modeBreakdown(predictions: FailurePrediction[]): Record<FailureMode, number> {
  const breakdown = Object.fromEntries(failureModes.map((mode) => [mode, 0])) as Record<FailureMode, number>;
  for (const prediction of predictions) {
    breakdown[prediction.mode] += 1;
  }
  return breakdown;
}

function timelineFor(predictions: FailurePrediction[]) {
  const horizons: FailureHorizon[] = ["launch", "first_24_hours", "first_week", "scale"];
  return horizons
    .map((horizon) => {
      const scoped = predictions.filter((prediction) => prediction.horizon === horizon);
      return {
        horizon,
        riskScore: scoped.length ? clamp(Math.round(scoped.reduce((sum, prediction) => sum + prediction.probabilityScore, 0) / scoped.length)) : 0,
        likelyFailures: scoped.slice(0, 3).map((prediction) => prediction.title),
      };
    })
    .filter((item) => item.riskScore > 0);
}

function guardrailsFor(predictions: FailurePrediction[]) {
  return [
    ...new Set(
      predictions
        .flatMap((prediction) => prediction.preventionSteps)
        .slice(0, 8),
    ),
  ];
}

function summaryFor(predictions: FailurePrediction[], risk: SecuritySeverity, score: number) {
  if (predictions.length === 0) {
    return "No high-confidence production failure predictions were generated from the current evidence.";
  }
  const top = predictions[0];
  return `${risk.toUpperCase()} release risk (${score}/100): most likely production failure is "${top.title}" based on ${top.evidenceChain.length} evidence item${top.evidenceChain.length === 1 ? "" : "s"}.`;
}

function predictionRank(prediction: FailurePrediction) {
  return severityRank(prediction.severity) * 10_000 + prediction.probabilityScore * 100 + prediction.impactScore + prediction.confidenceScore / 100;
}

function severityRank(severity: SecuritySeverity) {
  return severity === "critical" ? 4 : severity === "high" ? 3 : severity === "medium" ? 2 : 1;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}
