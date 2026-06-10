import assert from "node:assert/strict";

import { ControlPlane, InMemoryControlPlaneStore } from "@/lib/control-plane";
import { enqueuePipelineJob, runPipelineQueue, snapshotMemoryPipeline } from "@/lib/pipeline/jobQueue";
import { pipelineWorkers } from "@/lib/pipeline/workers";

async function main() {
  const store = new InMemoryControlPlaneStore();
  const controlPlane = new ControlPlane(store, {
    enqueue: async (reaction, transition) => {
      const type = {
        RUN_APPRAISAL: "runAppraisal",
        RUN_SCANNER: "runScanner",
        GENERATE_CERTIFICATE: "generateCertificate",
        WRITE_TRANSPARENCY_LOG: "writeTransparencyLog",
        LOCK_ASSET: "lockAsset",
        REVIEW_RISK: "reviewRisk",
        RECORD_FAILURE: "recordFailure",
      }[reaction.kind];

      await enqueuePipelineJob({
        type,
        entityId: reaction.entityId,
        entityKind: reaction.entityKind,
        projectId: reaction.projectId,
        idempotencyKey: `${transition.id}:${reaction.kind}`,
        payload: {
          ...reaction.payload,
          reason: reaction.reason,
        },
      });
    },
  });

  const paid = await controlPlane.dispatch({
    name: "STRIPE_PAID",
    entityKind: "payment",
    entityId: "pay-pipeline-1",
    projectId: "project-pipeline-1",
    context: { userId: "user-pipeline-1" },
  });
  assert.equal(paid.toState, "PAID");

  const intake = await controlPlane.dispatch({
    name: "INTAKE_RECEIVED",
    entityKind: "payment",
    entityId: "pay-pipeline-1",
    projectId: "project-pipeline-1",
  });
  assert.equal(intake.toState, "INTAKE_RECEIVED");

  const scanStarted = await controlPlane.dispatch({
    name: "SCAN_STARTED",
    entityKind: "payment",
    entityId: "pay-pipeline-1",
    projectId: "project-pipeline-1",
  });
  assert.equal(scanStarted.toState, "SCANNING");

  let jobs = snapshotMemoryPipeline();
  assert.ok(jobs.some((job) => job.type === "runScanner" && job.status === "queued"));

  await runPipelineQueue(pipelineWorkers, {
    maxJobs: 10,
    dispatchResult: async (job, result) => {
      if (!result.event) return;
      await controlPlane.dispatch({
        name: result.event,
        entityKind: job.entityKind,
        entityId: job.entityId,
        projectId: job.projectId || null,
        context: {
          ...job.payload,
          ...(result.context || {}),
          pipelineJobId: job.id,
          pipelineJobType: job.type,
        },
      });
    },
  });

  const snapshot = store.snapshot("payment", "pay-pipeline-1");
  assert.ok(snapshot);
  assert.equal(snapshot.state, "LOCKED");

  jobs = snapshotMemoryPipeline().filter((job) => job.entityId === "pay-pipeline-1");
  assert.ok(jobs.some((job) => job.type === "runScanner" && job.status === "done"));
  assert.ok(jobs.some((job) => job.type === "generateCertificate" && job.status === "done"));
  assert.ok(jobs.some((job) => job.type === "writeTransparencyLog" && job.status === "done"));
  assert.ok(jobs.some((job) => job.type === "lockAsset" && job.status === "done"));

  let attempts = 0;
  await enqueuePipelineJob({
    type: "unstableWorker",
    entityKind: "system",
    entityId: "retry-test",
    maxRetries: 1,
    idempotencyKey: "retry-test",
  });
  await runPipelineQueue({
    unstableWorker: async () => {
      attempts += 1;
      throw new Error("planned failure");
    },
  }, { maxJobs: 2 });

  const retryJob = snapshotMemoryPipeline().find((job) => job.entityId === "retry-test");
  assert.equal(attempts, 2);
  assert.equal(retryJob?.status, "failed");
  assert.equal(retryJob?.retries, 2);

  console.log(JSON.stringify({
    passed: true,
    finalState: snapshot.state,
    pipelineJobs: jobs.map((job) => ({ type: job.type, status: job.status, retries: job.retries })),
    retry: { attempts, status: retryJob?.status, retries: retryJob?.retries },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
