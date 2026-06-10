import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { VentureOSHeader } from "@/components/institutional/institutional-shell";
import { PassportDecisionPanel } from "@/components/passport/decision-panel";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { loadPassportDecisionSummary, type PassportDecisionSummary } from "@/lib/passport/decision-log";
import { loadVentureOSPassport, type VentureOSPassport } from "@/lib/registry/software-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const passport = await loadVentureOSPassport(decodeURIComponent(id || ""));
  if (!passport) return { title: "VentureOS Passport" };
  return {
    title: `${passport.asset.name} Software Passport`,
    description: `${passport.asset.name} is registered as ${passport.asset.ventureOsId} with trust score ${passport.asset.trustScore}/100.`,
  };
}

export default async function VentureOSPassportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const passport = await loadVentureOSPassport(decodeURIComponent(id || ""));
  if (!passport) notFound();

  const decision = decisionFor(passport);
  const decisionSummary = await loadPassportDecisionSummary(passport.asset.ventureOsId);

  return (
    <main className="vos-page min-h-screen">
      <VentureOSHeader
        purposeLabel="Software Passport"
        actions={[
          { label: "Registry", href: "/registry", variant: "outline" },
          { label: "Trust Graph", href: `/registry/${encodeURIComponent(passport.asset.ventureOsId)}`, variant: "outline" },
          { label: "Buyer Report", href: `/passport/${encodeURIComponent(passport.asset.ventureOsId)}/report`, variant: "outline" },
          { label: "Verify", href: passport.asset.publicVerificationUrl, variant: "default" },
        ]}
      />

      <section className="mx-auto w-full max-w-[1280px] px-4 pb-12 pt-28 sm:px-6 lg:px-8">
        <PassportHeader passport={passport} decisionSummary={decisionSummary} />

        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <DecisionPanel passport={passport} decision={decision} />
          <ActionPanel passport={passport} />
        </section>

        <section className="mt-6">
          <PassportDecisionPanel passportId={passport.asset.ventureOsId} initialSummary={decisionSummary} />
        </section>

        <section className="mt-6 grid gap-3 md:grid-cols-3">
          <TopScore label="Trust" value={passport.asset.trustScore} detail="Overall confidence" />
          <TopScore label="Quality" value={qualityScore(passport)} detail={qualityVerdict(passport)} />
          <TopScore label="Safety" value={safetyScore(passport)} detail={safetyVerdict(passport)} />
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <PassportDomain
            title="Quality Passport"
            summary="This section evaluates whether the software can be built, operated, maintained, and supported in production."
            rows={[
              ["Build Quality", buildQualityScore(passport), "Builds, dependencies, compilation, versioning"],
              ["Reliability", reliabilityScore(passport), "Error handling, retries, health checks, logging"],
              ["Maintainability", maintainabilityScore(passport), "Code organization, documentation, tests, dependency hygiene"],
              ["Operational Maturity", operationalMaturityScore(passport), "CI/CD, rollback, monitoring, alerts"],
            ]}
          />
          <PassportDomain
            title="Safety Passport"
            summary="This section evaluates whether the software can be trusted with identity, access, data, integrations, and deployment controls."
            rows={[
              ["Identity Safety", identityScore(passport), "Domain, repository, organization, ownership signals"],
              ["Access Safety", accessSafetyScore(passport), "Authentication, authorization, roles, sessions"],
              ["Data Safety", dataSafetyScore(passport), "Encryption, database controls, tenant isolation, backups"],
              ["Integration Safety", integrationSafetyScore(passport), "API security, secrets, webhooks, third-party risk"],
              ["Deployment Safety", deploymentSafetyScore(passport), "Environment separation, secrets handling, infrastructure controls"],
            ]}
          />
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <Panel title="Buyer Notes" marker="BUYER">
            <div className="grid gap-4 md:grid-cols-3">
              <BuyerNote title="Quality Summary" body={qualitySummary(passport)} />
              <BuyerNote title="Safety Summary" body={safetySummary(passport)} />
              <BuyerNote title="Recommended Use" body={recommendedUse(passport)} />
            </div>
          </Panel>
          <Panel title="Certificate Seals" marker="SEALS">
            <div className="grid gap-2">
              {certificateSeals(passport).map((seal) => (
                <div key={seal.label} className="flex items-center justify-between gap-3 border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] px-3 py-2">
                  <p className="text-sm font-black text-[rgb(var(--vos-text))]">{seal.label}</p>
                  <Badge variant={seal.state === "verified" ? "ready" : seal.state === "pending" ? "risky" : "muted"}>{seal.text}</Badge>
                </div>
              ))}
            </div>
          </Panel>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-5">
          <TrustCategory
            title="Identity Confidence"
            question="Can we prove where this software came from?"
            score={identityScore(passport)}
            evidence={passport.asset.repository ? 4 : 2}
            narrative={passport.asset.repository ? "Repository origin and asset identity are linked to this passport." : "Identity is registered, but repository origin needs more external evidence."}
          />
          <TrustCategory
            title="Operational Reliability"
            question="Can we trust this software to function consistently?"
            score={passport.asset.readinessScore}
            evidence={passport.timeline.length}
            narrative="Readiness is computed from submitted evidence, appraisal output, and the latest verification record."
          />
          <TrustCategory
            title="Security Confidence"
            question="Can we trust it to protect systems and data?"
            score={securityScore(passport)}
            evidence={passport.asset.certificateId ? 5 : 2}
            narrative={passport.asset.certificateId ? "Certificate issuance indicates the current evidence passed VentureOS signing gates." : "Security confidence remains limited until certificate evidence is issued."}
          />
          <TrustCategory
            title="Maintenance Confidence"
            question="Can we trust it to remain healthy over time?"
            score={maintenanceScore(passport)}
            evidence={passport.timeline.length}
            narrative={passport.improvement.direction === "IMPROVING" ? "Trust movement is improving across the recorded timeline." : "Maintenance confidence depends on continued verification updates."}
          />
          <TrustCategory
            title="Organizational Confidence"
            question="Can we trust the team behind it?"
            score={organizationScore(passport)}
            evidence={passport.asset.company ? 3 : 1}
            narrative={passport.asset.company ? "The software has a named organization record in the registry." : "Organizational evidence is limited in the current passport."}
          />
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <Panel title="Software Timeline" marker="TIMELINE">
            <div className="grid gap-3">
              {passport.timeline.length ? passport.timeline.map((item, index) => {
                const previous = passport.timeline[index - 1]?.readinessScore;
                const delta = previous == null ? 0 : item.readinessScore - previous;
                return (
                  <Link key={item.id} href={item.href} className="block border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] p-4 transition hover:border-[rgb(var(--vos-border-strong))]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs font-black uppercase text-[rgb(var(--vos-text-subtle))]">{formatDate(item.timestamp)}</p>
                      <Badge variant={item.status === "VERIFIED" ? "ready" : "muted"}>{item.type}</Badge>
                    </div>
                    <p className="mt-3 text-sm font-black text-[rgb(var(--vos-text))]">
                      Trust score {previous == null ? item.readinessScore : `${previous} -> ${item.readinessScore}`}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-[rgb(var(--vos-text-muted))]">
                      Reason: {delta > 0 ? "Verification confidence increased." : delta < 0 ? "Risk or evidence limitations changed." : item.label}
                    </p>
                  </Link>
                );
              }) : (
                <p className="vos-body">No timeline entries are available for this passport yet.</p>
              )}
            </div>
          </Panel>

          <Panel title="Software DNA" marker="DNA">
            <DnaRow label="Origin" value={passport.asset.repository || passport.asset.domain || "Registered software asset"} />
            <DnaRow label="Ownership" value={passport.asset.company || "Ownership evidence limited"} />
            <DnaRow label="Architecture" value={passport.asset.evidenceCoverageLevel} />
            <DnaRow label="Deployment Sources" value={passport.asset.domain || "Not verified"} />
            <DnaRow label="Dependencies" value="Linked through appraisal evidence" />
            <DnaRow label="Verification Chain" value={passport.asset.certificateId || passport.asset.appraisalPublicId} />
          </Panel>
        </section>

        <section className="mt-6">
          <Panel title="Risk Intelligence" marker="RISK">
            <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div className="border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] p-5">
                <p className="vos-label">Risk Level</p>
                <p className="mt-3 text-3xl font-black text-[rgb(var(--vos-text))]">{riskLevel(passport)}</p>
              </div>
              <div className="border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] p-5">
                <p className="text-base font-black text-[rgb(var(--vos-text))]">Recommended Action</p>
                <p className="mt-3 vos-body">{decision.recommendation}</p>
                <p className="mt-4 text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">
                  This passport reports observed and computed trust signals. Independent legal, compliance, security, accounting, or investment validation may still be required.
                </p>
              </div>
            </div>
          </Panel>
        </section>
      </section>
    </main>
  );
}

function PassportHeader({ passport, decisionSummary }: { passport: VentureOSPassport; decisionSummary: PassportDecisionSummary }) {
  return (
    <section className="vos-panel p-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-primary))] text-2xl font-black text-[rgb(var(--vos-primary-text))]">
            {passport.asset.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={passport.asset.status === "VERIFIED" ? "ready" : "muted"}>{passport.asset.status}</Badge>
              <Badge variant="outline">{passport.asset.ventureOsId}</Badge>
              <Badge variant="muted">{monitoringStatus(passport)}</Badge>
            </div>
            <h1 className="mt-3 break-words vos-h1">{passport.asset.name}</h1>
            <p className="mt-2 text-sm font-bold text-[rgb(var(--vos-text-muted))]">{passport.asset.company || "Organization evidence limited"}</p>
          </div>
        </div>
        <div className="grid gap-2 text-sm font-bold text-[rgb(var(--vos-text-muted))] sm:grid-cols-2 lg:w-[520px]">
          <Meta label="Trusted for Production" value={decisionSummary.currentStatus.trustedForProduction ? "YES" : "NO"} />
          <Meta label="Last Decision" value={formatDecision(decisionSummary.currentStatus.lastDecision)} />
          <Meta label="Decision Confidence" value={decisionSummary.currentStatus.decisionConfidence} />
          <Meta label="Trust Drift" value={formatDrift(decisionSummary.currentStatus.trustDrift)} />
          <Meta label="Based On" value={`${decisionSummary.counts.approvals} approvals, ${decisionSummary.counts.rejections} rejections, ${decisionSummary.counts.productionUses} production uses`} />
          <Meta label="Passport ID" value={passport.asset.ventureOsId} />
        </div>
      </div>
    </section>
  );
}

function DecisionPanel({ passport, decision }: { passport: VentureOSPassport; decision: ReturnType<typeof decisionFor> }) {
  return (
    <section className="border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel))] p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-7 w-7 place-items-center rounded-full border border-[rgb(var(--vos-verified))] text-xs font-black text-[rgb(var(--vos-verified))]">OK</span>
        <Badge variant={decision.badge}>{decision.status}</Badge>
        <Badge variant="muted">Confidence: {decision.confidence}</Badge>
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_220px] md:items-end">
        <div>
          <p className="text-6xl font-black leading-none text-[rgb(var(--vos-text))]">{decision.status}</p>
          <p className="mt-4 max-w-2xl text-lg font-semibold leading-8 text-[rgb(var(--vos-text-muted))]">{decision.summary}</p>
        </div>
        <div className="grid gap-2">
          <MiniDecisionMetric label="Quality" value={qualityScore(passport)} />
          <MiniDecisionMetric label="Safety" value={safetyScore(passport)} />
          <MiniDecisionMetric label="Trust" value={passport.asset.trustScore} />
        </div>
      </div>
      <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {decision.recommendedFor.map((item) => (
          <div key={item} className="flex items-center gap-2 border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] px-3 py-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[rgb(var(--vos-verified))]" />
            <p className="text-sm font-black text-[rgb(var(--vos-text))]">{item}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function MiniDecisionMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4 border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] px-4 py-3">
      <p className="vos-label">{label}</p>
      <p className="text-3xl font-black text-[rgb(var(--vos-text))]">{value}</p>
    </div>
  );
}

function TopScore({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <article className="border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel))] p-5">
      <p className="vos-label">{label} Score</p>
      <div className="mt-3 flex items-end justify-between gap-4">
        <p className="text-5xl font-black text-[rgb(var(--vos-text))]">{value}</p>
        <Badge variant={value >= 85 ? "ready" : value >= 70 ? "risky" : "blocked"}>{scoreBand(value)}</Badge>
      </div>
      <p className="mt-3 text-sm font-bold text-[rgb(var(--vos-text-muted))]">{detail}</p>
    </article>
  );
}

function PassportDomain({
  title,
  summary,
  rows,
}: {
  title: string;
  summary: string;
  rows: Array<[string, number, string]>;
}) {
  return (
    <section className="border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel))]">
      <div className="border-b border-[rgb(var(--vos-border))] p-5">
        <p className="vos-label">{title}</p>
        <p className="mt-3 text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">{summary}</p>
      </div>
      <div className="grid gap-0">
        {rows.map(([label, score, checks]) => (
          <div key={label} className="grid gap-3 border-b border-[rgb(var(--vos-border))] p-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_96px] sm:items-center">
            <div>
              <p className="text-base font-black text-[rgb(var(--vos-text))]">{label}</p>
              <p className="mt-1 text-xs font-bold text-[rgb(var(--vos-text-muted))]">{checks}</p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-3xl font-black text-[rgb(var(--vos-text))]">{score}</p>
              <p className="text-[11px] font-black uppercase text-[rgb(var(--vos-text-subtle))]">{scoreBand(score)}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BuyerNote({ title, body }: { title: string; body: string }) {
  return (
    <article className="border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] p-4">
      <p className="text-sm font-black text-[rgb(var(--vos-text))]">{title}</p>
      <p className="mt-3 text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">{body}</p>
    </article>
  );
}

function ActionPanel({ passport }: { passport: VentureOSPassport }) {
  const actions = [
    ["Approve Software", passport.asset.publicVerificationUrl],
    ["Reject Software", `/appraisal-intake?offer=buyer-ready&assetId=${encodeURIComponent(passport.asset.ventureOsId)}`],
    ["Flag For Review", `/appraisal-intake?offer=buyer-ready&assetId=${encodeURIComponent(passport.asset.ventureOsId)}`],
    ["Open Buyer Report", `/passport/${encodeURIComponent(passport.asset.ventureOsId)}/report`],
    ["Share Passport", passport.asset.passportUrl],
    ["Export Passport", passport.asset.appraisalUrl],
    ["Track Continuously", `/registry/${encodeURIComponent(passport.asset.ventureOsId)}`],
    ["Request Independent Assessment", "/software-appraisal"],
  ] as const;
  return (
    <section className="border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel))] p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-5 w-5 place-items-center rounded border border-[rgb(var(--vos-border))] text-[10px] font-black text-[rgb(var(--vos-verified))]">A</span>
        <h2 className="text-base font-black text-[rgb(var(--vos-text))]">Decision Actions</h2>
      </div>
      <div className="mt-5 grid gap-2">
        {actions.map(([label, href], index) => (
          <Link key={label} href={href} className={buttonClassName({ variant: index === 0 ? "default" : "outline", className: "w-full justify-center" })}>
            {label}
          </Link>
        ))}
      </div>
    </section>
  );
}

function TrustCategory({ title, question, score, evidence, narrative }: { title: string; question: string; score: number; evidence: number; narrative: string }) {
  const confidence = score >= 85 ? "HIGH" : score >= 70 ? "MODERATE" : "LIMITED";
  return (
    <article className="border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel))] p-5">
      <p className="vos-label">{title}</p>
      <p className="mt-3 text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">{question}</p>
      <div className="mt-5 flex items-end justify-between gap-4">
        <p className="text-4xl font-black text-[rgb(var(--vos-text))]">{score}</p>
        <Badge variant={score >= 85 ? "ready" : score >= 70 ? "risky" : "muted"}>{confidence}</Badge>
      </div>
      <p className="mt-4 text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">{narrative}</p>
      <p className="mt-4 text-xs font-black uppercase text-[rgb(var(--vos-text-subtle))]">Evidence count: {evidence}</p>
    </article>
  );
}

function Panel({ title, marker, children }: { title: string; marker: string; children: ReactNode }) {
  return (
    <section className="border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel))]">
      <div className="flex items-center gap-3 border-b border-[rgb(var(--vos-border))] p-4">
        <span className="text-[10px] font-black uppercase text-[rgb(var(--vos-verified))]">{marker}</span>
        <h2 className="text-base font-black text-[rgb(var(--vos-text))]">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function DnaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[rgb(var(--vos-border))] py-3 first:pt-0 last:border-b-0 last:pb-0">
      <p className="text-xs font-black uppercase text-[rgb(var(--vos-text-subtle))]">{label}</p>
      <p className="max-w-[260px] text-right text-sm font-black text-[rgb(var(--vos-text))]">{value}</p>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] p-3">
      <p className="text-[11px] font-black uppercase text-[rgb(var(--vos-text-subtle))]">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-[rgb(var(--vos-text))]">{value}</p>
    </div>
  );
}

function decisionFor(passport: VentureOSPassport) {
  if (passport.asset.status === "VERIFIED" && passport.asset.trustScore >= 85) {
    return {
      status: "VERIFIED",
      confidence: "HIGH",
      badge: "ready" as const,
      summary: "This software has an active VentureOS trust record with strong readiness and certificate evidence.",
      recommendation: "Approved for procurement, integration, deployment review, or investment diligence within the stated evidence scope.",
      recommendedFor: ["Procurement", "Integration", "Deployment", "Investment Review"],
    };
  }
  if (passport.asset.trustScore >= 70) {
    return {
      status: "REVIEW",
      confidence: "MODERATE",
      badge: "risky" as const,
      summary: "This software has useful trust evidence, but limitations remain visible in the passport.",
      recommendation: "Review the evidence scope and unresolved risks before enterprise deployment or acquisition decisions.",
      recommendedFor: ["Technical Review", "Vendor Review", "Risk Triage", "Follow-up Scan"],
    };
  }
  return {
    status: "RESTRICTED",
    confidence: "LIMITED",
    badge: "blocked" as const,
    summary: "This software does not currently show enough trust evidence for a low-friction approval decision.",
    recommendation: "Reject or hold until identity, operational, security, and maintenance evidence improves.",
    recommendedFor: ["Risk Review", "Remediation", "Independent Assessment", "Recheck"],
  };
}

function identityScore(passport: VentureOSPassport) {
  return clamp(passport.asset.repository ? passport.asset.trustScore : passport.asset.trustScore - 12);
}

function buildQualityScore(passport: VentureOSPassport) {
  return clamp(passport.asset.readinessScore + (passport.asset.status === "VERIFIED" ? 3 : -2));
}

function reliabilityScore(passport: VentureOSPassport) {
  return clamp(passport.asset.readinessScore - (passport.asset.evidenceCoverage < 70 ? 8 : 0));
}

function maintainabilityScore(passport: VentureOSPassport) {
  return clamp(passport.asset.evidenceCoverage + (passport.asset.repository ? 10 : 0));
}

function operationalMaturityScore(passport: VentureOSPassport) {
  return clamp(passport.asset.lastScan ? passport.asset.readinessScore - 4 : passport.asset.readinessScore - 12);
}

function qualityScore(passport: VentureOSPassport) {
  return clamp(Math.round((buildQualityScore(passport) + reliabilityScore(passport) + maintainabilityScore(passport) + operationalMaturityScore(passport)) / 4));
}

function securityScore(passport: VentureOSPassport) {
  return clamp(passport.asset.certificateId ? passport.asset.trustScore : passport.asset.trustScore - 10);
}

function accessSafetyScore(passport: VentureOSPassport) {
  return clamp(securityScore(passport) + (passport.asset.certificateId ? 2 : -4));
}

function dataSafetyScore(passport: VentureOSPassport) {
  return clamp(securityScore(passport) - (passport.asset.evidenceCoverage < 75 ? 8 : 2));
}

function integrationSafetyScore(passport: VentureOSPassport) {
  return clamp(securityScore(passport) - (passport.asset.repository ? 2 : 10));
}

function deploymentSafetyScore(passport: VentureOSPassport) {
  return clamp(passport.asset.lastScan ? securityScore(passport) : securityScore(passport) - 8);
}

function safetyScore(passport: VentureOSPassport) {
  return clamp(Math.round((identityScore(passport) + accessSafetyScore(passport) + dataSafetyScore(passport) + integrationSafetyScore(passport) + deploymentSafetyScore(passport)) / 5));
}

function maintenanceScore(passport: VentureOSPassport) {
  return clamp(passport.asset.readinessScore + (passport.improvement.direction === "IMPROVING" ? 5 : passport.improvement.direction === "DECLINING" ? -8 : 0));
}

function organizationScore(passport: VentureOSPassport) {
  return clamp(passport.asset.company ? passport.asset.trustScore - 3 : passport.asset.trustScore - 16);
}

function riskLevel(passport: VentureOSPassport) {
  if (passport.asset.trustScore >= 85 && passport.asset.status === "VERIFIED") return "Low";
  if (passport.asset.trustScore >= 70) return "Moderate";
  return "Elevated";
}

function qualityVerdict(passport: VentureOSPassport) {
  const score = qualityScore(passport);
  if (score >= 85) return "Production Ready";
  if (score >= 70) return "Review Before Production";
  return "Quality Risk Elevated";
}

function safetyVerdict(passport: VentureOSPassport) {
  const score = safetyScore(passport);
  if (score >= 85) return "Low Safety Risk";
  if (score >= 70) return "Moderate Safety Risk";
  return "Safety Review Required";
}

function qualitySummary(passport: VentureOSPassport) {
  if (qualityScore(passport) >= 85) return "This software demonstrates mature development practices and appears capable of supporting production workloads within the observed evidence scope.";
  if (qualityScore(passport) >= 70) return "This software shows usable quality signals, but some build, reliability, maintainability, or operational controls need review before broad production use.";
  return "This software has quality gaps that should be remediated before buyer approval or production deployment.";
}

function safetySummary(passport: VentureOSPassport) {
  if (safetyScore(passport) >= 85) return "Identity, access, data, integration, and deployment controls show strong observed safety signals.";
  if (safetyScore(passport) >= 70) return "Core safety signals were observed, but some controls could not be independently verified from the current evidence.";
  return "Safety evidence is limited or weak. Review access, data protection, integration, and deployment controls before trusting this software.";
}

function recommendedUse(passport: VentureOSPassport) {
  if (qualityScore(passport) >= 85 && safetyScore(passport) >= 85) return "Suitable for deployment after standard internal review.";
  if (qualityScore(passport) >= 70 && safetyScore(passport) >= 70) return "Suitable for controlled pilot or diligence review before wider deployment.";
  return "Hold for remediation, independent assessment, or additional evidence collection.";
}

function certificateSeals(passport: VentureOSPassport) {
  return [
    { label: "Ownership Verified", state: identityScore(passport) >= 85 ? "verified" : "pending", text: identityScore(passport) >= 85 ? "Verified" : "Pending" },
    { label: "Quality Verified", state: qualityScore(passport) >= 85 ? "verified" : "pending", text: qualityScore(passport) >= 85 ? "Verified" : "Review" },
    { label: "Safety Verified", state: safetyScore(passport) >= 85 ? "verified" : "pending", text: safetyScore(passport) >= 85 ? "Verified" : "Review Pending" },
    { label: "Production Ready", state: qualityScore(passport) >= 85 && safetyScore(passport) >= 80 ? "verified" : "pending", text: qualityScore(passport) >= 85 && safetyScore(passport) >= 80 ? "Issued" : "Pending" },
    { label: "Operationally Mature", state: operationalMaturityScore(passport) >= 85 ? "verified" : "pending", text: operationalMaturityScore(passport) >= 85 ? "Verified" : "Pending" },
  ];
}

function scoreBand(score: number) {
  if (score >= 85) return "High";
  if (score >= 70) return "Moderate";
  return "Limited";
}

function monitoringStatus(passport: VentureOSPassport) {
  return passport.asset.lastScan ? "Continuous Watch" : "Snapshot";
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function formatDecision(value: string) {
  return value === "none" ? "NONE" : value.replace(/_/g, " ").toUpperCase();
}

function formatDrift(value: number) {
  if (value > 0) return `+${value}`;
  return String(value);
}
