"use client";

import { RefreshCw } from "lucide-react";
import { useMutation } from "@/lib/hooks/use-mutation";
import type { JobRecord } from "@/lib/api";

export function MutationIndicator({ job }: { job?: JobRecord | null }) {
  const mutation = useMutation(job);
  return (
    <div className={`glass-panel rounded-lg p-4 ${mutation.active ? "text-[#F59E0B]" : "text-[#94A3B8]"}`}>
      <div className="flex items-center gap-2">
        <RefreshCw className="h-4 w-4" />
        <p className="font-semibold text-white">{mutation.active ? `Mutation ${mutation.count}` : "No mutation active"}</p>
      </div>
      <p className="mt-2 text-sm leading-6">
        {mutation.modelUsed ? `${mutation.modelUsed} at ${mutation.temperature ?? "default"} temperature` : "The first build uses the base architecture."}
      </p>
      {mutation.promptHash && <p className="mt-1 text-xs font-mono text-[#94A3B8]">{mutation.promptHash}</p>}
    </div>
  );
}
