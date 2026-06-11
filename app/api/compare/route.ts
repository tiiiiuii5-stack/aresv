import { NextRequest } from "next/server";

import { createTrace } from "@/lib/diagnostics";
import { compareContract } from "@/lib/diligence/api-contracts";
import { buildDueDiligenceWorkspace } from "@/lib/diligence/due-diligence-engine";
import { enforceRateLimit, jsonResponse, secureErrorResponse } from "@/lib/security/backendSecurity";
import { compileTrust, readCompiledJson } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rateLimit = { name: "compare-api", limit: 50, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const traceId = createTrace("compare-api.GET");
  try {
    await compileTrust(request, { mode: "publicRead", reason: "vendor comparison API" });
    const limit = await enforceRateLimit(request, rateLimit);
    const vendors = parseVendorList(request.nextUrl.searchParams.get("vendors") || request.nextUrl.searchParams.get("q") || "");
    const workspace = await buildDueDiligenceWorkspace({ query: vendors[0] || "", limit: 16, deterministic: true });
    return jsonResponse({ ok: true, traceId, ...compareContract(workspace, vendors) }, { headers: limit.headers });
  } catch (error) {
    return secureErrorResponse("compare-api.GET", traceId, error, { fallbackStatus: 400 });
  }
}

export async function POST(request: NextRequest) {
  const traceId = createTrace("compare-api.POST");
  try {
    await compileTrust(request, { mode: "publicNonPersistent", reason: "vendor comparison API" });
    const limit = await enforceRateLimit(request, rateLimit);
    const body = await readCompiledJson(request);
    const vendors = Array.isArray(body.vendors)
      ? body.vendors.map((vendor) => clean(vendor)).filter(Boolean).slice(0, 12)
      : parseVendorList(body.vendors);
    const workspace = await buildDueDiligenceWorkspace({ query: vendors[0] || "", limit: Math.max(16, vendors.length || 16), deterministic: true });
    return jsonResponse({ ok: true, traceId, ...compareContract(workspace, vendors) }, { headers: limit.headers });
  } catch (error) {
    return secureErrorResponse("compare-api.POST", traceId, error, { fallbackStatus: 400 });
  }
}

function parseVendorList(value: unknown) {
  return String(value || "")
    .split(",")
    .map((item) => clean(item))
    .filter(Boolean)
    .slice(0, 12);
}

function clean(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 180);
}
