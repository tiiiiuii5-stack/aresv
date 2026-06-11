import type { Metadata } from "next";

import { AppraisalIntakeClient } from "@/components/appraisal-intake-client";
import { BuyerJourneyStrip } from "@/components/buyer-journey-strip";
import { InstitutionalPageShell } from "@/components/institutional/institutional-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Build Your Evidence Review | VentureOS",
  description: "Submit software evidence, generate an evidence-scoped review, and issue a signed evidence receipt.",
};

type AppraisalIntakePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AppraisalIntakePage({ searchParams }: AppraisalIntakePageProps) {
  const params = await searchParams;
  return (
    <InstitutionalPageShell
      purposeLabel="Build Your Evidence Review"
      actions={[
        { label: "Plans", href: "/software-appraisal", variant: "outline" },
        { label: "Sample Report", href: "/sample-appraisal", variant: "outline" },
        { label: "Free Review", href: "/free-review", variant: "outline" },
      ]}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Free Review", href: "/free-review" },
        { label: "Build Your Evidence Review" },
      ]}
    >
      <div className="grid gap-5">
        <BuyerJourneyStrip current="evidence" />
        <AppraisalIntakeClient
          checkoutStatus={firstValue(params.checkout)}
          initialOffer={firstValue(params.offer)}
          sessionId={firstValue(params.session_id)}
          initialRepositoryUrl={firstValue(params.repo)}
          initialFramework={firstValue(params.framework)}
        />
      </div>
    </InstitutionalPageShell>
  );
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
