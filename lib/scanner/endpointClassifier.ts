export type EndpointClassificationKind =
  | "internal_api"
  | "third_party_endpoint"
  | "localhost_dependency"
  | "env_fallback";

export type EndpointClassificationStatus =
  | "implemented"
  | "missing_internal_api"
  | "external_reference"
  | "localhost_runtime_dependency"
  | "missing_env_fallback";

export type EndpointClassification = {
  kind: EndpointClassificationKind;
  status: EndpointClassificationStatus;
  endpoint: string;
  filePath: string;
  line: number;
  severity: "high" | "medium" | "low";
  blocking: boolean;
  evidence: string;
  fixSuggestion: string;
};

type EndpointFile = {
  path: string;
  content: string;
};

export function classifyRepositoryEndpoints(files: EndpointFile[]): EndpointClassification[] {
  const routePaths = files.map((file) => apiRouteFromPath(file.path)).filter((route): route is string => Boolean(route));
  const classifications: EndpointClassification[] = [];

  for (const file of files) {
    for (const fallback of extractEnvFallbacks(file)) classifications.push(fallback);
    for (const endpoint of extractEndpointReferences(file)) {
      if (endpoint.url.startsWith("/api/")) {
        const implemented = routePaths.some((routePath) => apiPathMatchesRoute(routePath, endpoint.url));
        classifications.push({
          kind: "internal_api",
          status: implemented ? "implemented" : "missing_internal_api",
          endpoint: endpoint.url,
          filePath: file.path,
          line: endpoint.line,
          severity: implemented ? "low" : "high",
          blocking: !implemented,
          evidence: implemented
            ? `Internal API call ${endpoint.url} resolves to a submitted route handler.`
            : `Internal API call ${endpoint.url} has no matching submitted route handler.`,
          fixSuggestion: implemented
            ? "No change required for this endpoint reference."
            : "Create the missing API route or point the client call at an existing route with the same request contract.",
        });
        continue;
      }

      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\b/i.test(endpoint.url)) {
        classifications.push({
          kind: "localhost_dependency",
          status: "localhost_runtime_dependency",
          endpoint: endpoint.url,
          filePath: file.path,
          line: endpoint.line,
          severity: "high",
          blocking: true,
          evidence: `Runtime endpoint ${endpoint.url} points to localhost.`,
          fixSuggestion: "Replace localhost URLs with required environment variables and fail closed outside local development.",
        });
        continue;
      }

      if (/^https?:\/\//i.test(endpoint.url)) {
        classifications.push({
          kind: "third_party_endpoint",
          status: "external_reference",
          endpoint: endpoint.url,
          filePath: file.path,
          line: endpoint.line,
          severity: "low",
          blocking: false,
          evidence: `Hardcoded external endpoint ${safeEndpoint(endpoint.url)} was detected.`,
          fixSuggestion: "Keep third-party base URLs in configuration when environments differ; otherwise document this provider dependency.",
        });
      }
    }
  }

  return classifications.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.filePath.localeCompare(b.filePath) || a.line - b.line);
}

function extractEndpointReferences(file: EndpointFile) {
  const output: Array<{ url: string; line: number }> = [];
  const executableLines = stripCommentLines(file.content);
  for (const item of executableLines) {
    const patterns = [
      /\bfetch\s*\(\s*["']([^"']+)["']/g,
      /\baxios(?:\.[a-z]+)?\s*\(\s*["']([^"']+)["']/gi,
      /\baxios\.(?:get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']/gi,
    ];
    for (const pattern of patterns) {
      for (const match of item.text.matchAll(pattern)) {
        const url = match[1]?.trim();
        if (url) output.push({ url, line: item.line });
      }
    }
  }
  return output;
}

function extractEnvFallbacks(file: EndpointFile): EndpointClassification[] {
  const output: EndpointClassification[] = [];
  const executableLines = stripCommentLines(file.content);
  const fallbackPattern = /process\.env\.([A-Z0-9_]+)\s*(?:\|\||\?\?)\s*["'](https?:\/\/(?:localhost|127\.0\.0\.1)[^"']*)["']/gi;
  for (const item of executableLines) {
    for (const match of item.text.matchAll(fallbackPattern)) {
      const envName = match[1] || "ENV_VAR";
      const endpoint = match[2] || "localhost";
      output.push({
        kind: "env_fallback",
        status: "missing_env_fallback",
        endpoint,
        filePath: file.path,
        line: item.line,
        severity: "high",
        blocking: true,
        evidence: `${envName} falls back to ${endpoint}.`,
        fixSuggestion: `Require ${envName} in production and remove the localhost fallback from deployed code paths.`,
      });
    }
  }
  return output;
}

function stripCommentLines(source: string) {
  const lines = source.split("\n");
  const output: Array<{ text: string; line: number }> = [];
  let inBlockComment = false;

  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index] || "";
    let cursor = 0;
    let kept = "";

    while (cursor < text.length) {
      if (inBlockComment) {
        const end = text.indexOf("*/", cursor);
        if (end === -1) {
          cursor = text.length;
          continue;
        }
        inBlockComment = false;
        cursor = end + 2;
        continue;
      }

      const lineComment = findCommentTokenOutsideString(text, "//", cursor);
      const blockComment = findCommentTokenOutsideString(text, "/*", cursor);
      if (lineComment !== -1 && (blockComment === -1 || lineComment < blockComment)) {
        kept += text.slice(cursor, lineComment);
        cursor = text.length;
        continue;
      }
      if (blockComment !== -1) {
        kept += text.slice(cursor, blockComment);
        inBlockComment = true;
        cursor = blockComment + 2;
        continue;
      }
      kept += text.slice(cursor);
      cursor = text.length;
    }

    output.push({ text: kept, line: index + 1 });
  }

  return output;
}

function findCommentTokenOutsideString(text: string, token: "//" | "/*", start: number) {
  let quote: "'" | "\"" | "`" | null = null;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === "\"" || char === "`") {
      quote = char;
      continue;
    }
    if (text.startsWith(token, index)) return index;
  }

  return -1;
}

function apiRouteFromPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const appRoute = normalized.match(/(?:^|\/)app\/api\/(.+)\/route\.(?:ts|tsx|js|jsx|mjs|cjs)$/i);
  if (appRoute?.[1]) return `/api/${appRoute[1].replace(/\/index$/i, "")}`;

  const pagesRoute = normalized.match(/(?:^|\/)pages\/api\/(.+)\.(?:ts|tsx|js|jsx|mjs|cjs)$/i);
  if (pagesRoute?.[1]) return `/api/${pagesRoute[1].replace(/\/index$/i, "")}`;

  return null;
}

function apiPathMatchesRoute(routePath: string, apiPath: string) {
  const routeParts = routePath.split("/").filter(Boolean);
  const apiParts = apiPath.split(/[?#]/)[0]?.split("/").filter(Boolean) || [];

  for (let index = 0; index < routeParts.length; index += 1) {
    const routePart = routeParts[index];
    const apiPart = apiParts[index];
    if (routePart?.startsWith("[[...") && routePart.endsWith("]]")) return apiParts.length >= index;
    if (routePart?.startsWith("[...") && routePart.endsWith("]")) return apiParts.length >= index;
    if (!apiPart) return false;
    if (routePart?.startsWith("[") && routePart.endsWith("]")) continue;
    if (routePart !== apiPart) return false;
  }

  return routeParts.length === apiParts.length;
}

function safeEndpoint(value: string) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.slice(0, 120);
  }
}

function severityRank(value: "high" | "medium" | "low") {
  return value === "high" ? 3 : value === "medium" ? 2 : 1;
}
