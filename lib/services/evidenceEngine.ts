import type { IntelligenceIssue } from "@/lib/services/intelligenceAnalysis";

export type EvidenceLocation = {
  line: number;
  column: number;
};

type ParsedFile = {
  path: string;
  content: string;
  lineOffset: number;
};

type EvidenceMatch = {
  filePath: string;
  location: EvidenceLocation;
  codeSnippet: string;
  explanation: string;
  confidenceScore: number;
};

type EvidenceRule = {
  issueId: string;
  patterns: RegExp[];
  explanation: string;
  confidenceScore: number;
};

const evidenceRules: EvidenceRule[] = [
  {
    issueId: "exposed-secret-literal",
    patterns: [
      /sk_(live|test)_[A-Za-z0-9_\-.]{16,}/i,
      /whsec_[A-Za-z0-9_\-.]{16,}/i,
      /SUPABASE_SERVICE_ROLE_KEY\s*=\s*["']?[A-Za-z0-9._-]{20,}/i,
      /DATABASE_URL\s*=\s*["']?postgres:\/\/[^"'\s]+:[^"'\s]+@/i,
      /postgres:\/\/[^"'\s]+:[^"'\s]+@/i,
      /api[_-]?key\s*[:=]\s*["'][A-Za-z0-9_\-.]{28,}["']/i,
      /bearer\s+[A-Za-z0-9_\-.]{32,}/i,
    ],
    explanation: "Matched a concrete secret-shaped token or private credential value in source.",
    confidenceScore: 95,
  },
  {
    issueId: "frontend-secret-exposure",
    patterns: [
      /["']use client["'][\s\S]{0,2500}process\.env\.(?!NEXT_PUBLIC_)[A-Z0-9_]*(SECRET|TOKEN|KEY)/i,
      /(?:process\.env\.)?NEXT_PUBLIC_([A-Z0-9_]*(SECRET|TOKEN|PRIVATE|SERVICE_ROLE)|(?:OPENAI|ANTHROPIC|GEMINI|RESEND|SENDGRID|TWILIO|DATABASE|STRIPE_SECRET|SUPABASE_SERVICE_ROLE|AUTH|JWT)[A-Z0-9_]*)/i,
      /["']use client["'][\s\S]{0,2500}(service_role|sk_live_|sk_test_|whsec_)/i,
    ],
    explanation: "Matched a client-side module that references a server credential or public secret name.",
    confidenceScore: 92,
  },
  {
    issueId: "ai-fake-auth-flow",
    patterns: [/(localStorage|sessionStorage)\.(getItem|setItem)\(\s*["'][^"']*(auth|token|user|session|loggedIn|isAuthenticated)[^"']*["']/i],
    explanation: "Matched browser storage being used as the source of authentication state.",
    confidenceScore: 88,
  },
  {
    issueId: "ai-ui-only-protection",
    patterns: [
      /(router\.push\(["']\/?(login|signin|sign-in)|if\s*\(\s*!?(isAuthenticated|user|session)|user\?\.role|user\.role|role\s*===|roles?\.includes)/i,
      /(localStorage|sessionStorage)\.getItem\(\s*["'][^"']*(auth|token|user|session|role)[^"']*["']/i,
    ],
    explanation: "Matched client-side gating logic used to protect an admin, private, or account UI.",
    confidenceScore: 89,
  },
  {
    issueId: "ai-phantom-api",
    patterns: [/\bfetch\s*\(\s*["']\/api\/[A-Za-z0-9_./\-[\]]+["']/],
    explanation: "Matched a static API call whose route handler was not found in the submitted files.",
    confidenceScore: 90,
  },
  {
    issueId: "ai-fake-persistence",
    patterns: [/(localStorage|sessionStorage)\.setItem\(/i],
    explanation: "Matched create/save behavior backed only by browser storage.",
    confidenceScore: 84,
  },
  {
    issueId: "ai-no-op-action",
    patterns: [
      /<(?:button|form)[^>]+on(?:Click|Submit)\s*=\s*\{\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*(?:\{\s*(?:(?:event|e)\.preventDefault\(\);?\s*)?(?:(?:console\.log|alert)\([^;]*\);?\s*)?\}|(?:console\.log|alert)\([^)]*\)|undefined|null)\s*\}/i,
      /on(?:Click|Submit)\s*=\s*\{[^}]{0,180}(TODO|coming soon|not implemented|placeholder|stub|noop|no-op)[^}]{0,180}\}/i,
    ],
    explanation: "Matched a user action handler that is empty, placeholder-only, console-only, or alert-only.",
    confidenceScore: 86,
  },
  {
    issueId: "ai-missing-backend-implementation",
    patterns: [/(<form[^>]+onSubmit|onSubmit\s*=)[\s\S]{0,1600}preventDefault\(\)/i, /preventDefault\(\)/i],
    explanation: "Matched a form submit handler that prevents default behavior without backend submission evidence.",
    confidenceScore: 82,
  },
  {
    issueId: "ai-broken-deployment-assumption",
    patterns: [/https?:\/\/(localhost|127\.0\.0\.1)/i, /fs\.(writeFile|writeFileSync|appendFile|mkdirSync)/],
    explanation: "Matched localhost runtime dependency or local filesystem write in production code.",
    confidenceScore: 90,
  },
  {
    issueId: "unsafe-sql-query",
    patterns: [
      /\$(?:queryRawUnsafe|executeRawUnsafe)\s*\(\s*`[^`]*\$\{/i,
      /\$(?:queryRawUnsafe|executeRawUnsafe)\s*\(\s*["'][^"']*["']\s*\+/i,
      /\b(?:query|execute)\s*\([^)]*\+[^)]*\)/i,
    ],
    explanation: "Matched raw SQL construction that can bypass parameterization.",
    confidenceScore: 94,
  },
  {
    issueId: "missing-auth-middleware",
    patterns: [/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/],
    explanation: "Matched a sensitive route handler where no auth guard was detected in the same source segment.",
    confidenceScore: 78,
  },
  {
    issueId: "insecure-mutating-api-route",
    patterns: [/export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\s*\(/],
    explanation: "Matched a mutating route handler with write behavior and no detected auth plus ownership/role guard.",
    confidenceScore: 86,
  },
  {
    issueId: "open-admin-endpoint",
    patterns: [/admin/i, /deleteUser/i, /impersonate/i, /banUser/i, /setRole/i, /grantPermission/i, /updateRole/i],
    explanation: "Matched an admin-named surface or privileged user-management action without a detected role gate.",
    confidenceScore: 92,
  },
  {
    issueId: "weak-authorization-pattern",
    patterns: [
      /(role|isAdmin|userId|ownerId)\s*=\s*(body|req\.body|requestBody|searchParams|params)/i,
      /body\.(role|isAdmin|userId|ownerId)/i,
      /email\.endsWith\(["'][^"']+["']\)/i,
    ],
    explanation: "Matched authorization data being read from request-controlled input.",
    confidenceScore: 88,
  },
  {
    issueId: "webhook-without-signature-validation",
    patterns: [/export\s+async\s+function\s+POST\s*\([\s\S]{0,2000}(webhook|stripe|svix|github|clerk|paypal)/i, /webhook/i],
    explanation: "Matched a webhook handler. The scanner did not detect signature verification.",
    confidenceScore: 84,
  },
  {
    issueId: "cors-wildcard",
    patterns: [/Access-Control-Allow-Origin["']?\s*[:,]\s*["']\*/i],
    explanation: "Matched a wildcard CORS response header.",
    confidenceScore: 96,
  },
  {
    issueId: "missing-rate-limit",
    patterns: [/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\([\s\S]{0,2000}(^|[\/_\-\s.])(login|signup|password|generate|analyze|upload|checkout|payment|webhook|ai|openai|gemini|stripe|anthropic)([\/_\-\s.]|$)/i],
    explanation: "Matched a sensitive route or action keyword without a detected rate-limit guard.",
    confidenceScore: 76,
  },
  {
    issueId: "dangerous-code-execution",
    patterns: [/\beval\s*\(/, /new\s+Function\s*\(/, /\b(exec|execFile|spawn|fork)\s*\(/],
    explanation: "Matched dynamic code execution or direct child-process execution.",
    confidenceScore: 96,
  },
  {
    issueId: "missing-env-validation",
    patterns: [/process\.env\.(?!NEXT_PUBLIC_)(DATABASE_URL|[A-Z0-9_]*(SECRET|TOKEN|PRIVATE|SERVICE_ROLE|STRIPE|SUPABASE|OPENAI|GEMINI|ANTHROPIC|KEY)[A-Z0-9_]*)/i],
    explanation: "Matched sensitive environment variable usage without detected centralized validation.",
    confidenceScore: 76,
  },
  {
    issueId: "repo-serverless-localhost",
    patterns: [/https?:\/\/(localhost|127\.0\.0\.1)/i],
    explanation: "Matched a localhost URL in source.",
    confidenceScore: 96,
  },
  {
    issueId: "repo-serverless-file-writes",
    patterns: [/fs\.(writeFile|writeFileSync|appendFile|mkdirSync)/],
    explanation: "Matched a local filesystem write in server/API code.",
    confidenceScore: 92,
  },
];

const structuralIssueIds = new Set([
  "repo-missing-lockfile",
  "repo-missing-ci",
  "repo-missing-tests",
  "repo-missing-env-template",
  "repo-missing-health-route",
  "repo-migrations-missing",
]);

const runtimeEvidenceIssueIds = new Set([
  "ai-broken-deployment-assumption",
  "repo-serverless-localhost",
  "repo-serverless-file-writes",
  "unsafe-sql-query",
  "weak-authorization-pattern",
  "webhook-without-signature-validation",
  "cors-wildcard",
  "missing-rate-limit",
  "dangerous-code-execution",
]);

export function enrichFindingsWithEvidence<T extends IntelligenceIssue>(issues: T[], source: string): T[] {
  if (!source.trim() || issues.length === 0) return issues;
  const files = parseSourceFiles(source);
  return issues.map((issue) => {
    const match = findEvidence(issue, files);
    if (!match) return issue;
    return {
      ...issue,
      filePath: match.filePath,
      location: match.location,
      codeSnippet: match.codeSnippet,
      explanation: match.explanation,
      confidenceScore: Math.max(issue.confidenceScore ?? 0, match.confidenceScore),
    };
  });
}

function findEvidence(issue: IntelligenceIssue, files: ParsedFile[]): EvidenceMatch | null {
  if (structuralIssueIds.has(issue.id)) return null;
  if (issue.id === "insecure-mutating-api-route") return findInsecureMutatingApiRouteEvidence(files);
  const rule = evidenceRules.find((item) => item.issueId === issue.id);
  if (!rule) return null;

  for (const file of files.filter((item) => evidenceFileAllowed(issue.id, item.path))) {
    for (const pattern of rule.patterns) {
      const match = pattern.exec(file.content);
      if (!match || match.index < 0) continue;
      return buildMatch(file, match.index, rule);
    }

    if (rule.patterns.some((pattern) => pattern.test(file.path))) {
      return buildMatch(file, 0, rule);
    }
  }

  return null;
}

function findInsecureMutatingApiRouteEvidence(files: ParsedFile[]): EvidenceMatch | null {
  const rule = evidenceRules.find((item) => item.issueId === "insecure-mutating-api-route");
  if (!rule) return null;

  for (const file of files.filter((item) => evidenceFileAllowed("insecure-mutating-api-route", item.path))) {
    if (
      !isApiRoutePath(file.path) ||
      !hasMutatingRoute(file.content) ||
      !hasWriteOperation(file.content) ||
      isAllowedAnonymousTelemetryWrite(file.content) ||
      (hasAuthGuard(file.content) && hasOwnershipOrRoleGuard(file.content))
    ) {
      continue;
    }

    const mutatingHandler = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\s*\(/.exec(file.content);
    return buildMatch(file, mutatingHandler?.index ?? 0, rule);
  }

  return null;
}

function isApiRoutePath(path: string) {
  return /(?:^|\/)(app\/api\/.+\/route|pages\/api\/.+)\.(tsx?|jsx?|mjs|cjs)$/i.test(path.replace(/\\/g, "/").toLowerCase());
}

function hasMutatingRoute(source: string) {
  return /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\s*\(/.test(source);
}

function hasWriteOperation(source: string) {
  const executable = stripCommentsStringsAndRegex(source);
  return (
    /\b(?:prisma|db)\.[a-zA-Z0-9_]+\.(create|update|upsert|delete|deleteMany|updateMany)\s*\(/i.test(executable) ||
    /\b(?:setDoc|addDoc|deleteDoc)\s*\(/i.test(executable) ||
    /\bsupabase\.[\s\S]{0,160}\.(insert|update|upsert|delete)\s*\(/i.test(executable) ||
    /\$\s*(?:executeRaw|executeRawUnsafe|queryRawUnsafe)\s*\(\s*(?:`[^`]*\b(?:INSERT|UPDATE|DELETE|UPSERT)\b|["'][^"']*\b(?:INSERT|UPDATE|DELETE|UPSERT)\b)/i.test(source)
  );
}

function hasAuthGuard(source: string) {
  return /(compileTrust\s*\(|requireAuth|requireSession|getServerSession|auth\(|currentUser|verifyToken|verifyJwt|verifyIntelligenceBearer|verifyGitHubWebhookSignature|x-hub-signature|authorization|bearer|jwt|session|clerk|auth0|nextauth|supabase\.auth)/i.test(source);
}

function hasOwnershipOrRoleGuard(source: string) {
  return /(assertOwnership|assertOrgAccess|resolveWorkspaceProjectIdForUser|ownerId|userId|teamId|tenantId|organizationId|orgId|role|permission|rbac|requireRole|requireAdmin|hasRole|can\()/i.test(source);
}

function isAllowedAnonymousTelemetryWrite(source: string) {
  const executable = stripCommentsStringsAndRegex(source);
  return (
    /compileTrust\s*\([\s\S]{0,240}mode\s*:\s*["']publicNonPersistent["']/i.test(source) &&
    /\benforceRateLimit\s*\(/i.test(executable) &&
    /(allowedEvents\s*=\s*new\s+Set|allowedEvents\.has\s*\()/i.test(source) &&
    /\bINSERT\s+INTO\s+(?:\\?["'])?app_telemetry_events(?:\\?["'])?/i.test(source) &&
    /(repositoryHash|rawSourceStored\s*=\s*false|sanitizeMetadata)/i.test(source) &&
    !hasRequestControlledPrivilege(source)
  );
}

function hasRequestControlledPrivilege(source: string) {
  const sanitized = stripCommentsStringsAndRegex(source).replace(
    /\bdelete\s+(body|req\.body|requestBody|searchParams|params)\.(role|isAdmin|permissions?|ownerId|userId|actorId|orgId|teamId)\s*;?/gi,
    "",
  );
  return /(body|req\.body|requestBody|searchParams|params)\.(role|isAdmin|permissions?|ownerId|userId)|\b(role|isAdmin|permissions?)\s*=\s*(body|req\.body|requestBody|searchParams|params)/i.test(sanitized);
}

function stripCommentsStringsAndRegex(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, " ")
    .replace(/(["'`])(?:\\[\s\S]|(?!\1)[\s\S])*\1/g, " ");
}

function evidenceFileAllowed(issueId: string, filePath: string) {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\.\/+/, "").toLowerCase();
  if (/(^|\/)(sample-report|demo|fixture|fixtures|mock|mocks|examples?)\//i.test(normalized)) return false;
  if (!runtimeEvidenceIssueIds.has(issueId)) return true;
  if (!/\.(tsx?|jsx?|mjs|cjs)$/i.test(normalized)) return false;
  if (/\.(d|config)\.ts$/i.test(normalized)) return false;
  if (/(^|\/)(package(?:-lock)?\.json|\.env(?:\..*)?|prisma\/schema\.prisma)$/i.test(normalized)) return false;
  return true;
}

function buildMatch(file: ParsedFile, index: number, rule: EvidenceRule): EvidenceMatch {
  const location = locationForIndex(file.content, index);
  return {
    filePath: file.path,
    location,
    codeSnippet: snippetForLine(file.content, location.line),
    explanation: rule.explanation,
    confidenceScore: rule.confidenceScore,
  };
}

function parseSourceFiles(source: string): ParsedFile[] {
  const markerPattern = /^\/\/ FILE:\s+(.+)$/gm;
  const markers = [...source.matchAll(markerPattern)];
  if (markers.length === 0) return [{ path: "submitted-code", content: source, lineOffset: 0 }];

  return markers.map((marker, index) => {
    const markerEnd = (marker.index ?? 0) + marker[0].length;
    const nextMarkerStart = markers[index + 1]?.index ?? source.length;
    const content = source.slice(markerEnd, nextMarkerStart).replace(/^\r?\n/, "");
    const path = marker[1]?.trim() || "unknown-file";
    return {
      path,
      content,
      lineOffset: lineNumberForIndex(source, markerEnd),
    };
  });
}

function locationForIndex(content: string, index: number): EvidenceLocation {
  const before = content.slice(0, index);
  const lines = before.split(/\r?\n/);
  return {
    line: lines.length,
    column: (lines[lines.length - 1]?.length ?? 0) + 1,
  };
}

function lineNumberForIndex(content: string, index: number) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function snippetForLine(content: string, line: number) {
  const lines = content.split(/\r?\n/);
  const start = Math.max(0, line - 2);
  const end = Math.min(lines.length, line + 1);
  return lines
    .slice(start, end)
    .map((text, offset) => `${start + offset + 1}: ${redactSecrets(text)}`)
    .join("\n");
}

function redactSecrets(value: string) {
  return value
    .replace(/sk_(live|test)_[A-Za-z0-9_\-.]+/gi, "sk_$1_[redacted]")
    .replace(/whsec_[A-Za-z0-9_\-.]+/gi, "whsec_[redacted]")
    .replace(/postgres:\/\/[^"'\s]+/gi, "postgres://[redacted]")
    .replace(/bearer\s+[A-Za-z0-9_\-.]{24,}/gi, "bearer [redacted]");
}
