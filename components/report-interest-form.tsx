"use client";

import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import { buttonClassName } from "@/components/ui/button";

const roleOptions = [
  "Founder / owner",
  "Buyer / investor",
  "Security reviewer",
  "Operator / engineering lead",
];

export function ReportInterestForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(roleOptions[0]);
  const [repoUrl, setRepoUrl] = useState("");
  const [context, setContext] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const previewHref = previewUrlFor(repoUrl);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const incomingRepo = params.get("repo");
    if (incomingRepo) setRepoUrl(incomingRepo);
  }, []);

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
    setSaved(false);
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          role,
          repositoryUrl: repoUrl.trim(),
          source: "request_report_page",
          useCase: [
            "Requested VentureOS report path",
            repoUrl.trim() ? `Repo: ${repoUrl.trim()}` : "",
            context.trim() ? `Context: ${context.trim()}` : "",
          ].filter(Boolean).join(" | "),
          ...campaignMetadataFromLocation(),
        }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; synthetic?: boolean; emailSent?: boolean; emailDelivery?: { reason?: string } };
      if (!response.ok) throw new Error(payload.error || "Could not save this request.");
      setMessage(deliveryMessage(payload));
      setSaved(true);
      setEmail("");
      setContext("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save this request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="vos-panel p-5 sm:p-6">
      <p className="vos-label">Report path request</p>
      <h2 className="mt-2 text-2xl font-black text-[rgb(var(--vos-text))]">Send me the VentureOS decision report path.</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">
        Use this when you want the free decision preview, buyer-ready report option, or human-assisted review without starting from a paid checkout.
      </p>

      <div className="mt-5 grid gap-3">
        <label className="block">
          <span className="text-xs font-black uppercase tracking-normal text-[rgb(var(--vos-text-muted))]">Email</span>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            required
            placeholder="you@company.com"
            className="mt-2 h-12 w-full rounded-lg border border-[rgb(var(--vos-border-strong))] bg-[rgb(var(--vos-panel-raised))] px-3 text-sm font-bold text-[rgb(var(--vos-text))] outline-none placeholder:text-[rgb(var(--vos-text-subtle))] focus:border-[rgb(var(--vos-primary))]"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-black uppercase tracking-normal text-[rgb(var(--vos-text-muted))]">Role</span>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="mt-2 h-12 w-full rounded-lg border border-[rgb(var(--vos-border-strong))] bg-[rgb(var(--vos-panel-raised))] px-3 text-sm font-bold text-[rgb(var(--vos-text))] outline-none focus:border-[rgb(var(--vos-primary))]"
            >
              {roleOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-black uppercase tracking-normal text-[rgb(var(--vos-text-muted))]">Repository or app URL</span>
            <input
              value={repoUrl}
              onChange={(event) => setRepoUrl(event.target.value)}
              type="url"
              placeholder="https://github.com/username/repo"
              className="mt-2 h-12 w-full rounded-lg border border-[rgb(var(--vos-border-strong))] bg-[rgb(var(--vos-panel-raised))] px-3 text-sm font-bold text-[rgb(var(--vos-text))] outline-none placeholder:text-[rgb(var(--vos-text-subtle))] focus:border-[rgb(var(--vos-primary))]"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-xs font-black uppercase tracking-normal text-[rgb(var(--vos-text-muted))]">What decision are you trying to make?</span>
          <textarea
            value={context}
            onChange={(event) => setContext(event.target.value.slice(0, 700))}
            placeholder="Example: buyer review, investor diligence, production launch, security review"
            className="mt-2 min-h-28 w-full rounded-lg border border-[rgb(var(--vos-border-strong))] bg-[rgb(var(--vos-panel-raised))] px-3 py-3 text-sm font-bold leading-6 text-[rgb(var(--vos-text))] outline-none placeholder:text-[rgb(var(--vos-text-subtle))] focus:border-[rgb(var(--vos-primary))]"
          />
        </label>
      </div>

      <button type="submit" disabled={busy} className={buttonClassName({ size: "lg", className: "mt-5 w-full" })}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        {busy ? "Saving request" : "Send report path"}
      </button>
      {message ? <p className="mt-3 rounded-lg border border-[rgb(var(--vos-verified))]/30 bg-[rgb(var(--vos-verified-bg))] px-3 py-2 text-sm font-bold leading-6 text-[rgb(var(--vos-verified))]">{message}</p> : null}
      {saved ? (
        <div className="mt-3 grid gap-2 rounded-lg border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] p-3">
          <p className="text-xs font-black uppercase tracking-normal text-[rgb(var(--vos-text-muted))]">Next step</p>
          <Link href={previewHref} className={buttonClassName({ className: "w-full" })}>
            Run the free decision preview
          </Link>
          <p className="text-xs font-bold leading-5 text-[rgb(var(--vos-text-muted))]">
            The preview creates the second demand signal: a real person moving from interest to software review.
          </p>
        </div>
      ) : null}
      {error ? <p className="mt-3 rounded-lg border border-[rgb(var(--vos-danger))]/30 bg-[rgb(var(--vos-danger))]/10 px-3 py-2 text-sm font-bold leading-6 text-[rgb(var(--vos-danger))]">{error}</p> : null}
    </form>
  );
}

function deliveryMessage(payload: { synthetic?: boolean; emailSent?: boolean; emailDelivery?: { reason?: string } }) {
  if (payload.synthetic) return "Saved as a test request. No email was sent for synthetic traffic.";
  if (payload.emailSent) return "Saved and emailed. Check your inbox for the VentureOS review links.";
  if (payload.emailDelivery?.reason === "not_configured") {
    return "Saved, but outbound email is not configured yet. Use the preview button below now.";
  }
  return "Saved. Use the preview button below now; email delivery was not confirmed.";
}

function previewUrlFor(repoUrl: string) {
  const url = new URL("/free-review", "https://ventureos.local");
  const cleanRepo = repoUrl.trim();
  if (cleanRepo) url.searchParams.set("repo", cleanRepo);
  url.searchParams.set("campaign", "lead_to_preview");
  url.searchParams.set("ref", "request_report");
  url.searchParams.set("utm_source", "request_report_form");
  return `${url.pathname}?${url.searchParams.toString()}`;
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
