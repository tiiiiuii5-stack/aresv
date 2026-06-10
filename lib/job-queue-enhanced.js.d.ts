import type { AgentJob, JobAction } from "./types";

export declare const appBuilderQueue: unknown;
export declare const repairQueue: unknown;
export declare const connection: unknown;

export declare function createJob(
  action: JobAction,
  options?: {
    appName?: string;
    prompt?: string;
    model?: string;
    mode?: string;
    projectId?: string;
    projectSlug?: string;
    projectPath?: string;
    userId?: string;
    buildMode?: boolean;
  },
): Promise<AgentJob>;

export declare function listJobs(): Promise<AgentJob[]>;
export declare function getJob(jobId: string): Promise<AgentJob | null>;
export declare function startJobWorker(): Promise<void>;
export declare function broadcastAgentEvent(event: unknown): void;
