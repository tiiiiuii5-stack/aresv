"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, CheckCircle2, FileText, Gauge, Lock, ShieldCheck } from "lucide-react";

import { InstitutionalPageShell } from "@/components/institutional/institutional-shell";
import { buttonClassName } from "@/components/ui/button";

const steps = [
  {
    title: "Start with a free review",
    detail: "Paste a public GitHub repository or a small code sample. VentureOS returns launch blockers, readiness, and top risks without issuing a signed evidence receipt.",
    href: "/free-review",
    action: "Run Free Review",
    icon: Gauge,
  },
  {
    title: "Generate the right review",
    detail: "Use the free Evidence Review Report for a signed technical snapshot, or the free Buyer Evidence Review for a deeper diligence artifact.",
    href: "/software-appraisal",
    action: "Choose Report",
    icon: FileText,
  },
  {
    title: "Read the evidence record",
    detail: "The record shows quality, safety, buyer readiness, evidence, limitations, receipt status, and decision history in one customer-facing view.",
    href: "/registry",
    action: "Open Registry",
    icon: FileText,
  },
  {
    title: "Open the receipt",
    detail: "Every issued Signed Evidence Receipt has a public page, API response, signature check, and registry match.",
    href: "/certificate/vos-cert-92f9705b765d4c84",
    action: "View Example Badge",
    icon: Lock,
  },
  {
    title: "Check the transparency log",
    detail: "The log proves badge issuance and scan commitments with hash-chain entries, Merkle proofs, and signed anchor manifests.",
    href: "/transparency-log",
    action: "Open Log",
    icon: BarChart3,
  },
  {
    title: "Track growth",
    detail: "Use the owner dashboard to see user count, paid customers, subscription mix, payments, and revenue without counting founder access as fake revenue.",
    href: "/admin/growth",
    action: "Open Admin Growth",
    icon: ShieldCheck,
  },
] as const;

const customerPacket = [
  "Free limited scan",
  "Free Evidence Review Report",
  "Free Buyer Evidence Review",
  "Software evidence record",
  "Public registry record",
  "Signed Evidence Receipt",
  "Transparency log proof",
  "Decision ledger",
  "Evidence and limitation summary",
];

export default function TutorialPage() {
  return (
    <InstitutionalPageShell
      purposeLabel="Tutorial"
      maxWidth="max-w-6xl"
      actions={[
        { label: "Free Review", href: "/free-review", variant: "outline" },
        { label: "Review Options", href: "/software-appraisal", variant: "outline" },
        { label: "Build Report", href: "/software-appraisal", variant: "default" },
      ]}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Free Review", href: "/free-review" },
        { label: "Tutorial" },
      ]}
    >
      <section className="grid min-h-[520px] items-center gap-10 py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <p className="vos-proof-mark">First Run Tutorial</p>
          <h1 className="mt-8 vos-display">How to use VentureOS from scan to evidence review.</h1>
          <p className="mt-7 vos-lede">
            This is the customer path: test a software asset, generate the right evidence review, receive a signed receipt, and share public evidence boundaries.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link href="/free-review" className={buttonClassName({ size: "lg", className: "w-full sm:w-auto" })}>
              Start Tutorial Scan <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/pricing" className={buttonClassName({ variant: "outline", size: "lg", className: "w-full sm:w-auto" })}>
              See Review Options
            </Link>
          </div>
        </div>

        <aside className="vos-panel p-6">
          <p className="vos-label">What Customers Receive</p>
          <div className="mt-5 grid gap-3">
            {customerPacket.map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-md border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] px-3 py-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[rgb(var(--vos-verified))]" />
                <p className="text-sm font-bold text-[rgb(var(--vos-text-muted))]">{item}</p>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {steps.map((step, index) => (
          <article key={step.title} className="vos-panel flex min-h-[330px] flex-col p-6">
            <div className="flex items-center justify-between gap-4">
              <span className="grid h-10 w-10 place-items-center rounded-lg border border-[rgb(var(--vos-border))] text-sm font-black text-[rgb(var(--vos-text))]">
                {index + 1}
              </span>
              <step.icon className="h-5 w-5 text-[rgb(var(--vos-verified))]" />
            </div>
            <h2 className="mt-7 vos-card-title">{step.title}</h2>
            <p className="mt-4 flex-1 vos-body">{step.detail}</p>
            <Link href={step.href} className={buttonClassName({ variant: index === 0 ? "default" : "outline", className: "mt-7 w-full" })}>
              {step.action}
            </Link>
          </article>
        ))}
      </section>
    </InstitutionalPageShell>
  );
}
