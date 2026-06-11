import assert from "node:assert/strict";

const baseUrl = (process.env.VENTUREOS_BASE_URL || "https://ventureos-full-fixed.vercel.app").replace(/\/+$/, "");
const syntheticHeaders = {
  "User-Agent": "VentureOSbot enterprise-readiness synthetic-validation",
};

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

  const health = await getJson("/api/health?deep=1") as {
    configuration?: {
      database?: { configured?: boolean; disabled?: boolean; reachable?: boolean; verifiedRead?: boolean; verifiedWrite?: boolean; provider?: string; reason?: string | null; circuit?: { open?: boolean; reason?: string | null } };
      stripe?: {
        checkoutEnabled?: boolean;
        webhookEnabled?: boolean;
        appraisalPriceIdsConfigured?: { instant?: boolean; buyerReady?: boolean };
        paymentLedger?: { configured?: boolean; reachable?: boolean; verifiedRead?: boolean; verifiedWrite?: boolean; provider?: string; reason?: string | null };
      };
    };
  };
  const database = health.configuration?.database;
  const stripe = health.configuration?.stripe;

  gates.push({
    name: "production_db_flow",
    passed: Boolean(database?.configured && !database.disabled && database.reachable && database.verifiedRead && database.verifiedWrite),
    detail: `provider=${database?.provider || "none"} configured=${Boolean(database?.configured)} disabled=${Boolean(database?.disabled)} reachable=${Boolean(database?.reachable)} verifiedRead=${Boolean(database?.verifiedRead)} verifiedWrite=${Boolean(database?.verifiedWrite)} circuitOpen=${Boolean(database?.circuit?.open)} reason=${database?.reason || database?.circuit?.reason || "none"}`,
  });

  gates.push({
    name: "stripe_payment_operations",
    passed: Boolean(stripe?.checkoutEnabled && stripe.webhookEnabled && stripe.appraisalPriceIdsConfigured?.instant && stripe.appraisalPriceIdsConfigured?.buyerReady && stripe.paymentLedger?.verifiedRead && stripe.paymentLedger.verifiedWrite),
    detail: `checkout=${Boolean(stripe?.checkoutEnabled)} webhook=${Boolean(stripe?.webhookEnabled)} instantPrice=${Boolean(stripe?.appraisalPriceIdsConfigured?.instant)} buyerPrice=${Boolean(stripe?.appraisalPriceIdsConfigured?.buyerReady)} paymentLedgerProvider=${stripe?.paymentLedger?.provider || "none"} paymentLedgerRead=${Boolean(stripe?.paymentLedger?.verifiedRead)} paymentLedgerWrite=${Boolean(stripe?.paymentLedger?.verifiedWrite)} paymentLedgerReason=${stripe?.paymentLedger?.reason || "none"}`,
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
    metrics?: {
      uniqueReal?: {
        previewStarted?: number;
        previewCompleted?: number;
        checkoutStarted?: number;
        paidIntent?: number;
        reportGenerated?: number;
        previewToCheckoutPath?: number;
      };
      syntheticTotalEvents?: number;
      botTotalEvents?: number;
    };
    proof?: {
      customerDemand?: { proven?: boolean; previewStarted?: number; previewCompleted?: number; capturedLeads?: number; requirement?: string };
      conversionFunnel?: { proven?: boolean; checkoutStarted?: number; paidIntent?: number; previewToCheckoutRate?: number; previewToCheckoutPath?: number; requirement?: string };
    };
  };
  const uniqueReal = funnel.metrics?.uniqueReal;
  gates.push({
    name: "proven_customer_demand",
    passed: Boolean(funnel.proof?.customerDemand?.proven),
    detail: `uniqueRealPreviewStarted=${uniqueReal?.previewStarted ?? funnel.proof?.customerDemand?.previewStarted ?? 0} uniqueRealPreviewCompleted=${uniqueReal?.previewCompleted ?? funnel.proof?.customerDemand?.previewCompleted ?? 0} capturedLeads=${funnel.proof?.customerDemand?.capturedLeads ?? 0} syntheticEvents=${funnel.metrics?.syntheticTotalEvents ?? 0} botEvents=${funnel.metrics?.botTotalEvents ?? 0} requirement="${funnel.proof?.customerDemand?.requirement || "missing"}"`,
  });
  gates.push({
    name: "proven_conversion_funnel",
    passed: Boolean(funnel.proof?.conversionFunnel?.proven),
    detail: `uniqueRealCheckoutStarted=${uniqueReal?.checkoutStarted ?? funnel.proof?.conversionFunnel?.checkoutStarted ?? 0} uniqueRealPaidIntent=${uniqueReal?.paidIntent ?? funnel.proof?.conversionFunnel?.paidIntent ?? 0} uniqueRealPreviewToCheckoutPath=${uniqueReal?.previewToCheckoutPath ?? funnel.proof?.conversionFunnel?.previewToCheckoutPath ?? 0} previewToCheckoutRate=${funnel.proof?.conversionFunnel?.previewToCheckoutRate ?? 0}% requirement="${funnel.proof?.conversionFunnel?.requirement || "missing"}"`,
  });

  console.log(JSON.stringify({ passed: gates.every((gate) => gate.passed), baseUrl, gates }, null, 2));
  assert.ok(gates.every((gate) => gate.passed), "Enterprise readiness is not fully proven yet.");
}

async function getJson(path: string) {
  const response = await fetch(`${baseUrl}${path}`, { method: "GET", headers: syntheticHeaders });
  assert.equal(response.ok, true, `${path} failed with ${response.status}`);
  return response.json();
}

async function postJson(path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { ...syntheticHeaders, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal(response.ok, true, `${path} failed with ${response.status}`);
  return response.json();
}
