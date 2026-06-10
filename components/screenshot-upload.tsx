"use client";

import { FileText, Loader2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export type ScreenshotComponent = {
  type: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  style?: Record<string, unknown>;
};

export type ScreenshotAnalysis = {
  ok?: boolean;
  components: ScreenshotComponent[];
  colors: Array<{ hex: string; usage: string }>;
  layout: { type: "grid" | "flex" | "stack"; notes?: string };
  componentTree?: Record<string, unknown>;
  suggestedArchitecture: string;
  nsfw: boolean;
  fallback: boolean;
};

type ScreenshotUploadProps = {
  onAnalysis?: (analysis: ScreenshotAnalysis) => void;
};

export function ScreenshotUpload({ onAnalysis }: ScreenshotUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ScreenshotAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function analyzeFile(file: File) {
    setError(null);
    setAnalysis(null);

    if (!SUPPORTED_TYPES.has(file.type)) {
      setError("Supported formats: PNG, JPG, WebP.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("Screenshot must be 5MB or smaller.");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("image", file);
      const response = await fetch("/api/analyze-screenshot", {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Analysis failed: ${response.status}`);
      setAnalysis(data as ScreenshotAnalysis);
      onAnalysis?.(data as ScreenshotAnalysis);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Screenshot analysis failed. Use the text prompt fallback.");
    } finally {
      setLoading(false);
    }
  }

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) void analyzeFile(file);
  }

  return (
    <div className="vos-cell p-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        className={`relative flex min-h-[112px] w-full items-center justify-center overflow-hidden rounded-lg border border-dashed p-4 text-left transition ${dragging ? "border-[rgb(var(--vos-risk))]" : "border-[rgb(var(--vos-border))] hover:border-[rgb(var(--vos-border-strong))]"}`}
      >
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => handleFiles(event.target.files)} />
        {previewUrl ? (
          <div className="grid w-full gap-3 sm:grid-cols-[128px_1fr]">
            <div className="relative h-24 overflow-hidden rounded-md border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel))]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Uploaded screenshot preview" className={`h-full w-full object-cover ${analysis?.nsfw ? "blur-xl" : ""}`} />
              {analysis ? <WireframeOverlay components={analysis.components} /> : null}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--vos-text))]">
                {loading ? <Loader2 className="h-4 w-4 animate-spin text-[#F59E0B]" /> : <FileText className="h-4 w-4 text-[#10B981]" />}
                {loading ? "Analyzing layout..." : analysis ? "Architecture extracted" : "Screenshot ready"}
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-[rgb(var(--vos-text-muted))]">{analysis?.suggestedArchitecture || "Drop or click to convert a screenshot into layout, palette, component tree, and runtime-factory context."}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg border border-[rgb(var(--vos-border))] text-[rgb(var(--vos-primary))]">
              <Upload className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[rgb(var(--vos-text))]">Drop screenshot or click to upload</p>
              <p className="mt-1 text-xs text-[rgb(var(--vos-text-muted))]">PNG, JPG, WebP up to 5MB. Layout becomes architecture context.</p>
            </div>
          </div>
        )}
      </button>

      {analysis ? (
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1.2fr]">
          <div className="vos-cell p-3">
            <p className="vos-label">Detected</p>
            <p className="mt-2 text-sm text-[rgb(var(--vos-text))]">{analysis.components.length} components · {analysis.layout.type} layout</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {analysis.colors.slice(0, 6).map((color) => (
                <span key={`${color.hex}-${color.usage}`} className="inline-flex items-center gap-2 rounded-full border border-[rgb(var(--vos-border))] px-2.5 py-1 text-[11px] text-[rgb(var(--vos-text-muted))]">
                  <span className="h-3 w-3 rounded-full border border-white/20" style={{ backgroundColor: color.hex }} />
                  {color.hex}
                </span>
              ))}
            </div>
          </div>
          <div className="vos-cell p-3">
            <p className="vos-label text-[rgb(var(--vos-verified))]">Runtime seed</p>
            <p className="mt-2 line-clamp-4 text-xs leading-5 text-[rgb(var(--vos-text-muted))]">{analysis.suggestedArchitecture}</p>
            {analysis.fallback ? <p className="mt-2 text-xs font-semibold text-[rgb(var(--vos-risk))]">Vision fallback active. Text prompt remains primary.</p> : null}
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-sm font-medium text-[rgb(var(--vos-danger))]">{error}</p> : null}
    </div>
  );
}

function WireframeOverlay({ components }: { components: ScreenshotComponent[] }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {components.slice(0, 18).map((component, index) => (
        <span
          key={`${component.type}-${index}`}
          className="absolute rounded-[3px] border border-[rgb(var(--vos-verified))] bg-emerald-400/10"
          style={{
            left: `${component.bounds.x * 100}%`,
            top: `${component.bounds.y * 100}%`,
            width: `${component.bounds.width * 100}%`,
            height: `${component.bounds.height * 100}%`,
          }}
        />
      ))}
    </div>
  );
}
