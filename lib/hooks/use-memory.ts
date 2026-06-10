"use client";

import { useCallback, useState } from "react";
import { api } from "@/lib/api";

export function useMemory() {
  const [memories, setMemories] = useState<Array<{ id: string; memoryType: string; content: string; similarity?: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recall = useCallback(async (query: string, projectId?: string) => {
    if (!query.trim()) return [];
    setLoading(true);
    setError(null);
    try {
      const data = await api.recallMemory({ query, projectId, limit: 5 });
      setMemories(data.memories);
      return data.memories;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to recall memory.");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return { memories, loading, error, recall };
}
