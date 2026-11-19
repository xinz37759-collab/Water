import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";

type BudgetPeriod = "day" | "week" | "month";

async function currentUser(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user ?? null;
}

function dateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function periodStart(period: BudgetPeriod) {
  const now = new Date();
  const localDate = dateKey(now);
  const [year, month, day] = localDate.split("-").map(Number);
  const localMidnight = new Date(Date.UTC(year, month - 1, day));
  if (period === "week") {
    const dayOfWeek = (localMidnight.getUTCDay() + 6) % 7;
    localMidnight.setUTCDate(localMidnight.getUTCDate() - dayOfWeek);
  } else if (period === "month") {
    localMidnight.setUTCDate(1);
  }
  const key = `${localMidnight.getUTCFullYear()}-${String(localMidnight.getUTCMonth() + 1).padStart(2, "0")}-${String(localMidnight.getUTCDate()).padStart(2, "0")}`;
  return { key, timestamp: `${key}T00:00:00+05:00` };
}

function isPeriod(value: string | null): value is BudgetPeriod {
  return value === "day" || value === "week" || value === "month";
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const requested = new URL(request.url).searchParams.get("period");
  const period: BudgetPeriod = isPeriod(requested) ? requested : "week";
  const start = periodStart(period);
  const [budget, spent] = await Promise.all([
    db.execute({ sql: "SELECT amount_minor, currency FROM budgets WHERE user_id = ? AND period_type = ? ORDER BY updated_at DESC LIMIT 1", args: [user.id, period] }),
    db.execute({ sql: "SELECT COALESCE(SUM(amount_minor), 0) AS total FROM financial_transactions WHERE user_id = ? AND transaction_type = 'expense' AND currency = (SELECT currency FROM budgets WHERE user_id = ? AND period_type = ? ORDER BY updated_at DESC LIMIT 1) AND datetime(occurred_at) >= datetime(?)", args: [user.id, user.id, period, start.timestamp] }),
  ]);
  const row = budget.rows[0];
  const amountMinor = row ? Number(row.amount_minor) : null;
  const spentMinor = row ? Number(spent.rows[0]?.total ?? 0) : 0;
  return NextResponse.json({ period, periodStart: start.key, currency: row ? String(row.currency) : "UZS", amountMinor, spentMinor, remainingMinor: amountMinor == null ? null : amountMinor - spentMinor });
}

export async function PUT(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const value = await request.json().catch(() => null) as { period?: unknown; amount?: unknown; currency?: unknown } | null;
  const period = typeof value?.period === "string" && isPeriod(value.period) ? value.period : null;
  const amount = Number(value?.amount);
  const currency = typeof value?.currency === "string" ? value.currency.toUpperCase() : "UZS";
  if (!period || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000 || !/^[A-Z]{3}$/.test(currency)) {
    return NextResponse.json({ error: "invalid_budget" }, { status: 400 });
  }
  const start = periodStart(period);
  const existing = await db.execute({ sql: "SELECT id FROM budgets WHERE user_id = ? AND period_type = ? ORDER BY updated_at DESC LIMIT 1", args: [user.id, period] });
  const id = existing.rows[0]?.id;
  if (id) {
    await db.execute({ sql: "UPDATE budgets SET period_start = ?, amount_minor = ?, currency = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", args: [start.key, Math.round(amount * 100), currency, String(id), user.id] });
  } else {
    await db.execute({ sql: "INSERT INTO budgets (id, user_id, period_type, period_start, amount_minor, currency) VALUES (?, ?, ?, ?, ?, ?)", args: [crypto.randomUUID(), user.id, period, start.key, Math.round(amount * 100), currency] });
  }
  return NextResponse.json({ ok: true });
}
