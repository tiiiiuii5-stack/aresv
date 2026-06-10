"use client";

import { useState } from "react";

import { buttonClassName } from "@/components/ui/button";
import type { PassportDecisionSummary, PassportDecisionType } from "@/lib/passport/decision-log";

type Props = {
  passportId: string;
  initialSummary: PassportDecisionSummary;
};

const actions: Array<{ decision: PassportDecisionType; label: string; context: string; variant?: "default" | "outline" | "destructive" }> = [
  { decision: "approved", label: "Approve Software", context: "software approval", variant: "default" },
  { decision: "rejected", label: "Reject Software", context: "software rejection", variant: "destructive" },
  { decision: "review_requested", label: "Request Review", context: "additional review", variant: "outline" },
  { decision: "used_in_production", label: "Mark Used In Production", context: "production", variant: "outline" },
  { decision: "deployment_blocked", label: "Block Deployment", context: "deployment", variant: "outline" },
  { decision: "production_failure", label: "Software Broke In Production", context: "production incident", variant: "destructive" },
];

export function PassportDecisionPanel({ passportId, initialSummary }: Props) {
  const [summary, setSummary] = useState(initialSummary);
  const [actor, setActor] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<PassportDecisionType | null>(null);
  const [message, setMessage] = useState("");

  async function record(decision: PassportDecisionType, context: string) {
    setPending(decision);
    setMessage("");
    try {
      const response = await fetch(`/api/passport/${encodeURIComponent(passportId)}/decisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          actor: actor || "browser-user",
          context,
          reason,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Decision could not be recorded.");
      setSummary(data.summary);
      setReason("");
      setMessage("Decision recorded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Decision could not be recorded.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel))]">
      <div className="border-b border-[rgb(var(--vos-border))] p-4">
        <p className="vos-label">Software Decision Record</p>
        <h2 className="mt-2 text-xl font-black text-[rgb(var(--vos-text))]">Trust decisions are recorded, not implied.</h2>
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="grid gap-3">
          <DecisionMetric label="Trusted for Production" value={summary.currentStatus.trustedForProduction ? "YES" : "NO"} />
          <DecisionMetric label="Last Decision" value={formatDecision(summary.currentStatus.lastDecision)} />
          <DecisionMetric label="Decision Confidence" value={summary.currentStatus.decisionConfidence} />
          <DecisionMetric label="Trust Drift" value={formatDrift(summary.currentStatus.trustDrift)} />
        </div>

        <div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="vos-label">Actor</span>
              <input
                value={actor}
                onChange={(event) => setActor(event.target.value)}
                placeholder="user, team, org, reviewer"
                className="h-11 border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] px-3 text-sm font-bold text-[rgb(var(--vos-text))] outline-none"
              />
            </label>
            <label className="grid gap-1">
              <span className="vos-label">Reason</span>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="production deployment, procurement review..."
                className="h-11 border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] px-3 text-sm font-bold text-[rgb(var(--vos-text))] outline-none"
              />
            </label>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {actions.map((action) => (
              <button
                key={action.decision}
                type="button"
                disabled={Boolean(pending)}
                onClick={() => record(action.decision, action.context)}
                className={buttonClassName({ variant: action.variant || "outline", className: "w-full justify-center disabled:opacity-60" })}
              >
                {pending === action.decision ? "Recording..." : action.label}
              </button>
            ))}
          </div>
          {message ? <p className="mt-3 text-sm font-bold text-[rgb(var(--vos-text-muted))]">{message}</p> : null}
        </div>
      </div>

      <div className="border-t border-[rgb(var(--vos-border))] p-4">
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <DecisionMetric label="Approvals" value={String(summary.counts.approvals)} />
          <DecisionMetric label="Rejections" value={String(summary.counts.rejections)} />
          <DecisionMetric label="Reviews" value={String(summary.counts.reviewRequests)} />
          <DecisionMetric label="Prod Uses" value={String(summary.counts.productionUses)} />
          <DecisionMetric label="Blocks" value={String(summary.counts.deploymentBlocks)} />
          <DecisionMetric label="Failures" value={String(summary.counts.productionFailures)} />
        </div>
        <div className="mt-4 grid gap-2">
          {summary.decisions.slice(0, 6).map((decision) => (
            <div key={decision.id} className="grid gap-2 border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] p-3 sm:grid-cols-[180px_minmax(0,1fr)_90px] sm:items-center">
              <div>
                <p className="text-sm font-black text-[rgb(var(--vos-text))]">{formatDecision(decision.decision)}</p>
                <p className="text-[11px] font-bold uppercase text-[rgb(var(--vos-text-subtle))]">{formatDate(decision.timestamp)}</p>
              </div>
              <p className="text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">{decision.reason} Actor: {decision.actor}. Context: {decision.context}.</p>
              <p className="text-right text-sm font-black text-[rgb(var(--vos-text))]">{formatDrift(decision.driftDelta)}</p>
            </div>
          ))}
          {!summary.decisions.length ? <p className="text-sm font-bold text-[rgb(var(--vos-text-muted))]">No software decisions have been recorded for this passport yet.</p> : null}
        </div>
      </div>
    </section>
  );
}

function DecisionMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] p-3">
      <p className="text-[11px] font-black uppercase text-[rgb(var(--vos-text-subtle))]">{label}</p>
      <p className="mt-1 text-lg font-black text-[rgb(var(--vos-text))]">{value}</p>
    </div>
  );
}

function formatDecision(value: string) {
  return value === "none" ? "NONE" : value.replace(/_/g, " ").toUpperCase();
}

function formatDrift(value: number) {
  if (value > 0) return `+${value}`;
  return String(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
