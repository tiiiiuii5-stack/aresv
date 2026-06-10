export type ProofSourceFile = {
  path: string;
  content: string;
};

export type FindingEvidenceType = "code" | "manifest" | "metadata" | "file-inventory";

export type FindingFileEvidence = {
  filePath: string;
  line: number | null;
  column: number | null;
  codeSnippet: string;
  reason: string;
  evidenceType: FindingEvidenceType;
  confidence: number;
};

export type ReproducibleProof = {
  method: "static-analysis";
  deterministic: true;
  steps: string[];
  observedResult: string;
  expectedResult: string;
};

export type FindingProofBundle = {
  fileEvidence: FindingFileEvidence[];
  reasoning: string;
  confidenceScore: number;
  reproducibleProof: ReproducibleProof;
  supported: true;
};

export type FindingProofFields = {
  fileEvidence: FindingFileEvidence[];
  reasoning: string;
  confidenceScore: number;
  reproducibleProof: ReproducibleProof;
  proof: FindingProofBundle;
};

type ProofableIssue = {
  id?: string;
  ruleId?: string;
  title?: string;
  evidence?: unknown;
  filePath?: string;
  location?: {
    line?: number;
    column?: number;
  };
  codeSnippet?: string;
  explanation?: string;
  recommendation?: string;
  fixSuggestion?: string;
  confidence?: number;
  confidenceScore?: number;
};

type EvidenceRecord = {
  source?: unknown;
  filePath?: unknown;
  line?: unknown;
  column?: unknown;
  snippet?: unknown;
  codeSnippet?: unknown;
  reason?: unknown;
  detail?: unknown;
  confidence?: unknown;
};

export type FindingProofContext = {
  files?: ProofSourceFile[];
  source?: string;
  scanner?: string;
};

export function attachFindingProof<T extends ProofableIssue>(issue: T, context: FindingProofContext = {}): T & FindingProofFields {
  const proof = buildFindingProof(issue, context);
  return {
    ...issue,
    fileEvidence: proof.fileEvidence,
    reasoning: proof.reasoning,
    confidenceScore: proof.confidenceScore,
    reproducibleProof: proof.reproducibleProof,
    proof,
  };
}

export function buildFindingProof(issue: ProofableIssue, context: FindingProofContext = {}): FindingProofBundle {
  const files = normalizeFiles(context.files || (context.source ? parseSourceFiles(context.source) : []));
  const fileEvidence = collectFileEvidence(issue, files);
  const confidenceScore = confidenceScoreFor(issue, fileEvidence);
  const reasoning = reasoningFor(issue, fileEvidence, confidenceScore);
  const reproducibleProof = reproducibleProofFor(issue, fileEvidence, context.scanner);

  return {
    fileEvidence,
    reasoning,
    confidenceScore,
    reproducibleProof,
    supported: true,
  };
}

function collectFileEvidence(issue: ProofableIssue, files: ProofSourceFile[]): FindingFileEvidence[] {
  const collected: FindingFileEvidence[] = [];
  const evidence = issue.evidence;

  if (Array.isArray(evidence)) {
    for (const item of evidence) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      collected.push(fileEvidenceFromRecord(issue, item as EvidenceRecord, files));
    }
  } else if (typeof evidence === "string" && evidence.trim()) {
    collected.push(fileEvidenceFromString(issue, evidence, files));
  }

  if (collected.length === 0 && (issue.filePath || issue.codeSnippet || issue.explanation)) {
    collected.push(fileEvidenceFromString(issue, issue.explanation || issue.codeSnippet || "Finding includes a source location.", files));
  }

  if (collected.length === 0) {
    collected.push(inventoryEvidence(issue, files, "Finding is supported by the scanned file inventory and rule-specific structural analysis."));
  }

  return uniqueEvidence(collected).slice(0, 6);
}

function fileEvidenceFromRecord(issue: ProofableIssue, record: EvidenceRecord, files: ProofSourceFile[]): FindingFileEvidence {
  const source = stringValue(record.source);
  const filePath = normalizePath(stringValue(record.filePath) || issue.filePath || anchorFileForIssue(issue, files) || "__scan_file_inventory__");
  const file = files.find((item) => item.path === filePath);
  const line = numberOrNull(record.line) ?? issue.location?.line ?? null;
  const column = numberOrNull(record.column) ?? issue.location?.column ?? null;
  const codeSnippet =
    stringValue(record.snippet) ||
    stringValue(record.codeSnippet) ||
    issue.codeSnippet ||
    snippetFor(file, line) ||
    inventorySnippet(files);
  const reason =
    stringValue(record.reason) ||
    stringValue(record.detail) ||
    issue.explanation ||
    stringValue(issue.evidence) ||
    "Scanner rule matched this evidence item.";

  return {
    filePath,
    line,
    column,
    codeSnippet: redactSecrets(cleanSnippet(codeSnippet)),
    reason: cleanReason(reason),
    evidenceType: evidenceTypeFor(source, filePath),
    confidence: boundedConfidence(confidenceToScore(record.confidence ?? issue.confidenceScore ?? issue.confidence)),
  };
}

function fileEvidenceFromString(issue: ProofableIssue, evidence: string, files: ProofSourceFile[]): FindingFileEvidence {
  const filePath = normalizePath(issue.filePath || anchorFileForIssue(issue, files) || "__scan_file_inventory__");
  const file = files.find((item) => item.path === filePath);
  const line = issue.location?.line ?? null;
  return {
    filePath,
    line,
    column: issue.location?.column ?? null,
    codeSnippet: redactSecrets(cleanSnippet(issue.codeSnippet || snippetFor(file, line) || inventorySnippet(files))),
    reason: cleanReason(issue.explanation || evidence),
    evidenceType: filePath === "__scan_file_inventory__" ? "file-inventory" : "code",
    confidence: boundedConfidence(confidenceToScore(issue.confidenceScore ?? issue.confidence)),
  };
}

function inventoryEvidence(issue: ProofableIssue, files: ProofSourceFile[], reason: string): FindingFileEvidence {
  return {
    filePath: "__scan_file_inventory__",
    line: null,
    column: null,
    codeSnippet: inventorySnippet(files),
    reason: cleanReason(issue.explanation || reason),
    evidenceType: "file-inventory",
    confidence: boundedConfidence(confidenceToScore(issue.confidenceScore ?? issue.confidence)),
  };
}

function reasoningFor(issue: ProofableIssue, fileEvidence: FindingFileEvidence[], confidenceScore: number) {
  const rule = issue.ruleId || issue.id || "scanner-rule";
  const primary = fileEvidence[0];
  const title = issue.title || "Finding";
  const recommendation = issue.recommendation || issue.fixSuggestion;
  const parts = [
    `${title} is emitted by ${rule} because ${primary?.reason || "the scanner found reproducible evidence"}.`,
    `The claim is anchored to ${fileEvidence.length} evidence item${fileEvidence.length === 1 ? "" : "s"} with a ${confidenceScore}/100 confidence score.`,
  ];
  if (recommendation) parts.push(`Recommended fix: ${recommendation}`);
  return parts.join(" ");
}

function reproducibleProofFor(issue: ProofableIssue, fileEvidence: FindingFileEvidence[], scanner?: string): ReproducibleProof {
  const rule = issue.ruleId || issue.id || "scanner-rule";
  const title = issue.title || "finding";
  const primary = fileEvidence[0];
  const steps = [
    `Run ${scanner || "the VentureOS scanner"} against the same submitted files without executing application code.`,
    ...fileEvidence.slice(0, 3).map((item) =>
      item.filePath === "__scan_file_inventory__"
        ? `Inspect the scanned file inventory and confirm: ${item.reason}`
        : `Open ${item.filePath}${item.line ? ` at line ${item.line}` : ""} and confirm the evidence snippet matches the rule condition.`,
    ),
    `Apply rule ${rule} and keep the finding only when the evidence above is present.`,
  ];

  return {
    method: "static-analysis",
    deterministic: true,
    steps,
    observedResult: primary ? `${title}: ${primary.reason}` : `${title}: scanner rule produced supported evidence.`,
    expectedResult: `The same input should reproduce rule ${rule} with the same evidence anchors and confidence score.`,
  };
}

function confidenceScoreFor(issue: ProofableIssue, evidence: FindingFileEvidence[]) {
  const explicit = confidenceToScore(issue.confidenceScore ?? issue.confidence);
  const evidenceAverage = evidence.length ? Math.round(evidence.reduce((sum, item) => sum + item.confidence, 0) / evidence.length) : 75;
  return boundedConfidence(Math.max(explicit, evidenceAverage));
}

function confidenceToScore(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0) return 75;
  return number <= 1 ? Math.round(number * 100) : Math.round(number);
}

function anchorFileForIssue(issue: ProofableIssue, files: ProofSourceFile[]) {
  const text = `${issue.id || ""} ${issue.ruleId || ""} ${issue.title || ""}`.toLowerCase();
  if (/package|lockfile|build script|dependency/.test(text)) return files.find((file) => /(^|\/)package\.json$/i.test(file.path))?.path;
  if (/env|environment/.test(text)) return files.find((file) => /(^|\/)(\.env\.example|package\.json)$/i.test(file.path))?.path;
  if (/prisma|migration|database|schema/.test(text)) return files.find((file) => /(^|\/)(prisma\/schema\.prisma|schema\.sql|package\.json)$/i.test(file.path))?.path;
  if (/health|api|route|endpoint/.test(text)) return files.find((file) => /(^|\/)(app\/api|pages\/api)\//i.test(file.path))?.path;
  return files[0]?.path;
}

function snippetFor(file: ProofSourceFile | undefined, line: number | null) {
  if (!file) return "";
  if (line && line > 0) {
    const lines = file.content.split(/\r?\n/);
    const index = Math.min(lines.length - 1, line - 1);
    return `${index + 1}: ${lines[index] || ""}`.trim();
  }
  const firstMeaningful = file.content.split(/\r?\n/).find((item) => item.trim());
  return firstMeaningful ? firstMeaningful.trim().slice(0, 260) : "";
}

function inventorySnippet(files: ProofSourceFile[]) {
  if (files.length === 0) return "No source files were supplied with this finding.";
  return `Scanned files: ${files.slice(0, 16).map((file) => file.path).join(", ")}${files.length > 16 ? `, +${files.length - 16} more` : ""}`;
}

function evidenceTypeFor(source: string, filePath: string): FindingEvidenceType {
  if (filePath === "__scan_file_inventory__") return "file-inventory";
  if (source === "metadata") return "metadata";
  if (source === "manifest") return "manifest";
  return "code";
}

function parseSourceFiles(source: string): ProofSourceFile[] {
  const markerPattern = /^\/\/ FILE:\s+(.+)$/gm;
  const markers = [...source.matchAll(markerPattern)];
  if (markers.length === 0) return [{ path: "submitted-code", content: source }];

  return markers.map((marker, index) => {
    const markerEnd = (marker.index ?? 0) + marker[0].length;
    const nextMarkerStart = markers[index + 1]?.index ?? source.length;
    return {
      path: normalizePath(marker[1]?.trim() || `submitted-code-${index + 1}`),
      content: source.slice(markerEnd, nextMarkerStart).replace(/^\r?\n/, ""),
    };
  });
}

function normalizeFiles(files: ProofSourceFile[]) {
  return files
    .filter((file) => file && typeof file.path === "string" && typeof file.content === "string")
    .map((file) => ({
      path: normalizePath(file.path),
      content: file.content,
    }));
}

function uniqueEvidence(items: FindingFileEvidence[]) {
  const seen = new Set<string>();
  const output: FindingFileEvidence[] = [];
  for (const item of items) {
    const key = `${item.filePath}:${item.line || ""}:${item.reason}:${item.codeSnippet}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrNull(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
}

function normalizePath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "").trim() || "__scan_file_inventory__";
}

function cleanReason(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 500) || "Scanner rule matched reproducible evidence.";
}

function cleanSnippet(value: string) {
  return value.replace(/\r/g, "").trim().slice(0, 800) || "Evidence is structural and based on the scanned file inventory.";
}

function boundedConfidence(value: number) {
  return Math.max(0, Math.min(99, Math.round(Number.isFinite(value) ? value : 75)));
}

function redactSecrets(value: string) {
  return value
    .replace(/sk_(live|test)_[A-Za-z0-9_\-.]+/gi, "sk_$1_[redacted]")
    .replace(/whsec_[A-Za-z0-9_\-.]+/gi, "whsec_[redacted]")
    .replace(/postgres(?:ql)?:\/\/[^"'\s]+/gi, "postgres://[redacted]")
    .replace(/bearer\s+[A-Za-z0-9_\-.]{24,}/gi, "bearer [redacted]");
}
