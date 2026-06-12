import { createServer } from "node:http";
import { GoogleGenAI } from "@google/genai";
import { config as loadEnv } from "dotenv";
import next from "next";
import { WebSocket, WebSocketServer } from "ws";
import { agentEvents } from "./lib/agent-bus.js";
import { startJobWorker } from "./lib/job-queue-enhanced.js";

// Initialize Application Insights FIRST before anything else
// This is required for proper telemetry collection
if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  try {
    const { initializeAppInsights } = await import("./lib/monitoring/appinsights.ts");
    initializeAppInsights();
  } catch (error) {
    console.warn("Failed to initialize AppInsights:", error);
  }
}

loadEnv({ path: ".env.local" });
loadEnv();

const dev = process.env.NODE_ENV !== "production" && process.env.npm_lifecycle_event !== "start";
const hostname = process.env.HOSTNAME || "localhost";
const port = Number(process.env.PORT || 3000);
const googleApiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || process.env.GOOGLE_GENAI_MODEL || "gemini-2.5-flash";

const gemini = googleApiKey ? new GoogleGenAI({ apiKey: googleApiKey }) : null;

const app = next({ dev, hostname, port, webpack: dev });
const handle = app.getRequestHandler();
const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX || 120);
const rateLimitBuckets = new Map();

const systemPrompt =
  "You are a production-minded AI App Builder. For every app request, return three sections: File structure, Code files, and Explanation. Keep generated apps small, runnable, accessible, performant, and complete. Include exact file paths and full code blocks for every file. Unless the user names a different stack, generate Next.js 16 App Router apps with TypeScript and TailwindCSS.";

function toGeminiContents({ prompt, messages = [] }) {
  const sourceMessages = messages.length
    ? messages
    : [{ role: "user", content: prompt || "" }];

  return sourceMessages
    .filter((message) => message?.content)
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: String(message.content) }]
    }));
}

async function streamGemini({ prompt, messages = [], model = geminiModel, onToken }) {
  if (!gemini) {
    throw new Error("Gemini API key is not configured.");
  }
  const stream = await gemini.models.generateContentStream({
    model,
    contents: toGeminiContents({ prompt, messages }),
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.7
    }
  });

  for await (const chunk of stream) {
    const token = chunk.text || "";
    if (token) onToken(token);
  }
}

await app.prepare();
const handleUpgrade = app.getUpgradeHandler();

const server = createServer((req, res) => {
  applySecurityHeaders(res);
  if (isRateLimited(req)) {
    res.writeHead(429, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Too many requests.", code: "rate_limited" }));
    return;
  }
  handle(req, res);
});

function applySecurityHeaders(res) {
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

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
  }
}, Math.max(30000, rateLimitWindowMs)).unref?.();

const wss = new WebSocketServer({ noServer: true });
const wsHeartbeatMs = Number(process.env.WS_HEARTBEAT_INTERVAL_MS || 15000);
const wsStaleTtlMs = Number(process.env.WS_STALE_CONNECTION_TTL_MS || 45000);
const wsClients = new Map();

function registerSocket(ws) {
  const clientId = `ws-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  wsClients.set(clientId, {
    ws,
    connectedAt: Date.now(),
    lastHeartbeat: Date.now()
  });
  ws.on("pong", () => {
    const client = wsClients.get(clientId);
    if (client) client.lastHeartbeat = Date.now();
  });
  ws.on("close", () => wsClients.delete(clientId));
  ws.on("error", () => wsClients.delete(clientId));
  return clientId;
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
    handleUpgrade(request, socket, head);
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
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(event));
      }
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
      const shouldSend =
        subscriptions.has("*") ||
        (typeof appName === "string" && subscriptions.has(appName)) ||
        (typeof jobId === "string" && subscriptions.has(jobId));

      if (shouldSend && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "stream_event",
            timestamp: event.timestamp || Date.now(),
            event
          })
        );
      }
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
        if (payload.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
        }
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
      ws.send(
        JSON.stringify({
          type: "status",
          stage: "generating",
          message: "assistant thinking..."
        })
      );
      ws.send(JSON.stringify({ type: "start" }));

      await streamGemini({
        prompt: payload.prompt,
        messages: payload.messages,
        model: payload.model || geminiModel,
        onToken: (token) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "token", content: token }));
          }
        }
      });

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "status",
            stage: "ready",
            message: "assistant ready"
          })
        );
        ws.send(JSON.stringify({ type: "done" }));
      }
    } catch (error) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "error",
            error: error instanceof Error ? error.message : "Unknown WebSocket error"
          })
        );
      }
    }
  });
});

// Start job worker
startJobWorker().catch(console.error);

server.listen(port, () => {
  console.log(`AI App Builder ready at http://${hostname}:${port}`);
  console.log(`Gemini model: ${geminiModel}`);
  console.log(`[BullMQ] Job workers initialized (${process.env.REDIS_URL ? `Redis: ${process.env.REDIS_URL}` : "in-memory fallback"})`);
  if (!googleApiKey) {
    console.log("[Gemini] API key not configured; websocket chat is disabled.");
  }
});
