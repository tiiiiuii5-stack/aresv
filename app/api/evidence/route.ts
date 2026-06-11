import { NextRequest } from "next/server";

import { createTrace } from "@/lib/diagnostics";
import { buildDueDiligenceWorkspace, buildSubmittedEvidenceReceipt, type ExternalEvidenceAnchor } from "@/lib/diligence/due-diligence-engine";
import { evidenceForVendor } from "@/lib/diligence/api-contracts";
import { enforceRateLimit, jsonResponse, secureErrorResponse } from "@/lib/security/backendSecurity";
import { compileTrust, readCompiledJson } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const readRateLimit = { name: "evidence-api-read", limit: 80, windowMs: 60_000 };
const writeRateLimit = { name: "evidence-api-write", limit: 30, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const traceId = createTrace("evidence-api.GET");
  try {
    await compileTrust(request, { mode: "publicRead", reason: "evidence ledger API" });
    const limit = await enforceRateLimit(request, readRateLimit);
    const vendor = request.nextUrl.searchParams.get("vendor") || request.nextUrl.searchParams.get("q") || "";
    const workspace = await buildDueDiligenceWorkspace({ query: vendor, limit: boundedLimit(request.nextUrl.searchParams.get("limit")), deterministic: true });
    const evidence = vendor ? evidenceForVendor(workspace, vendor).evidence : workspace.evidence;
    return jsonResponse(
      {
        ok: true,
        traceId,
        apiVersion: "evidence-v1",
        vendor: vendor || null,
        count: evidence.length,
        evidence,
        snapshot: workspace.snapshot,
      },
      { headers: limit.headers },
    );
  } catch (error) {
    return secureErrorResponse("evidence-api.GET", traceId, error, { fallbackStatus: 400 });
  }
}

export async function POST(request: NextRequest) {
  const traceId = createTrace("evidence-api.POST");
  try {
    await compileTrust(request, { mode: "publicNonPersistent", reason: "non-persistent evidence receipt" });
    const limit = await enforceRateLimit(request, writeRateLimit);
    const body = await readCompiledJson(request);
    const validation = validateSubmittedEvidence(body);
    if (!validation.ok) {
      return jsonResponse({ ok: false, traceId, error: validation.error }, { status: 400, headers: limit.headers });
    }

    const receipt = buildSubmittedEvidenceReceipt(validation.input);
    return jsonResponse(
      {
        ok: true,
        traceId,
        apiVersion: "evidence-ingest-v1",
        persisted: false,
        receipt,
        nextStep: "Persist this receipt in the evidence ledger once a workspace or vendor record is selected.",
      },
      { status: 201, headers: limit.headers },
    );
  } catch (error) {
    return secureErrorResponse("evidence-api.POST", traceId, error, { fallbackStatus: 400 });
  }
}

function validateSubmittedEvidence(body: Record<string, unknown>):
  | { ok: true; input: Parameters<typeof buildSubmittedEvidenceReceipt>[0] }
  | { ok: false; error: string } {
  const source = clean(body.source, 240);
  const type = clean(body.type, 80);
  const summary = clean(body.summary, 2000);
  const anchors = Array.isArray(body.anchors) ? body.anchors.map(normalizeAnchor).filter((anchor): anchor is ExternalEvidenceAnchor => Boolean(anchor)) : [];
  if (!source) return { ok: false, error: "source is required." };
  if (!type) return { ok: false, error: "type is required." };
  if (!summary) return { ok: false, error: "summary is required." };
  if (!anchors.length) return { ok: false, error: "At least one external anchor is required for evidence ingestion." };
  return {
    ok: true,
    input: {
      subjectId: clean(body.subjectId, 120) || undefined,
      subjectName: clean(body.subjectName, 160) || undefined,
      source,
      sourceKind: sourceKind(body.sourceKind),
      type,
      category: category(body.category),
      summary,
      timestamp: clean(body.timestamp, 80) || undefined,
      confidence: Number(body.confidence ?? 35),
      verified: Boolean(body.verified),
      href: clean(body.href, 500) || undefined,
      limitations: Array.isArray(body.limitations) ? body.limitations.map((item) => clean(item, 240)).filter(Boolean) : undefined,
      anchors,
    },
  };
}

function normalizeAnchor(value: unknown): ExternalEvidenceAnchor | null {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const kind = anchorKind(record.kind);
  const label = clean(record.label, 120) || kind.replace(/_/g, " ");
  const externalId = clean(record.externalId, 240);
  const url = clean(record.url, 500);
  if (!externalId || !url) return null;
  return {
    kind,
    label,
    externalId,
    url,
    verificationMethod: verificationMethod(record.verificationMethod),
    immutable: Boolean(record.immutable),
    confidence: Math.max(0, Math.min(100, Math.round(Number(record.confidence ?? 55)))),
  };
}

function anchorKind(value: unknown): ExternalEvidenceAnchor["kind"] {
  const allowed: ExternalEvidenceAnchor["kind"][] = [
    "github_api_object",
    "osv_advisory",
    "domain_whois_record",
    "sbom_file_hash",
    "package_registry_version",
    "ssl_certificate_record",
    "ventureos_registry_record",
    "transparency_log_entry",
  ];
  return allowed.includes(value as ExternalEvidenceAnchor["kind"]) ? value as ExternalEvidenceAnchor["kind"] : "ventureos_registry_record";
}

function verificationMethod(value: unknown): ExternalEvidenceAnchor["verificationMethod"] {
  const allowed: ExternalEvidenceAnchor["verificationMethod"][] = ["api_object", "hash_match", "public_record", "internal_ledger"];
  return allowed.includes(value as ExternalEvidenceAnchor["verificationMethod"]) ? value as ExternalEvidenceAnchor["verificationMethod"] : "public_record";
}

function sourceKind(value: unknown): Parameters<typeof buildSubmittedEvidenceReceipt>[0]["sourceKind"] {
  const allowed: NonNullable<Parameters<typeof buildSubmittedEvidenceReceipt>[0]["sourceKind"]>[] = [
    "registry",
    "github_repository",
    "domain",
    "sbom",
    "certificate",
    "transparency_log",
    "event_log",
    "self_attested",
  ];
  return allowed.includes(value as NonNullable<Parameters<typeof buildSubmittedEvidenceReceipt>[0]["sourceKind"]>)
    ? value as NonNullable<Parameters<typeof buildSubmittedEvidenceReceipt>[0]["sourceKind"]>
    : "self_attested";
}

function category(value: unknown): Parameters<typeof buildSubmittedEvidenceReceipt>[0]["category"] {
  const allowed: NonNullable<Parameters<typeof buildSubmittedEvidenceReceipt>[0]["category"]>[] = [
    "identity",
    "security",
    "reliability",
    "maintainability",
    "buyer_readiness",
    "supply_chain",
    "ledger",
  ];
  return allowed.includes(value as NonNullable<Parameters<typeof buildSubmittedEvidenceReceipt>[0]["category"]>)
    ? value as NonNullable<Parameters<typeof buildSubmittedEvidenceReceipt>[0]["category"]>
    : "buyer_readiness";
}

function boundedLimit(value: unknown) {
  const number = Number(value || 16);
  return Math.max(1, Math.min(50, Number.isFinite(number) ? Math.round(number) : 16));
}

function clean(value: unknown, maxLength: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
