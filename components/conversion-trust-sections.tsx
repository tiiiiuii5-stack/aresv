"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Code2, FileText, Loader2, Lock, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import {
  InstitutionalMetricCard,
  InstitutionalPanel,
} from "@/components/institutional/institutional-shell";

type DemoIssue = {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  title: string;
  evidence: string;
  fixSuggestion: string;
};

type DemoResult = {
  securityScore: number;
  failureScore: number;
  productionReadinessScore: number;
  riskLevel: string;
  issues: DemoIssue[];
  recommendations: string[];
  inputTruncated?: boolean;
};

const demoCode = `// app/api/admin/users/route.ts
export async function POST(request: Request) {
  const body = await request.json();
  await prisma.user.update({
    where: { id: body.userId },
    data: { role: body.role }
  });
  return Response.json({ ok: true });
}`;

const miniReportFindings = [
  "Protected-looking screens with unprotected backend routes.",
  "Payment flows that update billing before verified webhook proof.",
  "Success toasts without durable persistence.",
  "Frontend calls to APIs that were never implemented.",
];

const privacyPoints = [
  "The public demo caps submitted code and does not require an account.",
  "Telemetry stores compact summaries, not public raw-code dumps.",
  "Secrets should never be pasted into any scanner.",
  "Paid scans use API-key access, quota controls, and usage logging.",
];

export function ConversionTrustSections() {
  return (
    <section className="mt-6 grid gap-5">
      <PublicDemoFlow />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <MiniReportTeaser />
        <PrivacySecuritySection />
      </div>
      <WaitlistSection />
    </section>
  );
}

function PublicDemoFlow() {
  const [code, setCode] = useState(demoCode);
  const [framework, setFramework] = useState("nextjs");
  const [result, setResult] = useState<DemoResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const topIssue = useMemo(() => result?.issues[0], [result]);

  async function runDemoScan() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/public-demo-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appCode: code, framework, modules: ["stripe", "prisma", "auth"] }),
      });
      const payload = (await response.json()) as DemoResult & { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error || "Demo scan failed.");
      setResult(payload);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Demo scan failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <InstitutionalPanel
      eyebrow="Public demo"
      title="Scan generated code before account creation."
      actions={
        <Link href="/sample-appraisal" className="action">
          Sample Report <ArrowRight className="h-4 w-4" />
        </Link>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-3">
          <textarea
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="h-64 resize-none p-4 font-mono text-xs leading-6"
            aria-label="Code to scan"
          />
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <select
              id="demo-framework"
              value={framework}
              onChange={(event) => setFramework(event.target.value)}
              className="px-3 py-3 text-sm font-bold"
              aria-label="Framework"
            >
              <option value="nextjs">Next.js</option>
              <option value="react">React</option>
              <option value="express">Express</option>
              <option value="supabase">Supabase app</option>
            </select>
            <button type="button" onClick={runDemoScan} disabled={busy} className="action primary">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Code2 className="h-4 w-4" />}
              Scan
            </button>
            <Link href="/free-review" className="action">
              Free Review
            </Link>
          </div>
          {error ? <p className="vos-status-danger vos-cell p-3 text-sm font-bold">{error}</p> : null}
        </div>

        <aside className="grid content-start gap-3">
          {busy ? (
            <>
              <div className="skeleton h-24" />
              <div className="skeleton h-24" />
              <div className="skeleton h-24" />
            </>
          ) : result ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <InstitutionalMetricCard label="Security" value={result.securityScore} status={result.securityScore >= 70 ? "verified" : "danger"} />
                <InstitutionalMetricCard label="Failure" value={result.failureScore} status={result.failureScore >= 70 ? "danger" : "risk"} />
                <InstitutionalMetricCard label="Ready" value={result.productionReadinessScore} status={result.productionReadinessScore >= 80 ? "verified" : "risk"} />
              </div>
              <div className="vos-cell p-4">
                <p className="vos-label">Top Finding</p>
                <h3 className="mt-2 font-black text-[rgb(var(--vos-text))]">{topIssue?.title || "No major issue detected"}</h3>
                <p className="mt-2 vos-body">{topIssue?.evidence || "The sample passed the public-demo checks."}</p>
              </div>
              {result.inputTruncated ? <p className="vos-status-risk text-xs font-bold">Input was capped for the public demo.</p> : null}
            </>
          ) : (
            <div className="vos-cell p-4">
              <p className="vos-label">Live Result</p>
              <p className="mt-2 vos-body">Paste a route, component, or checkout flow to receive a limited public scan.</p>
            </div>
          )}
        </aside>
      </div>
    </InstitutionalPanel>
  );
}

function MiniReportTeaser() {
  return (
    <InstitutionalPanel eyebrow="Field guide" title="State of AI app launch risk">
      <div className="grid gap-3">
        {miniReportFindings.map((finding) => (
          <p key={finding} className="vos-cell flex gap-3 p-3 text-sm font-semibold text-[rgb(var(--vos-text-muted))]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 vos-status-verified" />
            {finding}
          </p>
        ))}
      </div>
    </InstitutionalPanel>
  );
}

function PrivacySecuritySection() {
  return (
    <InstitutionalPanel eyebrow="Privacy" title="Clear submission boundaries">
      <div className="grid gap-3">
        {privacyPoints.map((point) => (
          <p key={point} className="vos-cell flex gap-3 p-3 text-sm font-semibold text-[rgb(var(--vos-text-muted))]">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 vos-status-verified" />
            {point}
          </p>
        ))}
      </div>
    </InstitutionalPanel>
  );
}

function WaitlistSection() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("solo-founder");
  const [useCase, setUseCase] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function joinWaitlist(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role, useCase }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not join waitlist.");
      setMessage("You are on the early-access list.");
      setEmail("");
      setUseCase("");
    } catch (waitlistError) {
      setError(waitlistError instanceof Error ? waitlistError.message : "Could not join waitlist.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <InstitutionalPanel
      eyebrow="Early access"
      title="Request CI gates, scheduled scans, and hardening workflows."
      actions={<Lock className="h-5 w-5 text-[rgb(var(--vos-text-muted))]" />}
    >
      <form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]" onSubmit={joinWaitlist}>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          required
          placeholder="you@company.com"
          className="px-4 py-3 text-sm font-semibold"
        />
        <select value={role} onChange={(event) => setRole(event.target.value)} className="px-4 py-3 text-sm font-semibold">
          <option value="solo-founder">Solo founder</option>
          <option value="agency">Agency / studio</option>
          <option value="security-lead">Security lead</option>
          <option value="ai-builder">AI app builder</option>
        </select>
        <textarea
          value={useCase}
          onChange={(event) => setUseCase(event.target.value)}
          placeholder="What are you trying to scan or harden?"
          className="min-h-24 resize-none px-4 py-3 text-sm font-semibold lg:col-span-2"
        />
        <button type="submit" disabled={busy} className="action primary lg:w-fit">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Join
        </button>
      </form>
      {message ? <p className="mt-3 vos-status-verified vos-cell p-3 text-sm font-bold">{message}</p> : null}
      {error ? <p className="mt-3 vos-status-danger vos-cell p-3 text-sm font-bold">{error}</p> : null}
    </InstitutionalPanel>
  );
}
