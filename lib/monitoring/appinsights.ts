/**
 * Azure Application Insights Instrumentation
 * Provides telemetry collection for production monitoring
 */

import { useAzureMonitor } from "@azure/monitor-opentelemetry";

let telemetryClient: any = null;

/**
 * Initialize Azure Monitor OpenTelemetry
 * Should be called early in application startup, after env vars are loaded
 */
export function initializeAppInsights(): void {
  if (telemetryClient) {
    console.warn("AppInsights already initialized, skipping duplicate init");
    return;
  }

  const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  
  if (!connectionString && process.env.NODE_ENV === "production") {
    console.error(
      "APPLICATIONINSIGHTS_CONNECTION_STRING not configured. " +
      "Production monitoring disabled. Set env var to enable."
    );
    return;
  }

  if (!connectionString) {
    console.warn("APPLICATIONINSIGHTS_CONNECTION_STRING not set - monitoring disabled (dev mode)");
    return;
  }

  try {
    const options = {
      azureMonitorExporterOptions: {
        connectionString,
      },
    };

    telemetryClient = useAzureMonitor(options);
    console.log("✓ Azure Application Insights initialized");
  } catch (error) {
    console.error("Failed to initialize AppInsights:", error);
    if (process.env.NODE_ENV === "production") {
      throw error; // Fail fast in production
    }
  }
}

/**
 * Track custom event to Application Insights
 */
export function trackEvent(
  name: string,
  properties?: Record<string, string>,
  measurements?: Record<string, number>
): void {
  if (!telemetryClient) {
    if (process.env.NODE_ENV === "production") {
      console.warn("AppInsights not initialized - event not tracked:", name);
    }
    return;
  }

  try {
    telemetryClient.trackEvent?.({
      name,
      properties,
      measurements,
    });
  } catch (error) {
    console.error("Failed to track event:", name, error);
  }
}

/**
 * Track exception to Application Insights
 */
export function trackException(
  error: Error,
  properties?: Record<string, string>,
  measurements?: Record<string, number>,
  traceId?: string
): void {
  if (!telemetryClient) {
    if (process.env.NODE_ENV === "production") {
      console.warn("AppInsights not initialized - exception not tracked");
    }
    return;
  }

  try {
    const props = {
      ...(properties || {}),
      ...(traceId && { traceId }),
    };

    telemetryClient.trackException?.({
      exception: error,
      properties: props,
      measurements,
    });
  } catch (err) {
    console.error("Failed to track exception:", err);
  }
}

/**
 * Track dependency (DB, API call, etc.)
 */
export function trackDependency(
  name: string,
  type: string,
  target: string,
  duration: number,
  success: boolean,
  resultCode?: string,
  properties?: Record<string, string>
): void {
  if (!telemetryClient) return;

  try {
    telemetryClient.trackDependency?.({
      name,
      dependencyType: type,
      target,
      duration,
      success,
      resultCode: resultCode || (success ? "200" : "500"),
      properties,
    });
  } catch (error) {
    console.error("Failed to track dependency:", error);
  }
}

/**
 * Track custom metric
 */
export function trackMetric(name: string, value: number, properties?: Record<string, string>): void {
  if (!telemetryClient) return;

  try {
    telemetryClient.trackMetric?.({
      name,
      value,
      properties,
    });
  } catch (error) {
    console.error("Failed to track metric:", error);
  }
}

export { telemetryClient };
