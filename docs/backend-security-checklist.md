# VentureOS Backend Security Checklist

This checklist covers the VentureOS Intelligence Layer backend itself: API routes, scan ingestion, public demo flows, logging, and operational safety.

## Updated Code Structure

```txt
lib/
  diagnostics.ts
    Structured logging, redaction, safe client error messages.

  security/
    backendSecurity.ts
      Rate limiting
      JSON body size limits
      Public text sanitization
      Scan input sanitization
      Prompt-injection signal detection
      Static-analysis sandbox metadata
      Safe JSON responses
      Security response headers

app/api/
  analyze-app/route.ts
    Paid/API-key scan route
    Rate limited
    JSON body limited
    Scan input sanitized
    Static scan envelope attached

  scan-repo/route.ts
    Paid/API-key repository scan route
    Rate limited
    Repository references validated
    Repo files sanitized and capped
    Static scan envelope attached

  public-demo-scan/route.ts
    No-login public demo scan
    Strict public rate limit
    Small input cap
    Returns limited findings only

  waitlist/route.ts
    Early-access capture
    Strict public rate limit
    Email validation
    Sanitized role/use-case fields
    User agent stored as hash only
```

## Implemented Controls

- Rate limiting:
  - Uses Redis through `REDIS_URL` when configured.
  - Falls back to an in-memory limiter for local development.
  - Adds `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.
  - Policies:
    - `/api/analyze-app`: 60 requests/minute per fingerprint.
    - `/api/scan-repo`: 20 requests/minute per fingerprint.
    - `/api/public-demo-scan`: 8 requests/hour per fingerprint.
    - `/api/waitlist`: 4 requests/hour per fingerprint.

- Input sanitization:
  - JSON body parsing now enforces content type and body size limits.
  - Public text strips control characters and caps length.
  - Scan input normalizes framework/modules and caps code length.
  - Repo scans cap file count, per-file bytes, and total bytes.
  - Repo paths strip traversal markers and ignore unsafe/binary/generated paths.

- Prompt-injection protection:
  - User code is treated as untrusted data, never as instructions.
  - Prompt-injection phrases are detected and returned as `securityWarnings`.
  - Scan metadata records prompt-injection signals for auditability.
  - Scanner output includes a static sandbox envelope:
    - `mode: "static-analysis-only"`
    - `codeExecuted: false`
    - `networkAccess: false`

- Safe scanning sandboxing:
  - Current scanner performs static analysis only.
  - User-submitted code is not executed, imported, evaluated, or network-fetched.
  - Repository references reject localhost/private network URLs to prevent future SSRF mistakes.
  - Large/binary/generated directories are ignored before analysis.

- Proper error handling:
  - `SecurityError` returns safe client messages and status codes.
  - 500 responses use generic client-facing errors.
  - Error responses include `traceId`, not stack traces.
  - Stripe/API-key monetization errors preserve existing status behavior.

- Logging best practices:
  - Logs are structured JSON.
  - Sensitive keys, database URLs, JWTs, Stripe keys, webhook secrets, and long token-like strings are redacted.
  - Production error logs omit stack traces.
  - Waitlist user agents are stored as hashes.
  - Scan route logs include counts, framework, risk, and warning IDs, not raw code.

## Security Checklist

### API Surface

- [x] Authenticated scan APIs remain protected by API key/quota enforcement.
- [x] Public demo scan is separate from paid scan route.
- [x] Public routes have stricter rate limits than paid routes.
- [x] Rate-limit headers are returned to clients.
- [x] Error responses do not expose stack traces.
- [x] Security headers are attached to hardened JSON responses.

### Input Handling

- [x] JSON request body size is capped.
- [x] Invalid JSON returns `400`.
- [x] Wrong content type returns `415`.
- [x] Oversized body returns `413`.
- [x] Code input strips dangerous control characters.
- [x] Repo scan files are capped by count and size.
- [x] Repo paths are normalized and traversal-resistant.
- [x] Localhost/private repository URLs are rejected.

### Prompt Injection

- [x] User code is treated as untrusted content.
- [x] Prompt-injection signals are detected.
- [x] Signals are returned to callers as warnings.
- [x] Signals are recorded in scan metadata.
- [x] User-provided scan text is not used as system/developer instructions.

### Static Scan Safety

- [x] User code is never executed by scanner routes.
- [x] User code is never imported dynamically.
- [x] User code is never passed to shell commands.
- [x] Public demo scan is limited to small inputs and limited findings.
- [x] Repo scans ignore binary/build/dependency directories.

### Logging and Privacy

- [x] Logs redact secrets by key name and value shape.
- [x] Database connection errors are redacted.
- [x] Production stack traces are suppressed.
- [x] Waitlist metadata avoids raw user-agent storage.
- [x] Logs avoid raw app code.

## Remaining Hardening Backlog

- [ ] Replace memory fallback with mandatory Redis/Upstash in production by failing startup when `REDIS_URL` is missing.
- [ ] Add centralized `withSecureRoute` wrapper and migrate every API route, not just scan/waitlist surfaces.
- [ ] Add integration tests for rate-limit, body-size, invalid JSON, and prompt-injection warning behavior.
- [ ] Add Content Security Policy headers for page responses through middleware.
- [ ] Add production alerting for repeated `rate_limited`, `invalid_json`, and `prompt_injection` events.
- [ ] Add a quarantine path for code samples containing live-looking secrets.
