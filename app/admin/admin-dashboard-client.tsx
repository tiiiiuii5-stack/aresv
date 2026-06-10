"use client";

import { useMemo, type ReactNode } from "react";

import { DeployStatus } from "@/components/deploy-status";
import { VentureOSHeader } from "@/components/institutional/institutional-shell";
import { useJobs } from "@/lib/hooks/use-jobs";
import { useProjects } from "@/lib/hooks/use-projects";

export function AdminDashboardClient() {
  const { projects } = useProjects();
  const { jobs } = useJobs();
  const liveBuilds = useMemo(() => jobs.filter((build) => build.artifact?.runtimeUrl), [jobs]);
  const failedBuilds = useMemo(() => jobs.filter((build) => build.status === "failed" || build.artifact?.runtimeStatus === "failed"), [jobs]);
  const reviewedApps = useMemo(() => projects.filter((app) => app.qa), [projects]);

  return (
    <main className="vos-page min-h-screen">
      <VentureOSHeader
        purposeLabel="Admin"
        actions={[
          { label: "Apps", href: "/projects" },
          { label: "Growth", href: "/admin/growth", variant: "outline" },
          { label: "Operations", href: "/admin/operations", variant: "outline" },
          { label: "Settings", href: "/account" },
          { label: "Health", href: "/api/health", variant: "default" },
        ]}
      />

      <section className="mx-auto max-w-7xl px-4 pb-8 pt-20 sm:px-6 lg:px-8">
        <div className="vos-panel p-5 sm:p-6">
          <div>
            <p className="vos-label">Admin Dashboard</p>
            <h1 className="mt-3 vos-h1">Monitor apps, jobs, and live runtimes.</h1>
            <p className="mt-3 max-w-2xl vos-body">
              This UI reads from backend APIs only. Persistence, queue, and authorization logic stay server-side.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Metric label="Apps" value={String(projects.length)} detail="Built software" />
          <Metric label="Builds" value={String(jobs.length)} detail="Factory activity" />
          <Metric label="Live" value={String(liveBuilds.length)} detail="Open runtimes" tone="green" />
          <Metric label="Reviews" value={String(reviewedApps.length)} detail="Checked apps" />
          <Metric label="Issues" value={String(failedBuilds.length)} detail="Failed builds" tone={failedBuilds.length ? "red" : "green"} />
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
          <section className="space-y-5">
            <Panel title="Recent Builds">
              {jobs.length ? (
                <div className="grid gap-3">
                  {jobs.slice(0, 12).map((build) => (
                    <article key={build.id} className="vos-cell p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="vos-label">{humanAction(build.action)}</p>
                          <h3 className="mt-1 font-semibold text-[rgb(var(--vos-text))]">{build.appName || "Unnamed app"}</h3>
                          <p className="mt-1 vos-body">{humanStatus(build)}</p>
                        </div>
                        <span className={`rounded-full px-2 py-1 text-xs font-bold ${statusClass(build)}`}>{humanStatus(build)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty text="No builds have run yet." />
              )}
            </Panel>
          </section>

          <aside className="space-y-5">
            <DeployStatus job={jobs[0]} />
            <Panel title="Apps">
              {projects.length ? (
                <div className="space-y-3">
                  {projects.slice(0, 8).map((app) => (
                    <article key={app.id} className="vos-cell p-3">
                      <p className="vos-label">{app.category}</p>
                      <h3 className="mt-1 font-semibold text-[rgb(var(--vos-text))]">{app.name}</h3>
                      <p className="mt-1 line-clamp-2 vos-body">{app.problem}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty text="No apps found." />
              )}
            </Panel>
          </aside>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, detail, tone = "slate" }: { label: string; value: string; detail: string; tone?: "slate" | "green" | "red" }) {
  const color = tone === "green" ? "text-[rgb(var(--vos-verified))]" : tone === "red" ? "text-[rgb(var(--vos-danger))]" : "text-[rgb(var(--vos-text))]";
  return (
    <div className="vos-cell p-4">
      <p className="vos-label">{label}</p>
      <p className={`mt-3 text-3xl font-semibold ${color}`}>{value}</p>
      <p className="mt-1 vos-body">{detail}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="vos-panel p-5">
      <h2 className="vos-h2">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="vos-cell border-dashed p-5 vos-body">{text}</div>;
}

function humanAction(action: string) {
  const map: Record<string, string> = {
    generate: "Build App",
    verify: "Review App",
    repair: "Polish App",
    preview: "Start Live App",
    build: "Create Application",
    deploy: "Publish",
  };
  return map[action] || action;
}

function humanStatus(build: { status: string; artifact?: { runtimeStatus?: string } }) {
  if (build.artifact?.runtimeStatus === "ready") return "App is live";
  if (build.artifact?.runtimeStatus === "failed") return "Build failed";
  const map: Record<string, string> = {
    queued: "Preparing build",
    running: "Creating application",
    succeeded: "App is live",
    failed: "Build failed",
    cancelled: "Build stopped",
  };
  return map[build.status] || "Ready";
}

function statusClass(build: { status: string; artifact?: { runtimeStatus?: string } }) {
  if (build.status === "failed" || build.artifact?.runtimeStatus === "failed") return "bg-red-100 text-red-700";
  if (build.status === "succeeded" || build.artifact?.runtimeStatus === "ready") return "bg-emerald-100 text-emerald-700";
  return "bg-blue-100 text-blue-700";
}
