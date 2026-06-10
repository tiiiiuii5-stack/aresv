import type { AgentJob } from "./types";

export declare function executeJob(
  job: AgentJob,
  options?: {
    persistJob?: (job: AgentJob) => Promise<void> | void;
  },
): Promise<void>;

export declare function generateSafeModeFallback(appDir: string): Promise<void>;
