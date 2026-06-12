"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { InstitutionalEmptyState, InstitutionalPageShell, InstitutionalPanel, InstitutionalMetricCard } from "@/components/institutional/institutional-shell";
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
  const buildScore = project?.qa?.score || 0;

  return (
    <InstitutionalPageShell
      purposeLabel={project ? `Enterprise Review: ${project.name}` : "Project Review"}
      actions={[
        { label: "Home", href: "/" },
        { label: "Projects", href: "/projects" },
        ...(project ? [{ label: "Export Source", href: `/api/projects/${project.id}/download`, variant: "default" as const }] : []),
      ]}
    >
      <div className="grid gap-5">
        {error && <PreviewBlocked name="Preview failed" logs={[error]} />}
        {!project && !error && <InstitutionalEmptyState title="Loading preview..." />}
        {project && (
          <InstitutionalPanel className="overflow-hidden border-[rgb(var(--vos-primary))] p-0 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] px-6 py-4">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded bg-[rgb(var(--vos-primary))] p-2 text-white">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                </div>
                <div>
                  <p className="vos-label text-[rgb(var(--vos-primary))]">Verified Artifact • {project.category}</p>
                  <h1 className="vos-h2">{project.name}</h1>
                </div>
              </div>
              <div className="flex gap-4">
                <InstitutionalMetricCard label="Readiness" value={`${buildScore}%`} />
                <div className="flex flex-col items-end">
                   <span className="text-[10px] font-black uppercase tracking-widest text-[rgb(var(--vos-text-muted))]">Signature</span>
                   <code className="text-[10px] text-[rgb(var(--vos-primary))]">{project.id.slice(0, 16)}</code>
                </div>
              </div>
            </div>
            <div className="bg-amber-950/20 px-6 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-500">
              Diligence Notice: This is a sandbox preview. Database persistence is simulated via localStorage.
            </div>
            <div className="h-[calc(100vh-175px)] min-h-[560px] bg-white">
              {previewAllowed ? (
                <iframe title={`${project.name} live preview`} srcDoc={previewContent} sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts" className="h-full w-full border-0" />
              ) : project?.buildValidation?.status === "failed" ? (
                <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                   <p className="vos-label text-[rgb(var(--vos-danger))]">Build Failed</p>
                   <p className="mt-2 vos-body">The automated repair loop could not stabilize this build. Try a more specific prompt.</p>
                   <pre className="mt-4 max-w-2xl overflow-auto rounded bg-slate-900 p-4 text-left text-xs text-slate-300">{project.buildValidation.logs.join('\n')}</pre>
                </div>
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
