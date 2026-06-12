import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { config as loadEnv } from "dotenv";
import { WebSocket, WebSocketServer } from "ws";
import { agentEvents } from "../lib/agent-bus.js";
import { startJobWorker } from "../lib/job-queue-enhanced.js";
import * as jobQueue from "../lib/job-queue-enhanced.js";
import {
  archiveProject,
  deleteProject,
  duplicateProject,
  generateFiveApps,
  generateProject,
  getProject,
  getProjectArtifact,
  getProjectWorkspacePath,
  listProjects,
  renameProject,
  resetProjects,
  runProjectQualityGate,
  saveProjectFile,
} from "../lib/project-store.ts";

// Initialize Application Insights FIRST before anything else
// This is required for proper telemetry collection
if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  try {
    const { initializeAppInsights } = await import("../lib/monitoring/appinsights.ts");
    initializeAppInsights();
  } catch (error) {
    console.warn("Failed to initialize AppInsights:", error);
  }
}

loadEnv({ path: ".env.local" });
loadEnv();

const hostname = process.env.BACKEND_HOSTNAME || process.env.HOSTNAME || "localhost";
const port = Number(process.env.BACKEND_PORT || process.env.PORT || 4000);
const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:3000";
const googleApiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || process.env.GOOGLE_GENAI_MODEL || "gemini-2.5-flash";
const gemini = googleApiKey ? new GoogleGenAI({ apiKey: googleApiKey }) : null;
const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX || 120);
const rateLimitBuckets = new Map();
const sessionCookieName = "ventureos_session";
const adminCookieName = "ventureos_admin";

const systemPrompt =
  "You are a production-minded AI App Builder. For every app request, return three sections: File structure, Code files, and Explanation. Keep generated apps small, runnable, accessible, performant, and complete. Include exact file paths and full code blocks for every file. Unless the user names a different stack, generate Next.js 16 App Router apps with TypeScript and TailwindCSS.";

const server = createServer(async (req, res) => {
  applyHeaders(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (isRateLimited(req)) {
    sendJson(res, 429, { ok: false, error: "Too many requests.", code: "rate_limited" });
    return;
  }

  try {
    await routeRequest(req, res);
  } catch (error) {
    sendJson(res, statusForBackendError(error), { ok: false, error: error instanceof Error ? error.message : "Backend request failed." });
  }
});

async function routeRequest(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${hostname}:${port}`}`);
  const pathname = trimSlash(url.pathname);

  if (req.method === "GET" && pathname === "api/health") {
    compileBackendTrust(req, { mode: "publicRead" });
    sendJson(res, 200, { ok: true, service: "ventureos-backend", timestamp: new Date().toISOString() });
    return;
  }

  compileBackendTrust(req, { mode: "admin" });

  if (pathname === "api/projects") {
    if (req.method === "GET") {
      sendJson(res, 200, { projects: await listProjects() });
      return;
    }

    if (req.method === "POST") {
      const body = await readJson(req);
      if (body?.action === "reset") {
        await resetProjects();
        sendJson(res, 200, { ok: true, projects: [] });
        return;
      }

      if (body?.action === "generate-five") {
        sendJson(res, 200, { ok: true, projects: await generateFiveApps() });
        return;
      }

      const project = await generateProject(String(body?.prompt || ""), String(body?.category || "custom"));
      sendJson(res, 201, { ok: true, project });
      return;
    }
  }

  const projectDownloadMatch = pathname.match(/^api\/projects\/([^/]+)\/download$/);
  if (projectDownloadMatch && req.method === "GET") {
    const artifact = await getProjectArtifact(decodeURIComponent(projectDownloadMatch[1]));
    if (!artifact) {
      sendJson(res, 404, { ok: false, error: "Project not found." });
      return;
    }

    const filename = `${artifact.project.slug.replace(/[^a-z0-9-]/gi, "-")}-artifact.json`;
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
    res.end(JSON.stringify(artifact, null, 2));
    return;
  }

  const projectMatch = pathname.match(/^api\/projects\/([^/]+)$/);
  if (projectMatch) {
    await routeProject(req, res, decodeURIComponent(projectMatch[1]));
    return;
  }

  if (pathname === "api/jobs") {
    if (req.method === "GET") {
      sendJson(res, 200, { jobs: await jobQueue.listJobs() });
      return;
    }

    if (req.method === "POST") {
      const body = await readJson(req);
      const action = String(body?.action || "");
      const allowedActions = new Set(["generate", "verify", "repair", "preview", "build", "deploy"]);
      if (!allowedActions.has(action)) {
        sendJson(res, 400, { ok: false, error: "Unknown job action." });
        return;
      }

      const projectReference = String(body?.projectPath || body?.projectSlug || body?.projectId || body?.appName || "").trim();
      const projectPath = projectReference ? String(body?.projectPath || "") || (await getProjectWorkspacePath(projectReference)) : undefined;
      const job = await jobQueue.createJob(action, {
        appName: String(body?.appName || ""),
        prompt: String(body?.prompt || ""),
        model: String(body?.model || ""),
        mode: String(body?.mode || ""),
        projectId: String(body?.projectId || "") || undefined,
        projectSlug: String(body?.projectSlug || "") || undefined,
        projectPath,
      });

      sendJson(res, 201, { ok: true, job });
      return;
    }
  }

  const jobMatch = pathname.match(/^api\/jobs\/([^/]+)$/);
  if (jobMatch && req.method === "GET") {
    const id = decodeURIComponent(jobMatch[1]);
    const job = await jobQueue.getJob(id);
    const fallback = job || (await jobQueue.listJobs()).find((item) => item.id === id);
    if (!fallback) {
      sendJson(res, 404, { ok: false, error: "Job not found." });
      return;
    }
    sendJson(res, 200, { job: fallback });
    return;
  }

  sendJson(res, 404, { ok: false, error: "Backend route not found." });
}

async function routeProject(req, res, id) {
  if (req.method === "GET") {
    const project = await getProject(id);
    if (!project) {
      sendJson(res, 404, { ok: false, error: "Project not found." });
      return;
    }
    sendJson(res, 200, { project });
    return;
  }

  if (req.method === "PATCH") {
    const body = await readJson(req);
    if (body.action === "rename") sendJson(res, 200, { project: await renameProject(id, String(body.name || "")) });
    else if (body.action === "archive") sendJson(res, 200, { project: await archiveProject(id) });
    else if (body.action === "duplicate") sendJson(res, 200, { project: await duplicateProject(id) });
    else if (body.action === "run-qa") sendJson(res, 200, { project: await runProjectQualityGate(id) });
    else if (body.action === "save-file") sendJson(res, 200, { project: await saveProjectFile(id, String(body.path || ""), String(body.content || "")) });
    else sendJson(res, 400, { ok: false, error: "Unknown action." });
    return;
  }

  if (req.method === "DELETE") {
    await deleteProject(id);
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 405, { ok: false, error: "Method not allowed." });
}

function trimSlash(value) {
  return value.replace(/^\/+|\/+$/g, "");
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function applyHeaders(req, res) {
  const origin = req.headers.origin;
  const allowedOrigin = origin || frontendOrigin;
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function requestIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

function rateLimitForPath(pathname) {
  if (!pathname.startsWith("/api/")) return null;
  if (/^\/api\/health/.test(pathname)) return { max: Math.max(rateLimitMax, 240), windowMs: rateLimitWindowMs };
  if (/^\/api\/auth|^\/api\/agent|^\/api\/chat|^\/api\/ai-connections|^\/api\/billing/.test(pathname)) {
    return { max: Math.min(rateLimitMax, 60), windowMs: rateLimitWindowMs };
  }
  return { max: rateLimitMax, windowMs: rateLimitWindowMs };
}

function isRateLimited(req) {
  const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
  const policy = rateLimitForPath(url.pathname);
  if (!policy) return false;
  const now = Date.now();
  const key = `${requestIp(req)}:${url.pathname}`;
  const current = rateLimitBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + policy.windowMs });
    return false;
  }
  current.count += 1;
  return current.count > policy.max;
}

function compileBackendTrust(req, policy) {
  if (policy.mode === "publicRead") {
    return { session: { userId: "public:read", role: "public", orgId: null } };
  }

  const session = resolveBackendSession(req);
  if (!session?.userId) throw backendTrustError("UNAUTHORIZED", 401);
  if (policy.mode === "admin" && session.role !== "admin") throw backendTrustError("FORBIDDEN", 403);
  return { session };
}

function resolveBackendSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const session = verifyAppSession(cookies[sessionCookieName]);
  if (session) return session;
  return verifyAdminSession(cookies[adminCookieName]);
}

function verifyAppSession(token) {
  if (!token) return null;
  try {
    const [encoded, signature] = token.split(".");
    if (!encoded || !signature || !safeEqual(signature, sign(encoded, appSessionSecret()))) return null;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    const expires = Number(payload.expires || payload.exp || 0);
    if (expires && expires < Date.now()) return null;
    const userId = typeof payload.userId === "string" ? payload.userId.trim() : "";
    const role = typeof payload.role === "string" ? payload.role.trim() : "";
    const orgId = typeof payload.orgId === "string" && payload.orgId.trim() ? payload.orgId.trim() : null;
    return userId && role ? { userId, role, orgId } : null;
  } catch {
    return null;
  }
}

function verifyAdminSession(token) {
  if (!token) return null;
  try {
    const [encoded, signature] = token.split(".");
    if (!encoded || !signature) return null;
    const payload = Buffer.from(encoded, "base64url").toString("utf8");
    if (!safeEqual(signature, sign(payload, adminSessionSecret()))) return null;
    const [email, expiresRaw] = payload.split(":");
    const expires = Number(expiresRaw);
    if (!email || !expires || expires < Date.now()) return null;
    return { userId: process.env.ADMIN_USER_ID || email, role: "admin", orgId: process.env.ADMIN_ORG_ID || null };
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const source = Array.isArray(header) ? header.join(";") : header || "";
  return Object.fromEntries(
    source
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        if (separator < 0) return [part, ""];
        return [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
      }),
  );
}

function sign(value, secret) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function safeEqual(left, right) {
  const leftBuffer = new Uint8Array(Buffer.from(left));
  const rightBuffer = new Uint8Array(Buffer.from(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function appSessionSecret() {
  const secret = process.env.SESSION_SECRET || process.env.ADMIN_SESSION_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw backendTrustError("SESSION_SECRET is required for server sessions.", 500);
  return secret;
}

function adminSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw backendTrustError("ADMIN_SESSION_SECRET is required for admin sessions.", 500);
  return secret;
}

function backendTrustError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function statusForBackendError(error) {
  return typeof error?.statusCode === "number" ? error.statusCode : 500;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
  }
}, Math.max(30000, rateLimitWindowMs)).unref?.();

function toGeminiContents({ prompt, messages = [] }) {
  const sourceMessages = messages.length ? messages : [{ role: "user", content: prompt || "" }];
  return sourceMessages
    .filter((message) => message?.content)
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: String(message.content) }],
    }));
}

async function streamGemini({ prompt, messages = [], model = geminiModel, onToken }) {
  if (!gemini) throw new Error("Gemini API key is not configured.");
  const stream = await gemini.models.generateContentStream({
    model,
    contents: toGeminiContents({ prompt, messages }),
    config: { systemInstruction: systemPrompt, temperature: 0.7 },
  });

  for await (const chunk of stream) {
    const token = chunk.text || "";
    if (token) onToken(token);
  }
}

const wss = new WebSocketServer({ noServer: true });
const wsHeartbeatMs = Number(process.env.WS_HEARTBEAT_INTERVAL_MS || 15000);
const wsStaleTtlMs = Number(process.env.WS_STALE_CONNECTION_TTL_MS || 45000);
const wsClients = new Map();

function registerSocket(ws) {
  const clientId = `ws-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  wsClients.set(clientId, { ws, connectedAt: Date.now(), lastHeartbeat: Date.now() });
  ws.on("pong", () => {
    const client = wsClients.get(clientId);
    if (client) client.lastHeartbeat = Date.now();
  });
  ws.on("close", () => wsClients.delete(clientId));
  ws.on("error", () => wsClients.delete(clientId));
}

setInterval(() => {
  const now = Date.now();
  for (const [clientId, client] of wsClients.entries()) {
    if (client.ws.readyState !== WebSocket.OPEN || now - client.lastHeartbeat > wsStaleTtlMs) {
      client.ws.terminate();
      wsClients.delete(clientId);
      continue;
    }
    client.ws.ping();
  }
}, wsHeartbeatMs).unref?.();

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  if (!["/ws/chat", "/ws/agent", "/ws/stream"].includes(url.pathname)) {
    socket.destroy();
    return;
  }

  try {
    compileBackendTrust(request, { mode: "admin" });
  } catch {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    ws.routePath = url.pathname;
    wss.emit("connection", ws, request);
  });
});

wss.on("connection", (ws) => {
  registerSocket(ws);
  ws.send(JSON.stringify({ type: "ready" }));

  if (ws.routePath === "/ws/agent") {
    const forward = (event) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
    };
    agentEvents.on("event", forward);
    ws.on("close", () => agentEvents.off("event", forward));
    return;
  }

  if (ws.routePath === "/ws/stream") {
    const subscriptions = new Set(["*"]);
    ws.send(JSON.stringify({ type: "stream_ready", timestamp: Date.now() }));
    const forward = (event) => {
      const eventData = event?.data && typeof event.data === "object" ? event.data : {};
      const appName = event.appName || eventData.appName;
      const jobId = event.jobId || eventData.jobId;
      const shouldSend = subscriptions.has("*") || (typeof appName === "string" && subscriptions.has(appName)) || (typeof jobId === "string" && subscriptions.has(jobId));
      if (shouldSend && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "stream_event", timestamp: event.timestamp || Date.now(), event }));
    };
    agentEvents.on("event", forward);
    ws.on("message", (raw) => {
      try {
        const payload = JSON.parse(raw.toString());
        if (payload.type === "subscribe" && typeof payload.id === "string") {
          subscriptions.add(payload.id);
          ws.send(JSON.stringify({ type: "subscribed", id: payload.id, timestamp: Date.now() }));
        }
        if (payload.type === "unsubscribe" && typeof payload.id === "string") {
          subscriptions.delete(payload.id);
          ws.send(JSON.stringify({ type: "unsubscribed", id: payload.id, timestamp: Date.now() }));
        }
        if (payload.type === "ping") ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
      } catch {
        ws.send(JSON.stringify({ type: "error", error: "Invalid stream socket payload." }));
      }
    });
    ws.on("close", () => agentEvents.off("event", forward));
    return;
  }

  ws.on("message", async (raw) => {
    try {
      const payload = JSON.parse(raw.toString());
      ws.send(JSON.stringify({ type: "status", stage: "generating", message: "assistant thinking..." }));
      ws.send(JSON.stringify({ type: "start" }));
      await streamGemini({
        prompt: payload.prompt,
        messages: payload.messages,
        model: payload.model || geminiModel,
        onToken: (token) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "token", content: token }));
        },
      });
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "status", stage: "ready", message: "assistant ready" }));
        ws.send(JSON.stringify({ type: "done" }));
      }
    } catch (error) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "error", error: error instanceof Error ? error.message : "Unknown WebSocket error" }));
      }
    }
  });
});

startJobWorker().catch(console.error);

server.listen(port, hostname, () => {
  console.log(`VentureOS backend ready at http://${hostname}:${port}`);
  console.log(`Frontend origin: ${frontendOrigin}`);
  console.log(`Gemini model: ${geminiModel}`);
  console.log(`[BullMQ] Job workers initialized (${process.env.REDIS_URL ? `Redis: ${process.env.REDIS_URL}` : "in-memory fallback"})`);
  if (!googleApiKey) console.log("[Gemini] API key not configured; websocket chat is disabled.");
});
