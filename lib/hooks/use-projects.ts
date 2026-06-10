"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type ProjectRecord } from "@/lib/api";
import { hasServerSession } from "@/lib/client-session";

export function useProjects() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hasSession = await withTimeout(hasServerSession(), 6_000, false);
      if (!hasSession) {
        setProjects([]);
        return true;
      }
      const data = await withTimeout(api.projects(), 8_000, { ok: false, projects: [] });
      setProjects(data.projects);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects.");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(id);
  }, [refresh]);

  return { projects, loading, error, refresh, setProjects };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => resolve(fallback), timeoutMs);
    promise
      .then((value) => resolve(value))
      .catch((error) => reject(error))
      .finally(() => window.clearTimeout(timeout));
  });
}
