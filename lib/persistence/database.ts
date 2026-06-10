import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { redactSensitiveText } from "@/lib/diagnostics";

const DEFAULT_USER_EMAIL = "owner@ventureos.local";

const globalForPrisma = globalThis as typeof globalThis & {
  ventureosPrisma?: PrismaClient;
};

export function isDatabaseConfigured() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return false;
  assertProductionDatabaseUrl(databaseUrl);
  return true;
}

export function getPrisma() {
  if (!isDatabaseConfigured()) return null;
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
    console.warn(`[persistence] Database unavailable, falling back to file store: ${redactSensitiveText(error instanceof Error ? error.message : "unknown error")}`);
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
