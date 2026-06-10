"use client";

import { useMemo } from "react";
import type { JobRecord } from "@/lib/api";

export function useMutation(job?: JobRecord | null) {
  return useMemo(() => {
    const tracking = job?.mutationTracking;
    const count = tracking?.mutationCount || 0;
    return {
      active: count > 0,
      count,
      modelUsed: tracking?.modelUsed || null,
      temperature: tracking?.temperature || null,
      promptHash: tracking?.promptHash || null,
      divergenceResult: tracking?.divergenceResult || null,
      history: tracking?.mutationHistory || [],
    };
  }, [job]);
}
