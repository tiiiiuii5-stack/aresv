"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleDot } from "lucide-react";
import type { ProjectRecord } from "@/lib/api";

export function ProjectCard({ project }: { project: ProjectRecord }) {
  const ready = project.buildValidation?.status !== "failed";
  return (
    <article className="vos-panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="vos-label">{project.category}</p>
          <h3 className="mt-2 text-lg font-semibold text-[rgb(var(--vos-text))]">{project.name}</h3>
          <p className="mt-2 line-clamp-2 vos-body">{project.problem}</p>
        </div>
        <span className={`vos-badge ${ready ? "vos-badge-ready" : "vos-badge-blocked"}`}>
          {ready ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleDot className="h-3.5 w-3.5" />}
          {ready ? "Ready" : "Fix"}
        </span>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Link href={`/project/${encodeURIComponent(project.id)}`} className="action">Workspace</Link>
        <Link href={`/preview?project=${encodeURIComponent(project.slug)}`} className="action">Preview</Link>
        <Link href={`/deploy?project=${encodeURIComponent(project.id)}`} className="action primary">Deploy <ArrowRight className="h-4 w-4" /></Link>
      </div>
    </article>
  );
}
