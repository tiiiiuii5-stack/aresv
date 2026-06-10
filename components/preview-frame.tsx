"use client";

import { LivePreview } from "@/components/live-preview";

export function PreviewFrame({ src }: { src?: string }) {
  return <LivePreview previewUrl={src} title="Project Preview" />;
}
