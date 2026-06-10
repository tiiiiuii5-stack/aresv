import { createJob, getJob } from "@/lib/queue";

export class DeploymentService {
  async deployProject(input: { projectId?: string; projectSlug?: string; appName?: string; prompt?: string; userId?: string }) {
    const projectId = input.projectId?.trim();
    if (!projectId) throw new Error("PROJECT_ID_REQUIRED");

    return createJob("deploy", {
      appName: input.appName || input.projectSlug || input.projectId || "VentureOS App",
      prompt: input.prompt || "",
      projectId,
      projectSlug: input.projectSlug,
      userId: input.userId,
      buildMode: false,
    } as Parameters<typeof createJob>[1] & { userId?: string; buildMode?: boolean });
  }

  async getDeploymentJob(jobId: string) {
    return getJob(jobId);
  }
}

export const deploymentService = new DeploymentService();
