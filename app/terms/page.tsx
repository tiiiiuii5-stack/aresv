import { InstitutionalPageShell, InstitutionalPanel } from "@/components/institutional/institutional-shell";

const sections = [
  {
    title: "Service",
    items: [
      "VentureOS provides software scans, verified system reports, signed attestations, evidence receipts, immutable evidence packs, and related technical diligence outputs.",
      "Outputs are evidence summaries and technical analysis. They are not legal, investment, accounting, security certification, or compliance certification advice.",
    ],
  },
  {
    title: "Customer responsibilities",
    items: [
      "You must have the right to submit any repository, source code, metadata, or artifact you provide.",
      "You must not submit secrets, credentials, private keys, regulated personal data, malicious payloads, or unlawful content.",
      "You are responsible for reviewing findings and validating fixes before relying on any launch, sale, purchase, or deployment decision.",
    ],
  },
  {
    title: "Reports and signed attestations",
    items: [
      "Scores and verdicts are limited by submitted evidence scope.",
      "Unknowns and not-claimed sections are part of the report and must not be removed when representing VentureOS output.",
      "Public attestation verification confirms signed payload integrity and registry consistency where available; it does not prove legal ownership or compliance certification.",
    ],
  },
  {
    title: "Report pricing",
    items: [
      "Free Review: $0 limited preview without signed attestation.",
      "Verified System Report: $49.",
      "Buyer-Ready Verified Report: $199.",
      "CTO-assisted review: scoped separately, currently $750-$1,500.",
      "Refund handling is described in the Refund Policy.",
    ],
  },
  {
    title: "Contact",
    items: ["Legal requests: legal@ventureos.ai", "Sales and support: sales@ventureos.ai"],
  },
];

export default function TermsPage() {
  return (
    <InstitutionalPageShell purposeLabel="Terms" maxWidth="max-w-5xl" actions={[{ label: "Privacy", href: "/privacy", variant: "outline" }, { label: "Refunds", href: "/refund", variant: "outline" }]}>
      <div className="grid gap-5">
        <InstitutionalPanel eyebrow="Legal" title="Terms of Service">
          <p className="vos-body">Effective date: June 8, 2026. These terms are written for the current VentureOS verified report and evidence platform.</p>
        </InstitutionalPanel>
        {sections.map((section) => (
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
