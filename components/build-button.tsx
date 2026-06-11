"use client";

import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { api, type JobRecord, type PassportRecord } from "@/lib/api";
import { UpgradeModal } from "@/components/upgrade-modal";

type BuildButtonProps = {
  prompt?: unknown;
  appName?: unknown;
  runtimeFactory?: unknown;
  busy?: boolean;
  idleLabel?: string;
  className?: string;
  onClick?: () => void | Promise<void>;
  onJobChange?: (job: JobRecord) => void;
  onPassportChange?: (passport: PassportRecord | null, stage: string) => void;
  onError?: (message: string) => void;
  deferJobChangeUntilDone?: boolean;
};

const terminalStatuses = new Set(["completed", "succeeded", "failed", "cancelled"]);
type LocalBuildStatus = JobRecord["status"] | "ready";
const generationSteps = [
  { label: "Starting passport shell", progress: 5 },
  { label: "Generating or importing software", progress: 18 },
  { label: "Recording build evidence", progress: 35 },
  { label: "Recording system evidence", progress: 50 },
  { label: "Running quality scan", progress: 65 },
  { label: "Running safety scan", progress: 80 },
  { label: "Issuing passport output", progress: 95 },
];

export function BuildButton({ prompt = "", appName = "New VentureOS App", runtimeFactory, busy, idleLabel = "Build", className, onClick, onJobChange, onPassportChange, onError, deferJobChangeUntilDone = false }: BuildButtonProps) {
  const router = useRouter();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutWarningRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<LocalBuildStatus>("ready");
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [timeoutWarning, setTimeoutWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null);
  const passportIdRef = useRef<string | null>(null);
  const promptText = normalizeBuilderText(prompt);
  const appNameText = normalizeBuilderText(appName) || "New VentureOS App";

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutWarningRef.current) clearTimeout(timeoutWarningRef.current);
    };
  }, []);

  async function handleBuild() {
    if (!promptText.trim() && onClick) {
      await onClick();
      return;
    }

    if (promptText.trim().length < 12) {
      reportError("Add more detail before building.");
      return;
    }

    const clarityQuestions = promptClarityQuestions(promptText);
    if (clarityQuestions.length) {
      reportError(`Spec is unclear. Answer before generation: ${clarityQuestions.join(" ")}`);
      setStatus("ready");
      setSubmitting(false);
      setProgress(0);
      setStep("");
      clearTimeoutWarning();
      return;
    }

    setError(null);
    setTimeoutWarning(false);
    setSubmitting(true);
    setProgress(0);
    setStep("Starting passport shell");
    onPassportChange?.(null, "Starting passport shell");

    try {
      const passport = await api.createPassport({
        source: promptText,
        sourceType: sourceTypeFromPrompt(promptText),
        name: appNameText,
        owner: ownerFromPrompt(promptText),
      });
      passportIdRef.current = passport.passportId;
      onPassportChange?.(passport, "Passport shell created");
      setStep("Generating or importing software");

      const created = await api.createJob({ action: "build", prompt: passportPrompt(promptText, passport.passportId), appName: appNameText, runtimeFactory, passportId: passport.passportId });
      setJobId(created.jobId);
      setStatus("queued");
      setStep("queued: software generation and evidence capture");
      setSubmitting(false);
      startTimeoutWarning();

      const queuedJob: JobRecord = {
        id: created.jobId,
        action: "build",
        status: created.status,
        progress: 0,
        currentStep: "queued",
        appName: appNameText,
      };
      if (!deferJobChangeUntilDone) onJobChange?.(queuedJob);
      startPolling(created.jobId);
    } catch (buildError) {
      const message = buildError instanceof Error ? buildError.message : "Build failed.";
      if (/limit reached|upgrade/i.test(message)) setUpgradeMessage(message);
      reportError(message);
      setStatus("ready");
      setSubmitting(false);
      clearTimeoutWarning();
    }
  }

  function startPolling(id: string) {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      void pollJob(id);
    }, 2000);
    void pollJob(id);
  }

  async function pollJob(id: string) {
    try {
      const job = await api.getJob(id);
      setStatus(job.status);
      setProgress(job.progress);
      setStep(job.currentStep || job.status);
      const nextJob: JobRecord = {
        id: job.jobId,
        action: job.action,
        status: job.status,
        progress: job.progress,
        currentStep: job.currentStep,
        resultUrl: job.resultUrl,
        errorMessage: job.errorMessage,
        mutationTracking: job.mutationTracking,
      };
      if (!deferJobChangeUntilDone || terminalStatuses.has(job.status)) onJobChange?.(nextJob);

      if (terminalStatuses.has(job.status)) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        clearTimeoutWarning();
      }

      if ((job.status === "completed" || job.status === "succeeded") && job.resultUrl) {
        await finalizePassport();
        router.push(previewPath(job.resultUrl));
      }

      if (job.status === "failed") {
        reportError(job.errorMessage || "Build failed.");
      }
    } catch (pollError) {
      reportError(pollError instanceof Error ? pollError.message : "Failed to load job status.");
    }
  }

  async function finalizePassport() {
    const passportId = passportIdRef.current;
    if (!passportId) return;
    try {
      setStep("Running quality and safety scans");
      onPassportChange?.(null, "Running quality and safety scans");
      const scanned = await api.scanPassport(passportId);
      onPassportChange?.(scanned, "Passport scanned");
      try {
        const certified = await api.issuePassportCertificate(passportId);
        onPassportChange?.(certified, "Passport created with certificate seal");
      } catch {
        onPassportChange?.(scanned, "Passport created; certificate pending");
      }
    } catch (error) {
      onPassportChange?.(null, error instanceof Error ? error.message : "Passport scan failed");
    }
  }

  function reportError(message: string) {
    setError(message);
    onError?.(message);
  }

  function startTimeoutWarning() {
    clearTimeoutWarning();
    timeoutWarningRef.current = setTimeout(() => setTimeoutWarning(true), 120_000);
  }

  function clearTimeoutWarning() {
    if (timeoutWarningRef.current) {
      clearTimeout(timeoutWarningRef.current);
      timeoutWarningRef.current = null;
    }
  }

  const running = status !== "ready" && !terminalStatuses.has(status);
  const building = busy || submitting || running;
  const label = submitting ? "Starting..." : status === "ready" || terminalStatuses.has(status) ? idleLabel : "Building...";

  return (
    <div className="space-y-3">
      <button type="button" onClick={handleBuild} disabled={building} className={className || "action primary h-12 px-5 disabled:opacity-60"}>
        {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {label}
      </button>

      {submitting ? <BackendLoadingSkeleton /> : null}

      {status !== "ready" ? (
        <div className="w-full max-w-sm vos-cell p-3">
          <div className="h-2 overflow-hidden rounded-full bg-[rgb(var(--vos-unknown-bg))]">
            <div className="h-full rounded-full bg-[rgb(var(--vos-verified))] transition-all" style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-[rgb(var(--vos-text-muted))]">
            <p className="truncate">{step || status}</p>
            <p className="font-semibold text-[rgb(var(--vos-text))]">{progress}%</p>
          </div>
          <p className="mt-1 text-[11px] font-medium text-[rgb(var(--vos-text-muted))]">{estimatedRemaining(progress, status)}</p>
          <div className="mt-3 space-y-2">
            {generationSteps.map((item, index) => {
              const state = stepState(index, progress, status);
              return (
                <div key={item.label} className="flex items-center gap-2 text-xs text-[rgb(var(--vos-text-muted))]">
                  {state === "complete" ? (
                    <CheckCircle2 className="h-4 w-4 text-[#10B981]" />
                  ) : state === "current" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-[#F59E0B]" />
                  ) : (
                    <span className="h-4 w-4 rounded-full border border-white/15" />
                  )}
                  <span className={state === "pending" ? "text-[rgb(var(--vos-text-subtle))]" : "text-[rgb(var(--vos-text))]"}>{item.label}</span>
                </div>
              );
            })}
          </div>
          {timeoutWarning ? (
            <div className="mt-3 rounded-lg border border-amber-300/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100">
              Generation is taking longer than expected. You can keep waiting, or retry with a more specific prompt if this does not finish soon.
            </div>
          ) : null}
          {jobId ? <p className="mt-1 truncate text-[11px] text-[rgb(var(--vos-text-muted))]">{jobId}</p> : null}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-300/25 bg-red-500/10 p-3 text-sm text-red-100">
          <p className="font-semibold text-red-50">Generation failed</p>
          <p className="mt-1 leading-6">{error}</p>
          <button
            type="button"
            onClick={handleBuild}
            disabled={building}
            className="mt-3 action disabled:opacity-60"
          >
            {building ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Retry
          </button>
        </div>
      ) : null}
      <UpgradeModal message={upgradeMessage} onClose={() => setUpgradeMessage(null)} />
    </div>
  );
}

function BackendLoadingSkeleton() {
  return (
    <div className="w-full max-w-sm vos-cell p-3" aria-label="Backend loading">
      <div className="h-2 overflow-hidden rounded-full bg-[rgb(var(--vos-unknown-bg))]">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-[rgb(var(--vos-primary))]" />
      </div>
      <div className="mt-3 space-y-2">
        <div className="h-4 w-3/4 animate-pulse rounded bg-[rgb(var(--vos-unknown-bg))]" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-[rgb(var(--vos-unknown-bg))]" />
        <div className="h-10 w-full animate-pulse rounded-lg bg-[rgb(var(--vos-unknown-bg))]" />
      </div>
    </div>
  );
}

function activeStepIndex(progress: number, status: LocalBuildStatus) {
  if (status === "completed" || status === "succeeded") return generationSteps.length;
  if (status === "failed" || status === "cancelled") return Math.max(0, generationSteps.findLastIndex((step) => progress >= step.progress));
  const index = generationSteps.findIndex((step, stepIndex) => {
    const next = generationSteps[stepIndex + 1];
    return progress < (next?.progress ?? 100);
  });
  return Math.max(0, index);
}

function stepState(index: number, progress: number, status: LocalBuildStatus) {
  const active = activeStepIndex(progress, status);
  if (status === "completed" || status === "succeeded" || index < active) return "complete";
  if (index === active) return "current";
  return "pending";
}

function estimatedRemaining(progress: number, status: LocalBuildStatus) {
  if (status === "completed" || status === "succeeded") return "Complete";
  if (status === "failed") return "Stopped";
  if (status === "cancelled") return "Cancelled";
  const seconds = Math.max(5, Math.ceil((100 - Math.max(progress, 1)) * 0.45));
  return `Estimated time remaining: ~${seconds}s`;
}

function previewPath(resultUrl: string) {
  if (resultUrl.startsWith("/preview")) return resultUrl;
  if (resultUrl.startsWith("/generated-apps")) return resultUrl;
  if (resultUrl.startsWith("/")) return resultUrl;
  return `/preview/${encodeURIComponent(resultUrl)}`;
}

function sourceTypeFromPrompt(prompt: string) {
  if (/github\.com/i.test(prompt)) return "github";
  if (/upload|archive|zip/i.test(prompt)) return "upload";
  if (/https?:\/\//i.test(prompt)) return "url";
  return "built";
}

function ownerFromPrompt(prompt: string) {
  const github = prompt.match(/github\.com\/([^/\s]+)\/?/i);
  if (github?.[1]) return github[1];
  try {
    const url = new URL(prompt.match(/https?:\/\/[^\s]+/i)?.[0] || "");
    return url.hostname.replace(/^www\./i, "");
  } catch {
    return "Builder Factory";
  }
}

function passportPrompt(prompt: string, passportId: string) {
  return [
    prompt,
    "",
    `Passport Factory directive: create or import this software while recording build evidence, system evidence, quality evidence, and safety evidence for ${passportId}.`,
    "The remembered output is the Software Passport, not only the generated app.",
  ].join("\n");
}

function promptClarityQuestions(prompt: string) {
  const source = prompt.toLowerCase();
  return [
    !/\b(user|users|customer|client|admin|team|manager|staff|owner|member|seller|buyer|founder|creator|operator)\b/i.test(source)
      ? "Who are the real users?"
      : "",
    !/\b(create|edit|delete|submit|book|buy|sell|track|assign|move|deploy|generate|save|upload|approve|publish|schedule|message|checkout|manage|review)\b/i.test(source)
      ? "What real actions must users perform?"
      : "",
    !/\b(database|data|record|records|client|clients|project|projects|task|tasks|order|orders|booking|bookings|product|products|metric|metrics|post|posts|member|members|deal|deals|invoice|invoices|slot|slots|listing|listings|item|items|request|requests|review|reviews|report|reports)\b/i.test(source)
      ? "What real data or records must be stored?"
    : "",
  ].filter(Boolean);
}

function normalizeBuilderText(value: unknown) {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);

  try {
    return JSON.stringify(value, null, 2) || "";
  } catch {
    return String(value);
  }
}
