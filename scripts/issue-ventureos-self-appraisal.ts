import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import dotenv from "dotenv";

import { createSoftwareAppraisal } from "@/lib/appraisal/appraisalEngine";
import { issueCertificateForAppraisal, verifyStoredCertificate } from "@/lib/certificates/certificateService";
import { getPrisma } from "@/lib/persistence/database";
import { persistProject } from "@/lib/persistence/project-repository";
import { recordProjectRepositoryLink } from "@/lib/services/projectWorkspace";
import { sanitizeMetadata } from "@/lib/services/platformSupport";
import { ventureOSIntelligenceService } from "@/lib/services/intelligenceAnalysis";
import type { ProjectFile, ProjectRecord } from "@/lib/project-store";

dotenv.config({ path: ".env.local", override: true });
dotenv.config();

const PROJECT_ID = process.env.VENTUREOS_SELF_APPRAISAL_PROJECT_ID || "ventureos-self-appraisal";
const OWNER_EMAIL = process.env.VENTUREOS_SELF_APPRAISAL_OWNER_EMAIL || process.env.ADMIN_EMAIL || "owner@ventureos.local";
const REPOSITORY_URL = process.env.VENTUREOS_SELF_REPO_URL || "";
const MAX_SOURCE_CHARS = positiveInt(process.env.VENTUREOS_SELF_APPRAISAL_MAX_SOURCE_CHARS, 2_500_000);
const MAX_FILE_CHARS = positiveInt(process.env.VENTUREOS_SELF_APPRAISAL_MAX_FILE_CHARS, 90_000);

const includeExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".prisma"]);
const includeRootFiles = new Set(["package.json", "next.config.ts", "next.config.js", "middleware.ts", "proxy.ts"]);
const includeDirectories = ["app", "components", "lib", "prisma"];
const excludedPathParts = new Set([
  ".git",
  ".next",
  "node_modules",
  "coverage",
  "dist",
  "build",
  "generated-apps",
  "__tests__",
  "fixtures",
  "mocks",
]);

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
});

async function main() {
  const db = getPrisma();
  if (!db) throw new Error("DATABASE_URL is required to issue a VentureOS self-appraisal.");

  const owner = await db.user.upsert({
    where: { email: OWNER_EMAIL },
    update: { plan: "founder" },
    create: { email: OWNER_EMAIL, plan: "founder" },
    select: { id: true, email: true },
  });

  const snapshot = await collectSourceSnapshot(process.cwd());
  if (snapshot.files.length < 20) throw new Error(`Self-appraisal needs at least 20 source files; found ${snapshot.files.length}.`);
  if (snapshot.source.length < 80_000) throw new Error(`Self-appraisal source snapshot is too small: ${snapshot.source.length} characters.`);

  const now = new Date().toISOString();
  await persistProject(projectRecordFor({
    projectId: PROJECT_ID,
    ownerEmail: owner.email,
    files: snapshot.files,
    createdAt: now,
    sourceHash: hashValue(snapshot.source),
  }), owner.id);

  if (REPOSITORY_URL.trim()) {
    await recordProjectRepositoryLink({
      projectId: PROJECT_ID,
      repository: REPOSITORY_URL.trim(),
      branch: process.env.VENTUREOS_SELF_REPO_BRANCH || "main",
      metadata: {
        source: "ventureos_self_appraisal",
        sourceHash: hashValue(REPOSITORY_URL.trim()),
      },
    });
  }

  const analysis = await ventureOSIntelligenceService.analyze({
    projectId: PROJECT_ID,
    appCode: snapshot.source,
    framework: "nextjs",
    modules: [
      "nextjs",
      "react",
      "prisma",
      "stripe",
      "bullmq",
      "github",
      "certificates",
      "appraisal",
      "scanner",
      "intelligence",
    ],
    appMetadata: sanitizeMetadata({
      source: "ventureos_self_appraisal",
      rawCodeStored: true,
      repositoryHash: REPOSITORY_URL.trim() ? hashValue(REPOSITORY_URL.trim()) : null,
      codeHash: hashValue(snapshot.source),
      sourceFileCount: snapshot.files.length,
      eligibleFileCount: snapshot.eligibleFileCount,
      truncated: snapshot.truncated,
    }),
    validationResults: {
      selfAppraisal: "ventureos_current_repository",
      rawCodeStored: true,
      inputLength: snapshot.source.length,
      sourceFileCount: snapshot.files.length,
      eligibleFileCount: snapshot.eligibleFileCount,
      inputTruncated: snapshot.truncated,
      includedDirectories: includeDirectories,
    },
  });

  const appraisal = await createSoftwareAppraisal({ projectId: PROJECT_ID, userId: owner.id });
  const certificate = await issueCertificateForAppraisal({ appraisalIdOrPublicId: appraisal.id, userId: owner.id });
  const verification = await verifyStoredCertificate(certificate.certificateId);

  console.log(JSON.stringify({
    ok: true,
    projectId: PROJECT_ID,
    owner: {
      userId: owner.id,
      email: owner.email,
    },
    sourceSnapshot: {
      fileCount: snapshot.files.length,
      eligibleFileCount: snapshot.eligibleFileCount,
      sourceLength: snapshot.source.length,
      truncated: snapshot.truncated,
      hash: hashValue(snapshot.source),
    },
    scan: {
      analysisId: analysis.analysisId,
      readinessScore: analysis.productionReadinessScore,
      riskLevel: analysis.riskLevel,
      issueCount: analysis.issues.length,
      criticalCount: analysis.severityBreakdown.critical,
      highCount: analysis.severityBreakdown.high,
      mediumCount: analysis.severityBreakdown.medium,
      lowCount: analysis.severityBreakdown.low,
      topIssues: analysis.issues.slice(0, 3).map((issue) => ({
        title: issue.title,
        severity: issue.severity,
        filePath: issue.filePath || null,
        confidenceScore: issue.confidenceScore ?? null,
      })),
    },
    appraisal: {
      id: appraisal.id,
      publicId: appraisal.publicId,
      url: appraisal.appraisalUrl,
      grade: appraisal.grade,
      launchVerdict: appraisal.launchVerdict,
      readinessScore: appraisal.readinessScore,
      evidenceCoverage: appraisal.publicSummary.evidenceCoverage,
      unknowns: appraisal.publicSummary.unknowns,
      notClaimed: appraisal.publicSummary.unverifiedClaims,
    },
    certificate: {
      certificateId: certificate.certificateId,
      status: certificate.status,
      verificationUrl: certificate.verificationUrl,
      badgeUrl: certificate.badgeUrl,
      signatureValid: verification.signatureValid,
      registryMatch: verification.registryMatch,
      valid: verification.valid,
      reason: verification.reason,
    },
  }, null, 2));
}

async function collectSourceSnapshot(root: string) {
  const eligiblePaths = await listEligiblePaths(root);
  const selected: ProjectFile[] = [];
  let source = "";
  let truncated = false;

  for (const absolutePath of eligiblePaths) {
    const relativePath = toPosix(path.relative(root, absolutePath));
    const raw = await fs.readFile(absolutePath, "utf8").catch(() => "");
    if (!raw.trim()) continue;

    const fileTruncated = raw.length > MAX_FILE_CHARS;
    const content = normalizeFileContent(fileTruncated ? raw.slice(0, MAX_FILE_CHARS) : raw);
    const block = `// FILE: ${relativePath}\n${content}${fileTruncated ? `\n// [VentureOS self-appraisal truncated ${relativePath} after ${MAX_FILE_CHARS} characters]\n` : "\n"}`;
    if (source.length + block.length > MAX_SOURCE_CHARS) {
      truncated = true;
      break;
    }

    selected.push({ path: relativePath, content });
    source += source ? `\n${block}` : block;
    if (fileTruncated) truncated = true;
  }

  if (selected.length < eligiblePaths.length) truncated = true;
  return {
    files: selected,
    eligibleFileCount: eligiblePaths.length,
    source,
    truncated,
  };
}

async function listEligiblePaths(root: string) {
  const entries: string[] = [];

  for (const fileName of includeRootFiles) {
    const absolute = path.join(root, fileName);
    if (await exists(absolute)) entries.push(absolute);
  }

  for (const directory of includeDirectories) {
    const absoluteDirectory = path.join(root, directory);
    if (await exists(absoluteDirectory)) {
      entries.push(...await walk(absoluteDirectory));
    }
  }

  return [...new Set(entries)]
    .filter((absolutePath) => isIncludedPath(root, absolutePath))
    .sort((a, b) => sourcePriority(root, a) - sourcePriority(root, b) || toPosix(path.relative(root, a)).localeCompare(toPosix(path.relative(root, b))));
}

async function walk(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!excludedPathParts.has(entry.name)) files.push(...await walk(absolutePath));
      continue;
    }
    if (entry.isFile()) files.push(absolutePath);
  }

  return files;
}

function isIncludedPath(root: string, absolutePath: string) {
  const relativePath = toPosix(path.relative(root, absolutePath));
  const parts = relativePath.split("/");
  if (parts.some((part) => excludedPathParts.has(part))) return false;
  if (/\.env(?:\.|$)|package-lock\.json|tsconfig\.tsbuildinfo/i.test(relativePath)) return false;
  if (includeRootFiles.has(relativePath)) return true;
  const extension = path.extname(relativePath);
  if (!includeExtensions.has(extension)) return false;
  if (/\.(test|spec|stories)\.(ts|tsx|js|jsx)$/i.test(relativePath)) return false;
  return includeDirectories.some((directory) => relativePath === directory || relativePath.startsWith(`${directory}/`));
}

function sourcePriority(root: string, absolutePath: string) {
  const relativePath = toPosix(path.relative(root, absolutePath));
  if (relativePath === "package.json") return 0;
  if (relativePath === "prisma/schema.prisma") return 1;
  if (/^app\/api\//.test(relativePath)) return 2;
  if (/^app\/.*page\.tsx$/.test(relativePath)) return 3;
  if (/^lib\/(auth|trust|security|appraisal|certificates|services|intelligence)\//.test(relativePath)) return 4;
  if (/^components\//.test(relativePath)) return 5;
  if (/^lib\//.test(relativePath)) return 6;
  return 7;
}

function projectRecordFor(input: {
  projectId: string;
  ownerEmail: string;
  files: ProjectFile[];
  createdAt: string;
  sourceHash: string;
}): ProjectRecord {
  return {
    id: input.projectId,
    name: "VentureOS",
    slug: input.projectId,
    category: "paid-software-appraisal",
    problem: "Determine whether VentureOS is ready to present a signed technical appraisal and public certificate.",
    audience: "software founders, buyers, investors, agencies, and technical reviewers",
    uiDirection: "evidence-backed software appraisal",
    monetization: "self-issued first VentureOS appraisal",
    prompt: "Run VentureOS through the VentureOS appraisal, evidence, readiness, and certificate pipeline.",
    status: "ready",
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    files: input.files,
    onboarding: ["Source snapshot collected", "Scanner executed", "Appraisal generated", "Certificate issued"],
    features: [
      "Repository intelligence",
      "Evidence-backed findings",
      "Production readiness score",
      "Software appraisal",
      "Signed certificate",
      "Public verification badge",
    ],
    appraisalContact: {
      purchaserEmail: input.ownerEmail,
      receiptEmail: input.ownerEmail,
      contactEmail: input.ownerEmail,
      source: "authenticated_session",
    },
    qa: {
      score: 0,
      threshold: 85,
      releaseApproved: false,
      issues: [],
      blockers: [],
      simulatedUsers: [],
      productionQuestions: {
        wouldSomeonePay: false,
        wouldEmbarrassFounder: false,
        survivesRealUsers: false,
        feelsPremiumBesideSaaS: true,
      },
      dimensions: {
        sourceFiles: input.files.length,
        snapshotHashPresent: input.sourceHash ? 1 : 0,
      },
    },
  };
}

function normalizeFileContent(value: string) {
  return value.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trimEnd();
}

async function exists(absolutePath: string) {
  try {
    await fs.access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function toPosix(value: string) {
  return value.replace(/\\/g, "/");
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}
