import assert from "node:assert/strict";

import { applyEvidenceCoverageGate, assessEvidenceCoverage } from "@/lib/scanner/evidence-coverage-gate";

const thinRepoCoverage = assessEvidenceCoverage({
  inputSource: "public_github_repository",
  inputLength: 6_000,
  inputLimit: 40_000,
  inputTruncated: false,
  repository: {
    filesLoaded: 2,
    totalFilesDiscovered: 973,
    truncated: true,
  },
});

assert.equal(thinRepoCoverage.level, "thin");
assert.equal(thinRepoCoverage.scoreCap, 55);
assert.equal(thinRepoCoverage.confidence, 25);
assert.equal(thinRepoCoverage.scoreCapped, true);

const adjustedThinRepo = applyEvidenceCoverageGate({
  securityScore: 100,
  failureScore: 0,
  productionReadinessScore: 100,
  riskLevel: "low",
}, thinRepoCoverage);

assert.equal(adjustedThinRepo.securityScore, 55);
assert.equal(adjustedThinRepo.productionReadinessScore, 55);
assert.equal(adjustedThinRepo.failureScore, 45);
assert.equal(adjustedThinRepo.riskLevel, "high");
assert.equal(adjustedThinRepo.rawScores.productionReadinessScore, 100);

const completeRepoCoverage = assessEvidenceCoverage({
  inputSource: "public_github_repository",
  inputLength: 35_000,
  inputLimit: 40_000,
  inputTruncated: false,
  repository: {
    filesLoaded: 48,
    totalFilesDiscovered: 48,
    truncated: false,
  },
});

assert.equal(completeRepoCoverage.level, "complete");
assert.equal(completeRepoCoverage.scoreCap, 85);
assert.equal(completeRepoCoverage.confidence, 90);

const adjustedCompleteRepo = applyEvidenceCoverageGate({
  securityScore: 92,
  failureScore: 8,
  productionReadinessScore: 92,
  riskLevel: "low",
}, completeRepoCoverage);

assert.equal(adjustedCompleteRepo.securityScore, 85);
assert.equal(adjustedCompleteRepo.productionReadinessScore, 85);
assert.equal(adjustedCompleteRepo.riskLevel, "low");

console.log(JSON.stringify({
  passed: true,
  thinRepoCoverage,
  adjustedThinRepo,
  completeRepoCoverage,
  adjustedCompleteRepo,
}, null, 2));
