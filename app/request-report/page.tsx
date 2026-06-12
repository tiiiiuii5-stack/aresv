import Link from "next/link";

import { VentureOSFooter, VentureOSHeader } from "@/components/institutional/institutional-shell";
import { ReportInterestForm } from "@/components/report-interest-form";
import { buttonClassName } from "@/components/ui/button";

export const metadata = {
  title: "Request a VentureOS Report",
  description: "Request the VentureOS decision report path for software diligence, launch readiness, buyer review, or security review.",
};

export default function RequestReportPage() {
  return (
    <main className="vos-page min-h-screen">
      <VentureOSHeader
        purposeLabel="Request Report"
        actions={[
          { label: "Free Review", href: "/free-review", variant: "default" },
          { label: "Reviewer Invite", href: "/reviewer-invite", variant: "outline" },
          { label: "Sample", href: "/sample-appraisal", variant: "outline" },
        ]}
      />

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-12 pt-32 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-8">
        <div className="vos-panel p-6 sm:p-8">
          <p className="vos-label">Free decision request</p>
          <h1 className="mt-3 vos-h1">Get a software trust decision path without starting at checkout.</h1>
          <p className="mt-4 max-w-3xl vos-body">
            VentureOS helps founders, buyers, investors, and security teams decide whether software should be bought, investigated, or avoided. This page captures real interest in the report path and routes you to the free preview.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              ["Observed", "Direct evidence from the submitted repo or app."],
              ["Inferred", "Reasonable conclusions from the evidence."],
              ["Unknown", "Important facts the evidence cannot prove."],
            ].map(([label, detail]) => (
              <div key={label} className="rounded-lg border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] p-4">
                <p className="text-sm font-black text-[rgb(var(--vos-text))]">{label}</p>
                <p className="mt-2 text-xs font-bold leading-5 text-[rgb(var(--vos-text-muted))]">{detail}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/free-review" className={buttonClassName({ className: "min-h-12 w-full sm:w-auto" })}>
              Start free preview
            </Link>
            <Link href="/sample-appraisal" className={buttonClassName({ variant: "outline", className: "min-h-12 w-full sm:w-auto" })}>
              View sample report
            </Link>
          </div>
        </div>

        <ReportInterestForm />
      </section>

      <VentureOSFooter />
    </main>
  );
}
