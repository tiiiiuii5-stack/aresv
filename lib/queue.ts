import { Job, Queue, Worker } from "bullmq";
import Redis from "ioredis";

export type BuildJobData = {
  jobId: string;
  projectId?: string;
  projectSlug?: string;
  projectPath?: string;
  action?: string;
  appName?: string;
  prompt?: string;
  userId?: string;
  traceId?: string;
  [key: string]: unknown;
};

const redisUrl = process.env.REDIS_URL;

export const buildQueueConnection = redisUrl
  ? new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })
  : null;

export const buildQueue = buildQueueConnection
  ? new Queue<BuildJobData>("build-jobs", { connection: buildQueueConnection })
  : null;

export async function addBuildJob(jobId: string, data: BuildJobData) {
  if (!buildQueue) {
    throw new Error("REDIS_URL is required to enqueue build jobs.");
  }

  await buildQueue.add(jobId, { ...data, jobId }, {
    jobId,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  });
}

export function createBuildWorker(handler: (job: Job<BuildJobData>) => Promise<void>) {
  if (!buildQueueConnection) {
    throw new Error("REDIS_URL is required to start build workers.");
  }

  return new Worker<BuildJobData>("build-jobs", handler, {
    connection: buildQueueConnection,
    concurrency: 5,
  });
}

export {
  appBuilderQueue,
  broadcastAgentEvent,
  connection,
  createJob,
  getJob,
  listJobs,
  repairQueue,
  startJobWorker,
} from "@/lib/job-queue-enhanced.js";
