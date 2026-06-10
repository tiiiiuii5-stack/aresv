import Link from "next/link";
import { redirect } from "next/navigation";

import { VentureOSHeader } from "@/components/institutional/institutional-shell";
import { requireAdmin } from "@/lib/auth/guards";
import { requireSession } from "@/lib/auth/session";
import { AdminDashboardClient } from "./admin-dashboard-client";

export default async function AdminDashboardPage() {
  const access = await adminAccess();
  if (access === "unauthorized") redirect("/admin/login");
  if (access === "forbidden") return <AdminAccessDenied />;

  return <AdminDashboardClient />;
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
      <VentureOSHeader purposeLabel="Admin" actions={[{ label: "Home", href: "/", variant: "default" }]} />
      <section className="w-full max-w-md vos-panel p-6">
        <p className="vos-label text-[rgb(var(--vos-danger))]">Admin Access Blocked</p>
        <h1 className="mt-3 vos-h1">You do not have admin permission.</h1>
        <p className="mt-3 vos-body">Admin data is only available after a server-side admin role check.</p>
        <Link href="/" className="mt-6 action primary">
          Return to VentureOS
        </Link>
      </section>
    </main>
  );
}
