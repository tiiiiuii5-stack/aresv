import { promises as fs } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const appsRoot = process.env.VERCEL ? path.join(os.tmpdir(), "ventureos-generated-apps") : path.join(process.cwd(), "generated-apps");
const registryDir = path.join(appsRoot, ".system", "runtime");
const registryPath = path.join(registryDir, "ports.json");

const activeApps = new Map();
let lock = Promise.resolve();

function withLock(task) {
  const previous = lock;
  let release;
  lock = new Promise((resolve) => {
    release = resolve;
  });
  return previous
    .then(task)
    .finally(() => {
      release?.();
    });
}

async function ensureRegistry() {
  await fs.mkdir(registryDir, { recursive: true });
  try {
    await fs.access(registryPath);
  } catch {
    await fs.writeFile(registryPath, JSON.stringify({ nextPort: 3001, entries: [] }, null, 2));
  }
}

async function readState() {
  await ensureRegistry();
  try {
    const raw = await fs.readFile(registryPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      nextPort: Number(parsed?.nextPort || 3001),
      entries: Array.isArray(parsed?.entries) ? parsed.entries : [],
    };
  } catch {
    return { nextPort: 3001, entries: [] };
  }
}

async function writeState(state) {
  await ensureRegistry();
  await fs.writeFile(registryPath, JSON.stringify(state, null, 2));
}

function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => resolve(false));
    server.listen({ port, host: "127.0.0.1" }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function cleanState(state) {
  const now = Date.now();
  state.entries = state.entries.filter((entry) => {
    if (!entry) return false;
    if (entry.status === "running") return isPidAlive(entry.pid);
    if (entry.status === "reserved") {
      const timestamp = Date.parse(entry.updatedAt || entry.createdAt || "");
      return Number.isFinite(timestamp) && now - timestamp < 15 * 60 * 1000;
    }
    return true;
  });
}

function normalizeEntry(entry) {
  return {
    runtimeId: entry.runtimeId,
    projectPath: entry.projectPath,
    workspacePath: entry.workspacePath,
    port: Number(entry.port),
    pid: entry.pid ? Number(entry.pid) : null,
    status: entry.status,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    startedAt: entry.startedAt || null,
    stoppedAt: entry.stoppedAt || null,
  };
}

export async function reservePort({ runtimeId, projectPath, workspacePath }) {
  return withLock(async () => {
    const state = await readState();
    await cleanState(state);

    const existing = state.entries.find(
      (entry) => entry.runtimeId === runtimeId || (entry.projectPath === projectPath && (entry.status === "running" || entry.status === "reserved")),
    );
    if (existing) {
      const normalized = normalizeEntry(existing);
      activeApps.set(runtimeId, normalized);
      await writeState(state);
      return normalized;
    }

    const usedPorts = new Set(state.entries.map((entry) => Number(entry.port)).filter(Number.isFinite));
    let port = Math.max(3001, Number(state.nextPort || 3001));
    while (usedPorts.has(port) || !(await isPortAvailable(port))) {
      port += 1;
    }

    const now = new Date().toISOString();
    const entry = {
      runtimeId,
      projectPath,
      workspacePath,
      port,
      pid: null,
      status: "reserved",
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      stoppedAt: null,
    };
    state.entries.push(entry);
    state.nextPort = port + 1;
    activeApps.set(runtimeId, normalizeEntry(entry));
    await writeState(state);
    return normalizeEntry(entry);
  });
}

export async function attachRuntimeProcess({ runtimeId, pid, port, projectPath, workspacePath }) {
  return withLock(async () => {
    const state = await readState();
    const now = new Date().toISOString();
    let entry = state.entries.find((item) => item.runtimeId === runtimeId);
    if (!entry) {
      entry = {
        runtimeId,
        projectPath,
        workspacePath,
        port,
        pid,
        status: "running",
        createdAt: now,
        updatedAt: now,
        startedAt: now,
        stoppedAt: null,
      };
      state.entries.push(entry);
    } else {
      Object.assign(entry, {
        pid,
        port,
        projectPath,
        workspacePath,
        status: "running",
        updatedAt: now,
        startedAt: entry.startedAt || now,
      });
    }
    const normalized = normalizeEntry(entry);
    activeApps.set(runtimeId, normalized);
    await writeState(state);
    return normalized;
  });
}

export async function releasePort(runtimeId) {
  return withLock(async () => {
    const state = await readState();
    const index = state.entries.findIndex((entry) => entry.runtimeId === runtimeId);
    if (index === -1) {
      activeApps.delete(runtimeId);
      return null;
    }
    const [entry] = state.entries.splice(index, 1);
    const normalized = normalizeEntry({ ...entry, status: "stopped", stoppedAt: new Date().toISOString() });
    activeApps.delete(runtimeId);
    await writeState(state);
    return normalized;
  });
}

export async function listActiveApps() {
  return withLock(async () => {
    const state = await readState();
    await cleanState(state);
    await writeState(state);
    return state.entries.filter((entry) => entry.status === "running").map(normalizeEntry);
  });
}

export function getActiveRuntime(runtimeId) {
  return activeApps.get(runtimeId) || null;
}
