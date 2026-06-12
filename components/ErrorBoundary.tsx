"use client";

import { useEffect, useState } from "react";
import { createLogger } from "@/lib/logging/logger";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorState {
  hasError: boolean;
  error?: Error;
  traceId?: string;
}

/**
 * React Error Boundary for catching client-side errors
 * Prevents entire app from crashing when a component fails
 */
export function ErrorBoundary({ children, fallback }: ErrorBoundaryProps) {
  const [state, setState] = useState<ErrorState>({ hasError: false });
  const logger = createLogger();

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const traceId = logger.getTraceId();
      logger.error("Uncaught error", event.error, { component: "global" });

      setState({
        hasError: true,
        error: event.error,
        traceId,
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const traceId = logger.getTraceId();
      const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      logger.error("Unhandled promise rejection", error, { component: "global" });

      setState({
        hasError: true,
        error,
        traceId,
      });
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  if (state.hasError) {
    return (
      fallback || (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
          <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-lg shadow-lg p-6">
            <h1 className="text-xl font-bold text-red-400 mb-2">Something went wrong</h1>
            <p className="text-slate-300 text-sm mb-4">
              {state.error?.message || "An unexpected error occurred"}
            </p>
            <p className="text-slate-500 text-xs mb-4">
              <span className="font-mono">Trace ID: {state.traceId}</span>
            </p>
            <button
              onClick={() => window.location.href = "/"}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              Return Home
            </button>
          </div>
        </div>
      )
    );
  }

  return <>{children}</>;
}
