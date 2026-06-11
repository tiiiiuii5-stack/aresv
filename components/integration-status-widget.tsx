"use client";

import Link from "next/link";
import { CheckCircle2, Code2, FileText, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface IntegrationStatus {
  provider: "github" | "google" | "stripe";
  name: string;
  connected: boolean;
  connectedAs?: string;
  href?: string;
  connectHref?: string;
}

interface IntegrationStatusWidgetProps {
  integrations?: IntegrationStatus[];
}

export function IntegrationStatusWidget({
  integrations = [
    {
      provider: "github",
      name: "GitHub",
      connected: false,
      connectHref: "/auth/github",
    },
    {
      provider: "google",
      name: "Google",
      connected: false,
      connectHref: "/auth/google",
    },
  ],
}: IntegrationStatusWidgetProps) {
  return (
    <div className="vos-panel p-5">
      <p className="vos-label">Integrations</p>
      <h3 className="mt-2 vos-h3">Connected Services</h3>
      <div className="mt-5 space-y-3">
        {integrations.map((integration) => (
          <div
            key={integration.provider}
            className="vos-cell flex items-center justify-between p-3 transition hover:border-[rgb(var(--vos-border-strong))] hover:bg-slate-800/50"
          >
            <div className="flex items-center gap-3">
              {integration.provider === "github" && (
                <Code2 className="h-4 w-4 text-slate-400" />
              )}
              {integration.provider === "google" && (
                <FileText className="h-4 w-4 text-slate-400" />
              )}
              <div>
                <p className="text-sm font-bold text-[rgb(var(--vos-text))]">
                  {integration.name}
                </p>
                {integration.connected && integration.connectedAs && (
                  <p className="mt-0.5 text-xs font-semibold text-[rgb(var(--vos-text-muted))]">
                    as {integration.connectedAs}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {integration.connected ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    disabled
                  >
                    Connected
                  </Button>
                </>
              ) : (
                <>
                  <ShieldAlert className="h-4 w-4 text-slate-400" />
                  <Link href={integration.connectHref || "#"}>
                    <Button variant="outline" size="sm" className="text-xs">
                      Connect
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
