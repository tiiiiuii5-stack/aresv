"use client";

import { FileText, RefreshCw, Rocket, Settings, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type DeviceMode = "mobile" | "tablet" | "desktop";

type LivePreviewProps = {
  previewUrl?: string | null;
  title?: string;
  className?: string;
};

const deviceWidths: Record<DeviceMode, string> = {
  mobile: "390px",
  tablet: "820px",
  desktop: "100%",
};

export function LivePreview({ previewUrl, title = "Live Preview", className = "" }: LivePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [device, setDevice] = useState<DeviceMode>("desktop");
  const [loading, setLoading] = useState(Boolean(previewUrl));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [consoleErrors, setConsoleErrors] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [scale, setScale] = useState(1);
  const [inspector, setInspector] = useState(false);
  const [highlight, setHighlight] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [previewNotice, setPreviewNotice] = useState("");

  const iframeSrc = useMemo(() => {
    if (!previewUrl) return "";
    try {
      const url = new URL(previewUrl, window.location.origin);
      url.searchParams.set("previewRefresh", String(refreshKey));
      return url.toString();
    } catch {
      return previewUrl;
    }
  }, [previewUrl, refreshKey]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width || 1;
      const target = device === "mobile" ? 390 : device === "tablet" ? 820 : width;
      setScale(Math.min(1, width / target));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [device]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!iframeRef.current?.contentWindow || event.source !== iframeRef.current.contentWindow) return;
      const data = event.data as { type?: string; message?: string; rect?: { x: number; y: number; width: number; height: number } };
      if (data?.type === "ventureos:console-error" && data.message) {
        setConsoleErrors((current) => [data.message || "Preview error", ...current].slice(0, 5));
      }
      if (data?.type === "ventureos:hover" && data.rect) {
        setHighlight(data.rect);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage({ type: "ventureos:inspector", enabled: inspector }, "*");
  }, [inspector, iframeSrc]);

  const refresh = useCallback(() => {
    if (!previewUrl) {
      setPreviewNotice("Preview is not available until a deployment returns a URL.");
      return;
    }
    setPreviewNotice("Refreshing preview...");
    setLoading(Boolean(previewUrl));
    setLoadError(null);
    setConsoleErrors([]);
    setRefreshKey((current) => current + 1);
  }, [previewUrl]);

  const openFullscreen = useCallback(() => {
    const target = containerRef.current;
    if (!target?.requestFullscreen) {
      setPreviewNotice("Fullscreen is not supported in this browser.");
      return;
    }
    target.requestFullscreen()
      .then(() => setPreviewNotice("Fullscreen opened."))
      .catch(() => setPreviewNotice("Fullscreen could not be opened."));
  }, []);

  return (
    <section className={`vos-panel overflow-hidden ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgb(var(--vos-border))] px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-[rgb(var(--vos-text))]">{title}</p>
          <p className="text-xs text-[rgb(var(--vos-text-muted))]">{previewUrl || "Waiting for deployment result URL."}</p>
        </div>
        <div className="flex items-center gap-2">
          <DeviceButton active={device === "mobile"} label="Mobile" onClick={() => setDevice("mobile")} icon={<FileText className="h-4 w-4" />} />
          <DeviceButton active={device === "tablet"} label="Tablet" onClick={() => setDevice("tablet")} icon={<Settings className="h-4 w-4" />} />
          <DeviceButton active={device === "desktop"} label="Desktop" onClick={() => setDevice("desktop")} icon={<Rocket className="h-4 w-4" />} />
          <button type="button" onClick={() => setInspector((current) => {
            if (current) setHighlight(null);
            return !current;
          })} className={`rounded-md border px-3 py-2 text-xs font-semibold ${inspector ? "border-[rgb(var(--vos-risk))] text-[rgb(var(--vos-risk))]" : "border-[rgb(var(--vos-border))] text-[rgb(var(--vos-text-muted))]"}`}>Inspect</button>
          <button type="button" onClick={refresh} className="rounded-md border border-[rgb(var(--vos-border))] p-2 text-[rgb(var(--vos-text-muted))]" aria-label="Refresh preview"><RefreshCw className="h-4 w-4" /></button>
          <button type="button" onClick={openFullscreen} className="rounded-md border border-[rgb(var(--vos-border))] p-2 text-[rgb(var(--vos-text-muted))]" aria-label="Open fullscreen"><Upload className="h-4 w-4" /></button>
        </div>
      </div>

      <div ref={containerRef} className="relative min-h-[520px] bg-[rgb(var(--vos-surface))] p-4">
        {!previewUrl ? <Skeleton message="Preview appears after deployment returns a result URL." /> : null}
        {previewUrl ? (
          <div className="mx-auto origin-top overflow-hidden rounded-lg border border-[rgb(var(--vos-border))] bg-white transition" style={{ width: deviceWidths[device], maxWidth: "100%", transform: `scale(${scale})`, minHeight: `${Math.round(640 / scale)}px` }}>
            {loading ? <Skeleton message="Loading live runtime..." overlay /> : null}
            {loadError ? <Skeleton message={loadError} overlay error /> : null}
            <iframe
              key={iframeSrc}
              ref={iframeRef}
              title={title}
              src={iframeSrc}
              sandbox="allow-scripts allow-same-origin"
              className="h-[640px] w-full bg-white"
              onLoad={() => {
                setLoading(false);
                setLoadError(null);
                setPreviewNotice("Preview loaded.");
                injectInspectorBridge();
              }}
              onError={() => {
                setLoading(false);
                setLoadError("Preview failed to load.");
                setPreviewNotice("");
              }}
            />
          </div>
        ) : null}
        {inspector && highlight ? (
          <div className="pointer-events-none absolute border border-amber-300 bg-amber-300/15" style={{ left: highlight.x, top: highlight.y, width: highlight.width, height: highlight.height }} />
        ) : null}
      </div>

      {consoleErrors.length > 0 ? (
        <div className="border-t border-red-300/20 bg-red-500/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-100"><FileText className="h-4 w-4" /> Console errors</div>
          <ul className="mt-2 space-y-1 text-xs text-red-100/80">
            {consoleErrors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}
          </ul>
        </div>
      ) : null}
      {previewNotice ? <p className="border-t border-[rgb(var(--vos-border))] px-4 py-2 text-xs font-semibold text-[rgb(var(--vos-text-muted))]">{previewNotice}</p> : null}
    </section>
  );

  function injectInspectorBridge() {
    iframeRef.current?.contentWindow?.postMessage({ type: "ventureos:inspector", enabled: inspector }, "*");
  }
}

function DeviceButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-2 text-xs font-semibold ${active ? "border-[rgb(var(--vos-primary))] text-[rgb(var(--vos-text))]" : "border-[rgb(var(--vos-border))] text-[rgb(var(--vos-text-muted))]"}`}>
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function Skeleton({ message, overlay, error }: { message: string; overlay?: boolean; error?: boolean }) {
  return (
    <div className={`${overlay ? "absolute inset-4 z-10" : "min-h-[420px]"} grid place-items-center rounded-lg border ${error ? "border-red-300/30 bg-red-500/10 text-red-100" : "border-[rgb(var(--vos-border))] text-[rgb(var(--vos-text-muted))]"}`}>
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-40 animate-pulse rounded bg-[rgb(var(--vos-unknown-bg))]" />
        <p className="text-sm">{message}</p>
      </div>
    </div>
  );
}
