import type { PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/persistence/database";

export { getPrisma, getDefaultUserId, isDatabaseConfigured, tryDatabase } from "@/lib/persistence/database";

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrisma();
    if (!client) {
      throw new Error("DATABASE_URL is required before using prisma.");
    }
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
