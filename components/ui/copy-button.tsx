"use client";

import { AlertTriangle, Check, Copy, Loader2 } from "lucide-react";
import { useId, useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { showToast } from "@/components/ui/toast";

type CopyButtonProps = {
  value: string;
  label?: string;
  copiedLabel?: string;
  failedLabel?: string;
  successMessage?: string;
  className?: string;
};

type CopyState = "idle" | "copying" | "success" | "error";

export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  failedLabel = "Copy failed",
  successMessage = "Copied to clipboard.",
  className,
}: CopyButtonProps) {
  const [state, setState] = useState<CopyState>("idle");
  const [message, setMessage] = useState("");
  const statusId = useId();
  const canCopy = value.trim().length > 0;

  async function handleCopy() {
    if (!canCopy || state === "copying") return;

    setState("copying");
    setMessage("");

    const result = await copyToClipboard(value);
    if (result.ok) {
      setState("success");
      setMessage(successMessage);
      showToast({ type: "success", title: successMessage });
      window.setTimeout(() => {
        setState("idle");
        setMessage("");
      }, 1800);
      return;
    }

    setState("error");
    setMessage(result.error);
    showToast({ type: "error", title: failedLabel, description: result.error });
    window.setTimeout(() => setState("idle"), 2600);
  }

  const Icon = state === "copying" ? Loader2 : state === "success" ? Check : state === "error" ? AlertTriangle : Copy;
  const visibleLabel = state === "copying" ? "Copying" : state === "success" ? copiedLabel : state === "error" ? failedLabel : label;

  return (
    <>
      <button
        type="button"
        onClick={handleCopy}
        disabled={!canCopy || state === "copying"}
        aria-describedby={statusId}
        aria-label={visibleLabel}
        title={!canCopy ? "Nothing is available to copy." : visibleLabel}
        className={
          className ??
          "vos-button vos-button-outline vos-button-sm disabled:cursor-not-allowed disabled:opacity-60"
        }
      >
        <Icon className={`h-4 w-4 ${state === "copying" ? "animate-spin" : ""}`} aria-hidden="true" />
        <span>{visibleLabel}</span>
      </button>
      <span id={statusId} className="sr-only" role="status" aria-live="polite">
        {message}
      </span>
    </>
  );
}
