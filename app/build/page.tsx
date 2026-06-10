"use client";

import { Bot, CheckCircle2, Code2, FileText, Loader2, RefreshCw, Rocket, Settings, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { AgentAvatar } from "@/components/agent-avatar";
import { BillingUsage } from "@/components/billing-usage";
import { BuildButton } from "@/components/build-button";
import { GestureCanvas, type CanvasArtifact } from "@/components/gesture-canvas";
import { GitHubConnectPanel } from "@/components/github-connect-panel";
import { InstitutionalPageShell } from "@/components/institutional/institutional-shell";
import { LivePreview as ArtifactLivePreview } from "@/components/live-preview";
import { MemoryRecall } from "@/components/memory-recall";
import { MutationIndicator } from "@/components/mutation-indicator";
import { ScreenshotUpload, type ScreenshotAnalysis } from "@/components/screenshot-upload";
import { VoiceInput } from "@/components/voice-input";
import { type JobRecord, type PassportRecord } from "@/lib/api";
import { useMemory } from "@/lib/hooks/use-memory";

const agents = [
  { name: "Nova", role: "Product", tone: "clarifies user truth", status: "verified" },
  { name: "Forge", role: "Backend", tone: "binds APIs to data", status: "verified" },
  { name: "Prism", role: "Interface", tone: "turns flows into UI", status: "unknown" },
  { name: "Gauge", role: "QA", tone: "hunts fake buttons", status: "risk" },
];

const artifacts: CanvasArtifact[] = [
  { id: "screenshot", icon: FileText, label: "Screenshot", state: "drop input", value: "wireframe extraction", x: 40, y: 42, width: 240, height: 150 },
  { id: "architecture", icon: RefreshCw, label: "Architecture", state: "planning", value: "routes + schema + state graph", x: 312, y: 42, width: 260, height: 150 },
  { id: "codebase", icon: Settings, label: "Codebase", state: "generating", value: "isolated app runtime", x: 604, y: 42, width: 240, height: 150 },
  { id: "preview", icon: Rocket, label: "Preview", state: "live", value: "real backend preview", x: 876, y: 42, width: 240, height: 150 },
];

const examplePrompts = [
  "Import https://github.com/acme/sales-crm and create a software passport",
  "Verify https://example.com before procurement review",
  "Build a booking calendar and create its passport",
];

const defaultNotice = "Start with a plain-language description. VentureOS will build the software asset and prepare the evidence trail for its passport.";
const generationSteps = [
  { label: "Detecting architecture", progress: 5 },
  { label: "Running safety scan", progress: 20 },
  { label: "Running quality scan", progress: 35 },
  { label: "Building evidence graph", progress: 55 },
  { label: "Computing scores", progress: 70 },
  { label: "Checking certificate eligibility", progress: 85 },
  { label: "Creating passport", progress: 95 },
];

const sourceOptions = [
  { label: "Import GitHub repo", icon: Code2, prompt: "Import https://github.com/owner/repository and create a software passport." },
  { label: "Upload codebase", icon: Upload, prompt: "Create a software passport from an uploaded codebase archive." },
  { label: "Enter live URL", icon: FileText, prompt: "Verify https://example.com and create a software passport." },
  { label: "Build new software", icon: Rocket, prompt: "Build new software and create its passport from day one." },
];

export default function BuildPage() {
  const [prompt, setPrompt] = useState("");
  const [job, setJob] = useState<JobRecord | null>(null);
  const [notice, setNotice] = useState(defaultNotice);
  const [screenshotAnalysis, setScreenshotAnalysis] = useState<ScreenshotAnalysis | null>(null);
  const [passport, setPassport] = useState<PassportRecord | null>(null);
  const [passportStage, setPassportStage] = useState("Awaiting source");
  const [focusRequest, setFocusRequest] = useState(0);
  const buildPanelRef = useRef<HTMLDivElement | null>(null);
  const descriptionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const memory = useMemory();
  const progress = job?.progress ?? 0;
  const previewUrl = job?.resultUrl || job?.artifact?.runtimeUrl || null;
  const buildPrompt = screenshotAnalysis ? withScreenshotArchitecture(prompt, screenshotAnalysis) : prompt;
  const runtimeFactory = screenshotAnalysis
    ? {
        source: "screenshot",
        layout: screenshotAnalysis.layout,
        components: screenshotAnalysis.components,
        colors: screenshotAnalysis.colors,
        componentTree: screenshotAnalysis.componentTree,
        suggestedArchitecture: screenshotAnalysis.suggestedArchitecture,
      }
    : undefined;

  useEffect(() => {
    if (!focusRequest) return;
    window.requestAnimationFrame(() => {
      buildPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      descriptionInputRef.current?.focus();
    });
  }, [focusRequest, job]);

  function handleNewProject() {
    setPrompt("");
    setJob(null);
    setPassport(null);
    setPassportStage("Awaiting source");
    setNotice(defaultNotice);
    setScreenshotAnalysis(null);
    setFocusRequest((value) => value + 1);
  }

  return (
    <InstitutionalPageShell
      purposeLabel="Passport Factory"
      rightSlot={<BillingUsage compact />}
      actions={[
        { label: "New Passport", onClick: handleNewProject },
        { label: "Software Assets", href: "/projects" },
        { label: "Registry", href: "/registry" },
        previewUrl ? { label: "Preview", href: previewUrl } : { label: "Preview", disabled: true, title: "Create a project first to use this feature." },
        previewUrl ? { label: "Deploy", href: "/deploy" } : { label: "Deploy", disabled: true, title: "Create a project first to use this feature." },
        { label: "Upgrade", href: "/pricing" },
        { label: "Account", href: "/account" },
      ]}
      className="relative"
    >
      <section className="canvas-grid relative">
        {!job ? (
          <EmptyBuildState
            panelRef={buildPanelRef}
            inputRef={descriptionInputRef}
            prompt={prompt}
            buildPrompt={buildPrompt}
            runtimeFactory={runtimeFactory}
            notice={notice}
            onPromptChange={setPrompt}
            onJobChange={setJob}
            onPassportChange={(nextPassport, stage) => {
              if (nextPassport) setPassport(nextPassport);
              setPassportStage(stage);
            }}
            onError={setNotice}
            passport={passport}
            passportStage={passportStage}
          />
        ) : (
        <div className="mx-auto grid max-w-7xl gap-5 xl:grid-cols-[1fr_360px]">
          <div className="relative min-h-[760px] overflow-hidden vos-panel">
            <CanvasChrome />

            <div className="relative z-10 grid gap-5 p-4 md:p-6 lg:grid-cols-[minmax(320px,420px)_1fr]">
              <section className="vos-panel p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                <p className="vos-label">Passport Factory</p>
                <h1 className="mt-3 vos-h1">Build software with a passport from day one.</h1>
                  </div>
                  <AgentAvatar job={job} message={job?.currentStep || notice} />
                </div>

                <div className="mt-6">
                  <VoiceInput value={prompt} onChange={setPrompt} onAgentResponse={setNotice} />
                </div>

                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  className="mt-4 h-36 w-full resize-none p-4 text-sm leading-6"
                  placeholder="Build a CRM for sales managers where users create clients, move deals, assign tasks, save activity history, and generate a software passport."
                />

                <div className="mt-4">
                  <ScreenshotUpload
                    onAnalysis={(analysis) => {
                      setScreenshotAnalysis(analysis);
                      setNotice(analysis.fallback ? "Screenshot fallback loaded. The text prompt will stay primary for generation." : "Screenshot architecture loaded into runtime factory.");
                    }}
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <BuildButton
                    prompt={buildPrompt}
                    appName="VentureOS Passport Factory"
                    runtimeFactory={runtimeFactory}
                    onJobChange={setJob}
                    onPassportChange={(nextPassport, stage) => {
                      if (nextPassport) setPassport(nextPassport);
                      setPassportStage(stage);
                    }}
                    onError={setNotice}
                  />
                </div>
                <GenerationProgress job={job} />
                <PassportOutput passport={passport} stage={passportStage} />
                <p className="mt-4 vos-body">{notice}</p>
              </section>

              <section className="relative min-h-[620px]">
                <GestureCanvas
                  artifacts={artifacts}
                  preview={
                    <ArtifactLivePreview previewUrl={previewUrl} title={`Live Artifact Preview · ${job?.currentStep || "Awaiting signal"} · ${progress}%`} />
                  }
                >
                  <AgentConstellation />
                </GestureCanvas>
              </section>
            </div>
          </div>

          <aside className="space-y-5">
            <div className="vos-panel p-5">
              <div className="flex items-center gap-3">
                <Settings className="h-5 w-5 text-[rgb(var(--vos-verified))]" />
                <div>
                  <p className="font-semibold text-[rgb(var(--vos-text))]">Factory Context</p>
                  <p className="vos-body">Private build context used to shape the passport.</p>
                </div>
              </div>
            </div>
            <MutationIndicator job={job} />
            <details className="vos-panel p-4">
              <summary className="cursor-pointer text-sm font-black text-[rgb(var(--vos-text))]">Show technical context</summary>
              <div className="mt-4">
                <MemoryRecall memories={memory.memories} loading={memory.loading} />
              </div>
            </details>
          </aside>
        </div>
        )}
      </section>
    </InstitutionalPageShell>
  );
}

function GenerationProgress({ job }: { job: JobRecord | null }) {
  if (!job || job.status === "failed" || job.status === "cancelled") return null;

  const progress = job.progress ?? 0;
  const active = activeStepIndex(progress, job.status);

  return (
    <section className="mt-4 vos-cell p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="vos-label">Generation</p>
          <h2 className="mt-1 text-sm font-semibold text-[rgb(var(--vos-text))]">{job.currentStep || generationSteps[Math.min(active, generationSteps.length - 1)]?.label || "Generating"}</h2>
        </div>
        <p className="text-xs font-semibold text-[rgb(var(--vos-text-muted))]">{estimatedRemaining(progress, job.status)}</p>
      </div>
      <div className="mt-4 space-y-2">
        {generationSteps.map((step, index) => {
          const state = stepState(index, progress, job.status);
          return (
            <div key={step.label} className="flex items-center gap-3 vos-cell px-3 py-2 text-sm">
              {state === "complete" ? (
                <CheckCircle2 className="h-4 w-4 text-[#10B981]" />
              ) : state === "current" ? (
                <Loader2 className="h-4 w-4 animate-spin text-[#F59E0B]" />
              ) : (
                <span className="h-4 w-4 rounded-full border border-white/15" />
              )}
              <span className={state === "pending" ? "text-[rgb(var(--vos-text-subtle))]" : "text-[rgb(var(--vos-text))]"}>{step.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function activeStepIndex(progress: number, status: JobRecord["status"]) {
  if (status === "completed" || status === "succeeded") return generationSteps.length;
  const index = generationSteps.findIndex((step, stepIndex) => {
    const next = generationSteps[stepIndex + 1];
    return progress < (next?.progress ?? 100);
  });
  return Math.max(0, index);
}

function stepState(index: number, progress: number, status: JobRecord["status"]) {
  const active = activeStepIndex(progress, status);
  if (status === "completed" || status === "succeeded" || index < active) return "complete";
  if (index === active) return "current";
  return "pending";
}

function estimatedRemaining(progress: number, status: JobRecord["status"]) {
  if (status === "completed" || status === "succeeded") return "Complete";
  const seconds = Math.max(5, Math.ceil((100 - Math.max(progress, 1)) * 0.45));
  return `~${seconds}s remaining`;
}

function EmptyBuildState({
  panelRef,
  inputRef,
  prompt,
  buildPrompt,
  runtimeFactory,
  notice,
  onPromptChange,
  onJobChange,
  onPassportChange,
  onError,
  passport,
  passportStage,
}: {
  panelRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  prompt: string;
  buildPrompt: string;
  runtimeFactory?: unknown;
  notice: string;
  onPromptChange: (value: string) => void;
  onJobChange: (job: JobRecord) => void;
  onPassportChange: (passport: PassportRecord | null, stage: string) => void;
  onError: (message: string) => void;
  passport: PassportRecord | null;
  passportStage: string;
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-145px)] max-w-4xl items-center justify-center">
      <div ref={panelRef} className="w-full vos-panel p-5 sm:p-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="vos-label">Passport Factory</p>
          <h1 className="mt-4 vos-h1">What software needs a passport?</h1>
        </div>

        <textarea
          ref={inputRef}
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          className="mt-8 min-h-48 w-full resize-none p-6 text-lg leading-8 sm:text-xl"
          placeholder="Describe the software asset VentureOS should build and verify..."
          autoFocus
        />

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {examplePrompts.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                onPromptChange(example);
                inputRef.current?.focus();
              }}
              className="vos-cell px-4 py-3 text-left text-sm font-medium transition hover:border-[rgb(var(--vos-border-strong))]"
            >
              {example}
            </button>
          ))}
        </div>

        <section className="mt-5">
          <p className="vos-label text-left">Step 1: Source Selection</p>
          <div className="mt-3">
            <GitHubConnectPanel />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {sourceOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => {
                    onPromptChange(option.prompt);
                    inputRef.current?.focus();
                  }}
                  className="vos-cell min-h-28 px-4 py-3 text-left transition hover:border-[rgb(var(--vos-border-strong))]"
                >
                  <Icon className="h-5 w-5 text-[rgb(var(--vos-verified))]" />
                  <p className="mt-3 text-sm font-black text-[rgb(var(--vos-text))]">{option.label}</p>
                </button>
              );
            })}
          </div>
        </section>

        <PassportFactoryEvidence stage={passportStage} passport={passport} />

        <div className="mt-5 flex justify-center">
          <BuildButton
            prompt={buildPrompt}
            appName="VentureOS Passport Factory"
            runtimeFactory={runtimeFactory}
            idleLabel="Build Passport"
            onJobChange={onJobChange}
            onPassportChange={onPassportChange}
            onError={onError}
            deferJobChangeUntilDone
            className="action primary h-14 min-w-48 px-8 text-base disabled:opacity-60"
          />
        </div>

        {notice ? <p className="mt-5 text-center vos-body">{notice}</p> : null}
      </div>
    </div>
  );
}

function PassportFactoryEvidence({ stage, passport }: { stage: string; passport: PassportRecord | null }) {
  const cells = [
    ["Build Evidence", "Files, architecture, dependencies, APIs, auth setup"],
    ["System Evidence", "Database usage, deployment config, environment setup"],
    ["Quality Scan", "Structure, tests, maintainability, dependency hygiene"],
    ["Safety Scan", "Auth, data handling, secrets, API surface, tenant isolation"],
  ];
  return (
    <section className="mt-5 border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] p-4 text-left">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="vos-label">Evidence Capture</p>
          <p className="mt-2 text-sm font-black text-[rgb(var(--vos-text))]">{stage}</p>
        </div>
        {passport ? <p className="text-sm font-black text-[rgb(var(--vos-verified))]">{passport.passportId}</p> : null}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {cells.map(([title, detail]) => (
          <div key={title} className="vos-cell p-3">
            <p className="text-sm font-black text-[rgb(var(--vos-text))]">{title}</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-[rgb(var(--vos-text-muted))]">{detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function PassportOutput({ passport, stage }: { passport: PassportRecord | null; stage: string }) {
  if (!passport) return null;
  return (
    <section className="mt-4 border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="vos-label">Passport Output</p>
          <h2 className="mt-1 text-base font-black text-[rgb(var(--vos-text))]">{passport.passportId}</h2>
          <p className="mt-1 text-xs font-bold text-[rgb(var(--vos-text-muted))]">{stage}</p>
        </div>
        <a href={`/passport/${encodeURIComponent(passport.passportId)}`} className="action">
          Open Passport
        </a>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <PassportMetric label="Trust" value={passport.trustScore} />
        <PassportMetric label="Quality" value={passport.qualityScore} />
        <PassportMetric label="Safety" value={passport.safetyScore} />
      </div>
    </section>
  );
}

function PassportMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="vos-cell p-3">
      <p className="vos-label">{label}</p>
      <p className="mt-2 text-3xl font-black text-[rgb(var(--vos-text))]">{value}</p>
    </div>
  );
}

function withScreenshotArchitecture(prompt: string, analysis: ScreenshotAnalysis) {
  const componentSummary = analysis.components
    .slice(0, 12)
    .map((component) => `${component.type}(${component.bounds.x.toFixed(2)},${component.bounds.y.toFixed(2)},${component.bounds.width.toFixed(2)},${component.bounds.height.toFixed(2)})`)
    .join(", ");
  const palette = analysis.colors.map((color) => `${color.hex}=${color.usage}`).join(", ");

  return [
    prompt,
    "",
    "Screenshot architecture seed:",
    `Layout: ${analysis.layout.type}. ${analysis.layout.notes || ""}`,
    `Components: ${componentSummary}`,
    `Palette: ${palette}`,
    `Runtime factory directive: ${analysis.suggestedArchitecture}`,
    "Use this screenshot analysis as the starting architecture. Convert every visible control into a real API-backed interaction with persistent state.",
  ].join("\n");
}

function CanvasChrome() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute left-8 top-8 h-2 w-2 rounded-full bg-[rgb(var(--vos-verified))]" />
      <div className="absolute right-10 top-24 h-px w-44 bg-[rgb(var(--vos-border))]" />
      <div className="absolute bottom-12 left-20 h-px w-64 bg-[rgb(var(--vos-border))]" />
    </div>
  );
}

function AgentConstellation() {
  return (
    <div className="grid gap-3">
      {agents.map((agent) => (
        <div key={agent.name} className="vos-panel p-4">
          <div className="flex items-center gap-3">
            <div className={`grid h-10 w-10 place-items-center rounded-full border border-[rgb(var(--vos-border))] ${agent.status === "verified" ? "bg-[rgb(var(--vos-verified-bg))]" : agent.status === "risk" ? "bg-[rgb(var(--vos-risk-bg))]" : "bg-[rgb(var(--vos-unknown-bg))]"}`}>
              <Bot className={`h-5 w-5 ${agent.status === "verified" ? "vos-status-verified" : agent.status === "risk" ? "vos-status-risk" : "text-[rgb(var(--vos-text-muted))]"}`} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[rgb(var(--vos-text))]">{agent.name}</p>
              <p className="text-xs text-[rgb(var(--vos-text-muted))]">{agent.role}</p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-[rgb(var(--vos-text-muted))]">{agent.tone}</p>
        </div>
      ))}
    </div>
  );
}
