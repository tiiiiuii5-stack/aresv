"use client";

import { ArrowRight, FileText, Loader2 } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";

import { buttonClassName } from "@/components/ui/button";

export function DemandCaptureCard({
  source,
  title = "Send me the report path",
  description = "Leave an email if you want the review path, buyer-ready report option, or human-assisted review.",
  useCase,
  role = "founder-or-buyer",
  buttonLabel = "Send details",
  className = "",
}: {
  source: string;
  title?: string;
  description?: string;
  useCase: string;
  role?: string;
  buttonLabel?: string;
  className?: string;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError("Enter an email to save the report path.");
      return;
    }

    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          role,
          source,
          useCase,
          ...campaignMetadataFromLocation(),
        }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not save this request.");
      setMessage("Saved. We can follow up with the review path.");
      setEmail("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save this request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={["rounded-lg border border-emerald-300/30 bg-emerald-300/10 p-4", className].filter(Boolean).join(" ")}>
      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-normal text-emerald-100">
        <FileText className="h-4 w-4" />
        Buyer intent
      </p>
      <h2 className="mt-2 text-xl font-black text-white">{title}</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-emerald-50/80">{description}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px]">
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          required
          placeholder="you@company.com"
          className="h-11 rounded-lg border border-white/10 bg-black/30 px-3 text-sm font-semibold text-white outline-none placeholder:text-emerald-50/35 focus:border-emerald-300"
        />
        <button type="submit" disabled={busy} className={buttonClassName({ variant: "outline", size: "sm", className: "h-11 w-full" })}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          {busy ? "Saving" : buttonLabel}
        </button>
      </div>
      {message ? <p className="mt-2 text-xs font-bold leading-5 text-emerald-100">{message}</p> : null}
      {error ? <p className="mt-2 text-xs font-bold leading-5 text-red-100">{error}</p> : null}
    </form>
  );
}

function campaignMetadataFromLocation() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return {
    campaign: cleanCampaignParam(params.get("campaign") || params.get("utm_campaign")),
    ref: cleanCampaignParam(params.get("ref")),
    utmSource: cleanCampaignParam(params.get("utm_source")),
  };
}

function cleanCampaignParam(value: unknown) {
  return String(value || "").trim().replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 80);
}
