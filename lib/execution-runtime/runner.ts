export type RuntimeStatus = "running" | "failed" | "ready";

export interface RuntimeResult {
  status: RuntimeStatus;
  logs: string[];
  port?: number;
  url?: string;
  error?: string;
}

export interface RunProjectRuntimeOptions {
  runtimeId?: string;
  timeoutMs?: number;
  installTimeoutMs?: number;
}

export declare function runProjectRuntime(
  projectPath: string,
  options?: RunProjectRuntimeOptions,
): Promise<RuntimeResult>;

export declare function stopRuntime(runtimeId: string): Promise<void>;

export * from "./runner.js";
