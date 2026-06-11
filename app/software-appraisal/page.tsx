"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, FileText, Lock, ShieldCheck } from "lucide-react";

import { InstitutionalPageShell } from "@/components/institutional/institutional-shell";
import { BuyerJourneyStrip } from "@/components/buyer-journey-strip";
import { StickyConversionBar } from "@/components/sticky-conversion-bar";
import { buttonClassName } from "@/components/ui/button";
import { APPRAISAL_OFFERS } from "@/lib/appraisal/offers";

const reportOutcomes = [
  "Verified System Report",
  "Signed Verification Badge",
  "Immutable Evidence Pack",
  "Verification Registry record",
];

const buyerQuestions = [
  "What evidence was reviewed?",
  "What claims are verified?",
  "What remains unknown?",
  "What risks matter first?",
  "What can a third party verify?",
];

const process = [
  { title: "Choose Report Type", detail: "Select the verified snapshot or buyer-ready report. Both are free during launch." },
  { title: "Provide Evidence", detail: "Add a public repository, uploaded files, pasted source, and review context." },
  { title: "Review & Generate", detail: "Review the selected scope before issuing the report." },
  { title: "Get Report", detail: "Receive the verified report, Signed Verification Badge, and verification link." },
];

const credibilityRules = [
  "No security guarantee.",
  "No compliance certification.",
  "No unsupported valuation claim.",
  "Evidence gaps appear as limitations.",
];

export default function SoftwareAppraisalPage() {
  const verifiedReport = APPRAISAL_OFFERS.find((item) => item.id === "instant") || APPRAISAL_OFFERS[0];
  const buyerReport = APPRAISAL_OFFERS.find((item) => item.id === "buyer-ready") || APPRAISAL_OFFERS[1] || verifiedReport;

  return (
    <InstitutionalPageShell
      purposeLabel="Build Your Verified Report"
      maxWidth="max-w-[1280px]"
      actions={[
        { label: "Free Review", href: "/free-review", variant: "outline" },
        { label: "Sample Report", href: "/sample-appraisal", variant: "outline" },
        { label: "Start Free Intake", href: `/appraisal-intake?offer=${verifiedReport.id}`, variant: "default" },
      ]}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Free Review", href: "/free-review" },
        { label: "Build Your Verified Report" },
      ]}
    >
      <BuyerJourneyStrip current="choose" />
      <section className="grid min-h-[620px] items-center gap-14 py-10 lg:grid-cols-[minmax(0,1fr)_480px]">
        <div>
          <p className="vos-proof-mark">Verified Software Evidence</p>
          <h1 className="mt-8 vos-display">Choose the free report that matches the buyer moment.</h1>
          <p className="mt-8 vos-lede">
            Start with the verified snapshot or use the buyer-ready report when a customer, acquirer, or auditor needs a deeper evidence package. Both are free during launch.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link href={`/appraisal-intake?offer=${verifiedReport.id}`} className={buttonClassName({ size: "lg", className: "w-full sm:w-auto" })}>
              Start Free Intake <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/sample-appraisal" className={buttonClassName({ variant: "outline", size: "lg", className: "w-full sm:w-auto" })}>
              View Sample Report
            </Link>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {reportOutcomes.map((item) => (
              <div key={item} className="vos-cell flex items-center gap-3 p-4">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[rgb(var(--vos-verified))]" />
                <p className="text-sm font-black text-[rgb(var(--vos-text))]">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <aside className="vos-report-preview p-8">
          <p className="vos-label">Recommended upgrade</p>
          <h2 className="mt-4 vos-card-title">Buyer-Ready Verified Report</h2>
          <p className="mt-6 text-5xl font-black text-[rgb(var(--vos-text))]">{buyerReport.priceLabel}</p>
          <p className="mt-5 vos-body">{buyerReport.description}</p>
          <div className="mt-8 grid gap-3">
            {buyerQuestions.map((question) => (
              <div key={question} className="flex items-start gap-3 border-b border-[rgb(var(--vos-border))] pb-3 last:border-b-0 last:pb-0">
                <ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-[rgb(var(--vos-verified))]" />
                <p className="text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">{question}</p>
              </div>
            ))}
          </div>
          <Link href={`/appraisal-intake?offer=${buyerReport.id}`} className={buttonClassName({ className: "mt-8 w-full" })}>
            Start Free Buyer Intake
          </Link>
        </aside>
      </section>

      <section className="vos-section-compact">
        <div className="grid gap-6 lg:grid-cols-3">
          <OfferCard
            title="Free Review"
            price="$0"
            description="Limited evidence preview for early feedback. No Signed Verification Badge or buyer-ready report."
            href="/free-review"
            action="Start Free Review"
            icon={FileText}
          />
          <OfferCard
            title={verifiedReport.name}
            price={verifiedReport.priceLabel}
            description={verifiedReport.description}
            href={`/appraisal-intake?offer=${verifiedReport.id}`}
            action="Start Free Intake"
            icon={Lock}
            highlighted
          />
          <OfferCard
            title={buyerReport.name}
            price={buyerReport.priceLabel}
            description={buyerReport.description}
            href={`/appraisal-intake?offer=${buyerReport.id}`}
            action="Start Free Buyer Intake"
            icon={FileText}
          />
        </div>
      </section>

      <section className="vos-section grid gap-12 lg:grid-cols-[420px_minmax(0,1fr)]">
        <div>
          <p className="vos-label">Report Workflow</p>
          <h2 className="mt-4 vos-section-title">A clear path from source evidence to signed evidence.</h2>
          <p className="mt-5 vos-lede">
            The intake flow is structured to collect enough context for a more defensible report while keeping the customer path understandable.
          </p>
        </div>
        <div className="grid gap-4">
          {process.map((step, index) => (
            <article key={step.title} className="vos-panel flex gap-5 p-6">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[rgb(var(--vos-border))] text-sm font-black text-[rgb(var(--vos-text))]">
                {index + 1}
              </span>
              <div>
                <h3 className="vos-card-title">{step.title}</h3>
                <p className="mt-2 vos-body">{step.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="vos-section-compact">
        <div className="vos-panel grid gap-8 p-8 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div>
            <p className="vos-label">Trust Boundaries</p>
            <h2 className="mt-4 vos-section-title">Professional because it says what it cannot prove.</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {credibilityRules.map((rule) => (
              <div key={rule} className="vos-cell flex items-center gap-3 p-4">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[rgb(var(--vos-verified))]" />
                <p className="text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">{rule}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <StickyConversionBar
        eyebrow="Step 3 of 4"
        title="Choose the report level and submit evidence."
        primaryLabel="Start Free Buyer Intake"
        primaryHref={`/appraisal-intake?offer=${buyerReport.id}`}
        secondaryLabel="Start Free"
        secondaryHref={`/appraisal-intake?offer=${verifiedReport.id}`}
        source="software_appraisal_sticky"
      />
    </InstitutionalPageShell>
  );
}

function OfferCard({
  title,
  price,
  description,
  href,
  action,
  icon: Icon,
  highlighted = false,
}: {
  title: string;
  price: string;
  description: string;
  href: string;
  action: string;
  icon: typeof FileText;
  highlighted?: boolean;
}) {
  return (
    <article className={["vos-panel flex min-h-[380px] flex-col p-8", highlighted ? "border-[rgb(var(--vos-primary))]" : ""].filter(Boolean).join(" ")}>
      <Icon className="h-6 w-6 text-[rgb(var(--vos-verified))]" />
      <h2 className="mt-8 vos-card-title">{title}</h2>
      <p className="mt-6 text-4xl font-black text-[rgb(var(--vos-text))]">{price}</p>
      <p className="mt-5 flex-1 vos-body">{description}</p>
      <Link href={href} className={buttonClassName({ variant: highlighted ? "default" : "outline", className: "mt-8 w-full" })}>
        {action}
      </Link>
    </article>
  );
}
