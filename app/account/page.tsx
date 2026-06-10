"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BillingUsage } from "@/components/billing-usage";
import { VentureOSHeader } from "@/components/institutional/institutional-shell";
import { useProjects } from "@/lib/hooks/use-projects";
import { hasServerSession } from "@/lib/client-session";

export default function SettingsPage() {
  const { projects, loading } = useProjects();
  const [billing, setBilling] = useState<{ tier: string; usage: { builds: number; projects: number }; limits: { builds: number | null; projects: number | null; label: string }; status: string } | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);

  useEffect(() => {
    hasServerSession()
      .then((authenticated) => authenticated ? fetch("/api/billing/status", { cache: "no-store" }) : null)
      .then((response) => response?.json())
      .then((data) => {
        if (data?.ok) setBilling(data);
      })
      .catch(() => undefined);
  }, []);

  async function openPortal() {
    setBillingError(null);
    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      const url = data?.url || data?.portal?.url;
      if (!response.ok || !url) throw new Error(data?.error || "Billing portal is not available yet.");
      window.open(url, "_self", "noopener,noreferrer");
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Billing portal is not available yet.");
    }
  }

  return (
    <main className="vos-page min-h-screen">
      <VentureOSHeader
        purposeLabel="Account"
        actions={[
          { label: "Projects", href: "/projects" },
          { label: "Build", href: "/build" },
          { label: "Admin", href: "/admin", variant: "outline" },
        ]}
      />
      <section className="mx-auto max-w-5xl px-4 pb-8 pt-20 sm:px-6 lg:px-8">
        <div className="vos-panel p-5 sm:p-6">
          <p className="vos-label">Settings</p>
          <h1 className="mt-3 vos-h1">Advanced factory controls.</h1>
          <p className="mt-3 max-w-2xl vos-body">
            Settings reads platform state through backend APIs. No database or file-system logic runs in this UI.
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <Card label="Factory mode" value="API" detail="Frontend talks to VentureOS API routes only." />
          <Card label="Apps built" value={loading ? "..." : String(projects.length)} detail="Loaded through /api/projects." />
          <Card label="Plan" value={billing?.limits.label || "Starter"} detail={billing ? `${billing.usage.builds} builds used this month.` : "Loaded through /api/billing/status."} />
        </div>

        <section className="mt-5 vos-panel p-5 sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="vos-h2">Billing dashboard</h2>
              <p className="mt-2 vos-body">
                Current tier: {billing?.tier || "STARTER"} · Status: {billing?.status || "ACTIVE"}
              </p>
            </div>
            <div className="flex gap-3">
              <Link href="/pricing" className="action primary">
                Upgrade
              </Link>
              <button type="button" onClick={openPortal} className="action">
                Stripe portal
              </button>
            </div>
          </div>
          <div className="mt-5">
            <BillingUsage />
          </div>
          {billingError ? <p className="mt-3 text-sm text-red-300">{billingError}</p> : null}
        </section>

        <section className="mt-5 vos-panel p-5 sm:p-6">
          <h2 className="vos-h2">Clean architecture boundary</h2>
          <p className="mt-2 vos-body">
            UI components call the API client. API routes call services. Services call database, queue, filesystem, and AI providers.
          </p>
        </section>
      </section>
    </main>
  );
}

function Card({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="vos-cell p-4">
      <p className="vos-label">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-[rgb(var(--vos-text))]">{value}</p>
      <p className="mt-2 vos-body">{detail}</p>
    </div>
  );
}
