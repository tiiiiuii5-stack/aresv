import assert from "node:assert/strict";

import { evaluateTrustPolicy } from "@/lib/trust-graph/trustGraph";

const verified = evaluateTrustPolicy({
  trustScore: 91,
  criticalFindings: 0,
  hasActiveCertificate: true,
  failedJobs: 0,
});
assert.equal(verified.certificateIssuance, "ALLOW");
assert.equal(verified.registryStatus, "VERIFIED");
assert.ok(verified.rules.every((rule) => rule.result === "pass"));

const review = evaluateTrustPolicy({
  trustScore: 82,
  criticalFindings: 0,
  hasActiveCertificate: false,
  failedJobs: 1,
});
assert.equal(review.certificateIssuance, "REVIEW");
assert.equal(review.registryStatus, "RISKY");
assert.ok(review.rules.some((rule) => rule.result === "warn"));

const blocked = evaluateTrustPolicy({
  trustScore: 69,
  criticalFindings: 1,
  hasActiveCertificate: true,
  failedJobs: 0,
});
assert.equal(blocked.certificateIssuance, "BLOCK");
assert.equal(blocked.registryStatus, "BLOCKED");
assert.ok(blocked.rules.some((rule) => rule.result === "fail"));

console.log(JSON.stringify({
  passed: true,
  verified: verified.registryStatus,
  review: review.registryStatus,
  blocked: blocked.registryStatus,
}, null, 2));
