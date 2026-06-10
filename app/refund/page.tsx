import { InstitutionalPageShell, InstitutionalPanel } from "@/components/institutional/institutional-shell";

const policy = [
  {
    title: "Free reviews",
    items: ["Free reviews cost $0 and do not issue refunds, signed attestations, or buyer-ready reports."],
  },
  {
    title: "Verified System Reports",
    items: [
      "The Verified System Report is currently free, so no refund is required.",
      "It is not refundable after a signed attestation or public report has been issued, unless required by law or approved by support.",
    ],
  },
  {
    title: "Buyer-ready verified reports",
    items: [
      "The Buyer-Ready Verified Report is currently free, so no refund is required.",
      "Once the report, signed attestation, or badge is issued, refunds are reviewed case by case because the evidence work has been delivered.",
    ],
  },
  {
    title: "Assisted reviews",
    items: [
      "CTO-assisted reviews are scoped manually. Refund terms are handled in the order agreement or invoice.",
      "If no custom terms exist, cancellation before manual work begins may be refunded; work already delivered is not automatically refundable.",
    ],
  },
  {
    title: "How to request a refund",
    items: ["Email sales@ventureos.ai with the checkout email, order date, report type, and reason for the request."],
  },
];

export default function RefundPage() {
  return (
    <InstitutionalPageShell purposeLabel="Refunds" maxWidth="max-w-5xl" actions={[{ label: "Privacy", href: "/privacy", variant: "outline" }, { label: "Terms", href: "/terms", variant: "outline" }]}>
      <div className="grid gap-5">
        <InstitutionalPanel eyebrow="Legal" title="Refund Policy">
          <p className="vos-body">Effective date: June 8, 2026. This page explains how refunds are handled for current VentureOS public offers.</p>
        </InstitutionalPanel>
        {policy.map((section) => (
          <InstitutionalPanel key={section.title} title={section.title}>
            <ul className="grid gap-3">
              {section.items.map((item) => (
                <li key={item} className="vos-cell p-4 text-sm font-bold leading-6 text-[rgb(var(--vos-text-muted))]">{item}</li>
              ))}
            </ul>
          </InstitutionalPanel>
        ))}
      </div>
    </InstitutionalPageShell>
  );
}
