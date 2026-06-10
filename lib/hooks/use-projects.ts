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
      if (!(await hasServerSession())) {
        setProjects([]);
        return true;
      }
      const data = await api.projects();
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
