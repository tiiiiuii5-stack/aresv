import assert from "node:assert/strict";

import { loadPublicGitHubRepositorySource } from "@/lib/repositories/public-github-source";
import { assessEvidenceCoverage } from "@/lib/scanner/evidence-coverage-gate";
import { generateSoftwareBillOfMaterials } from "@/lib/sbom/software-bom";

const repositoryUrl = process.env.VENTUREOS_REPO_URL || "https://github.com/tiiiiuii5-stack/aresv.git";

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const repo = await loadPublicGitHubRepositorySource({
    repositoryUrl,
    maxChars: 6_000_000,
    maxFiles: 2_000,
    maxFileBytes: 1_000_000,
    maxCharsPerFile: 1_000_000,
  });

  const coverage = assessEvidenceCoverage({
    inputSource: "public_github_repository",
    inputLength: repo.code.length,
    inputLimit: 6_000_000,
    inputTruncated: repo.truncated,
    repository: {
      filesLoaded: repo.filesLoaded,
      totalFilesDiscovered: repo.totalFilesDiscovered,
      truncated: repo.truncated,
    },
  });

  const sbom = generateSoftwareBillOfMaterials({
    sourceCode: repo.code,
    appName: `${repo.owner}/${repo.repo}`,
    repositoryUrl: repo.canonicalUrl,
  });

  assert.equal(repo.truncated, false, `Expected no truncation, got ${repo.filesLoaded}/${repo.totalFilesDiscovered}.`);
  assert.equal(repo.filesLoaded, repo.totalFilesDiscovered, `Expected full eligible source coverage, got ${repo.filesLoaded}/${repo.totalFilesDiscovered}.`);
  assert.equal(coverage.coveragePercent, 100, `Expected 100% coverage, got ${coverage.coveragePercent}.`);
  assert.equal(coverage.level, "complete", `Expected complete coverage, got ${coverage.level}.`);
  assert.ok(sbom.componentCount >= 100, `Expected lockfile-backed SBOM, got ${sbom.componentCount} component(s).`);

  console.log(JSON.stringify({
    passed: true,
    repository: {
      owner: repo.owner,
      repo: repo.repo,
      filesLoaded: repo.filesLoaded,
      totalFilesDiscovered: repo.totalFilesDiscovered,
      codeLength: repo.code.length,
      truncated: repo.truncated,
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
    },
  }, null, 2));
}
