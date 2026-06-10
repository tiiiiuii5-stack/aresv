"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type JobRecord } from "@/lib/api";
import { hasServerSession } from "@/lib/client-session";

export function useJobs() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!(await hasServerSession())) {
        setJobs([]);
        return;
      }
      const data = await api.jobs();
      setJobs(data.jobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load jobs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(id);
  }, [refresh]);

  return { jobs, loading, error, refresh, setJobs };
}
