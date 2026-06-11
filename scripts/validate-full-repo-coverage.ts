import assert from "node:assert/strict";
import process from "node:process";

import { assessEvidenceCoverage } from "@/lib/scanner/evidence-coverage-gate";
import { walkRepositorySource } from "@/lib/scanner/repo-walker";
import { generateSoftwareBillOfMaterials } from "@/lib/sbom/software-bom";

const repo = walkRepositorySource({
  rootDir: process.cwd(),
  maxFileBytes: 750_000,
  maxTotalBytes: 25_000_000,
});

assert.ok(repo.totalFilesDiscovered >= 100, `Expected meaningful traversal, got ${repo.totalFilesDiscovered} discovered files.`);
assert.ok(repo.filesLoaded >= 100, `Expected at least 100 readable source files, got ${repo.filesLoaded}.`);
assert.ok(repo.files.some((file) => file.path === "package.json"), "package.json must be included in full repository evidence.");
assert.ok(repo.files.some((file) => file.path === "package-lock.json"), "package-lock.json must be included in full repository evidence.");
assert.ok(repo.files.some((file) => file.path === "prisma/schema.prisma"), "Prisma schema must be included in full repository evidence.");

const coverage = assessEvidenceCoverage({
  inputSource: "submitted_source",
  inputLength: repo.source.length,
  inputLimit: repo.source.length,
  inputTruncated: false,
  repository: {
    filesLoaded: repo.filesLoaded,
    totalFilesDiscovered: repo.totalFilesDiscovered,
    truncated: false,
  },
});

assert.equal(coverage.level, "complete", `Expected complete coverage, got ${coverage.level}.`);
assert.equal(coverage.coveragePercent, 100, `Expected 100% coverage, got ${coverage.coveragePercent}.`);

const sbom = generateSoftwareBillOfMaterials({
  sourceCode: repo.source,
  appName: "VentureOS",
  repositoryUrl: "https://github.com/tiiiiuii5-stack/aresv",
});

assert.equal(sbom.status, "available", "SBOM should be available from full repository evidence.");
assert.equal(sbom.completeness, "moderate", "SBOM should be moderate when lockfile evidence is present.");
assert.ok(sbom.componentCount > 100, `Expected lockfile transitive dependencies, got ${sbom.componentCount} components.`);
assert.ok(sbom.componentsPreview.some((component) => component.packageManager === "npm"), "SBOM should identify npm package manager.");

console.log(JSON.stringify({
  passed: true,
  repository: {
    totalFilesDiscovered: repo.totalFilesDiscovered,
    filesLoaded: repo.filesLoaded,
    warnings: repo.warnings.slice(0, 5),
  },
  coverage: {
    level: coverage.level,
    coveragePercent: coverage.coveragePercent,
    confidence: coverage.confidence,
    scoreCap: coverage.scoreCap,
  },
  sbom: {
    status: sbom.status,
    completeness: sbom.completeness,
    componentCount: sbom.componentCount,
    directDependencyCount: sbom.directDependencyCount,
    devDependencyCount: sbom.devDependencyCount,
    packageManagers: sbom.packageManagers,
  },
}, null, 2));
