"use client";

import { FileText, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast";

type ActionState = "idle" | "loading" | "success" | "error";

export function VerifyFixButton({
  projectId,
  issueTitle,
  disabledReason,
}: {
  projectId: string;
  issueTitle: string;
  disabledReason?: string;
}) {
  const [state, setState] = useState<ActionState>("idle");
  const unavailable = Boolean(disabledReason);
  const disabled = state === "loading";

  async function verify() {
    if (unavailable) {
      if (disabledReason) showToast({ type: "info", title: "Verification unavailable", description: disabledReason });
      return;
    }
    if (disabled) return;

    setState("loading");
    try {
      const response = await fetch("/api/project-diff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Verification failed.");

      setState("success");
      showToast({
        type: "success",
        title: "Verification complete",
        description: `${issueTitle}: diff evidence refreshed.`,
      });
    } catch (error) {
      setState("error");
      showToast({
        type: "error",
        title: "Verification failed",
        description: error instanceof Error ? error.message : "Unable to verify this fix.",
      });
    } finally {
      window.setTimeout(() => setState("idle"), 1800);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={verify} disabled={disabled} aria-disabled={unavailable || disabled} title={disabledReason || "Verify this fix against scan diff evidence."}>
      {state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
      Verify
    </Button>
  );
}

export function GenerateLaunchReportButton({
  projectId,
  disabledReason,
}: {
  projectId: string;
  disabledReason?: string;
}) {
  const [state, setState] = useState<ActionState>("idle");
  const unavailable = Boolean(disabledReason);
  const disabled = state === "loading";

  async function generate() {
    if (unavailable) {
      if (disabledReason) showToast({ type: "info", title: "Launch report unavailable", description: disabledReason });
      return;
    }
    if (disabled) return;

    setState("loading");
    try {
      const response = await fetch("/api/appraisals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Report generation failed.");

      const certificateUrl = String(data.appraisal?.certificateUrl || "");

      setState("success");
      showToast({
        type: "success",
        title: "Verified report generated",
        description: "Opening the public Signed Verification Badge.",
      });
      if (certificateUrl) window.location.assign(certificateUrl);
    } catch (error) {
      setState("error");
      showToast({
        type: "error",
        title: "Report failed",
        description: error instanceof Error ? error.message : "Unable to generate this verified report.",
      });
    } finally {
      window.setTimeout(() => setState("idle"), 1800);
    }
  }

  return (
    <Button type="button" variant="default" size="lg" onClick={generate} disabled={disabled} aria-disabled={unavailable || disabled} title={disabledReason || "Generate a VentureOS verified report from latest scan evidence."}>
      {state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
      Generate Report
    </Button>
  );
}
