import assert from "node:assert/strict";

import { assertNeutralReportLanguage, buildReportLanguageContract, neutralizeReportText } from "@/lib/appraisal/reportLanguage";

assert.equal(neutralizeReportText("Verified by us with High confidence."), "observed in submitted evidence with supported by evidence.");
assert.equal(neutralizeReportText("We confirmed production ready signals."), "VentureOS observed readiness indicators.");

const contract = buildReportLanguageContract({
  coverage: {
    score: 70,
    level: "moderate",
    scope: "repository_linked",
    scoreCap: 88,
    scoreCapped: true,
    reasons: ["Repository link was observed."],
    verifiedClaims: ["A stored VentureOS scan was observed."],
    unverifiedClaims: ["Runtime production behavior."],
    unknowns: ["Legal ownership was not measured."],
  },
  evidence: [{ id: "e1", title: "Missing webhook signature", severity: "high", category: "billing", evidence: "route", fixRecommendation: "verify signature", confidence: 0.9, fixImpact: 12, publicSummary: "HIGH billing risk observed in scan evidence." }],
  verdict: "RISKY",
});

assert.equal(contract.voice, "observational");
assert.ok(contract.boundaries.some((boundary) => boundary.authorityLevel === "not_verified"));
assert.ok(contract.claims.observed.every((claim) => claim.authorityLevel === "system_observed"));
assert.ok(contract.claims.notVerified.every((claim) => claim.authorityLevel === "not_verified"));
assert.doesNotThrow(() => assertNeutralReportLanguage(contract));
assert.throws(() => assertNeutralReportLanguage({ text: "Verified by us with high confidence." }), /REPORT_LANGUAGE_BOUNDARY_VIOLATION/);

console.log(JSON.stringify({
  passed: true,
  boundaries: contract.boundaries.length,
  observedClaims: contract.claims.observed.length,
  notVerifiedClaims: contract.claims.notVerified.length,
}, null, 2));
