import { InstitutionalPageShell, InstitutionalPanel } from "@/components/institutional/institutional-shell";

const sections = [
  {
    title: "Information collected",
    items: [
      "Contact details you submit, such as email address and use case.",
      "Software source or repository metadata you submit for review.",
      "Scan results, evidence summaries, SBOM dependency summaries, signed evidence receipt records, and immutable evidence pack metadata.",
      "Product telemetry such as page views, scan starts, feedback submissions, and API usage events.",
    ],
  },
  {
    title: "How information is used",
    items: [
      "Generate software reviews, evidence-scoped reports, signed evidence receipts, SBOM summaries, and evidence packs.",
      "Operate billing, API metering, product support, abuse prevention, and reliability checks.",
      "Improve scanner accuracy and product workflows using compact metadata.",
    ],
  },
  {
    title: "Submission boundaries",
    items: [
      "Do not submit secrets, private keys, passwords, tokens, regulated personal data, or code you are not authorized to submit.",
      "Free reviews are capped and intended for public repos or small code samples.",
      "Public report and receipt pages may expose asset names, scores, evidence scope, SBOM summary fields, receipt IDs, and signature metadata.",
    ],
  },
  {
    title: "Contact",
    items: ["Privacy and legal requests: legal@ventureos.ai", "Sales and account questions: sales@ventureos.ai"],
  },
];

export default function PrivacyPage() {
  return (
    <InstitutionalPageShell purposeLabel="Privacy" maxWidth="max-w-5xl" actions={[{ label: "Terms", href: "/terms", variant: "outline" }, { label: "Refunds", href: "/refund", variant: "outline" }]}>
      <LegalPage title="Privacy Policy" effective="June 8, 2026" sections={sections} />
    </InstitutionalPageShell>
  );
}

function LegalPage({ title, effective, sections }: { title: string; effective: string; sections: Array<{ title: string; items: string[] }> }) {
  return (
    <div className="grid gap-5">
      <InstitutionalPanel eyebrow="Legal" title={title}>
        <p className="vos-body">Effective date: {effective}. This policy describes the current VentureOS product surface and may be updated as the service changes.</p>
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
  );
}
