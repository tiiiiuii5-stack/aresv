import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

import { SecurityError } from "@/lib/security/errors";
import { detectPromptInjectionSignals, staticAnalysisSandbox } from "@/lib/security/promptGuard";

export type SanitizedScanInput = {
  appCode: string;
  framework: string;
  modules: string[];
  inputTruncated: boolean;
  promptInjectionSignals: string[];
  sandbox: {
    mode: "static-analysis-only";
    codeExecuted: false;
    networkAccess: false;
  };
};

export type SanitizedRepoFile = {
  path: string;
  content: string;
};

export async function readJsonBody<T>(request: NextRequest, options: { maxBytes: number; requireJson?: boolean }): Promise<T> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > options.maxBytes) {
    throw new SecurityError(`Request body is too large. Limit is ${options.maxBytes} bytes.`, 413, "body_too_large");
  }

  const contentType = request.headers.get("content-type") || "";
  if (options.requireJson !== false && contentType && !contentType.toLowerCase().includes("application/json")) {
    throw new SecurityError("Content-Type must be application/json.", 415, "unsupported_media_type");
  }

  const text = await request.text();
  const byteLength = new TextEncoder().encode(text).byteLength;
  if (byteLength > options.maxBytes) {
    throw new SecurityError(`Request body is too large. Limit is ${options.maxBytes} bytes.`, 413, "body_too_large");
  }
  if (!text.trim()) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new SecurityError("Request body must be valid JSON.", 400, "invalid_json");
  }
}

export function sanitizeScanInput(
  input: { appCode: unknown; framework: unknown; modules: unknown },
  options: { maxCodeLength: number; maxModules?: number },
): SanitizedScanInput {
  const code = sanitizeUntrustedText(input.appCode, options.maxCodeLength);
  const framework = sanitizeIdentifier(input.framework, "unknown", 40);
  const modules = Array.isArray(input.modules)
    ? input.modules.map((moduleName) => sanitizeIdentifier(moduleName, "", 80)).filter(Boolean).slice(0, options.maxModules ?? 20)
    : [];

  return {
    appCode: code.value,
    framework,
    modules,
    inputTruncated: code.truncated,
    promptInjectionSignals: detectPromptInjectionSignals(code.value),
    sandbox: staticAnalysisSandbox(),
  };
}

export function sanitizeRepoFiles(files: unknown, options: { maxFiles: number; maxFileBytes: number; maxTotalBytes: number }) {
  if (!Array.isArray(files)) return { files: [] as SanitizedRepoFile[], promptInjectionSignals: [] as string[], totalBytes: 0, truncated: false };

  const output: SanitizedRepoFile[] = [];
  const promptInjectionSignals = new Set<string>();
  let totalBytes = 0;
  let truncated = false;

  for (const item of files.slice(0, options.maxFiles)) {
    if (!item || typeof item !== "object") continue;
    const file = item as Record<string, unknown>;
    const path = sanitizePath(file.path);
    if (!path || ignoredUnsafePath(path)) continue;

    const content = sanitizeUntrustedText(file.content, options.maxFileBytes);
    totalBytes += new TextEncoder().encode(content.value).byteLength;
    if (content.truncated) truncated = true;
    if (totalBytes > options.maxTotalBytes) {
      truncated = true;
      break;
    }
    for (const signal of detectPromptInjectionSignals(content.value)) promptInjectionSignals.add(signal);
    output.push({ path, content: content.value });
  }

  return { files: output, promptInjectionSignals: [...promptInjectionSignals], totalBytes, truncated };
}

export function sanitizeRepositoryReference(value: unknown) {
  const raw = typeof value === "string" ? value.trim().slice(0, 300) : "";
  if (!raw) return undefined;
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(raw)) return raw;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") throw new SecurityError("Repository URL must use https.", 400, "invalid_repository_url");
    if (isLocalOrPrivateHost(url.hostname)) throw new SecurityError("Repository URL cannot target localhost or private networks.", 400, "invalid_repository_url");
    return url.toString();
  } catch (error) {
    if (error instanceof SecurityError) throw error;
    throw new SecurityError("Repository must be an https URL or owner/repo reference.", 400, "invalid_repository_url");
  }
}

export function sanitizePublicText(value: unknown, maxLength: number) {
  return sanitizeUntrustedText(value, maxLength).value.trim();
}

export function hashForLog(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function sanitizeUntrustedText(value: unknown, maxLength: number) {
  const raw = typeof value === "string" ? value : value == null ? "" : JSON.stringify(value);
  const withoutControls = raw
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const truncated = withoutControls.length > maxLength;
  return { value: withoutControls.slice(0, maxLength), truncated };
}

function sanitizeIdentifier(value: unknown, fallback: string, maxLength: number) {
  const raw = typeof value === "string" ? value : "";
  const clean = raw.trim().toLowerCase().replace(/[^a-z0-9@/_+.-]/g, "").slice(0, maxLength);
  return clean || fallback;
}

function sanitizePath(value: unknown) {
  const raw = typeof value === "string" ? value : "";
  return raw
    .replace(/\\/g, "/")
    .replace(/\u0000/g, "")
    .replace(/(^|\/)\.\.(?=\/|$)/g, "")
    .replace(/^\/+/, "")
    .slice(0, 240);
}

function ignoredUnsafePath(path: string) {
  return /(^|\/)(node_modules|\.git|\.next|dist|build|coverage|vendor)\//i.test(path) || /\.(png|jpg|jpeg|gif|webp|ico|zip|gz|tar|pdf|exe|dll|lockb)$/i.test(path);
}

function isLocalOrPrivateHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (["localhost", "127.0.0.1", "::1"].includes(host)) return true;
  if (/^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return host.endsWith(".local") || host.endsWith(".internal");
}
