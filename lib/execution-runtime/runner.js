import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { attachRuntimeProcess, releasePort, reservePort } from "./port-registry.js";
import { waitForHealthyApp } from "./health-check.js";

const appsRoot = process.env.VERCEL ? path.join(os.tmpdir(), "ventureos-generated-apps") : path.join(process.cwd(), "generated-apps");
const runtimeRoot = path.join(appsRoot, ".system", "runtime");
const activeRuns = new Map();
const dockerImage = process.env.RUNTIME_DOCKER_IMAGE || "node:20-bookworm-slim";
let dockerAvailability;

function npmBinary() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function nodeBinary() {
  return process.platform === "win32" ? "node.exe" : "node";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timestamp() {
  return new Date().toISOString();
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function runtimeContainerName(runtimeId) {
  return `ventureos-runtime-${slugify(runtimeId).slice(0, 48)}`;
}

async function isDockerAvailable() {
  if (dockerAvailability !== undefined) return dockerAvailability;
  dockerAvailability = await new Promise((resolve) => {
    const probe = spawn("docker", ["version", "--format", "{{.Server.Version}}"], {
      stdio: ["ignore", "ignore", "ignore"],
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      try {
        probe.kill();
      } catch {
        // ignore
      }
      resolve(false);
    }, 4000);

    probe.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });

    probe.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
  return dockerAvailability;
}

function buildDockerLaunchCommand(startCommand, port) {
  const installCommand = "npm install --no-audit --no-fund --prefer-offline";
  if (startCommand.command === nodeBinary()) {
    return `${installCommand} && node ${shellQuote(startCommand.args[0])}`;
  }

  const scriptName = startCommand.args[1] || "dev";
  return `${installCommand} && npm run ${scriptName} -- --port ${port} --hostname 0.0.0.0`;
}

function spawnLoggedProcess(command, args, state, sourcePrefix, extraEnv = {}, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      CI: "true",
      FORCE_COLOR: "0",
      ...extraEnv,
    },
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  wireProcessLogging(child, state, sourcePrefix);
  return child;
}

function spawnDockerWait(containerId, state) {
  const child = spawnLoggedProcess("docker", ["wait", containerId], state, "docker:wait", {}, {});
  let stdout = "";
  child.stdout?.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
  });
  return {
    child,
    promise: new Promise((resolve) => {
      child.once("exit", (code, signal) => {
        resolve({
          code,
          signal,
          exitCode: Number(String(stdout).trim() || "0"),
        });
      });
      child.once("error", (error) => {
        resolve({
          code: null,
          signal: null,
          exitCode: null,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }),
  };
}

async function runDockerCommand(commandArgs, state, sourcePrefix, timeoutMs = 30_000, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnLoggedProcess("docker", commandArgs, state, sourcePrefix, extraEnv, {});
    let stdout = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    const timer = setTimeout(() => {
      void killProcessTree(child.pid).finally(() => {
        reject(new Error(`${sourcePrefix} timed out after ${timeoutMs}ms`));
      });
    }, timeoutMs);

    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.once("exit", async (code, signal) => {
      clearTimeout(timer);
      await flushRemainingBuffers(state);
      if (code === 0) {
        resolve({ stdout: stdout.trim(), signal });
      } else {
        reject(new Error(`${sourcePrefix} exited with code ${code ?? "unknown"}${signal ? ` signal ${signal}` : ""}${stdout.trim() ? `: ${stdout.trim()}` : ""}`));
      }
    });
  });
}

async function stopDockerContainer(containerId, state) {
  if (!containerId) return;
  try {
    await runDockerCommand(["stop", "--time", "5", containerId], state, "docker-stop", 15_000);
  } catch {
    try {
      await runDockerCommand(["rm", "-f", containerId], state, "docker-rm", 15_000);
    } catch {
      // ignore
    }
  }
}

function createRuntimeState({ runtimeId, projectPath, runtimeDir, workspacePath, logFile }) {
  return {
    runtimeId,
    projectPath,
    runtimeDir,
    workspacePath,
    logFile,
    logs: [],
    logWriteQueue: Promise.resolve(),
    stdoutBuffer: "",
    stderrBuffer: "",
    child: null,
    waitProcess: null,
    logFollower: null,
    containerId: null,
    port: null,
    released: false,
  };
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function appendRuntimeLog(state, source, line) {
  const entry = `[${timestamp()}] [${source}] ${line}`;
  state.logs.push(entry);
  state.logWriteQueue = state.logWriteQueue.then(() => fs.appendFile(state.logFile, `${entry}\n`).catch(() => undefined));
  await state.logWriteQueue.catch(() => undefined);
}

function flushStreamChunk(state, source, chunk) {
  const bufferKey = source === "stdout" ? "stdoutBuffer" : "stderrBuffer";
  state[bufferKey] += chunk.toString("utf8");
  const lines = state[bufferKey].split(/\r?\n/);
  state[bufferKey] = lines.pop() || "";
  return lines.filter((line) => line.trim().length > 0);
}

async function flushRemainingBuffers(state) {
  if (state.stdoutBuffer.trim()) {
    await appendRuntimeLog(state, "stdout", state.stdoutBuffer.trimEnd());
    state.stdoutBuffer = "";
  }
  if (state.stderrBuffer.trim()) {
    await appendRuntimeLog(state, "stderr", state.stderrBuffer.trimEnd());
    state.stderrBuffer = "";
  }
}

function wireProcessLogging(child, state, sourcePrefix) {
  child.stdout?.on("data", (chunk) => {
    for (const line of flushStreamChunk(state, "stdout", chunk)) {
      void appendRuntimeLog(state, `${sourcePrefix}:stdout`, line);
    }
  });

  child.stderr?.on("data", (chunk) => {
    for (const line of flushStreamChunk(state, "stderr", chunk)) {
      void appendRuntimeLog(state, `${sourcePrefix}:stderr`, line);
    }
  });
}

async function readPackageJson(workspacePath) {
  try {
    const raw = await fs.readFile(path.join(workspacePath, "package.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function stageWorkspace(sourcePath, workspacePath) {
  await fs.rm(workspacePath, { recursive: true, force: true }).catch(() => undefined);
  await ensureDir(workspacePath);
  await fs.cp(sourcePath, workspacePath, {
    recursive: true,
    force: true,
    dereference: true,
    filter: (currentPath) => {
      const relative = path.relative(sourcePath, currentPath);
      if (!relative) return true;
      const normalized = relative.split(path.sep).join("/");
      if (normalized === ".system" || normalized.startsWith(".system/")) return false;
      if (normalized === "node_modules" || normalized.startsWith("node_modules/")) return false;
      if (normalized === ".next" || normalized.startsWith(".next/")) return false;
      return true;
    },
  });
}

async function ensureRuntimeScaffold(workspacePath) {
  const appDir = path.join(workspacePath, "app");
  const layoutPath = path.join(appDir, "layout.tsx");
  const pagePath = path.join(appDir, "page.tsx");

  if ((await fileExists(pagePath)) && !(await fileExists(layoutPath))) {
    await ensureDir(appDir);
    await fs.writeFile(
      layoutPath,
      `import type { ReactNode } from "react";\n\nexport default function RootLayout({ children }: { children: ReactNode }) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}\n`,
    );
  }
}

async function chooseStartCommand(workspacePath, port) {
  const packageJson = await readPackageJson(workspacePath);
  const scripts = packageJson?.scripts || {};

  if (scripts.dev) {
    return {
      command: npmBinary(),
      args: ["run", "dev", "--", "--port", String(port)],
    };
  }

  if (scripts.start) {
    return {
      command: npmBinary(),
      args: ["run", "start", "--", "--port", String(port)],
    };
  }

  const nodeEntry = await (async () => {
    for (const entry of ["server.mjs", "server.js", "index.mjs", "index.js"]) {
      if (await fileExists(path.join(workspacePath, entry))) return entry;
    }
    return null;
  })();

  if (nodeEntry) {
    return {
      command: nodeBinary(),
      args: [nodeEntry],
    };
  }

  return {
    command: npmBinary(),
    args: ["run", "dev", "--", "--port", String(port)],
  };
}

function killProcessTree(pid) {
  if (!pid) return Promise.resolve();
  if (process.platform === "win32") {
    return new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
      killer.once("exit", () => resolve());
      killer.once("error", () => resolve());
    });
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return Promise.resolve();
  }

  return delay(500).then(() => {
    try {
      process.kill(pid, 0);
      process.kill(pid, "SIGKILL");
    } catch {
      // already stopped
    }
  });
}

async function cleanupRuntime(runtimeId, shouldReleasePort = true) {
  const runtime = activeRuns.get(runtimeId);
  if (!runtime) return;
  if (runtime.containerId) {
    await stopDockerContainer(runtime.containerId, runtime).catch(() => undefined);
  }
  if (runtime.logFollower?.pid) {
    await killProcessTree(runtime.logFollower.pid).catch(() => undefined);
  }
  if (runtime.child?.pid) {
    await killProcessTree(runtime.child.pid).catch(() => undefined);
  }
  if (runtime.waitProcess?.pid && runtime.waitProcess.pid !== runtime.child?.pid) {
    await killProcessTree(runtime.waitProcess.pid).catch(() => undefined);
  }
  if (shouldReleasePort) {
    await releasePort(runtimeId).catch(() => undefined);
  }
  activeRuns.delete(runtimeId);
}

async function runDockerRuntime(projectPath, options = {}) {
  const sourcePath = path.resolve(projectPath);
  const runtimeId = options.runtimeId || randomUUID();
  const runtimeDir = path.join(runtimeRoot, runtimeId);
  const workspacePath = path.join(runtimeDir, "workspace");
  const logFile = path.join(runtimeDir, "runtime.log");
  const state = createRuntimeState({ runtimeId, projectPath: sourcePath, runtimeDir, workspacePath, logFile });

  await ensureDir(runtimeDir);
  await fs.writeFile(logFile, "").catch(() => undefined);
  activeRuns.set(runtimeId, state);

  try {
    if (!(await isDockerAvailable())) {
      throw new Error("Docker is not available on this host.");
    }

    await appendRuntimeLog(state, "runner", `Staging workspace for ${sourcePath}`);
    await stageWorkspace(sourcePath, workspacePath);
    await ensureRuntimeScaffold(workspacePath);

    const installTimeoutMs = Number(options.installTimeoutMs || 300000);
    const startTimeoutMs = Number(options.timeoutMs || 20000);

    const reserved = await reservePort({
      runtimeId,
      projectPath: sourcePath,
      workspacePath,
    });
    state.port = reserved.port;

    const startCommand = await chooseStartCommand(workspacePath, state.port);
    const launchCommand = buildDockerLaunchCommand(startCommand, state.port);
    const containerName = runtimeContainerName(runtimeId);

    await appendRuntimeLog(state, "runner", `Creating Docker container ${containerName} using ${dockerImage}`);
    const createResult = await runDockerCommand(
      [
        "create",
        "--name",
        containerName,
        "--init",
        "--publish",
        `127.0.0.1:${state.port}:${state.port}`,
        "--mount",
        `type=bind,source=${workspacePath},target=/workspace`,
        "--workdir",
        "/workspace",
        "--env",
        `PORT=${state.port}`,
        "--env",
        "HOSTNAME=0.0.0.0",
        "--env",
        "HOST=0.0.0.0",
        "--env",
        "NODE_ENV=development",
        "--env",
        "CI=true",
        "--env",
        "FORCE_COLOR=0",
        "--env",
        "NEXT_TELEMETRY_DISABLED=1",
        dockerImage,
        "sh",
        "-lc",
        launchCommand,
      ],
      state,
      "docker-create",
      installTimeoutMs,
    );

    const containerId = createResult.stdout.trim();
    if (!containerId) {
      throw new Error("Docker did not return a container id.");
    }
    state.containerId = containerId;

    const logsFollower = spawnLoggedProcess("docker", ["logs", "-f", "--timestamps", containerId], state, "docker:logs");
    state.logFollower = logsFollower;

    const wait = spawnDockerWait(containerId, state);
    state.waitProcess = wait.child;
    state.child = wait.child;

    await attachRuntimeProcess({
      runtimeId,
      pid: wait.child.pid,
      port: state.port,
      projectPath: sourcePath,
      workspacePath,
    });

    await appendRuntimeLog(state, "runner", "Starting Docker container");
    await runDockerCommand(["start", containerId], state, "docker-start", 30_000);

    const healthPromise = waitForHealthyApp(state.port, { timeoutMs: startTimeoutMs, intervalMs: 750 });
    const outcome = await Promise.race([
      healthPromise.then((health) => ({ kind: "health", health })),
      wait.promise.then((exit) => ({ kind: "exit", exit })),
    ]);

    if (outcome.kind === "health" && outcome.health.ready) {
      const url = outcome.health.url || `http://localhost:${state.port}`;
      const result = {
        status: "ready",
        logs: [...state.logs],
        port: state.port,
        url,
      };

      wait.child.once("exit", () => {
        void cleanupRuntime(runtimeId);
      });

      await state.logWriteQueue.catch(() => undefined);
      return result;
    }

    const errorMessage =
      outcome.kind === "exit"
        ? `Runtime exited before becoming healthy (code ${outcome.exit.exitCode ?? outcome.exit.code ?? "unknown"})`
        : outcome.health.error || `Runtime failed health check on port ${state.port}`;

    await appendRuntimeLog(state, "runner", errorMessage);
    await cleanupRuntime(runtimeId);

    return {
      status: "failed",
      logs: [...state.logs],
      port: state.port,
      url: state.port ? `http://localhost:${state.port}` : undefined,
      error: errorMessage,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Runtime execution failed.";
    await appendRuntimeLog(state, "runner", errorMessage);
    await cleanupRuntime(runtimeId);
    return {
      status: "failed",
      logs: [...state.logs],
      port: state.port || undefined,
      url: state.port ? `http://localhost:${state.port}` : undefined,
      error: errorMessage,
    };
  }
}

export async function runProjectRuntime(projectPath, options = {}) {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new Error("Runtime execution is disabled in production; queue deploy/preview work outside the request cycle.");
  }
  if (!(await isDockerAvailable())) {
    throw new Error("Docker is required for runtime execution but is unavailable on this host.");
  }
  return runDockerRuntime(projectPath, options);
}

export async function stopRuntime(runtimeId) {
  await cleanupRuntime(runtimeId);
}
