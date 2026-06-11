import assert from "node:assert/strict";

const baseUrl = (process.env.VENTUREOS_FLOW_BASE_URL || "https://ventureos-full-fixed.vercel.app").replace(/\/+$/, "");
const syntheticHeaders = {
  "User-Agent": "VentureOSbot product-flow-contract synthetic-validation",
};

async function main() {
  const home = await get("/");
  assert.equal(home.status, 200, "Home page should load.");
  assert.match(await home.text(), /VentureOS|software/i, "Home page should contain product copy.");

  const freeReview = await get("/free-review");
  assert.equal(freeReview.status, 200, "Free review page should load.");
  assert.match(await freeReview.text(), /GitHub|repo|review/i, "Free review page should expose source intake.");

  await postEvent("preview_started");

  const scan = await postJson("/api/public-demo-scan", {
    framework: "nextjs",
    modules: ["auth", "billing", "database"],
    appCode: [
      "// FILE: package.json",
      JSON.stringify({
        dependencies: { next: "16.2.6", react: "19.2.6" },
        devDependencies: { typescript: "6.0.3" },
      }),
      "// FILE: app/api/health/route.ts",
      "export async function GET() { return Response.json({ ok: true }); }",
    ].join("\n"),
  });
  assert.equal(scan.status, 200, "Preview scan should complete.");
  const scanPayload = await scan.json() as {
    ok?: boolean;
    evidenceCoverage?: unknown;
    verdict?: unknown;
    decision?: {
      answer?: unknown;
      observed?: unknown;
      inferred?: unknown;
      unknown?: unknown;
    };
    confidence?: unknown;
    productionReadinessScore?: unknown;
    rawScores?: unknown;
  };
  assert.equal(scanPayload.ok, true, "Preview scan should return ok.");
  assert.ok(scanPayload.evidenceCoverage, "Preview scan must return evidence coverage.");
  assert.ok(scanPayload.verdict, "Preview scan must return confidence-aware verdict.");
  assert.ok(scanPayload.decision, "Preview scan must return decision object.");
  assert.match(String(scanPayload.decision?.answer || ""), /BUY|INVESTIGATE|AVOID/, "Decision must be BUY, INVESTIGATE, or AVOID.");
  assert.ok(Array.isArray(scanPayload.decision?.observed), "Decision must expose observed evidence.");
  assert.ok(Array.isArray(scanPayload.decision?.inferred), "Decision must expose inferred evidence.");
  assert.ok(Array.isArray(scanPayload.decision?.unknown), "Decision must expose unknowns.");
  assert.equal(typeof scanPayload.confidence, "number", "Preview scan must return confidence.");
  assert.equal(typeof scanPayload.productionReadinessScore, "number", "Preview scan must return displayed score.");
  assert.ok(scanPayload.rawScores, "Preview scan must preserve raw scores.");

  await postEvent("preview_completed");

  const pricing = await get("/pricing");
  assert.equal(pricing.status, 200, "Pricing page should load.");
  assert.match(await pricing.text(), /\$9|\$19|Free|Report/i, "Pricing page should show the value ladder.");

  await postEvent("checkout_started");

  const checkout = await postJson("/api/appraisal-checkout", {
    offer: "instant",
    repoUrl: "https://github.com/tiiiiuii5-stack/aresv",
    framework: "nextjs",
  });
  assert.ok([200, 201, 503].includes(checkout.status), `Checkout route should be reachable, got ${checkout.status}.`);
  if (checkout.status !== 503) {
    const checkoutPayload = await checkout.json() as { ok?: boolean; url?: unknown };
    assert.equal(checkoutPayload.ok, true, "Checkout response should return ok when Stripe/free access is configured.");
    assert.equal(typeof checkoutPayload.url, "string", "Checkout response should include a destination URL.");
  }

  await postEvent("report_generated");
  await postEvent("report_opened");

  console.log(JSON.stringify({
    passed: true,
    baseUrl,
    checkoutStatus: checkout.status,
    decision: scanPayload.decision?.answer,
    previewVerdict: scanPayload.verdict,
    previewConfidence: scanPayload.confidence,
    previewScore: scanPayload.productionReadinessScore,
  }, null, 2));
}

async function get(path: string) {
  return fetch(`${baseUrl}${path}`, { method: "GET", headers: syntheticHeaders });
}

async function postJson(path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { ...syntheticHeaders, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function postEvent(event: string) {
  const response = await postJson("/api/product-events", {
    event,
    source: "product_flow_contract",
    framework: "nextjs",
    counts: { contractTest: true },
  });
  assert.equal(response.status, 200, `Product event ${event} should be accepted.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
