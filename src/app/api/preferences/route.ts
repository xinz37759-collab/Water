import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";

async function currentUser(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user ?? null;
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [preferences, goals] = await Promise.all([
    db.execute({ sql: "SELECT currency, mass_unit, volume_unit, reminders_enabled, reminder_time FROM user_preferences WHERE user_id = ?", args: [user.id] }),
    db.execute({ sql: "SELECT water_goal_ml, calories_goal_kcal, protein_goal_g, fat_goal_g, carbs_goal_g FROM user_goals WHERE user_id = ?", args: [user.id] }),
  ]);
  return NextResponse.json({ preferences: preferences.rows[0] ?? null, goals: goals.rows[0] ?? null });
}

export async function PUT(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const value = await request.json().catch(() => null) as { preferences?: Record<string, unknown>; goals?: Record<string, unknown> } | null;
  if (!value?.preferences || !value.goals) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const p = value.preferences;
  const g = value.goals;
  const currency = typeof p.currency === "string" && /^[A-Z]{3}$/.test(p.currency) ? p.currency : "UZS";
  const massUnit = p.massUnit === "kg" ? "kg" : "g";
  const volumeUnit = p.volumeUnit === "l" ? "l" : "ml";
  const enabled = p.remindersEnabled === true ? 1 : 0;
  await db.execute({
    sql: "INSERT INTO user_preferences (user_id, currency, mass_unit, volume_unit, reminders_enabled, reminder_time) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET currency=excluded.currency, mass_unit=excluded.mass_unit, volume_unit=excluded.volume_unit, reminders_enabled=excluded.reminders_enabled, reminder_time=excluded.reminder_time, updated_at=CURRENT_TIMESTAMP",
    args: [user.id, currency, massUnit, volumeUnit, enabled, typeof p.reminderTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(p.reminderTime) ? p.reminderTime : "10:00"],
  });
  const safeGoal = (field: string, max: number) => {
    const input = g[field];
    const parsed = input == null || input === "" ? null : Number(input);
    return parsed == null || !Number.isFinite(parsed) || parsed <= 0 || parsed > max ? null : parsed;
  };
  await db.execute({
    sql: "INSERT INTO user_goals (user_id, water_goal_ml, calories_goal_kcal, protein_goal_g, fat_goal_g, carbs_goal_g) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET water_goal_ml=excluded.water_goal_ml, calories_goal_kcal=excluded.calories_goal_kcal, protein_goal_g=excluded.protein_goal_g, fat_goal_g=excluded.fat_goal_g, carbs_goal_g=excluded.carbs_goal_g, updated_at=CURRENT_TIMESTAMP",
    args: [user.id, safeGoal("waterGoalMl", 100_000), safeGoal("caloriesGoalKcal", 100_000), safeGoal("proteinGoalG", 10_000), safeGoal("fatGoalG", 10_000), safeGoal("carbsGoalG", 10_000)],
  });
  return NextResponse.json({ ok: true });
}
