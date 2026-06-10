"use client";

import Link from "next/link";
import { useState } from "react";
import { VentureOSHeader } from "@/components/institutional/institutional-shell";
import { ProjectCard } from "@/components/project-card";
import { useProjects } from "@/lib/hooks/use-projects";

export default function AppsPage() {
  const { projects, loading, error, refresh } = useProjects();
  const [refreshNotice, setRefreshNotice] = useState("");

  async function handleRefresh() {
    setRefreshNotice("Refreshing projects...");
    const ok = await refresh();
    setRefreshNotice(ok ? "Projects refreshed." : "Project refresh failed. See the error below.");
  }

  return (
    <main className="vos-page min-h-screen">
      <VentureOSHeader
        purposeLabel="Generated Apps"
        actions={[
          { label: "Home", href: "/" },
          { label: "Projects", href: "/projects" },
          { label: "Build", href: "/build", variant: "default" },
        ]}
      />

      <section className="mx-auto max-w-7xl px-4 pb-8 pt-20 sm:px-6 lg:px-8">
        <div className="vos-panel p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="vos-label">Projects</p>
              <h1 className="mt-3 vos-h1">Generated software inventory.</h1>
              <p className="mt-3 max-w-2xl vos-body">
                Open previews, inspect source, run QA, deploy, or download through API-backed project actions.
              </p>
            </div>
            <button type="button" className="nav" onClick={handleRefresh}>Refresh Index</button>
          </div>
        </div>

        {refreshNotice && <p className="mt-5 vos-cell px-3 py-2 text-sm font-semibold text-[rgb(var(--vos-primary))]">{refreshNotice}</p>}
        {loading && <p className="mt-5 vos-body">Loading projects...</p>}
        {error && <p className="mt-5 vos-cell p-4 text-sm font-semibold text-[rgb(var(--vos-danger))]">{error}</p>}
        {!loading && projects.length === 0 ? (
          <div className="mt-5 grid min-h-[320px] place-items-center vos-panel border-dashed p-10 text-center">
            <div>
              <h2 className="vos-h2">Describe what you want to build</h2>
              <p className="mt-3 max-w-md vos-body">Your generated apps will appear here after `/api/projects` returns them.</p>
              <Link href="/build" className="mt-5 action primary">Generate App</Link>
            </div>
          </div>
        ) : (
          <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => <ProjectCard key={project.id} project={project} />)}
          </div>
        )}
      </section>
    </main>
  );
}
