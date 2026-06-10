"use client";

import Link from "next/link";
import { useActionState } from "react";
import { VentureOSHeader } from "@/components/institutional/institutional-shell";
import { loginAdmin } from "../actions";

export default function AdminLoginPage() {
  const [state, action, pending] = useActionState(loginAdmin, undefined);

  return (
    <main className="vos-page min-h-screen px-4 py-10 pt-24">
      <VentureOSHeader purposeLabel="Admin Access" actions={[{ label: "Home", href: "/" }]} />
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md flex-col justify-center">
        <Link href="/" className="mb-6 inline-flex text-sm font-semibold text-[rgb(var(--vos-text-muted))]">Back to VentureOS</Link>
        <div className="vos-panel p-6">
          <p className="vos-label">Admin Access</p>
          <h1 className="mt-3 vos-h1">Monitor VentureOS operations.</h1>
          <p className="mt-3 vos-body">
            Sign in to view apps, builds, live runtimes, backend health, and factory activity.
          </p>

          <form action={action} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-[rgb(var(--vos-text-muted))]">Email</span>
              <input name="email" type="email" autoComplete="username" required className="mt-2 w-full px-3 py-3" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[rgb(var(--vos-text-muted))]">Password</span>
              <input name="password" type="password" autoComplete="current-password" required className="mt-2 w-full px-3 py-3" />
            </label>
            {state?.error && <p className="vos-cell px-3 py-2 text-sm font-semibold text-[rgb(var(--vos-danger))]">{state.error}</p>}
            <button disabled={pending} className="action primary w-full disabled:opacity-60">
              {pending ? "Signing in..." : "Open Admin Dashboard"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
