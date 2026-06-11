import assert from "node:assert/strict";

const baseUrl = (process.env.VENTUREOS_BASE_URL || "https://ventureos-full-fixed.vercel.app").replace(/\/+$/, "");

type Gate = {
  name: string;
  passed: boolean;
  detail: string;
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const gates: Gate[] = [];

  const health = await getJson("/api/health") as {
    configuration?: {
      database?: { configured?: boolean; disabled?: boolean; reachable?: boolean; verifiedRead?: boolean; reason?: string | null; circuit?: { open?: boolean; reason?: string | null } };
      stripe?: { checkoutEnabled?: boolean; webhookEnabled?: boolean; appraisalPriceIdsConfigured?: { instant?: boolean; buyerReady?: boolean } };
    };
  };
  const database = health.configuration?.database;
  const stripe = health.configuration?.stripe;

  gates.push({
    name: "production_db_flow",
    passed: Boolean(database?.configured && !database.disabled && database.reachable && database.verifiedRead && !database.circuit?.open),
    detail: `configured=${Boolean(database?.configured)} disabled=${Boolean(database?.disabled)} reachable=${Boolean(database?.reachable)} verifiedRead=${Boolean(database?.verifiedRead)} circuitOpen=${Boolean(database?.circuit?.open)} reason=${database?.reason || database?.circuit?.reason || "none"}`,
  });

  gates.push({
    name: "stripe_payment_operations",
    passed: Boolean(stripe?.checkoutEnabled && stripe.webhookEnabled && stripe.appraisalPriceIdsConfigured?.instant && stripe.appraisalPriceIdsConfigured?.buyerReady),
    detail: `checkout=${Boolean(stripe?.checkoutEnabled)} webhook=${Boolean(stripe?.webhookEnabled)} instantPrice=${Boolean(stripe?.appraisalPriceIdsConfigured?.instant)} buyerPrice=${Boolean(stripe?.appraisalPriceIdsConfigured?.buyerReady)}`,
  });

  const scan = await postJson("/api/public-demo-scan", {
    repositoryUrl: "https://github.com/tiiiiuii5-stack/aresv.git",
    framework: "nextjs",
    modules: ["auth", "billing", "database", "deployment", "tests", "ci", "monitoring"],
  }) as {
    ok?: boolean;
    evidenceCoverage?: { coveragePercent?: number; level?: string; filesLoaded?: number; totalFilesDiscovered?: number; scoreCap?: number };
    sbom?: { componentCount?: number; completeness?: string };
    decision?: { answer?: string; confidence?: number };
  };
  const coverage = scan.evidenceCoverage;
  gates.push({
    name: "full_repository_coverage",
    passed: Boolean(scan.ok && coverage?.coveragePercent === 100 && coverage.level === "complete" && coverage.filesLoaded === coverage.totalFilesDiscovered),
    detail: `coverage=${coverage?.coveragePercent ?? 0}% files=${coverage?.filesLoaded ?? 0}/${coverage?.totalFilesDiscovered ?? 0} level=${coverage?.level || "unknown"} sbomComponents=${scan.sbom?.componentCount ?? 0}`,
  });

  gates.push({
    name: "enterprise_grade_verification",
    passed: Boolean(scan.decision?.answer && coverage?.coveragePercent === 100 && Number(scan.decision?.confidence || 0) >= 75 && Number(scan.sbom?.componentCount || 0) >= 100),
    detail: `decision=${scan.decision?.answer || "missing"} confidence=${scan.decision?.confidence ?? 0} coverage=${coverage?.coveragePercent ?? 0}% sbom=${scan.sbom?.componentCount ?? 0}`,
  });

  const funnel = await getJson("/api/funnel/metrics") as {
    proof?: {
      customerDemand?: { proven?: boolean; previewStarted?: number; previewCompleted?: number };
      conversionFunnel?: { proven?: boolean; checkoutStarted?: number; paidIntent?: number; previewToCheckoutRate?: number };
    };
  };
  gates.push({
    name: "proven_customer_demand",
    passed: Boolean(funnel.proof?.customerDemand?.proven),
    detail: `previewStarted=${funnel.proof?.customerDemand?.previewStarted ?? 0} previewCompleted=${funnel.proof?.customerDemand?.previewCompleted ?? 0}`,
  });
  gates.push({
    name: "proven_conversion_funnel",
    passed: Boolean(funnel.proof?.conversionFunnel?.proven),
    detail: `checkoutStarted=${funnel.proof?.conversionFunnel?.checkoutStarted ?? 0} paidIntent=${funnel.proof?.conversionFunnel?.paidIntent ?? 0} previewToCheckoutRate=${funnel.proof?.conversionFunnel?.previewToCheckoutRate ?? 0}%`,
  });

  console.log(JSON.stringify({ passed: gates.every((gate) => gate.passed), baseUrl, gates }, null, 2));
  assert.ok(gates.every((gate) => gate.passed), "Enterprise readiness is not fully proven yet.");
}

async function getJson(path: string) {
  const response = await fetch(`${baseUrl}${path}`, { method: "GET" });
  assert.equal(response.ok, true, `${path} failed with ${response.status}`);
  return response.json();
}

async function postJson(path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal(response.ok, true, `${path} failed with ${response.status}`);
  return response.json();
}
