import { getProject, runProjectQualityGate, type ProjectRecord } from "@/lib/project-store";

export type RuntimeGateResult = {
  ok: boolean;
  projectId: string;
  score?: number;
  issues: string[];
};

export class RuntimeFactoryService {
  async validateProject(projectId: string): Promise<RuntimeGateResult> {
    const project = await runProjectQualityGate(projectId);
    return toGateResult(project);
  }

  async inspectProject(projectId: string): Promise<RuntimeGateResult> {
    const project = await getProject(projectId);
    if (!project) return { ok: false, projectId, issues: ["Project not found."] };
    return toGateResult(project);
  }
}

export const runtimeFactoryService = new RuntimeFactoryService();

function toGateResult(project: ProjectRecord): RuntimeGateResult {
  const issues = [
    ...(project.buildValidation?.status === "failed" ? project.buildValidation.logs : []),
    ...(project.qa?.issues || []).map((issue) => issue.message),
  ];
  return {
    ok: project.buildValidation?.status !== "failed" && project.qa?.releaseApproved !== false,
    projectId: project.id,
    score: project.qa?.score,
    issues,
  };
}
