"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, BarChart3, Check, Code2, FileText, Gauge, ShieldAlert, ShieldCheck } from "lucide-react";

import {
  InstitutionalMetricCard,
  InstitutionalPanel,
} from "@/components/institutional/institutional-shell";
import { CopyButton } from "@/components/ui/copy-button";

type Severity = "critical" | "high" | "medium";

type Finding = {
  id: string;
  rank: number;
  title: string;
  severity: Severity;
  category: string;
  file: string;
  summary: string;
  businessImpact: string;
  fix: string;
  before: string;
  after: string;
};

const findings: Finding[] = [
  {
    id: "rls-open",
    rank: 1,
    title: "Fake Supabase RLS exposes profile data",
    severity: "critical",
    category: "Database Security",
    file: "supabase/policies.sql",
    summary: "The UI assumes private profiles, but the policy exposes rows without a user ownership check.",
    businessImpact: "Customer emails, billing state, and scan results can leak across accounts.",
    fix: "Replace the permissive policy with an auth.uid ownership rule and add a negative access test.",
    before: `create policy "Profiles are readable"
on profiles for select
using (true);`,
    after: `create policy "Users read own profile"
on profiles for select
using (auth.uid() = user_id);`,
  },
  {
    id: "fake-auth",
    rank: 2,
    title: "Admin API trusts frontend state",
    severity: "critical",
    category: "Authorization",
    file: "app/api/admin/users/route.ts",
    summary: "The route updates account roles from request JSON without verifying the caller server-side.",
    businessImpact: "A normal user can promote themselves or downgrade paying customers by calling the API directly.",
    fix: "Require a verified session, load the caller role from the database, and deny non-admin requests before mutation.",
    before: `const body = await request.json();
await prisma.user.update({
  where: { id: body.userId },
  data: { role: body.role }
});`,
    after: `const session = await requireSession(request);
await requireRole(session.userId, "admin");`,
  },
  {
    id: "webhook-signature",
    rank: 3,
    title: "Stripe webhook accepts forged events",
    severity: "critical",
    category: "Payments",
    file: "app/api/stripe/webhook/route.ts",
    summary: "The webhook parses JSON directly and never validates the Stripe signature header.",
    businessImpact: "Attackers can unlock paid tiers or create false subscription states without payment.",
    fix: "Read the raw body, verify Stripe-Signature, and make event handling idempotent.",
    before: `const event = await request.json();
if (event.type === "checkout.session.completed") {
  await activateSubscription(event.data.object.customer);
}`,
    after: `const signature = request.headers.get("stripe-signature");
const rawBody = await request.text();
const event = stripe.webhooks.constructEvent(rawBody, signature, secret);`,
  },
];

const severityClass: Record<Severity, string> = {
  critical: "vos-status-danger",
  high: "vos-status-danger",
  medium: "vos-status-risk",
};

export function SampleScanReport() {
  const [activeFindingId, setActiveFindingId] = useState(findings[0].id);

  const activeFinding = useMemo(
    () => findings.find((finding) => finding.id === activeFindingId) ?? findings[0],
    [activeFindingId],
  );

  return (
    <section className="grid gap-5">
      <InstitutionalPanel
        eyebrow="Sample Scan Report"
        title="This is what a real launch blocker looks like."
        actions={<span className="vos-status-danger text-sm font-black">Do not deploy</span>}
      >
        <div className="grid gap-4 lg:grid-cols-4">
          <InstitutionalMetricCard label="Trust Score" value="34" status="danger" detail="/100" />
          <InstitutionalMetricCard label="Critical" value="3" status="danger" />
          <InstitutionalMetricCard label="High" value="1" status="danger" />
          <InstitutionalMetricCard label="Medium" value="1" status="risk" />
        </div>
      </InstitutionalPanel>

      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <InstitutionalPanel eyebrow="Overall Verdict" title="Block deployment">
          <div className="grid gap-4">
            <div className="vos-cell p-4">
              <Gauge className="h-6 w-6 vos-status-danger" aria-hidden="true" />
              <p className="mt-3 vos-body">
                Critical security paths are not enforced server-side. The app can look finished while exposing user data and billing access.
              </p>
            </div>
            <ScoreBar label="Security" score={21} tone="danger" />
            <ScoreBar label="Reliability" score={43} tone="risk" />
            <ScoreBar label="Production Readiness" score={38} tone="danger" />
          </div>
        </InstitutionalPanel>

        <InstitutionalPanel
          eyebrow="Prioritized Findings"
          title="Fix these before launch"
          actions={
            <button type="button" disabled title="Sample report only. Run a real scan for exports." className="action">
              Sample only
            </button>
          }
        >
          <div className="grid gap-3">
            {findings.map((finding) => (
              <FindingRow
                key={finding.id}
                finding={finding}
                active={finding.id === activeFinding.id}
                onSelect={() => setActiveFindingId(finding.id)}
              />
            ))}
          </div>
        </InstitutionalPanel>
      </div>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <FixPreview finding={activeFinding} />
        <BusinessImpact finding={activeFinding} />
      </section>
    </section>
  );
}

export default SampleScanReport;

function ScoreBar({ label, score, tone }: { label: string; score: number; tone: "danger" | "risk" }) {
  return (
    <div className="vos-cell p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[rgb(var(--vos-text))]">{label}</p>
          <p className="mt-1 vos-body">Score out of 100</p>
        </div>
        <p className={`text-lg font-black ${tone === "danger" ? "vos-status-danger" : "vos-status-risk"}`}>{score}</p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[rgb(var(--vos-unknown-bg))]" aria-label={`${label} score ${score} out of 100`} role="img">
        <div className={`h-full rounded-full ${tone === "danger" ? "bg-[rgb(var(--vos-danger))]" : "bg-[rgb(var(--vos-risk))]"}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function FindingRow({ finding, active, onSelect }: { finding: Finding; active: boolean; onSelect: () => void }) {
  return (
    <article className={`vos-cell p-4 ${active ? "border-[rgb(var(--vos-border-strong))]" : ""}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <button type="button" onClick={onSelect} className="group flex flex-1 gap-4 text-left">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[rgb(var(--vos-border))] text-sm font-black text-[rgb(var(--vos-text))]">
            {finding.rank}
          </span>
          <span>
            <span className="flex flex-wrap items-center gap-2">
              <span className={`text-xs font-black uppercase ${severityClass[finding.severity]}`}>{finding.severity}</span>
              <span className="vos-label">{finding.category}</span>
            </span>
            <span className="mt-2 block font-bold text-[rgb(var(--vos-text))]">{finding.title}</span>
            <span className="mt-2 block vos-body">{finding.summary}</span>
            <span className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[rgb(var(--vos-text-muted))]">
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              {finding.file}
            </span>
          </span>
        </button>

        <button type="button" onClick={onSelect} className="action shrink-0">
          View Fix
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

function FixPreview({ finding }: { finding: Finding }) {
  return (
    <InstitutionalPanel
      eyebrow="Selected Fix"
      title={finding.title}
      actions={<span className={`text-xs font-black uppercase ${severityClass[finding.severity]}`}>{finding.severity}</span>}
    >
      <p className="vos-body">{finding.fix}</p>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <CodeBlock label="Before" code={finding.before} tone="danger" />
        <CodeBlock label="After" code={finding.after} tone="safe" />
      </div>
      <div className="mt-5 flex flex-col gap-3 vos-cell p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 vos-status-verified" aria-hidden="true" />
          <div>
            <p className="font-bold text-[rgb(var(--vos-text))]">Estimated risk reduction: 31 points</p>
            <p className="mt-1 vos-body">Patch preview only. Production rollout should include tests and reviewer approval.</p>
          </div>
        </div>
        <button type="button" disabled title="Patch preview only. Run a real scan before applying changes." className="action">
          <Check className="h-4 w-4" aria-hidden="true" />
          Preview only
        </button>
      </div>
    </InstitutionalPanel>
  );
}

function CodeBlock({ label, code, tone }: { label: string; code: string; tone: "danger" | "safe" }) {
  return (
    <div className={`overflow-hidden rounded-lg border ${tone === "danger" ? "border-[rgb(var(--vos-danger-bg))]" : "border-[rgb(var(--vos-verified-bg))]"}`}>
      <div className="flex items-center justify-between border-b border-[rgb(var(--vos-border))] px-4 py-3">
        <span className="vos-label">{label}</span>
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-[rgb(var(--vos-text-muted))]" aria-hidden="true" />
          <CopyButton value={code} label="Copy code" successMessage={`${label} code copied.`} />
        </div>
      </div>
      <pre className="overflow-x-auto bg-[rgb(var(--vos-panel-raised))] p-4 text-xs leading-6 text-[rgb(var(--vos-text-muted))]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function BusinessImpact({ finding }: { finding: Finding }) {
  return (
    <InstitutionalPanel eyebrow="Business Impact" title="Why this matters">
      <div className="grid gap-3">
        <p className="vos-body">{finding.businessImpact}</p>
        {["Customer data exposure", "Privilege escalation", "Payment bypass", "Failed launch trust"].map((item) => (
          <div key={item} className="flex items-center gap-3 vos-cell px-3 py-3">
            {item === "Payment bypass" ? <BarChart3 className="h-4 w-4 vos-status-danger" /> : item === "Failed launch trust" ? <ShieldAlert className="h-4 w-4 vos-status-risk" /> : <AlertTriangle className="h-4 w-4 vos-status-danger" />}
            <span className="text-sm font-semibold text-[rgb(var(--vos-text-muted))]">{item}</span>
          </div>
        ))}
      </div>
    </InstitutionalPanel>
  );
}
