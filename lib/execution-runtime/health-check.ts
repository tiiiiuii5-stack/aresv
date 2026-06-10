export interface HealthCheckResult {
  ready: boolean;
  statusCode?: number;
  url: string;
  error?: string;
}

export interface HealthCheckOptions {
  timeoutMs?: number;
  intervalMs?: number;
}

export declare function waitForHealthyApp(
  port: number,
  options?: HealthCheckOptions,
): Promise<HealthCheckResult>;

export * from "./health-check.js";
