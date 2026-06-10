import { createGitHubScanWorker } from "@/lib/github/queue";
import { runGitHubScanJob } from "@/lib/github/scanner";
import { trace, traceError } from "@/lib/diagnostics";

export function startGitHubScanWorker() {
  const worker = createGitHubScanWorker(async (job) => {
    trace("github.scan-worker", "job received", {
      jobId: job.id,
      scanJobId: job.data.scanJobId,
      jobType: job.data.jobType,
    });
    await runGitHubScanJob(job.data.scanJobId);
  });

  worker.on("completed", (job) => {
    trace("github.scan-worker", "job completed", { jobId: job.id, scanJobId: job.data.scanJobId });
  });

  worker.on("failed", (job, error) => {
    traceError("github.scan-worker", "job failed", error, { jobId: job?.id, scanJobId: job?.data.scanJobId });
  });

  return worker;
}
