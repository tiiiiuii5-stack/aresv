import Link from "next/link";

import { buttonClassName } from "@/components/ui/button";

export const metadata = {
  title: "Software Immigration Terminal | VentureOS",
  description: "A futuristic software identity, compliance, and passport issuance terminal for VentureOS.",
};

const terminalNav = [
  { label: "Arrivals", detail: "New scans", href: "/build", active: true },
  { label: "Registry", detail: "Public ledger", href: "/registry" },
  { label: "Decisions", detail: "Court", href: "/passport/VOS-2026-405933/report" },
  { label: "Compliance Vault", detail: "Attestations", href: "/transparency-log" },
];

const complianceBadges = [
  { label: "EU CRA Ready", detail: "Vulnerability evidence prepared", mark: "CRA" },
  { label: "SBOM Complete", detail: "Dependency inventory attached", mark: "SBOM" },
  { label: "Attested & Signed", detail: "Certificate chain active", mark: "SIGN" },
];

const processingRows = [
  ["Identity", "Repository origin observed", "CLEARED"],
  ["Provenance", "AI and human contribution trail pending", "REVIEW"],
  ["Safety", "Access and data controls scored", "CLEARED"],
  ["Compliance", "SBOM and attestation package assembled", "CLEARED"],
];

export default function SoftwareImmigrationTerminalPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#050812] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(45,212,191,0.18),transparent_28%),radial-gradient(circle_at_82%_8%,rgba(52,211,153,0.13),transparent_26%),linear-gradient(180deg,rgba(15,23,42,0.1),rgba(2,6,23,0.98))]" />
      <div className="pointer-events-none fixed inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:42px_42px]" />

      <section className="relative mx-auto grid min-h-screen w-full max-w-[1500px] gap-5 px-4 py-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-[#1f3348] bg-[#07101d]/80 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <Link href="/" className="flex items-center gap-3 rounded-xl border border-[#21435a] bg-[#0B1220]/80 p-3">
            <span className="grid h-11 w-11 place-items-center rounded-lg border border-[#34f5c5]/40 bg-[#34f5c5]/10 font-mono text-sm font-black text-[#9fffee]">
              V
            </span>
            <span>
              <span className="block text-sm font-black tracking-[0.18em] text-slate-100">VentureOS</span>
              <span className="block text-xs font-semibold text-[#7dd3fc]">Department Terminal</span>
            </span>
          </Link>

          <div className="mt-6 rounded-xl border border-[#1f3348] bg-black/20 p-3">
            <p className="font-mono text-[10px] font-black uppercase tracking-[0.24em] text-[#67e8f9]">Terminal Navigation</p>
            <nav className="mt-3 grid gap-2">
              {terminalNav.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className={[
                    "group rounded-xl border px-3 py-3 transition",
                    item.active ? "border-[#34f5c5]/50 bg-[#34f5c5]/10" : "border-transparent hover:border-[#1f3348] hover:bg-white/[0.03]",
                  ].join(" ")}
                >
                  <span className="block text-sm font-black text-slate-100">{item.label}</span>
                  <span className="mt-1 block font-mono text-[11px] uppercase tracking-[0.12em] text-slate-500 group-hover:text-[#7dd3fc]">{item.detail}</span>
                </Link>
              ))}
            </nav>
          </div>

          <div className="mt-5 rounded-xl border border-[#1f3348] bg-[#0B1220]/70 p-4">
            <p className="font-mono text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">Office Status</p>
            <div className="mt-4 grid gap-3 text-xs font-semibold">
              <Status label="Passport Desk" value="Open" />
              <Status label="Ledger Sync" value="Live" />
              <Status label="Court Queue" value="3 pending" muted />
            </div>
          </div>
        </aside>

        <section className="relative grid gap-5">
          <header className="rounded-2xl border border-[#1f3348] bg-[#07101d]/75 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-mono text-xs font-black uppercase tracking-[0.32em] text-[#67e8f9]">VentureOS • Department of Software Identity</p>
                <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-5xl">
                  Software Immigration & Compliance Terminal
                </h1>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/build" className={buttonClassName({ className: "justify-center" })}>
                  Process Arrival <span className="font-mono text-xs">-&gt;</span>
                </Link>
                <Link href="/registry" className={buttonClassName({ variant: "outline", className: "justify-center" })}>
                  Public Ledger
                </Link>
              </div>
            </div>
          </header>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="relative min-h-[680px] overflow-hidden rounded-3xl border border-[#1f3348] bg-[#07101d]/70 p-5 shadow-2xl shadow-black/40 backdrop-blur-xl">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#67e8f9] to-transparent opacity-80" />
              <div className="absolute left-0 right-0 top-16 h-24 animate-[vos-scan_4.5s_linear_infinite] bg-gradient-to-b from-transparent via-[#67e8f9]/16 to-transparent" />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_52%_40%,rgba(45,212,191,0.18),transparent_32%)]" />

              <div className="relative z-10 grid h-full gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="grid place-items-center py-8">
                  <DigitalPassport />
                </div>

                <aside className="grid content-center gap-4">
                  <ApprovalStamp score={94} />
                  <div className="rounded-2xl border border-[#1f3348] bg-black/25 p-4">
                    <p className="font-mono text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Live Processing</p>
                    <div className="mt-4 grid gap-3">
                      {processingRows.map(([label, detail, state]) => (
                        <div key={label} className="rounded-xl border border-[#1f3348] bg-[#0B1220]/80 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-black text-slate-100">{label}</p>
                            <span className={["font-mono text-[10px] font-black", state === "CLEARED" ? "text-[#34f5c5]" : "text-[#f8d16b]"].join(" ")}>
                              {state}
                            </span>
                          </div>
                          <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">{detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </aside>
              </div>
            </div>

            <aside className="grid gap-5">
              <section className="rounded-2xl border border-[#1f3348] bg-[#07101d]/75 p-5 backdrop-blur-xl">
                <p className="font-mono text-[10px] font-black uppercase tracking-[0.24em] text-[#67e8f9]">Compliance Badges</p>
                <div className="mt-4 grid gap-3">
                  {complianceBadges.map((badge) => {
                    return (
                      <div key={badge.label} className="rounded-2xl border border-[#34f5c5]/25 bg-[#34f5c5]/[0.06] p-4">
                        <div className="flex items-start gap-3">
                          <span className="grid h-10 w-12 place-items-center rounded-lg border border-[#34f5c5]/30 bg-[#34f5c5]/10 font-mono text-[10px] font-black text-[#9fffee]">
                            {badge.mark}
                          </span>
                          <div>
                            <p className="text-sm font-black text-slate-100">{badge.label}</p>
                            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{badge.detail}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-2xl border border-[#1f3348] bg-[#07101d]/75 p-5 backdrop-blur-xl">
                <p className="font-mono text-[10px] font-black uppercase tracking-[0.24em] text-[#67e8f9]">Identity Doctrine</p>
                <h2 className="mt-3 text-2xl font-black text-white">Every piece of code deserves a passport.</h2>
                <p className="mt-3 text-sm font-semibold leading-7 text-slate-400">
                  VentureOS packages software identity, provenance, SBOM evidence, attestations, and decision records into a living passport for AI-assisted and open source software.
                </p>
              </section>
            </aside>
          </section>
        </section>
      </section>
    </main>
  );
}

function DigitalPassport() {
  const stamps = ["CRA", "SBOM", "SIGNED", "LEDGER"];
  return (
    <article className="relative w-full max-w-[720px] rounded-[28px] border border-[#34f5c5]/25 bg-gradient-to-br from-[#0b1728] via-[#09111f] to-[#06101a] p-6 shadow-[0_40px_120px_rgba(0,0,0,0.55),0_0_80px_rgba(45,212,191,0.12)]">
      <div className="absolute inset-0 rounded-[28px] bg-[linear-gradient(115deg,transparent,rgba(103,232,249,0.10),transparent)]" />
      <div className="relative z-10 grid gap-6 lg:grid-cols-[180px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-[#1f3348] bg-black/25 p-4">
          <div className="grid aspect-[3/4] place-items-center rounded-xl border border-[#34f5c5]/25 bg-[#34f5c5]/[0.05]">
            <div className="grid h-20 w-20 place-items-center rounded-full border-2 border-[#34f5c5]/60 font-mono text-2xl font-black text-[#9fffee]">V</div>
          </div>
          <p className="mt-4 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Holder</p>
          <p className="mt-1 text-sm font-black text-slate-100">AI-assisted codebase</p>
        </div>

        <div>
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1f3348] pb-4">
            <div>
              <p className="font-mono text-[10px] font-black uppercase tracking-[0.26em] text-[#67e8f9]">Software Passport</p>
              <h2 className="mt-2 text-3xl font-black text-white">VOS-2026-405933</h2>
            </div>
            <span className="rounded-full border border-[#34f5c5]/30 bg-[#34f5c5]/10 px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#9fffee]">Holo</span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <PassportField label="Origin" value="github / build pipeline" />
            <PassportField label="Status" value="cleared for review" />
            <PassportField label="Provenance" value="human + AI contributions" />
            <PassportField label="Evidence" value="signed manifest attached" />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stamps.map((stamp, index) => (
              <div
                key={stamp}
                className="animate-[vos-stamp_4s_ease-in-out_infinite] rounded-xl border border-[#34f5c5]/40 bg-[#34f5c5]/10 px-3 py-4 text-center font-mono text-xs font-black tracking-[0.18em] text-[#9fffee]"
                style={{ animationDelay: `${index * 0.35}s` }}
              >
                {stamp}
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function ApprovalStamp({ score }: { score: number }) {
  const cleared = score >= 85;
  return (
    <div className={["rounded-3xl border p-5 text-center", cleared ? "border-[#34f5c5]/40 bg-[#34f5c5]/10" : "border-[#f8d16b]/40 bg-[#f8d16b]/10"].join(" ")}>
      <p className="font-mono text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">Official Approval Stamp</p>
      <div className={["mx-auto mt-4 grid h-36 w-36 rotate-[-8deg] place-items-center rounded-full border-4", cleared ? "border-[#34f5c5] text-[#9fffee]" : "border-[#f8d16b] text-[#f8d16b]"].join(" ")}>
        <div>
          <p className="font-mono text-5xl font-black">{score}</p>
          <p className="font-mono text-[10px] font-black uppercase tracking-[0.18em]">{cleared ? "Cleared" : "Review"}</p>
        </div>
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-400">{cleared ? "Admission granted to the public trust registry." : "Manual review required before issuance."}</p>
    </div>
  );
}

function PassportField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#1f3348] bg-black/20 p-3">
      <p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-100">{value}</p>
    </div>
  );
}

function Status({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={["font-mono font-black", muted ? "text-[#f8d16b]" : "text-[#34f5c5]"].join(" ")}>{value}</span>
    </div>
  );
}
