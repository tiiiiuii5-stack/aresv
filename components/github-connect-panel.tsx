"use client";

import { Code2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { buttonClassName } from "@/components/ui/button";

type GitHubStatus = {
  configured: boolean;
  configuredCount: number;
  requiredCount: number;
  missingVariables: string[];
  installUrl: string;
  webhookUrl: string;
  requiredEvents: string[];
};

export function GitHubConnectPanel({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/github/status")
      .then((response) => response.json())
      .then((payload) => {
        if (!active) return;
        if (!payload.ok) throw new Error(payload.error || "GitHub status unavailable.");
        setStatus(payload);
      })
      .catch((statusError) => {
        if (active) setError(statusError instanceof Error ? statusError.message : "GitHub status unavailable.");
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <section className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-sm font-semibold text-amber-100">
        {error}
      </section>
    );
  }

  if (!status) {
    return (
      <section className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-sm font-semibold text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin text-blue-300" />
        Checking GitHub App status
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-4 text-left">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-md border border-slate-700 bg-[#0B0F19] text-slate-100">
              <Code2 className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-black text-slate-100">Connect GitHub & Scan Repo</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {status.configured ? "GitHub App configuration is ready." : `${status.configuredCount}/${status.requiredCount} GitHub App variables configured.`}
              </p>
            </div>
          </div>

          {!compact ? (
            <div className="mt-4 grid gap-2 text-xs font-semibold text-slate-500">
              <p>Webhook URL: <span className="font-mono text-slate-300">{status.webhookUrl}</span></p>
              <p>Events: <span className="text-slate-300">{status.requiredEvents.join(", ")}</span></p>
              {!status.configured ? <p className="text-amber-200">Missing: {status.missingVariables.join(", ")}</p> : null}
            </div>
          ) : null}
        </div>

        {status.configured ? (
          <Link href={status.installUrl} className={buttonClassName({ className: "shrink-0 justify-center" })}>
            Connect GitHub
          </Link>
        ) : (
          <Link href="/admin/operations" className={buttonClassName({ variant: "outline", className: "shrink-0 justify-center" })}>
            View Setup
          </Link>
        )}
      </div>
    </section>
  );
}
