import { randomUUID } from "node:crypto";

import { getPrisma } from "@/lib/persistence/database";
import { sanitizeMetadata } from "@/lib/services/platformSupport";

const DEFAULT_FOUNDER_EMAILS = ["stackdigitz@gmail.com"];

export type FounderEntitlement = {
  active: boolean;
  email: string | null;
  reason: string | null;
};

export function founderEmails() {
  const configured = process.env.FOUNDER_EMAILS || process.env.FOUNDER_EMAIL || process.env.OWNER_EMAIL || "";
  const values = configured
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...DEFAULT_FOUNDER_EMAILS, ...values]));
}

export async function founderEntitlementForUser(userIdOrEmail: string): Promise<FounderEntitlement> {
  const clean = userIdOrEmail.trim().toLowerCase();
  if (!clean) return { active: false, email: null, reason: null };

  const emails = founderEmails();
  if (emails.includes(clean)) {
    return { active: true, email: clean, reason: "founder_email" };
  }

  const db = getPrisma();
  if (!db) return { active: false, email: null, reason: null };

  const rows = await db.$queryRawUnsafe<Array<{ email: string | null; plan: string | null; billingPlan: string | null }>>(
    `SELECT u."email", u."plan", ba."plan" AS "billingPlan"
     FROM "users" u
     LEFT JOIN "billing_accounts" ba ON ba."userId" = u."id"
     WHERE u."id" = $1 OR LOWER(u."email") = $2
     ORDER BY ba."updatedAt" DESC NULLS LAST
     LIMIT 1`,
    userIdOrEmail,
    clean,
  );
  const row = rows[0];
  if (!row) return { active: false, email: null, reason: null };

  const email = row.email?.toLowerCase() || null;
  const plan = `${row.plan || ""} ${row.billingPlan || ""}`.toLowerCase();
  const active = Boolean(email && emails.includes(email)) || /\b(founder|owner|lifetime|internal)\b/.test(plan);
  return { active, email, reason: active ? "founder_plan" : null };
}

export async function grantFounderEntitlement(email = DEFAULT_FOUNDER_EMAILS[0]) {
  const db = getPrisma();
  if (!db) throw new Error("DATABASE_URL is required to grant founder access.");

  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) throw new Error("A valid founder email is required.");

  const user = await db.user.upsert({
    where: { email: cleanEmail },
    update: { plan: "founder" },
    create: { email: cleanEmail, plan: "founder" },
    select: { id: true, email: true },
  });

  const metadata = sanitizeMetadata({
    entitlement: "founder",
    source: "internal_owner_grant",
    grantedAt: new Date().toISOString(),
  });

  await db.$executeRawUnsafe(
    `INSERT INTO "billing_accounts" ("id", "userId", "teamId", "plan", "status", "metadata", "updatedAt")
     VALUES ($1, $2, NULL, 'founder', 'active', $3::jsonb, NOW())
     ON CONFLICT ("userId", "teamId") DO UPDATE SET
       "plan" = 'founder',
       "status" = 'active',
       "metadata" = COALESCE("billing_accounts"."metadata", '{}'::jsonb) || EXCLUDED."metadata",
       "updatedAt" = NOW()`,
    randomUUID(),
    user.id,
    JSON.stringify(metadata),
  );

  return user;
}
