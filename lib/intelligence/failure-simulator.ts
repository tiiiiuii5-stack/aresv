import type { ExecutionPath } from "@/lib/intelligence/execution-path-mapper";
import type { EvidenceEngineResult, EvidenceItem, TraceableFinding } from "@/lib/intelligence/evidence-engine";

export type SimulationActor =
  | "Anonymous user"
  | "Authenticated user"
  | "Paid user"
  | "Admin user"
  | "API key user"
  | "Malicious user";

export type FailureSimulationOutcome = "breaks" | "requires-review";

export type FailureSimulation = {
  id: string;
  actor: SimulationActor;
  outcome: FailureSimulationOutcome;
  executionPathId: string | null;
  entryPoint: string | null;
  action: string | null;
  apiRoute: string | null;
  whatBreaks: string;
  why: string;
  evidence: EvidenceItem[];
  affectedSystem: string;
  severity: TraceableFinding["severity"];
  confidence: number;
};

export type FailureSimulationReport = {
  simulator: "ventureos-failure-simulator";
  version: "1.0.0";
  actors: SimulationActor[];
  simulations: FailureSimulation[];
  coverage: {
    executionPathsAnalyzed: number;
    pathsWithEvidence: number;
    traceableFindings: number;
    simulationsGenerated: number;
  };
  note: string;
};

export type FailureSimulatorInput = {
  executionPaths?: ExecutionPath[];
  evidenceReport?: EvidenceEngineResult;
  findings?: TraceableFinding[];
  maxSimulations?: number;
};

const actors: SimulationActor[] = [
  "Anonymous user",
  "Authenticated user",
  "Paid user",
  "Admin user",
  "API key user",
  "Malicious user",
];

export function simulateFailures(input: FailureSimulatorInput): FailureSimulationReport {
  const executionPaths = input.executionPaths || [];
  const findings = supportedFindings(input.findings || input.evidenceReport?.findings || []);
  const maxSimulations = Math.max(1, Math.min(100, input.maxSimulations ?? 30));
  const simulations: FailureSimulation[] = [];

  for (const finding of findings) {
    const path = resolvePath(finding, executionPaths);
    for (const actor of actorsForFinding(finding)) {
      simulations.push(simulationFor(finding, actor, path));
      if (simulations.length >= maxSimulations) break;
    }
    if (simulations.length >= maxSimulations) break;
  }

  return {
    simulator: "ventureos-failure-simulator",
    version: "1.0.0",
    actors,
    simulations: dedupeSimulations(simulations).slice(0, maxSimulations),
    coverage: {
      executionPathsAnalyzed: executionPaths.length,
      pathsWithEvidence: pathsWithEvidence(findings),
      traceableFindings: findings.length,
      simulationsGenerated: dedupeSimulations(simulations).length,
    },
    note: "Simulations are emitted only when a supported Evidence Engine finding can explain what breaks and why.",
  };
}

function supportedFindings(findings: TraceableFinding[]) {
  return findings.filter((finding) => finding.traceability?.supported && finding.evidence.length > 0);
}

function resolvePath(finding: TraceableFinding, executionPaths: ExecutionPath[]) {
  if (finding.executionPath) {
    const exact = executionPaths.find((path) => path.id === finding.executionPath?.id);
    if (exact) return exact;
    return finding.executionPath;
  }
  if (finding.affectedRoutes.length) {
    const byRoute = executionPaths.find((path) => path.apiRoute && finding.affectedRoutes.includes(path.apiRoute));
    if (byRoute) return byRoute;
  }
  return null;
}

function actorsForFinding(finding: TraceableFinding): SimulationActor[] {
  const text = findingText(finding);
  const matched = new Set<SimulationActor>();

  if (/\b(auth|session|anonymous|unauthenticated|login|token|cookie)\b/.test(text)) matched.add("Anonymous user");
  if (/\b(owner|ownership|tenant|org|role|permission|cross-user|forbidden|userId|actorId)\b/.test(text)) {
    matched.add("Authenticated user");
    matched.add("Malicious user");
  }
  if (/\b(billing|stripe|checkout|payment|subscription|customer portal|webhook|invoice|entitlement)\b/.test(text)) {
    matched.add("Paid user");
    matched.add("Malicious user");
  }
  if (/\b(admin|role|permission|publish|deploy|delete|archive)\b/.test(text)) matched.add("Admin user");
  if (/\b(api key|bearer|token|scan-repo|analyze-app|webhook)\b/.test(text)) matched.add("API key user");
  if (/\b(client|body\.|query\.|headers\.|request-controlled|missing backend|phantom|no-op)\b/.test(text)) matched.add("Malicious user");
  if (finding.category === "BROKEN USER FLOW" || finding.category === "STATE FAILURE") matched.add("Authenticated user");
  if (finding.category === "DEPLOYMENT FAILURE") matched.add("Admin user");

  if (!matched.size) matched.add("Authenticated user");
  return [...matched];
}

function simulationFor(finding: TraceableFinding, actor: SimulationActor, path: ExecutionPath | TraceableFinding["executionPath"] | null): FailureSimulation {
  const pathId = path?.id || null;
  const entryPoint = path?.entryPoint || finding.affectedRoutes.find((route) => !route.startsWith("/api/")) || null;
  const apiRoute = path?.apiRoute || finding.affectedRoutes.find((route) => route.startsWith("/api/")) || null;
  const action = path?.action || actionFromFinding(finding);

  return {
    id: stableId([actor, finding.id, pathId, apiRoute, action]),
    actor,
    outcome: finding.severity === "critical" || finding.severity === "high" ? "breaks" : "requires-review",
    executionPathId: pathId,
    entryPoint,
    action,
    apiRoute,
    whatBreaks: finding.title,
    why: finding.businessImpact,
    evidence: finding.evidence.slice(0, 4),
    affectedSystem: affectedSystemFor(finding),
    severity: finding.severity,
    confidence: finding.confidence,
  };
}

function actionFromFinding(finding: TraceableFinding) {
  const pathAction = finding.executionPath?.action;
  if (pathAction) return pathAction;
  if (/deploy/i.test(finding.title)) return "Deploy";
  if (/billing|checkout|payment|stripe/i.test(finding.title)) return "Billing action";
  if (/auth|session|role|owner|tenant/i.test(finding.title)) return "Protected action";
  if (/form|submit/i.test(finding.title)) return "Form submission";
  return null;
}

function affectedSystemFor(finding: TraceableFinding) {
  const text = findingText(finding);
  if (/\b(billing|stripe|checkout|payment|subscription|webhook|invoice)\b/.test(text)) return "Billing";
  if (/\b(auth|session|login|token|credential|cookie)\b/.test(text)) return "Authentication";
  if (/\b(owner|tenant|org|role|permission|admin|cross-user)\b/.test(text)) return "Authorization";
  if (/\b(database|db|prisma|sql|persist|migration|schema|save|write)\b/.test(text)) return "Data";
  if (/\b(deploy|environment|env|worker|queue|bullmq|redis|vercel|build)\b/.test(text)) return "Deployment";
  if (/\b(api|route|endpoint|provider|integration|service)\b/.test(text)) return "API";
  return "Operations";
}

function pathsWithEvidence(findings: TraceableFinding[]) {
  return new Set(findings.map((finding) => finding.executionPath?.id).filter(Boolean)).size;
}

function findingText(finding: TraceableFinding) {
  return [
    finding.title,
    finding.category,
    finding.businessImpact,
    finding.fixRecommendation,
    finding.affectedFiles.join(" "),
    finding.affectedRoutes.join(" "),
    finding.evidence.map((item) => `${item.detail} ${item.codeSnippet || ""}`).join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

function dedupeSimulations(simulations: FailureSimulation[]) {
  const seen = new Set<string>();
  const output: FailureSimulation[] = [];
  for (const simulation of simulations) {
    const key = `${simulation.actor}:${simulation.whatBreaks}:${simulation.executionPathId || simulation.apiRoute || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(simulation);
  }
  return output;
}

function stableId(parts: Array<string | null | undefined>) {
  const input = parts.filter(Boolean).join(":");
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return `sim_${Math.abs(hash).toString(36)}`;
}
