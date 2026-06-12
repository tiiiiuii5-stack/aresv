/**
 * Structured JSON Logging with Telemetry Integration
 * Provides consistent logging format and Application Insights integration
 */

import { trackEvent, trackException } from "./appinsights";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  traceId?: string;
  userId?: string;
  action?: string;
  context?: Record<string, unknown>;
  stack?: string;
}

/**
 * Generate unique trace ID for request correlation
 */
export function generateTraceId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Format log entry as JSON for cloud shipping
 */
function formatLogEntry(entry: LogEntry): string {
  return JSON.stringify(entry, null, 0);
}

/**
 * Structured logger with telemetry integration
 */
export class Logger {
  private traceId: string;

  constructor(traceId?: string) {
    this.traceId = traceId || generateTraceId();
  }

  getTraceId(): string {
    return this.traceId;
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      traceId: this.traceId,
      context,
    };

    const formatted = formatLogEntry(entry);

    // Output to console with level-appropriate styling
    const levelColors = {
      debug: "\x1b[36m", // cyan
      info: "\x1b[32m",  // green
      warn: "\x1b[33m",  // yellow
      error: "\x1b[31m", // red
    };
    const reset = "\x1b[0m";

    console.log(`${levelColors[level]}[${level.toUpperCase()}]${reset} ${formatted}`);

    // Track to Application Insights
    if (level === "error") {
      trackEvent("log_error", {
        message,
        traceId: this.traceId,
        ...Object.keys(context || {}).reduce(
          (acc, k) => ({ ...acc, [k]: String(context![k]) }),
          {}
        ),
      });
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log("warn", message, context);
  }

  error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    const errorContext = {
      ...(context || {}),
      ...(error instanceof Error && {
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack,
      }),
    };

    this.log("error", message, errorContext);

    // Also track exception to AppInsights
    if (error instanceof Error) {
      trackException(error, { message, traceId: this.traceId });
    }
  }
}

/**
 * Create logger instance with optional trace ID
 */
export function createLogger(traceId?: string): Logger {
  return new Logger(traceId);
}

/**
 * Global logger instance
 */
export const globalLogger = createLogger();
