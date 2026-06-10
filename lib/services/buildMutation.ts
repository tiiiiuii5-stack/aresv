import crypto from "node:crypto";

import type { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/persistence/database";

export type DivergenceResult = {
  allowed: boolean;
  similarity?: number;
  action?: "ALLOW" | "MUTATE";
  comparedJobId?: string;
};

export type RuntimeFactory = {
  frontend?: string;
  styling?: string;
  dataPattern?: string;
  scope?: string;
  maxFeatures?: number;
  validationLayers: string[];
  [key: string]: unknown;
};

type ProjectFileLike = {
  path?: unknown;
};

type ProjectRecordLike = {
  files?: ProjectFileLike[];
};

export class BuildMutationService {
  randomizeModel(retryCount: number): string {
    const models = ["gemini-2.5-pro", "claude-sonnet-4", "gpt-4.1"];
    return models[Math.max(0, retryCount) % models.length];
  }

  randomizeTemperature(): number {
    const min = configNumber("MUTATION_TEMP_MIN", 0.7);
    const max = configNumber("MUTATION_TEMP_MAX", 1.0);
    return Number((min + Math.random() * Math.max(0, max - min)).toFixed(2));
  }

  generatePromptHash(prompt: string): string {
    return crypto
      .createHash("sha256")
      .update(`${prompt}${Date.now()}${Math.random()}`)
      .digest("hex")
      .slice(0, 16);
  }

  async checkDivergence(userId: string, fileTree: string[], options: { excludeJobId?: string } = {}): Promise<DivergenceResult> {
    const prisma = getPrisma();
    if (!prisma) return { allowed: true, action: "ALLOW" };

    const where: Prisma.JobWhereInput = {
      id: options.excludeJobId ? { not: options.excludeJobId } : undefined,
      OR: [
        { project: { userId } },
        { payload: { path: ["userId"], equals: userId } },
      ],
    };

    const recent = await prisma.job.findMany({
      where: {
        ...where,
      },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true,
        project: {
          select: {
            record: true,
            generatedApps: {
              orderBy: { updatedAt: "desc" },
              take: 1,
              select: { files: true },
            },
          },
        },
      },
    });

    for (const job of recent) {
      const previousFileTree = extractFilePaths(job.project?.record, job.project?.generatedApps?.[0]?.files);
      if (previousFileTree.length === 0) continue;
      const similarity = this.jaccardSimilarity(fileTree, previousFileTree);
      if (similarity > configNumber("MUTATION_SIMILARITY_THRESHOLD", 0.8)) {
        return { allowed: false, similarity, action: "MUTATE", comparedJobId: job.id };
      }
    }

    return { allowed: true, action: "ALLOW" };
  }

  async mutateArchitecture(factory: RuntimeFactory, mutationCount: number): Promise<RuntimeFactory> {
    const strategies: Array<(factory: RuntimeFactory) => RuntimeFactory> = [
      (f) => ({ ...f, frontend: f.frontend === "nextjs" ? "react" : "nextjs" }),
      (f) => ({ ...f, styling: f.styling === "tailwind" ? "css-modules" : "tailwind" }),
      (f) => ({ ...f, dataPattern: f.dataPattern === "ssr" ? "csr" : "ssr" }),
      (f) => ({ ...f, scope: "mvp", maxFeatures: 3 }),
      (f) => ({ ...f, validationLayers: [...new Set([...(f.validationLayers || []), "strict-type-check"])] }),
    ];
    return strategies[Math.max(0, mutationCount) % strategies.length](factory);
  }

  private jaccardSimilarity(a: string[], b: string[]): number {
    const setA = new Set(a);
    const setB = new Set(b);
    const intersection = new Set([...setA].filter((x) => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    if (union.size === 0) return 0;
    return intersection.size / union.size;
  }
}

export const buildMutationService = new BuildMutationService();

export function maxMutationsPerJob() {
  return Math.max(0, Math.floor(configNumber("MUTATION_MAX_PER_JOB", 3)));
}

function configNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function extractFilePaths(projectRecord: unknown, generatedAppFiles: unknown): string[] {
  const recordFiles = (projectRecord as ProjectRecordLike | null)?.files;
  if (Array.isArray(recordFiles)) return recordFiles.map((file) => String(file.path || "")).filter(Boolean);

  if (Array.isArray(generatedAppFiles)) {
    return (generatedAppFiles as ProjectFileLike[]).map((file) => String(file.path || "")).filter(Boolean);
  }

  return [];
}
