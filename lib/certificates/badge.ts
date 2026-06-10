import type { CertificateStatus, VentureOSCertificatePayload } from "@/lib/certificates/types";

const tones: Record<CertificateStatus | "INVALID", { label: string; left: string; right: string; text: string }> = {
  ACTIVE: { label: "Verified", left: "#052e2b", right: "#10b981", text: "#ecfdf5" },
  EXPIRED: { label: "Expired", left: "#18181b", right: "#71717a", text: "#fafafa" },
  REVOKED: { label: "Revoked", left: "#450a0a", right: "#ef4444", text: "#fff1f2" },
  SUPERSEDED: { label: "Superseded", left: "#3f2e00", right: "#f59e0b", text: "#fffbeb" },
  INVALID: { label: "Invalid", left: "#450a0a", right: "#991b1b", text: "#fff1f2" },
};

export function certificateUrls(certificateId: string) {
  const base = applicationBaseUrl();
  return {
    verificationUrl: `${base}/certificate/${encodeURIComponent(certificateId)}`,
    badgeUrl: `${base}/api/certificates/${encodeURIComponent(certificateId)}/badge.svg`,
  };
}

export function buildCertificateBadgeSvg(input: {
  status: CertificateStatus | "INVALID";
  payload?: VentureOSCertificatePayload | null;
  score?: number | null;
}) {
  const tone = tones[input.status] || tones.INVALID;
  const scoreLabel = input.payload ? `${input.payload.appraisal.grade} / ${input.payload.appraisal.readinessScore}` : "UNVERIFIED";
  const appName = input.payload?.softwareAsset.name || "VentureOS Certificate";
  const width = Math.max(330, Math.min(560, 270 + appName.length * 5 + tone.label.length * 8));
  const rightWidth = 144;
  const leftWidth = width - rightWidth;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="40" role="img" aria-label="VentureOS signed certificate badge">
  <title>VentureOS ${escapeXml(tone.label)} certificate - ${escapeXml(appName)}</title>
  <clipPath id="vos-cert-radius"><rect width="${width}" height="40" rx="8"/></clipPath>
  <g clip-path="url(#vos-cert-radius)">
    <rect width="${leftWidth}" height="40" fill="${tone.left}"/>
    <rect x="${leftWidth}" width="${rightWidth}" height="40" fill="${tone.right}"/>
    <rect width="${width}" height="40" fill="none" stroke="rgba(255,255,255,.18)"/>
  </g>
  <text x="14" y="16" fill="#cbd5e1" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="10" font-weight="800" letter-spacing="1.4">VENTUREOS CERT</text>
  <text x="14" y="30" fill="${tone.text}" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="13" font-weight="800">${escapeXml(tone.label)}</text>
  <text x="${leftWidth + 14}" y="17" fill="rgba(255,255,255,.78)" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="10" font-weight="800">SIGNED</text>
  <text x="${leftWidth + 14}" y="31" fill="#ffffff" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="14" font-weight="900">${escapeXml(scoreLabel)}</text>
</svg>`;
}

function applicationBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (explicit?.trim()) return explicit.trim().replace(/\/+$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_URL or NEXT_PUBLIC_APP_URL is required for certificate public URLs.");
  }
  return `http://${localDevelopmentHost()}:3002`;
}

function localDevelopmentHost() {
  return "localhost";
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
