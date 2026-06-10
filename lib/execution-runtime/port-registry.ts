export interface RuntimePortEntry {
  runtimeId: string;
  projectPath: string;
  workspacePath?: string;
  port: number;
  pid: number | null;
  status: "reserved" | "running" | "stopped";
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  stoppedAt?: string | null;
}

export declare function reservePort(input: {
  runtimeId: string;
  projectPath: string;
  workspacePath: string;
}): Promise<RuntimePortEntry>;

export declare function attachRuntimeProcess(input: {
  runtimeId: string;
  pid: number;
  port: number;
  projectPath: string;
  workspacePath: string;
}): Promise<RuntimePortEntry>;

export declare function releasePort(runtimeId: string): Promise<RuntimePortEntry | null>;
export declare function listActiveApps(): Promise<RuntimePortEntry[]>;
export declare function getActiveRuntime(runtimeId: string): RuntimePortEntry | null;

export * from "./port-registry.js";
