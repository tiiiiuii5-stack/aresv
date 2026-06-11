import { NextResponse } from "next/server";

import { probeDatabaseRead } from "@/lib/persistence/database";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await compileTrust(request, { mode: "publicRead" });
  const database = await probeDatabaseRead();
  return NextResponse.json({
    ok: true,
    service: "ventureos-backend",
    runtime: "vercel-next-api",
    integratedBackend: {
      mode: "next-app-router",
      standaloneBackendRequired: false,
      chatRoute: "/api/backend/chat",
      projectRoutes: "/api/projects",
      jobRoutes: "/api/jobs",
      scanRoutes: ["/api/scan-repo", "/api/ai-app-scanner"],
      githubRoutes: "/api/github/*",
      appraisalRoutes: ["/api/appraisals", "/appraisal/:id"],
      trustLedgerRoutes: ["/api/trust-ledger"],
      evidenceOpsRoutes: [
        "/api/evidence/events",
        "/api/evidence/events/:id/receipt",
        "/api/audit-packets",
        "/api/verify",
      ],
      transparencyRoutes: [
        "/api/transparency-log",
        "/api/transparency-log/anchor",
        "/api/transparency-log/anchor/publish",
        "/api/transparency-log/proof",
        "/api/transparency-log/consistency",
        "/transparency-log",
        "/.well-known/ventureos-transparency-anchor.json",
      ],
      certificateRoutes: ["/api/certificates", "/api/certificates/:id/verify", "/certificate/:id", "/.well-known/ventureos-certificates.json"],
    },
    configuration: {
      database: {
        configured: database.configured,
        disabled: database.disabled,
        reachable: database.reachable,
        verifiedRead: database.verifiedRead,
        circuit: database.circuit,
        reason: database.reason,
      },
      stripe: {
        checkoutEnabled: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
        webhookEnabled: Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()),
        appraisalPriceIdsConfigured: {
          instant: Boolean((process.env.STRIPE_PRICE_APPRAISAL_INSTANT || process.env.STRIPE_APPRAISAL_INSTANT_PRICE_ID)?.trim()),
          buyerReady: Boolean((process.env.STRIPE_PRICE_APPRAISAL_BUYER || process.env.STRIPE_APPRAISAL_BUYER_PRICE_ID)?.trim()),
        },
      },
    },
    timestamp: new Date().toISOString(),
  });
}
