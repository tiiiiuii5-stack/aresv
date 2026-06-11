import Link from "next/link";

import { InstitutionalPageShell, InstitutionalPanel } from "@/components/institutional/institutional-shell";
import { buttonClassName } from "@/components/ui/button";

const facts = [
  { label: "Product", value: "Evidence-scoped software reviews, signed evidence receipts, and technical diligence infrastructure." },
  { label: "Customers", value: "Founders, buyers, agencies, technical diligence teams, and software marketplaces." },
  { label: "Contact", value: "sales@ventureos.ai" },
  { label: "Legal contact", value: "legal@ventureos.ai" },
  { label: "Operating location", value: "United States, remote-first." },
  { label: "Mailing address", value: "Provided in customer order paperwork and vendor onboarding. Not publicly listed on this site yet." },
];

const principles = [
  "Evidence is separated from interpretation.",
  "Unsupported claims are shown as unknown or not claimed.",
  "Free reviews are clearly scoped and do not overclaim missing evidence.",
  "Evidence reviews show scope, limitations, confidence, and public receipt links.",
];

export default function AboutPage() {
  return (
    <InstitutionalPageShell
      purposeLabel="Company"
      maxWidth="max-w-5xl"
      actions={[
        { label: "Review Options", href: "/software-appraisal", variant: "outline" },
        { label: "Free Review", href: "/free-review", variant: "outline" },
        { label: "Build Report", href: "/software-appraisal", variant: "default" },
      ]}
    >
      <div className="grid gap-5">
        <InstitutionalPanel eyebrow="About VentureOS" title="Software evidence reviews for due diligence.">
          <p className="max-w-3xl vos-body">
            VentureOS helps software owners and reviewers understand what was submitted, what evidence exists, what risks were found, what can be observed, and what remains unknown. It is not a law firm, accounting firm, valuation bank, security auditor, or compliance auditor.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {facts.map((fact) => (
              <div key={fact.label} className="vos-cell p-4">
                <p className="vos-label">{fact.label}</p>
                <p className="mt-2 text-sm font-bold leading-6 text-[rgb(var(--vos-text))]">{fact.value}</p>
              </div>
            ))}
          </div>
        </InstitutionalPanel>

        <InstitutionalPanel eyebrow="Trust Rules" title="How VentureOS avoids fake diligence output.">
          <div className="grid gap-3 sm:grid-cols-2">
            {principles.map((principle) => (
              <p key={principle} className="vos-cell p-4 text-sm font-bold leading-6 text-[rgb(var(--vos-text-muted))]">{principle}</p>
            ))}
          </div>
        </InstitutionalPanel>

        <InstitutionalPanel eyebrow="Commercial Terms" title="Current public offers">
          <div className="grid gap-3 sm:grid-cols-3">
            <Price title="Free Review" price="$0" detail="Limited public repo or code sample review." />
            <Price title="Evidence Review Report" price="$0" detail="Automated evidence review and signed evidence receipt." />
            <Price title="Buyer Evidence Review" price="$0" detail="Buyer-facing review, fix plan, confidence levels, and signed evidence receipt." />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/privacy" className={buttonClassName({ variant: "outline" })}>Privacy</Link>
            <Link href="/terms" className={buttonClassName({ variant: "outline" })}>Terms</Link>
            <Link href="/refund" className={buttonClassName({ variant: "outline" })}>Refund Policy</Link>
          </div>
        </InstitutionalPanel>
      </div>
    </InstitutionalPageShell>
  );
}

function Price({ title, price, detail }: { title: string; price: string; detail: string }) {
  return (
    <div className="vos-cell p-4">
      <p className="vos-label">{title}</p>
      <p className="mt-2 text-2xl font-black text-[rgb(var(--vos-text))]">{price}</p>
      <p className="mt-2 vos-body">{detail}</p>
    </div>
  );
}
