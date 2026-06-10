import { Job, Queue, Worker } from "bullmq";

import { buildQueueConnection } from "@/lib/queue";
import type { GitHubScanQueueData } from "@/lib/github/types";

export const githubScanQueue = buildQueueConnection
  ? new Queue<GitHubScanQueueData>("github-scan-jobs", { connection: buildQueueConnection })
  : null;

export async function enqueueGitHubScanJob(data: GitHubScanQueueData) {
  if (!githubScanQueue) throw new Error("REDIS_URL is required to enqueue GitHub scan jobs.");
  await githubScanQueue.add(data.scanJobId, data, {
    jobId: data.scanJobId,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 200,
    removeOnFail: 100,
  });
}

export function createGitHubScanWorker(handler: (job: Job<GitHubScanQueueData>) => Promise<void>) {
  if (!buildQueueConnection) throw new Error("REDIS_URL is required to start GitHub scan workers.");
  return new Worker<GitHubScanQueueData>("github-scan-jobs", handler, {
    connection: buildQueueConnection,
    concurrency: 2,
  });
}
