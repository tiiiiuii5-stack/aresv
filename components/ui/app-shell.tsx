import Link from "next/link";
import type { ReactNode } from "react";

const navigation = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Reports", href: "/software-appraisal" },
  { label: "Registry", href: "/registry" },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 md:block">
          <Link href="/" className="h2 mb-6 block">
            VentureOS
          </Link>

          <nav className="space-y-2 text-sm" aria-label="Application navigation">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href} className="btn-ghost w-full justify-start">
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="container-app section">{children}</div>
        </main>
      </div>
    </div>
  );
}
