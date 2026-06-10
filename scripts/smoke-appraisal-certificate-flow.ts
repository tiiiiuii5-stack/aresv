import { createHmac } from "node:crypto";

import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });
dotenv.config();

type JsonRecord = Record<string, unknown>;

const baseUrl = (process.env.VENTUREOS_SMOKE_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3002").replace(/\/+$/, "");
const userId = process.env.VENTUREOS_SMOKE_USER_ID || process.env.ADMIN_USER_ID || process.env.ADMIN_EMAIL || "admin@ventureos.local";
const role = process.env.VENTUREOS_SMOKE_ROLE || "user";
const sessionSecret = process.env.SESSION_SECRET || process.env.ADMIN_SESSION_SECRET || process.env.NEXTAUTH_SECRET || "";
const cookie = sessionCookie(userId, role, process.env.ADMIN_ORG_ID || null);

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }));
  process.exit(1);
});

async function main() {
  if (!sessionSecret) throw new Error("SESSION_SECRET or ADMIN_SESSION_SECRET or NEXTAUTH_SECRET is required for smoke session.");

  const session = await requestJson("/api/session");
  assert(session.authenticated === true, "session endpoint must authenticate smoke user");

  const projectId = await resolveProjectId();
  const appraisalResponse = await requestJson("/api/appraisals", {
    method: "POST",
    body: JSON.stringify({ projectId }),
  });
  assert(appraisalResponse.ok === true, "appraisal creation must succeed");
  const appraisal = objectValue(appraisalResponse.appraisal);
  const appraisalId = stringValue(appraisal.id) || stringValue(appraisal.publicId);
  assert(Boolean(appraisalId), "appraisal response must include id or publicId");

  const certificate =
    objectValue(appraisalResponse.certificate) ||
    objectValue((await requestJson("/api/certificates", {
      method: "POST",
      body: JSON.stringify({ appraisalId }),
    })).certificate);
  const certificateId = stringValue(certificate.certificateId);
  assert(Boolean(certificateId), "certificate response must include certificateId");

  const verificationResponse = await requestJson(`/api/certificates/${encodeURIComponent(certificateId)}/verify`, { method: "GET" });
  const verification = objectValue(verificationResponse.verification);
  assert(verification.valid === true, "certificate verification must be valid");
  assert(verification.signatureValid === true, "certificate signature must be valid");
  assert(verification.registryMatch === true, "certificate registry match must be valid");

  const badge = await requestRaw(`/api/certificates/${encodeURIComponent(certificateId)}/badge.svg`);
  assert(badge.status === 200, "certificate badge must return 200");
  assert(/image\/svg\+xml/.test(badge.headers.get("content-type") || ""), "certificate badge must be SVG");

  const page = await requestRaw(`/certificate/${encodeURIComponent(certificateId)}`);
  assert(page.status === 200, "public certificate page must load");

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    userId,
    projectId,
    appraisalPublicId: stringValue(appraisal.publicId),
    certificateId,
    verification: {
      valid: verification.valid,
      signatureValid: verification.signatureValid,
      registryMatch: verification.registryMatch,
      status: verification.status,
    },
  }));
}

async function resolveProjectId() {
  const explicit = process.env.VENTUREOS_SMOKE_PROJECT_ID?.trim();
  if (explicit) return explicit;

  if (process.env.VENTUREOS_SMOKE_CREATE_PROJECT !== "false") {
    try {
      const created = await requestJson("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          category: "crm",
          prompt:
            "Build a CRM SaaS dashboard for sales managers, operators, and account teams. Users create client records, manage deals, edit tasks, delete stale records, analyze pipeline metrics, assign follow ups, and store clients, deals, tasks, notes, invoices, and activity records in a database.",
        }),
      });
      const project = objectValue(created.project);
      const projectId = stringValue(project.id);
      if (projectId) return projectId;
    } catch (error) {
      console.warn(JSON.stringify({
        ok: false,
        step: "create smoke project",
        fallback: "list existing projects",
        reason: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  const listed = await requestJson("/api/projects");
  const projects = Array.isArray(listed.projects) ? listed.projects : [];
  const first = projects.find((item): item is JsonRecord => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  const projectId = first ? stringValue(first.id) : "";
  if (!projectId) throw new Error("No project is available for appraisal certificate smoke test.");
  return projectId;
}

async function requestJson(path: string, init: RequestInit = {}) {
  const response = await requestRaw(path, init);
  const body = await response.text();
  let parsed: JsonRecord = {};
  try {
    parsed = body ? JSON.parse(body) as JsonRecord : {};
  } catch {
    throw new Error(`${path} returned non-JSON response with status ${response.status}.`);
  }
  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}: ${String(parsed.error || parsed.message || "request failed")}`);
  }
  return parsed;
}

async function requestRaw(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      ...(init.headers || {}),
    },
  });
}

function sessionCookie(sessionUserId: string, sessionRole: string, orgId: string | null) {
  const payload = {
    userId: sessionUserId,
    role: sessionRole,
    orgId,
    expires: Date.now() + 1000 * 60 * 60,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", sessionSecret).update(encoded).digest("hex");
  return `ventureos_session=${encoded}.${signature}`;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function objectValue(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}
