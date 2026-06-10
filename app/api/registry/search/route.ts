import { NextRequest } from "next/server";

import { createTrace } from "@/lib/diagnostics";
import { searchVentureOSRegistry } from "@/lib/registry/software-registry";
import { enforceRateLimit, jsonResponse, readJsonBody, secureErrorResponse } from "@/lib/security/backendSecurity";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const registrySearchRateLimit = { name: "registry-search", limit: 60, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const traceId = createTrace("registry-search.GET");
  try {
    await compileTrust(request, { mode: "publicNonPersistent", reason: "public registry search" });
    const rateLimit = await enforceRateLimit(request, registrySearchRateLimit);
    const query = request.nextUrl.searchParams.get("q") || "";
    const limit = request.nextUrl.searchParams.get("limit") || undefined;
    const result = await searchVentureOSRegistry({ query, limit: limit ? Number(limit) : undefined });
    return jsonResponse({ ok: true, traceId, ...result }, { headers: rateLimit.headers });
  } catch (error) {
    return secureErrorResponse("registry-search.GET", traceId, error, { fallbackStatus: 400 });
  }
}

export async function POST(request: NextRequest) {
  const traceId = createTrace("registry-search.POST");
  try {
    await compileTrust(request, { mode: "publicNonPersistent", reason: "public registry search" });
    const rateLimit = await enforceRateLimit(request, registrySearchRateLimit);
    const body = await readJsonBody<{ q?: unknown; query?: unknown; limit?: unknown }>(request, { maxBytes: 4_000 });
    const result = await searchVentureOSRegistry({ query: String(body.q || body.query || ""), limit: Number(body.limit || 24) });
    return jsonResponse({ ok: true, traceId, ...result }, { headers: rateLimit.headers });
  } catch (error) {
    return secureErrorResponse("registry-search.POST", traceId, error, { fallbackStatus: 400 });
  }
}
