"use client";

import { Rocket } from "lucide-react";
import type { JobRecord } from "@/lib/api";

export function DeployStatus({ job }: { job?: JobRecord | null }) {
  const status = job?.artifact?.runtimeStatus || job?.status || "Awaiting deployment";
  const tone = status === "failed" ? "bg-red-50 text-red-700 ring-red-100" : status === "ready" || status === "succeeded" ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-blue-50 text-blue-700 ring-blue-100";
  return (
    <div className={`rounded-lg p-4 ring-1 ${tone}`}>
      <div className="flex items-center gap-2">
        <Rocket className="h-4 w-4" />
        <p className="font-semibold">{status}</p>
      </div>
      <p className="mt-2 text-sm leading-6">{job?.message || "Deploy status will appear here after a job runs."}</p>
      {job?.artifact?.runtimeUrl && <a href={job.artifact.runtimeUrl} className="mt-3 inline-flex text-sm font-bold underline">Open runtime</a>}
    </div>
  );
}
