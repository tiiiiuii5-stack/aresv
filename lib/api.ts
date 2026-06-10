"use client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export type ProjectFile = {
  path: string;
  content: string;
};

export type ProjectRecord = {
  id: string;
  name: string;
  slug: string;
  category: string;
  problem: string;
  status: "ready" | "archived";
  updatedAt: string;
  files: ProjectFile[];
  features?: string[];
  buildValidation?: { status: "passed" | "failed"; logs: string[] };
  qa?: { score: number; releaseApproved: boolean };
};

export type JobRecord = {
  id: string;
  action: string;
  status: "queued" | "running" | "generating" | "building" | "deploying" | "completed" | "succeeded" | "failed" | "cancelled";
  stage?: string;
  progress: number;
  currentStep?: string;
  resultUrl?: string | null;
  errorMessage?: string | null;
  appName?: string;
  projectId?: string;
  projectSlug?: string;
  message?: string;
  mutationTracking?: {
    mutationCount: number;
    mutationHistory: unknown[];
    modelUsed: string | null;
    temperature: number | null;
    promptHash: string | null;
    divergenceResult: unknown | null;
  };
  artifact?: {
    runtimeStatus?: "running" | "failed" | "ready";
    runtimeUrl?: string;
    executionError?: string;
  };
};

export type CreateJobResponse = {
  ok: boolean;
  traceId: string;
  jobId: string;
  status: JobRecord["status"];
  estimatedTime: string;
  elapsedMs?: number;
};

export type PassportRecord = {
  passportId: string;
  trustScore: number;
  qualityScore: number;
  safetyScore: number;
  verdict: "verified" | "caution" | "high_risk";
  softwareIdentity?: {
    name: string;
    owner: string;
    sourceType: string;
    sourceUrl: string;
  };
  evidence?: unknown[];
  timeline?: unknown[];
  certificates?: unknown[];
  links?: {
    passport: string;
    registry: string;
    verification: string;
  };
};

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : typeof options.body === "string" ? options.body : JSON.stringify(options.body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
  return data as T;
}

export async function createProject(prompt: string) {
  return apiFetch<{ ok: boolean; project: ProjectRecord }>("/api/projects", {
    method: "POST",
    body: { prompt },
  });
}

export async function getProjects() {
  return apiFetch<{ ok: boolean; projects: ProjectRecord[] }>("/api/projects");
}

export async function getJobStatus(jobId: string) {
  return apiFetch<{ ok: boolean } & JobRecord & { jobId: string }>(`/api/jobs/${encodeURIComponent(jobId)}`);
}

export async function getHealth() {
  return apiFetch<{ ok: boolean; service: string; timestamp: string }>("/api/health");
}

export async function recallMemory(query: string) {
  return apiFetch<{ ok: boolean; memories: Array<{ id: string; memoryType: string; content: string; similarity?: number }> }>("/api/agent-memory/recall", {
    method: "POST",
    body: { query },
  });
}

export const api = {
  projects: getProjects,
  project: (id: string) => apiFetch<{ ok: boolean; project: ProjectRecord }>(`/api/projects/${encodeURIComponent(id)}`),
  createProject: (prompt: string, category = "custom") =>
    apiFetch<{ ok: boolean; project: ProjectRecord }>("/api/projects", {
      method: "POST",
      body: { prompt, category },
    }),
  jobs: () => apiFetch<{ ok: boolean; jobs: JobRecord[] }>("/api/jobs"),
  getJob: getJobStatus,
  health: getHealth,
  createJob: (body: Record<string, unknown>) =>
    apiFetch<CreateJobResponse>("/api/jobs", {
      method: "POST",
      body,
    }),
  createPassport: (body: { source: string; sourceType?: string; name?: string; owner?: string }) =>
    apiFetch<{ ok: boolean } & PassportRecord>("/api/passport/create", {
      method: "POST",
      body,
    }),
  scanPassport: (id: string) =>
    apiFetch<{ ok: boolean } & PassportRecord>(`/api/passport/${encodeURIComponent(id)}/scan`, {
      method: "POST",
      body: {},
    }),
  issuePassportCertificate: (id: string) =>
    apiFetch<{ ok: boolean } & PassportRecord>(`/api/passport/${encodeURIComponent(id)}/certificate`, {
      method: "POST",
      body: {},
    }),
  retryJob: (id: string) =>
    apiFetch<{ ok: boolean; job: JobRecord; mutationTracking?: JobRecord["mutationTracking"] }>(`/api/jobs/${encodeURIComponent(id)}/retry`, {
      method: "POST",
      body: {},
    }),
  recallMemory: (body: { query: string; projectId?: string; limit?: number }) =>
    apiFetch<{ ok: boolean; memories: Array<{ id: string; memoryType: string; content: string; similarity?: number }> }>("/api/agent-memory/recall", {
      method: "POST",
      body,
    }),
};
