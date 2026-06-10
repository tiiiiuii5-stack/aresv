import type { PipelineWorker } from "@/lib/pipeline/jobQueue";

export const pipelineWorkers: Record<string, PipelineWorker> = {
  runAppraisal: async (job) => {
    const appraisalReady = job.payload.toState === "APPRAISING";
    return {
      event: appraisalReady ? "APPRAISAL_CREATED" : null,
      context: {
        appraisalPipelineStatus: appraisalReady ? "created" : "prepared",
        source: "pipeline.runAppraisal",
        entityId: job.entityId,
      },
    };
  },

  runScanner: async () => ({
    event: "SCAN_COMPLETED",
    context: {
      source: "pipeline.runScanner",
      riskScore: 0,
      readinessScore: 90,
    },
  }),

  generateCertificate: async () => ({
    event: "CERTIFICATE_ISSUED",
    context: {
      source: "pipeline.generateCertificate",
    },
  }),

  writeTransparencyLog: async () => ({
    event: "TRANSPARENCY_WRITTEN",
    context: {
      source: "pipeline.writeTransparencyLog",
    },
  }),

  lockAsset: async () => ({
    event: "LOCKED",
    context: {
      source: "pipeline.lockAsset",
    },
  }),

  reviewRisk: async (job) => ({
    context: {
      source: "pipeline.reviewRisk",
      reviewRequired: true,
      reason: job.payload.reason || "Risk review required.",
    },
  }),

  recordFailure: async (job) => ({
    context: {
      source: "pipeline.recordFailure",
      recorded: true,
      failure: job.lastError || job.payload.error || "Pipeline failure recorded.",
    },
  }),
};
