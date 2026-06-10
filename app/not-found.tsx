import Link from "next/link";

import { VentureOSHeader } from "@/components/institutional/institutional-shell";

export default function NotFound() {
  return (
    <main className="vos-page flex min-h-screen items-center justify-center p-6 pt-24">
      <VentureOSHeader purposeLabel="Not Found" actions={[{ label: "Registry", href: "/registry" }, { label: "Home", href: "/", variant: "default" }]} />
      <section className="w-full max-w-md vos-panel p-8 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg border border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] text-[rgb(var(--vos-primary))]">?</div>
        <h1 className="mt-4 vos-h1">Page not found</h1>
        <p className="mt-2 vos-body">This generated app view does not exist or has moved.</p>
        <Link
          href="/"
          className="mt-6 action primary"
        >
          Back home
        </Link>
      </section>
    </main>
  );
}
