"use client";

import { useState } from "react";
import { VentureOSHeader } from "@/components/institutional/institutional-shell";
import { ProjectCard } from "@/components/project-card";
import { useProjects } from "@/lib/hooks/use-projects";

export default function ProjectsPage() {
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
        purposeLabel="Projects"
        actions={[
          { label: "Legacy Scans", href: "/project/legacy" },
          { label: "Build", href: "/build", variant: "default" },
        ]}
      />
      <section className="mx-auto max-w-7xl px-4 pb-8 pt-20 sm:px-6 lg:px-8">
        <div className="vos-panel p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="vos-label">Projects</p>
              <h1 className="mt-3 vos-h1">Generated software inventory.</h1>
            </div>
            <button type="button" className="nav" onClick={handleRefresh}>Refresh Index</button>
          </div>
        </div>
        {refreshNotice && <p className="mt-5 vos-cell px-3 py-2 text-sm font-semibold text-[rgb(var(--vos-primary))]">{refreshNotice}</p>}
        {loading && <p className="mt-5 vos-body">Loading projects...</p>}
        {error && <p className="mt-5 vos-cell p-4 text-sm font-semibold text-[rgb(var(--vos-danger))]">{error}</p>}
        <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => <ProjectCard key={project.id} project={project} />)}
        </div>
      </section>
    </main>
  );
}
