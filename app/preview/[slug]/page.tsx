"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { InstitutionalEmptyState, InstitutionalPageShell, InstitutionalPanel } from "@/components/institutional/institutional-shell";
import { api, type ProjectRecord } from "@/lib/api";

export default function ProjectPreviewPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug || "";
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      if (!slug) return;
      api.project(slug)
        .then((data) => setProject(data.project))
        .catch((err) => setError(err instanceof Error ? err.message : "Preview failed to load."));
    }, 0);
    return () => clearTimeout(id);
  }, [slug]);

  const preview = project?.files.find((file) => file.path === "preview/index.html");
  const previewContent = withPreviewBridge(preview?.content || "");
  const previewAllowed = project?.buildValidation?.status === "passed" && previewContent.includes("/runtime") && previewContent.includes("data-api=");

  return (
    <InstitutionalPageShell
      purposeLabel={project?.name || "Preview"}
      actions={[
        { label: "Home", href: "/" },
        { label: "Projects", href: "/projects" },
        ...(project ? [{ label: "Download", href: `/api/projects/${project.id}/download`, variant: "default" as const }] : []),
      ]}
    >
      <div className="grid gap-5">
        {error && <PreviewBlocked name="Preview failed" logs={[error]} />}
        {!project && !error && <InstitutionalEmptyState title="Loading preview..." />}
        {project && (
          <InstitutionalPanel className="overflow-hidden p-0">
            <div className="border-b border-[rgb(var(--vos-border))] px-4 py-3">
              <p className="vos-label">{project.category}</p>
              <h1 className="mt-1 vos-h2">{project.name}</h1>
            </div>
            <div className="h-[calc(100vh-175px)] min-h-[560px] bg-white">
              {previewAllowed ? (
                <iframe title={`${project.name} live preview`} srcDoc={previewContent} sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts" className="h-full w-full border-0" />
              ) : (
                <PreviewBlocked name={project.name} logs={project.buildValidation?.logs || ["Runtime factory gate failed."]} />
              )}
            </div>
          </InstitutionalPanel>
        )}
      </div>
    </InstitutionalPageShell>
  );
}

function PreviewBlocked({ name, logs }: { name: string; logs: string[] }) {
  return (
    <InstitutionalEmptyState
      title={`${name} is not cleared for runtime preview.`}
      description={
        <span className="block text-left">
          <span className="vos-label text-[rgb(var(--vos-danger))]">Preview blocked</span>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
          {logs.slice(0, 6).map((log) => <li key={log}>{log}</li>)}
          </ul>
        </span>
      }
    />
  );
}

function withPreviewBridge(content: string) {
  if (!content) return "";
  const bridge = `<script>
(() => {
  const originalError = console.error;
  console.error = (...args) => {
    window.parent?.postMessage({ type: "ventureos:console-error", message: args.map(String).join(" ") }, "*");
    originalError.apply(console, args);
  };
  window.addEventListener("error", (event) => {
    window.parent?.postMessage({ type: "ventureos:console-error", message: event.message || "Preview runtime error" }, "*");
  });
  let inspectorEnabled = false;
  window.addEventListener("message", (event) => {
    if (event.data?.type === "ventureos:inspector") inspectorEnabled = Boolean(event.data.enabled);
  });
  document.addEventListener("mousemove", (event) => {
    if (!inspectorEnabled || !(event.target instanceof Element)) return;
    const rect = event.target.getBoundingClientRect();
    window.parent?.postMessage({
      type: "ventureos:hover",
      rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
    }, "*");
  }, { passive: true });
})();
</script>`;
  if (content.includes("</body>")) return content.replace("</body>", `${bridge}</body>`);
  return `${content}${bridge}`;
}
