import Link from "next/link";

import { VentureOSFooter, VentureOSHeader } from "@/components/institutional/institutional-shell";
import { ReportInterestForm } from "@/components/report-interest-form";
import { CopyButton } from "@/components/ui/copy-button";
import { buttonClassName } from "@/components/ui/button";
import { canonicalAppUrl } from "@/lib/appraisal/app-url";

export const metadata = {
  title: "Review VentureOS",
  description: "Help validate VentureOS by requesting the report path and running a free software trust preview.",
  openGraph: {
    title: "Review VentureOS",
    description: "Run a free software trust preview and tell us if the decision memo is useful for buyer diligence.",
    url: "/reviewer-invite",
  },
};

const sampleRepo = "https://github.com/tiiiiuii5-stack/aresv.git";

const proofSteps = [
  "Leave a real email if you want the report path or human review option.",
  "Run the free decision preview on the sample repo or your own public repo.",
  "If useful, click Generate Buyer Report so VentureOS can measure conversion intent.",
];

export default function ReviewerInvitePage() {
  const origin = appOrigin();
  const samplePreview = trackedReviewUrl(origin, "reviewer_invite", "reviewer_invite_sample", sampleRepo);
  const ownRepoRequest = `${origin}/request-report?campaign=reviewer_invite&ref=reviewer_invite&utm_source=reviewer_invite`;
  const message = [
    "Can you test VentureOS and tell me if the software trust decision is useful?",
    "1. Leave an email if you want the report path.",
    "2. Run the free preview.",
    "3. Click Generate Buyer Report if the result is useful.",
    `${origin}/reviewer-invite?campaign=reviewer_invite&ref=direct_share&utm_source=reviewer_invite`,
  ].join("\n");

  return (
    <main className="vos-page min-h-screen">
      <VentureOSHeader
        purposeLabel="Reviewer Invite"
        actions={[
          { label: "Request Report", href: "/request-report", variant: "default" },
          { label: "Launch Kit", href: "/launch-kit", variant: "outline" },
        ]}
      />

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-12 pt-32 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-8">
        <section className="vos-panel p-6 sm:p-8">
          <p className="vos-label">Real reviewer path</p>
          <h1 className="mt-3 vos-h1">Help validate VentureOS with one real software trust review.</h1>
          <p className="mt-4 max-w-3xl vos-body">
            VentureOS still needs real customer-demand proof. This page is the clean path for founders, buyers, investors, operators, and security reviewers to test the product without being counted as synthetic traffic.
          </p>

          <div className="mt-6 grid gap-3">
            {proofSteps.map((step, index) => (
              <div key={step} className="flex gap-3 rounded-lg border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] p-4">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[rgb(var(--vos-primary))] text-sm font-black text-[rgb(var(--vos-primary-text))]">{index + 1}</span>
                <p className="text-sm font-bold leading-6 text-[rgb(var(--vos-text-muted))]">{step}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link href={samplePreview} className={buttonClassName({ size: "lg", className: "w-full" })}>
              Run sample preview
            </Link>
            <Link href={ownRepoRequest} className={buttonClassName({ variant: "outline", size: "lg", className: "w-full" })}>
              Use my own repo
            </Link>
          </div>

          <div className="mt-6 rounded-lg border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] p-4">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-normal text-[rgb(var(--vos-text-muted))]">
              Message to send
            </p>
            <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-[rgb(var(--vos-border))] bg-black/25 p-3 text-xs font-bold leading-5 text-[rgb(var(--vos-text-muted))]">{message}</pre>
            <CopyButton value={message} label="Copy invite message" className="vos-button vos-button-outline vos-button-sm mt-3 w-full" />
          </div>
        </section>

        <aside className="grid content-start gap-4">
          <ReportInterestForm />
          <div className="vos-panel p-5">
            <p className="vos-label">What counts</p>
            <div className="mt-4 grid gap-3">
              <Rule title="Real people count" detail="Normal browser sessions and real emails count toward customer-demand proof." />
              <Rule title="Bots do not count" detail="Synthetic tests, monitoring, curl, and obvious bots are tracked but excluded." />
              <Rule title="Proof stays conservative" detail="The enterprise gate only passes at 10 real preview users or 3 captured real leads." />
            </div>
          </div>
        </aside>
      </section>

      <VentureOSFooter />
    </main>
  );
}

function Rule({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] p-3">
      <p className="flex items-center gap-2 text-sm font-black text-[rgb(var(--vos-text))]">
        {title}
      </p>
      <p className="mt-2 text-xs font-bold leading-5 text-[rgb(var(--vos-text-muted))]">{detail}</p>
    </div>
  );
}

function trackedReviewUrl(origin: string, campaign: string, source: string, repo: string) {
  const url = new URL("/t", origin);
  url.searchParams.set("e", "homepage.free_review_clicked");
  url.searchParams.set("source", source);
  url.searchParams.set("to", "/free-review");
  url.searchParams.set("repo", repo);
  url.searchParams.set("framework", "nextjs");
  url.searchParams.set("campaign", campaign);
  url.searchParams.set("utm_source", source);
  return url.toString();
}

function appOrigin() {
  try {
    return canonicalAppUrl();
  } catch {
    return "https://ventureos-full-fixed.vercel.app";
  }
}
