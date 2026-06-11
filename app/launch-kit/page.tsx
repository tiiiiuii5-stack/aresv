import Link from "next/link";

import { VentureOSFooter, VentureOSHeader } from "@/components/institutional/institutional-shell";
import { CopyButton } from "@/components/ui/copy-button";
import { loadProductFunnelMetrics } from "@/lib/analytics/product-funnel-store";
import { loadWaitlistLeadMetrics } from "@/lib/analytics/waitlist-lead-store";
import { canonicalAppUrl } from "@/lib/appraisal/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sampleRepo = "https://github.com/tiiiiuii5-stack/aresv.git";

export const metadata = {
  title: "VentureOS Launch Kit",
  description: "Campaign links and live proof counters for real VentureOS demand and conversion validation.",
};

export default async function LaunchKitPage() {
  const [funnel, leads] = await Promise.all([
    loadProductFunnelMetrics(),
    loadWaitlistLeadMetrics(),
  ]);
  const origin = appOrigin();
  const links = campaignLinks(origin);
  const demandNeeded = Math.max(0, 3 - leads.total);
  const previewNeeded = Math.max(0, 10 - funnel.uniqueReal.previewStarted);
  const conversionNeeded = funnel.uniqueReal.previewToCheckoutPath > 0 ? 0 : 1;

  return (
    <main className="vos-page min-h-screen">
      <VentureOSHeader
        purposeLabel="Launch Kit"
        actions={[
          { label: "Free Review", href: "/free-review", variant: "default" },
          { label: "Growth", href: "/admin/growth", variant: "outline" },
        ]}
      />

      <section className="mx-auto w-full max-w-6xl px-4 pb-12 pt-32 sm:px-6 lg:px-8">
        <section className="vos-panel p-6 sm:p-8">
          <p className="vos-label">Proof Kit</p>
          <h1 className="mt-3 vos-h1">Get the real people proof VentureOS still needs.</h1>
          <p className="mt-4 max-w-3xl vos-body">
            These links are for real founders, buyers, operators, and security reviewers. Bot traffic and synthetic tests are tracked but excluded from enterprise proof.
          </p>
        </section>

        <section className="mt-6 grid gap-3 md:grid-cols-3">
          <Metric
            label="Captured real leads"
            value={leads.total}
            detail={demandNeeded === 0 ? "Demand proof can pass from leads." : `${demandNeeded} more real email(s) needed.`}
            ready={leads.total >= 3}
          />
          <Metric
            label="Real preview visitors"
            value={funnel.uniqueReal.previewStarted}
            detail={previewNeeded === 0 ? "Preview demand threshold met." : `${previewNeeded} more real preview visitor(s) needed.`}
            ready={funnel.uniqueReal.previewStarted >= 10}
          />
          <Metric
            label="Preview to checkout"
            value={funnel.uniqueReal.previewToCheckoutPath}
            detail={conversionNeeded === 0 ? "Conversion proof path exists." : "Need 1 real visitor to scan, then start checkout."}
            ready={funnel.uniqueReal.previewToCheckoutPath > 0}
          />
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          {links.map((link) => (
            <article key={link.label} className="vos-panel p-5">
              <p className="vos-label">{link.label}</p>
              <h2 className="mt-2 text-xl font-black text-[rgb(var(--vos-text))]">{link.title}</h2>
              <p className="mt-2 min-h-16 text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">{link.detail}</p>
              <a href={link.href} className="mt-4 block truncate rounded-lg border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] px-3 py-2 font-mono text-xs font-bold text-[rgb(var(--vos-verified))]" title={link.href}>
                {link.href}
              </a>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <CopyButton value={link.href} label="Copy link" className="vos-button vos-button-outline vos-button-sm w-full" />
                <Link href={link.href} className="vos-button vos-button-default vos-button-sm w-full">
                  Open
                </Link>
              </div>
              <div className="mt-3">
                <CopyButton value={link.message} label="Copy message" className="vos-button vos-button-outline vos-button-sm w-full" />
              </div>
            </article>
          ))}
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="vos-panel p-5">
            <p className="vos-label">What to send</p>
            <div className="mt-4 grid gap-3">
              {[
                "Send the founder link to 10 founders with public repos.",
                "Ask 3 people to leave their real email if they want the report path.",
                "Ask 1 person to run a preview and click Generate Buyer Report. They do not need to complete payment for conversion intent proof.",
              ].map((step, index) => (
                <div key={step} className="flex gap-3 rounded-lg border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] p-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[rgb(var(--vos-primary))] text-sm font-black text-[rgb(var(--vos-primary-text))]">{index + 1}</span>
                  <p className="text-sm font-bold leading-6 text-[rgb(var(--vos-text-muted))]">{step}</p>
                </div>
              ))}
            </div>
          </div>

          <aside className="vos-panel p-5">
            <p className="vos-label">Live status</p>
            <div className="mt-4 grid gap-3 text-sm font-bold text-[rgb(var(--vos-text-muted))]">
              <StatusRow label="Lead store" value={leads.available ? "Live" : "Unavailable"} ready={leads.available} />
              <StatusRow label="Demand proof" value={leads.total >= 3 || funnel.uniqueReal.previewStarted >= 10 ? "Proven" : "Not proven"} ready={leads.total >= 3 || funnel.uniqueReal.previewStarted >= 10} />
              <StatusRow label="Conversion proof" value={funnel.uniqueReal.previewToCheckoutPath > 0 ? "Proven" : "Not proven"} ready={funnel.uniqueReal.previewToCheckoutPath > 0} />
            </div>
          </aside>
        </section>
      </section>

      <VentureOSFooter />
    </main>
  );
}

function campaignLinks(origin: string) {
  const founder = trackedReviewUrl(origin, "founder_outreach", "founder_dm", sampleRepo);
  const buyer = trackedReviewUrl(origin, "buyer_review", "buyer_email", sampleRepo);
  const directLead = `${origin}/?campaign=lead_capture&ref=direct_outreach&utm_source=launch_kit`;
  return [
    {
      label: "Founder link",
      title: "Run the sample decision preview",
      detail: "Best for founders and builders who need to see the output immediately.",
      href: founder,
      message: `I am testing VentureOS, a software trust decision system. Can you open this and run the free preview? ${founder}`,
    },
    {
      label: "Buyer link",
      title: "Review a buyer-style software memo",
      detail: "Best for operators, investors, buyers, and security reviewers.",
      href: buyer,
      message: `Can you review this VentureOS software decision preview and tell me if it is useful for buyer diligence? ${buyer}`,
    },
    {
      label: "Lead link",
      title: "Capture report-path interest",
      detail: "Best when someone is interested but not ready to scan a repo yet.",
      href: directLead,
      message: `If you want the VentureOS report path or human review option, leave your email here: ${directLead}`,
    },
  ];
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

function Metric({ label, value, detail, ready }: { label: string; value: number; detail: string; ready: boolean }) {
  return (
    <article className="vos-panel p-4">
      <p className="vos-label">{label}</p>
      <p className={["mt-3 text-4xl font-black", ready ? "text-[rgb(var(--vos-verified))]" : "text-[rgb(var(--vos-text))]"].join(" ")}>{value}</p>
      <p className="mt-2 text-xs font-bold leading-5 text-[rgb(var(--vos-text-muted))]">{detail}</p>
    </article>
  );
}

function StatusRow({ label, value, ready }: { label: string; value: string; ready: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] p-3">
      <span>{label}</span>
      <span className={ready ? "text-[rgb(var(--vos-verified))]" : "text-[rgb(var(--vos-warning))]"}>{value}</span>
    </div>
  );
}
