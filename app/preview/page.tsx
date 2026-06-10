"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { VentureOSHeader } from "@/components/institutional/institutional-shell";
import { PreviewFrame } from "@/components/preview-frame";
import { ProjectCard } from "@/components/project-card";
import { useProjects } from "@/lib/hooks/use-projects";

export default function PreviewPage() {
  return (
    <Suspense fallback={<PreviewFallback />}>
      <PreviewContent />
    </Suspense>
  );
}

function PreviewContent() {
  const search = useSearchParams();
  const selected = search?.get("project") || "";
  const { projects, loading } = useProjects();
  const project = useMemo(() => projects.find((item) => item.slug === selected || item.id === selected) || projects[0], [projects, selected]);
  const src = project ? `/preview/${project.slug}` : "";
  return (
    <main className="vos-page min-h-screen">
      <VentureOSHeader
        purposeLabel="Preview"
        actions={[
          { label: "Projects", href: "/projects" },
          { label: "Build", href: "/build", variant: "default" },
        ]}
      />
      <section className="mx-auto grid max-w-7xl gap-5 px-4 pb-8 pt-20 sm:px-6 lg:grid-cols-[360px_1fr] lg:px-8">
        <aside>
          {loading && <p className="vos-body">Loading preview...</p>}
          {project && <ProjectCard project={project} />}
        </aside>
        <PreviewFrame src={src} />
      </section>
    </main>
  );
}

function PreviewFallback() {
  return (
    <main className="vos-page min-h-screen">
      <VentureOSHeader
        purposeLabel="Preview"
        actions={[
          { label: "Projects", href: "/projects" },
          { label: "Build", href: "/build", variant: "default" },
        ]}
      />
      <section className="mx-auto max-w-7xl px-4 pb-8 pt-20 sm:px-6 lg:px-8">
        <div className="vos-panel p-6">
          <p className="vos-label">Preview</p>
          <h1 className="mt-2 vos-h2">Loading project preview.</h1>
        </div>
      </section>
    </main>
  );
}
