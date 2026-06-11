import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { redactSensitiveText } from "@/lib/diagnostics";

const DEFAULT_USER_EMAIL = "owner@ventureos.local";
const DEFAULT_DATABASE_COOLDOWN_MS = 10 * 60 * 1000;

const globalForPrisma = globalThis as typeof globalThis & {
  ventureosPrisma?: PrismaClient;
  ventureosDatabaseCircuit?: {
    unavailableUntil: number;
    reason: string;
    lastLoggedAt: number;
  };
};

export function isDatabaseConfigured() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return false;
  assertProductionDatabaseUrl(databaseUrl);
  return true;
}

export function getPrisma() {
  if (!isDatabaseConfigured()) return null;
  if (isDatabaseCircuitOpen()) return null;
  if (!globalForPrisma.ventureosPrisma) {
    const adapter = new PrismaPg({ connectionString: normalizedDatabaseUrl(process.env.DATABASE_URL || "") });
    globalForPrisma.ventureosPrisma = new PrismaClient({ adapter });
  }
  return globalForPrisma.ventureosPrisma;
}

function assertProductionDatabaseUrl(value: string) {
  if (process.env.NODE_ENV !== "production") return;
  const url = new URL(value);
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("Production DATABASE_URL cannot point to localhost.");
  }
}

function normalizedDatabaseUrl(value: string) {
  const url = new URL(value);
  if (url.searchParams.get("sslmode") === "require") {
    url.searchParams.set("sslmode", "verify-full");
  }
  return url.toString();
}

export async function tryDatabase<T>(operation: (db: PrismaClient) => Promise<T>): Promise<T | null> {
  const db = getPrisma();
  if (!db) return null;

  try {
    return await operation(db);
  } catch (error) {
    markDatabaseUnavailable(error);
    return null;
  }
}

export async function getDefaultUserId() {
  const user = await tryDatabase((db) =>
    db.user.upsert({
      where: { email: DEFAULT_USER_EMAIL },
      update: {},
      create: { email: DEFAULT_USER_EMAIL, plan: "founder" },
      select: { id: true },
    }),
  );
  return user?.id ?? null;
}

export function getDatabaseCircuitStatus() {
  const circuit = globalForPrisma.ventureosDatabaseCircuit;
  if (!circuit || circuit.unavailableUntil <= Date.now()) {
    return { open: false, reason: null, unavailableUntil: null };
  }

  return {
    open: true,
    reason: circuit.reason,
    unavailableUntil: new Date(circuit.unavailableUntil).toISOString(),
  };
}

function isDatabaseCircuitOpen() {
  const circuit = globalForPrisma.ventureosDatabaseCircuit;
  if (!circuit) return false;
  if (circuit.unavailableUntil <= Date.now()) {
    globalForPrisma.ventureosDatabaseCircuit = undefined;
    return false;
  }
  return true;
}

function markDatabaseUnavailable(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : "unknown error";
  const reason = databaseUnavailableReason(rawMessage);
  const cooldownMs = databaseCooldownMs(reason);
  const now = Date.now();
  const previous = globalForPrisma.ventureosDatabaseCircuit;
  const shouldLog = !previous || previous.unavailableUntil <= now || now - previous.lastLoggedAt > cooldownMs;

  globalForPrisma.ventureosDatabaseCircuit = {
    unavailableUntil: now + cooldownMs,
    reason,
    lastLoggedAt: shouldLog ? now : previous?.lastLoggedAt || now,
  };

  if (shouldLog) {
    console.warn(
      `[persistence] Database unavailable (${reason}); falling back without retrying until ${new Date(now + cooldownMs).toISOString()}: ${redactSensitiveText(rawMessage)}`,
    );
  }
}

function databaseUnavailableReason(message: string) {
  if (/data transfer quota|exceeded.*quota|quota.*exceeded/i.test(message)) return "quota_exceeded";
  if (/timeout|terminated|connection|ECONN|ENOTFOUND|ETIMEDOUT/i.test(message)) return "connection_unavailable";
  return "query_failed";
}

function databaseCooldownMs(reason: string) {
  const configured = Number(process.env.DATABASE_FAILURE_COOLDOWN_MS || "");
  if (Number.isFinite(configured) && configured >= 30_000) return configured;
  if (reason === "quota_exceeded") return 60 * 60 * 1000;
  return DEFAULT_DATABASE_COOLDOWN_MS;
}
