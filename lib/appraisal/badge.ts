import type { AppraisalBadgeState, AppraisalGrade, AppraisalLaunchVerdict, AppraisalPublicSummary } from "@/lib/appraisal/types";

type BadgeTone = {
  label: string;
  left: string;
  right: string;
  text: string;
};

const tones: Record<AppraisalBadgeState, BadgeTone> = {
  VENTUREOS_APPRAISED: { label: "Appraised", left: "#0f172a", right: "#475569", text: "#f8fafc" },
  PRODUCTION_READY: { label: "Production Ready", left: "#052e2b", right: "#10b981", text: "#ecfdf5" },
  RISK_REVIEWED: { label: "Risk Reviewed", left: "#3f2e00", right: "#f59e0b", text: "#fffbeb" },
  HIGH_RISK: { label: "High Risk", left: "#450a0a", right: "#ef4444", text: "#fff1f2" },
  REVERIFIED: { label: "Reverified", left: "#052e2b", right: "#22c55e", text: "#ecfdf5" },
  EXPIRED: { label: "Expired", left: "#18181b", right: "#71717a", text: "#fafafa" },
};

export function badgeLabelFor(state: AppraisalBadgeState) {
  return tones[state]?.label || "Appraised";
}

export function badgeToneFor(state: AppraisalBadgeState) {
  return tones[state] || tones.VENTUREOS_APPRAISED;
}

export function buildAppraisalUrls(publicId: string) {
  const base = applicationBaseUrl();
  const appraisalUrl = `${base}/appraisal/${encodeURIComponent(publicId)}`;
  return {
    appraisalUrl,
    certificateUrl: appraisalUrl,
    badgeUrl: `${base}/api/appraisals/${encodeURIComponent(publicId)}/badge`,
  };
}

export function buildBadgeEmbed(summary: Pick<AppraisalPublicSummary, "publicId" | "appName">) {
  const urls = buildAppraisalUrls(summary.publicId);
  return `<a href="${escapeAttribute(urls.certificateUrl)}" rel="noopener" target="_blank"><img src="${escapeAttribute(urls.badgeUrl)}" alt="VentureOS signed evidence receipt for ${escapeAttribute(summary.appName)}" /></a>`;
}

export function buildBadgeSvg(input: {
  appName: string;
  grade: AppraisalGrade;
  verdict: AppraisalLaunchVerdict;
  state: AppraisalBadgeState;
  score: number;
}) {
  const tone = badgeToneFor(input.state);
  const label = badgeLabelFor(input.state);
  const scoreLabel = `${input.grade} / ${input.score}`;
  const width = Math.max(310, Math.min(560, 250 + label.length * 8 + input.appName.length * 5));
  const rightWidth = 138;
  const leftWidth = width - rightWidth;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="40" role="img" aria-label="VentureOS ${escapeXml(label)} evidence receipt badge">
  <title>VentureOS ${escapeXml(label)} - ${escapeXml(input.appName)}</title>
  <linearGradient id="vos-badge-bg" x2="100%" y2="0">
    <stop offset="0" stop-color="${tone.left}"/>
    <stop offset="1" stop-color="#020617"/>
  </linearGradient>
  <clipPath id="vos-badge-radius">
    <rect width="${width}" height="40" rx="8"/>
  </clipPath>
  <g clip-path="url(#vos-badge-radius)">
    <rect width="${leftWidth}" height="40" fill="url(#vos-badge-bg)"/>
    <rect x="${leftWidth}" width="${rightWidth}" height="40" fill="${tone.right}"/>
    <rect width="${width}" height="40" fill="none" stroke="rgba(255,255,255,.18)"/>
  </g>
  <text x="14" y="16" fill="#cbd5e1" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="10" font-weight="800" letter-spacing="1.4">VENTUREOS</text>
  <text x="14" y="30" fill="${tone.text}" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="13" font-weight="800">${escapeXml(label)}</text>
  <text x="${leftWidth + 14}" y="17" fill="rgba(255,255,255,.78)" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="10" font-weight="800">${escapeXml(input.verdict.replace(/_/g, " "))}</text>
  <text x="${leftWidth + 14}" y="31" fill="#ffffff" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="14" font-weight="900">${escapeXml(scoreLabel)}</text>
</svg>`;
}

function applicationBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (explicit?.trim()) return explicit.trim().replace(/\/+$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_URL or NEXT_PUBLIC_APP_URL is required for appraisal public URLs.");
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

function escapeAttribute(value: string) {
  return escapeXml(value).replace(/`/g, "&#96;");
}
