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
assert.equal(thinRepoCoverage.scoreCap, 52);
assert.equal(thinRepoCoverage.confidence, 23);
assert.equal(thinRepoCoverage.coveragePercent, 0.21);
assert.equal(thinRepoCoverage.scoreCapped, true);

const adjustedThinRepo = applyEvidenceCoverageGate({
  securityScore: 100,
  failureScore: 0,
  productionReadinessScore: 100,
  riskLevel: "low",
}, thinRepoCoverage);

assert.equal(adjustedThinRepo.securityScore, 52);
assert.equal(adjustedThinRepo.productionReadinessScore, 52);
assert.equal(adjustedThinRepo.failureScore, 48);
assert.equal(adjustedThinRepo.riskLevel, "high");
assert.equal(adjustedThinRepo.verdict, "INSUFFICIENT_EVIDENCE");
assert.equal(adjustedThinRepo.rawScores.productionReadinessScore, 100);

const limitedRepoCoverage = assessEvidenceCoverage({
  inputSource: "public_github_repository",
  inputLength: 92_000,
  inputLimit: 120_000,
  inputTruncated: false,
  repository: {
    filesLoaded: 120,
    totalFilesDiscovered: 976,
    truncated: true,
  },
});

assert.equal(limitedRepoCoverage.level, "limited");
assert.equal(limitedRepoCoverage.coveragePercent, 12.3);
assert.equal(limitedRepoCoverage.scoreCap, 60);

const adjustedLimitedRepo = applyEvidenceCoverageGate({
  securityScore: 82,
  failureScore: 18,
  productionReadinessScore: 82,
  riskLevel: "medium",
}, limitedRepoCoverage);

assert.equal(adjustedLimitedRepo.securityScore, 60);
assert.equal(adjustedLimitedRepo.productionReadinessScore, 60);
assert.equal(adjustedLimitedRepo.riskLevel, "high");
assert.equal(adjustedLimitedRepo.verdict, "LIMITED_EVIDENCE");

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
assert.equal(adjustedCompleteRepo.verdict, "FULL_REVIEW_READY");

console.log(JSON.stringify({
  passed: true,
  thinRepoCoverage,
  adjustedThinRepo,
  limitedRepoCoverage,
  adjustedLimitedRepo,
  completeRepoCoverage,
  adjustedCompleteRepo,
}, null, 2));
