import { NextResponse } from "next/server";

import { buildDueDiligenceWorkspace } from "@/lib/diligence/due-diligence-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") || "json";
  const query = url.searchParams.get("q") || undefined;
  const workspace = await buildDueDiligenceWorkspace({ query, limit: 16, deterministic: true });

  const auditPacket = {
    snapshot: workspace.snapshot,
    deterministic: {
      enabled: workspace.deterministic,
      inputHash: workspace.deterministicInputHash,
      rule: "Same registry inputs produce the same evidence, risk, passport, and workspace root hashes.",
    },
    metrics: workspace.metrics,
    passports: workspace.passports,
    evidence: workspace.evidence,
    risks: workspace.risks,
    comparison: workspace.comparison,
  };

  if (format === "pdf") {
    const pdf = buildAuditPdf([
      "VentureOS Auditable Trust Engine",
      `Snapshot: ${workspace.snapshot.snapshotId}`,
      `Issued: ${workspace.snapshot.issuedAt}`,
      `Workspace Root: ${workspace.snapshot.workspaceRootHash}`,
      `Signature: ${workspace.snapshot.signature}`,
      `Evidence Records: ${workspace.metrics.evidenceRecords}`,
      `Open Risks: ${workspace.metrics.openRisks}`,
      `Critical Risks: ${workspace.metrics.criticalRisks}`,
      `Average Trust: ${workspace.metrics.averageTrust || "Pending"}`,
      "Boundary: Evidence summary only. Not legal, audit, investment, or compliance certification advice.",
    ]);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${workspace.snapshot.snapshotId}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json(auditPacket, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function buildAuditPdf(lines: string[]) {
  const content = [
    "BT",
    "/F1 16 Tf",
    "72 742 Td",
    ...lines.flatMap((line, index) => [
      index === 0 ? "" : "0 -24 Td",
      `(${escapePdfText(line).slice(0, 110)}) Tj`,
    ]).filter(Boolean),
    "ET",
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
  ];

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body, "utf8");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(body, "utf8");
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
