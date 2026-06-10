export type AgentStage = 
  | "idle" 
  | "planning" 
  | "generating" 
  | "writing_files" 
  | "installing" 
  | "building" 
  | "testing" 
  | "fixing" 
  | "ready";

export type JobAction = "generate" | "verify" | "repair" | "preview" | "build" | "deploy";

export interface JobArtifact {
  kind: "job-result";
  version: 1;
  jobId: string;
  action: JobAction;
  generatedAt: string;
  metadata: {
    appName: string | null;
    prompt: string | null;
    model: string | null;
    mode: string | null;
    attempts: number;
    maxAttempts: number;
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
  };
  status: AgentJob["status"];
  stage: AgentStage;
  progress: number;
  summary: string;
  outputFiles: string[];
  runtimeStatus?: "running" | "failed" | "ready";
  runtimeUrl?: string;
  runtimePort?: number;
  executionLogs?: string[];
  executionError?: string;
  result: {
    message: string;
    status: AgentJob["status"];
    stage: AgentStage;
    progress: number;
  };
}

export interface AgentJob {
  id: string;
  action: JobAction;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  stage: AgentStage;
  progress: number;
  appName?: string;
  prompt?: string;
  model?: string;
  mode?: string;
  buildMode?: boolean;
  traceId?: string;
  userId?: string;
  projectId?: string;
  projectSlug?: string;
  projectPath?: string;
  message: string;
  events: unknown[];
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  attempts: number;
  maxAttempts: number;
  artifact?: JobArtifact;
  mutationCount?: number;
  mutationHistory?: unknown[];
  modelUsed?: string;
  temperature?: number;
  promptHash?: string;
  divergenceResult?: unknown;
  memoryContext?: unknown[];
}

export interface RepairSession {
  appName: string;
  startedAt: string;
  cycles: unknown[];
  successful: boolean;
  fallbackApplied: boolean;
}
