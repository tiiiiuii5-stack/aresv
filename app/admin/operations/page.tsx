import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { VentureOSHeader } from "@/components/institutional/institutional-shell";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import { requireSession } from "@/lib/auth/session";
import { loadOperationsConsoleSnapshot } from "@/lib/operations/operations-console";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "VentureOS Operations Console",
  description: "Control-plane events, state changes, pipeline queue health, worker health, and failed jobs.",
};

export default async function AdminOperationsPage() {
  const access = await adminAccess();
  if (access === "unauthorized") redirect("/admin/login");
  if (access === "forbidden") return <AdminAccessDenied />;

  const snapshot = await loadOperationsConsoleSnapshot();

  return (
    <main className="vos-page min-h-screen">
      <VentureOSHeader
        purposeLabel="Operations"
        actions={[
          { label: "Admin", href: "/admin", variant: "outline" },
          { label: "Registry", href: "/registry", variant: "outline" },
          { label: "Refresh", href: "/admin/operations", variant: "default" },
        ]}
      />
      <section className="mx-auto w-full max-w-[1280px] px-4 pb-12 pt-28 sm:px-6 lg:px-8">
        <section className="vos-panel p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Control Plane</Badge>
            <Badge variant="muted">Pipeline Queue</Badge>
            <Badge variant="muted">Generated {formatDateTime(snapshot.generatedAt)}</Badge>
          </div>
          <h1 className="mt-4 vos-h1">Operations Console</h1>
          <p className="mt-3 max-w-3xl vos-body">
            Live operational view of state transitions, queued work, worker health, and failed jobs.
          </p>
        </section>

        <section className="mt-6 grid gap-3 md:grid-cols-4">
          <Metric label="Queued" value={snapshot.queueHealth.queued} tone="muted" />
          <Metric label="Running" value={snapshot.queueHealth.running} tone="risky" />
          <Metric label="Failed" value={snapshot.queueHealth.failed} tone="blocked" />
          <Metric label="Completed" value={snapshot.queueHealth.done} tone="ready" />
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <Panel title="Event Stream" badge={`${snapshot.eventStream.length} events`}>
            <DataTable
              headers={["Event", "Entity", "State", "Time"]}
              rows={snapshot.eventStream.slice(0, 20).map((event) => [
                event.event,
                event.entity,
                event.state,
                formatDateTime(event.createdAt),
              ])}
              empty="No control-plane events recorded yet."
            />
          </Panel>

          <Panel title="Worker Health" badge={`${snapshot.workerHealth.length} workers`}>
            <div className="grid gap-2">
              {snapshot.workerHealth.map((worker) => (
                <div key={worker.worker} className="grid grid-cols-[1fr_auto] gap-3 border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] p-3">
                  <div>
                    <p className="text-sm font-black uppercase text-[rgb(var(--vos-text))]">{worker.worker}</p>
                    <p className="mt-1 text-xs font-bold text-[rgb(var(--vos-text-muted))]">
                      {worker.queued} queued / {worker.running} running / {worker.failed} failed
                    </p>
                  </div>
                  <Badge variant={worker.status === "attention" ? "blocked" : worker.status === "running" ? "risky" : "muted"}>{worker.status}</Badge>
                </div>
              ))}
            </div>
          </Panel>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <Panel title="State Changes" badge={`${snapshot.stateChanges.length} changes`}>
            <DataTable
              headers={["Entity", "Event", "From", "To", "Time"]}
              rows={snapshot.stateChanges.slice(0, 20).map((change) => [
                change.entity,
                change.event,
                change.fromState,
                change.toState,
                formatDateTime(change.createdAt),
              ])}
              empty="No state changes recorded yet."
            />
          </Panel>

          <Panel title="Failures" badge={`${snapshot.failures.length} failed jobs`}>
            <DataTable
              headers={["Job", "Type", "Retries", "Error"]}
              rows={snapshot.failures.map((failure) => [
                failure.id,
                failure.type,
                String(failure.retries),
                failure.error,
              ])}
              empty="No failed pipeline jobs."
            />
          </Panel>
        </section>
      </section>
    </main>
  );
}

async function adminAccess() {
  try {
    const session = await requireSession();
    await requireAdmin(session);
    return "allowed" as const;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "UNAUTHORIZED") return "unauthorized" as const;
    return "forbidden" as const;
  }
}

function AdminAccessDenied() {
  return (
    <main className="vos-page grid min-h-screen place-items-center px-4 pt-20">
      <VentureOSHeader purposeLabel="Operations" actions={[{ label: "Home", href: "/", variant: "default" }]} />
      <section className="w-full max-w-md vos-panel p-6">
        <p className="vos-label text-[rgb(var(--vos-danger))]">Admin Access Blocked</p>
        <h1 className="mt-3 vos-h1">You do not have admin permission.</h1>
        <Link href="/" className={buttonClassName({ className: "mt-6" })}>
          Return to VentureOS
        </Link>
      </section>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "ready" | "risky" | "blocked" | "muted" }) {
  return (
    <div className="vos-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="vos-label">{label}</p>
        <Badge variant={tone}>{label}</Badge>
      </div>
      <p className="mt-3 text-3xl font-black text-[rgb(var(--vos-text))]">{value}</p>
    </div>
  );
}

function Panel({ title, badge, children }: { title: string; badge: string; children: ReactNode }) {
  return (
    <section className="vos-panel">
      <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--vos-border))] p-4">
        <h2 className="text-base font-black text-[rgb(var(--vos-text))]">{title}</h2>
        <Badge variant="muted">{badge}</Badge>
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function DataTable({ headers, rows, empty }: { headers: string[]; rows: string[][]; empty: string }) {
  if (!rows.length) return <p className="p-3 text-sm font-bold text-[rgb(var(--vos-text-muted))]">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="vos-table min-w-[620px] text-left text-xs">
        <thead className="bg-[rgb(var(--vos-panel-raised))]">
          <tr>{headers.map((header) => <th key={header} className="px-3 py-2 font-black uppercase text-[rgb(var(--vos-text-subtle))]">{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row[0]}:${index}`} className="border-b border-[rgb(var(--vos-border))] last:border-b-0">
              {row.map((cell, cellIndex) => (
                <td key={`${cell}:${cellIndex}`} className="max-w-[280px] truncate px-3 py-2 font-bold text-[rgb(var(--vos-text-muted))]" title={cell}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
