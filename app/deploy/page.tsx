"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DeployStatus } from "@/components/deploy-status";
import { VentureOSHeader } from "@/components/institutional/institutional-shell";
import { MutationIndicator } from "@/components/mutation-indicator";
import { api, type JobRecord } from "@/lib/api";
import { useJobs } from "@/lib/hooks/use-jobs";
import { useProjects } from "@/lib/hooks/use-projects";

export default function DeployPage() {
  return (
    <Suspense fallback={<DeployFallback />}>
      <DeployContent />
    </Suspense>
  );
}

function DeployContent() {
  const search = useSearchParams();
  const selected = search?.get("project") || "";
  const { projects } = useProjects();
  const { jobs, refresh } = useJobs();
  const [activeJob, setActiveJob] = useState<JobRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const project = useMemo(() => selected ? projects.find((item) => item.id === selected || item.slug === selected) || null : null, [projects, selected]);
  const latestJob = activeJob || (project ? jobs.find((job) => job.projectId === project.id || job.projectSlug === project.slug) || null : null);

  async function deploy() {
    if (!project) return;
    setBusy(true);
    setError("");
    setStatusMessage("Creating deploy job...");
    try {
      const result = await api.createJob({
        action: "deploy",
        appName: project.name,
        prompt: project.problem,
        projectId: project.id,
        projectSlug: project.slug,
      });
      setActiveJob({
        id: result.jobId,
        action: "deploy",
        status: result.status,
        progress: 0,
        currentStep: "queued",
        appName: project.name,
        projectId: project.id,
        projectSlug: project.slug,
      });
      await refresh();
      setStatusMessage("Deploy job queued. Status will update below.");
    } catch (deployError) {
      setError(deployError instanceof Error ? deployError.message : "Deploy failed to start.");
      setStatusMessage("");
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    if (!latestJob) return;
    setBusy(true);
    setError("");
    setStatusMessage("Creating mutated retry...");
    try {
      const result = await api.retryJob(latestJob.id);
      setActiveJob(result.job);
      await refresh();
      setStatusMessage("Retry job queued with mutation tracking.");
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Retry failed to start.");
      setStatusMessage("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="vos-page min-h-screen">
      <VentureOSHeader
        purposeLabel="Deploy"
        actions={[
          { label: "Projects", href: "/projects" },
          { label: "Build", href: "/build", variant: "default" },
        ]}
      />
      <section className="mx-auto grid max-w-5xl gap-5 px-4 pb-8 pt-20 sm:px-6 md:grid-cols-2 lg:px-8">
        <div className="vos-panel p-5 sm:p-6">
          <p className="vos-label">Deploy</p>
          <h1 className="mt-3 vos-h1">{project?.name || "Select a project"}</h1>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={deploy}
              disabled={!project || busy}
              title={!project ? "Create or select a project before deploying." : busy ? "A deploy action is already running." : "Create a deploy job for this project."}
              className="action primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              Deploy
            </button>
            <button
              type="button"
              onClick={retry}
              disabled={!latestJob || busy}
              title={!latestJob ? "Run a job before retrying with a mutation." : busy ? "A deploy action is already running." : "Create a mutated retry job."}
              className="action disabled:cursor-not-allowed disabled:opacity-60"
            >
              Retry with Mutation
            </button>
          </div>
          {statusMessage ? <p className="mt-4 vos-cell px-3 py-2 text-sm font-semibold text-[rgb(var(--vos-verified))]">{statusMessage}</p> : null}
          {error ? <p className="mt-4 vos-cell px-3 py-2 text-sm font-semibold text-[rgb(var(--vos-danger))]">{error}</p> : null}
        </div>
        <div className="space-y-5">
          <DeployStatus job={latestJob} />
          <MutationIndicator job={latestJob} />
        </div>
      </section>
    </main>
  );
}

function DeployFallback() {
  return (
    <main className="vos-page min-h-screen">
      <VentureOSHeader
        purposeLabel="Deploy"
        actions={[
          { label: "Projects", href: "/projects" },
          { label: "Build", href: "/build", variant: "default" },
        ]}
      />
      <section className="mx-auto max-w-5xl px-4 pb-8 pt-20 sm:px-6 lg:px-8">
        <div className="vos-panel p-6">
          <p className="vos-label">Deploy</p>
          <h1 className="mt-2 vos-h2">Loading deployment workspace.</h1>
        </div>
      </section>
    </main>
  );
}
