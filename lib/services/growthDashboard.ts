import { getPrisma } from "@/lib/persistence/database";

type CountRow = { count: number | bigint | string | null };
type MoneyRow = { cents: number | bigint | string | null };

export type GrowthDashboardSnapshot = {
  generatedAt: string;
  users: {
    total: number;
    likelyReal: number;
    systemOrTest: number;
    newLast7Days: number;
    newLast30Days: number;
  };
  revenue: {
    paidUsers: number;
    activeSubscribers: number;
    totalPaidRevenueCents: number;
    estimatedMrrCents: number;
    currency: "usd";
  };
  plans: Array<{ plan: string; count: number }>;
  subscriptions: Array<{ tier: string; status: string; count: number }>;
  recentUsers: Array<{ id: string; email: string; plan: string; createdAt: string }>;
  recentPayments: Array<{ id: string; email: string | null; offerId: string; status: string; amount: number; currency: string; createdAt: string }>;
};

const MONTHLY_RECURRING_CENTS: Record<string, number> = {
  PRO: 0,
  TEAM: 0,
  ENTERPRISE: 0,
};

export async function loadGrowthDashboardSnapshot(): Promise<GrowthDashboardSnapshot> {
  const db = getPrisma();
  if (!db) throw new Error("Database is not configured.");

  const since7 = daysAgo(7);
  const since30 = daysAgo(30);

  const [
    totalUsers,
    likelyRealUsers,
    newLast7Days,
    newLast30Days,
    paidUsers,
    activeSubscribers,
    totalPaidRevenue,
    plans,
    subscriptions,
    activeSubscriptionRows,
    recentUsers,
    recentPayments,
  ] = await Promise.all([
    db.$queryRawUnsafe<CountRow[]>(`SELECT COUNT(*)::int AS count FROM "users"`),
    db.$queryRawUnsafe<CountRow[]>(
      `SELECT COUNT(*)::int AS count
       FROM "users"
       WHERE "email" NOT ILIKE '%@ventureos.local'
         AND "email" NOT ILIKE '%test%'
         AND "email" NOT ILIKE '%demo%'
         AND "email" NOT ILIKE '%seed%'
         AND "email" NOT ILIKE '%example.%'`,
    ),
    db.$queryRawUnsafe<CountRow[]>(`SELECT COUNT(*)::int AS count FROM "users" WHERE "createdAt" >= $1`, since7),
    db.$queryRawUnsafe<CountRow[]>(`SELECT COUNT(*)::int AS count FROM "users" WHERE "createdAt" >= $1`, since30),
    db.$queryRawUnsafe<CountRow[]>(
      `SELECT COUNT(DISTINCT "userId")::int AS count
       FROM "payments"
       WHERE LOWER("status") IN ('paid', 'succeeded', 'complete', 'completed')`,
    ),
    db.$queryRawUnsafe<CountRow[]>(
      `SELECT COUNT(*)::int AS count
       FROM "subscriptions"
       WHERE "status" IN ('ACTIVE', 'TRIALING') AND "tier" <> 'STARTER'`,
    ),
    db.$queryRawUnsafe<MoneyRow[]>(
      `SELECT COALESCE(SUM("amount"), 0)::int AS cents
       FROM "payments"
       WHERE LOWER("status") IN ('paid', 'succeeded', 'complete', 'completed')`,
    ),
    db.$queryRawUnsafe<Array<{ plan: string | null; count: number }>>(
      `SELECT COALESCE(NULLIF("plan", ''), 'free') AS plan, COUNT(*)::int AS count
       FROM "users"
       GROUP BY COALESCE(NULLIF("plan", ''), 'free')
       ORDER BY count DESC`,
    ),
    db.$queryRawUnsafe<Array<{ tier: string; status: string; count: number }>>(
      `SELECT "tier"::text AS tier, "status"::text AS status, COUNT(*)::int AS count
       FROM "subscriptions"
       GROUP BY "tier", "status"
       ORDER BY count DESC`,
    ),
    db.$queryRawUnsafe<Array<{ tier: string }>>(
      `SELECT "tier"::text AS tier
       FROM "subscriptions"
       WHERE "status" IN ('ACTIVE', 'TRIALING') AND "tier" <> 'STARTER'`,
    ),
    db.$queryRawUnsafe<Array<{ id: string; email: string; plan: string; createdAt: Date }>>(
      `SELECT "id", "email", "plan", "createdAt"
       FROM "users"
       ORDER BY "createdAt" DESC
       LIMIT 12`,
    ),
    db.$queryRawUnsafe<Array<{ id: string; customerEmail: string | null; offerId: string; status: string; amount: number; currency: string; createdAt: Date }>>(
      `SELECT "id", "customerEmail", "offerId", "status", "amount", "currency", "createdAt"
       FROM "payments"
       ORDER BY "createdAt" DESC
       LIMIT 12`,
    ),
  ]);

  const total = numberFromRow(totalUsers);
  const likelyReal = numberFromRow(likelyRealUsers);

  return {
    generatedAt: new Date().toISOString(),
    users: {
      total,
      likelyReal,
      systemOrTest: Math.max(total - likelyReal, 0),
      newLast7Days: numberFromRow(newLast7Days),
      newLast30Days: numberFromRow(newLast30Days),
    },
    revenue: {
      paidUsers: numberFromRow(paidUsers),
      activeSubscribers: numberFromRow(activeSubscribers),
      totalPaidRevenueCents: centsFromRow(totalPaidRevenue),
      estimatedMrrCents: activeSubscriptionRows.reduce((sum, row) => sum + (MONTHLY_RECURRING_CENTS[row.tier] || 0), 0),
      currency: "usd",
    },
    plans: plans.map((row) => ({ plan: row.plan || "free", count: Number(row.count || 0) })),
    subscriptions: subscriptions.map((row) => ({ tier: row.tier, status: row.status, count: Number(row.count || 0) })),
    recentUsers: recentUsers.map((user) => ({
      ...user,
      createdAt: user.createdAt.toISOString(),
    })),
    recentPayments: recentPayments.map((payment) => ({
      id: payment.id,
      email: payment.customerEmail,
      offerId: payment.offerId,
      status: payment.status,
      amount: Number(payment.amount || 0),
      currency: payment.currency,
      createdAt: payment.createdAt.toISOString(),
    })),
  };
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function numberFromRow(rows: CountRow[]) {
  return Number(rows[0]?.count || 0);
}

function centsFromRow(rows: MoneyRow[]) {
  return Number(rows[0]?.cents || 0);
}
