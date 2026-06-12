export type ReportPathEmailInput = {
  to: string;
  role: string;
  source: string;
  useCase: string;
  reportRequestUrl: string;
  previewUrl: string;
  sampleReportUrl: string;
};

export type ReportPathEmailResult = {
  attempted: boolean;
  sent: boolean;
  provider: "resend" | "none";
  reason: "sent" | "not_configured" | "provider_error" | "invalid_recipient";
  providerId?: string | null;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendReportPathEmail(input: ReportPathEmailInput): Promise<ReportPathEmailResult> {
  const to = input.to.trim().toLowerCase();
  if (!emailPattern.test(to)) {
    return { attempted: false, sent: false, provider: "none", reason: "invalid_recipient" };
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    process.env.VENTUREOS_EMAIL_FROM?.trim();

  if (!apiKey || !from) {
    return { attempted: false, sent: false, provider: "none", reason: "not_configured" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: "Your VentureOS software trust review path",
      text: textBody(input),
      html: htmlBody(input),
      reply_to: process.env.VENTUREOS_REPLY_TO?.trim() || process.env.EMAIL_REPLY_TO?.trim() || undefined,
      tags: [
        { name: "source", value: cleanTag(input.source || "waitlist") },
        { name: "role", value: cleanTag(input.role || "unknown") },
      ],
    }),
    cache: "no-store",
  }).catch(() => null);

  if (!response?.ok) {
    return { attempted: true, sent: false, provider: "resend", reason: "provider_error" };
  }

  const payload = await response.json().catch(() => ({})) as { id?: string };
  return { attempted: true, sent: true, provider: "resend", reason: "sent", providerId: payload.id || null };
}

function textBody(input: ReportPathEmailInput) {
  return [
    "Your VentureOS software trust review path is ready.",
    "",
    `Role: ${input.role || "unknown"}`,
    input.useCase ? `Context: ${input.useCase}` : "",
    "",
    `Run the free decision preview: ${input.previewUrl}`,
    `Request or update the report path: ${input.reportRequestUrl}`,
    `View a sample report: ${input.sampleReportUrl}`,
    "",
    "VentureOS separates observed evidence, inferred conclusions, and unknowns. It is not a legal, security, compliance, or investment certification.",
  ].filter(Boolean).join("\n");
}

function htmlBody(input: ReportPathEmailInput) {
  const role = escapeHtml(input.role || "unknown");
  const useCase = escapeHtml(input.useCase || "No context provided.");
  return `<!doctype html>
<html>
  <body style="margin:0;background:#0B0F19;color:#e5e7eb;font-family:Inter,Arial,sans-serif;">
    <div style="max-width:640px;margin:0 auto;padding:32px;">
      <p style="margin:0 0 12px;color:#5eead4;font-size:12px;font-weight:800;text-transform:uppercase;">VentureOS</p>
      <h1 style="margin:0 0 16px;color:#f8fafc;font-size:28px;line-height:1.15;">Your software trust review path</h1>
      <p style="margin:0 0 20px;color:#cbd5e1;line-height:1.6;">Use these links to run a free decision preview, request a buyer-ready report path, or inspect a sample report.</p>
      <div style="border:1px solid #334155;border-radius:12px;padding:16px;background:#111827;margin-bottom:20px;">
        <p style="margin:0 0 8px;color:#f8fafc;font-weight:800;">Role: ${role}</p>
        <p style="margin:0;color:#94a3b8;line-height:1.6;">${useCase}</p>
      </div>
      ${linkButton("Run free decision preview", input.previewUrl)}
      ${linkButton("Request report path", input.reportRequestUrl)}
      ${linkButton("View sample report", input.sampleReportUrl)}
      <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;">VentureOS separates observed evidence, inferred conclusions, and unknowns. It is not a legal, security, compliance, or investment certification.</p>
    </div>
  </body>
</html>`;
}

function linkButton(label: string, href: string) {
  const cleanHref = escapeHtml(href);
  return `<p style="margin:0 0 12px;"><a href="${cleanHref}" style="display:block;border-radius:10px;background:#2dd4bf;color:#042f2e;padding:14px 18px;text-align:center;font-weight:800;text-decoration:none;">${escapeHtml(label)}</a></p>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanTag(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 50) || "unknown";
}
