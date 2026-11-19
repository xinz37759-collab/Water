import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";

export async function DELETE(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { confirmation?: unknown } | null;
  if (body?.confirmation !== "DELETE") return NextResponse.json({ error: "confirmation_required" }, { status: 400 });

  const userId = session.user.id;
  const email = session.user.email;
  // Explicitly remove rows that may outlive cascades in SQLite-compatible deployments.
  await db.batch([
    { sql: "DELETE FROM food_entry_transactions WHERE user_id = ?", args: [userId] },
    { sql: "DELETE FROM attachments WHERE user_id = ?", args: [userId] },
    { sql: "DELETE FROM financial_transaction_tags WHERE transaction_id IN (SELECT id FROM financial_transactions WHERE user_id = ?)", args: [userId] },
    { sql: "DELETE FROM food_entry_tags WHERE food_entry_id IN (SELECT id FROM food_entries WHERE user_id = ?)", args: [userId] },
    { sql: "DELETE FROM food_entry_ingredients WHERE food_entry_id IN (SELECT id FROM food_entries WHERE user_id = ?)", args: [userId] },
    { sql: "DELETE FROM financial_transactions WHERE user_id = ?", args: [userId] },
    { sql: "DELETE FROM food_entries WHERE user_id = ?", args: [userId] },
    { sql: "DELETE FROM drink_entries WHERE user_id = ?", args: [userId] },
    { sql: "DELETE FROM budgets WHERE user_id = ?", args: [userId] },
    { sql: "DELETE FROM favorites WHERE user_id = ?", args: [userId] },
    { sql: "DELETE FROM user_goals WHERE user_id = ?", args: [userId] },
    { sql: "DELETE FROM user_preferences WHERE user_id = ?", args: [userId] },
    { sql: "DELETE FROM auth_sessions WHERE user_id = ?", args: [userId] },
    { sql: "DELETE FROM account WHERE userId = ?", args: [userId] },
    { sql: "DELETE FROM session WHERE userId = ?", args: [userId] },
    { sql: "DELETE FROM verification WHERE identifier = ?", args: [email] },
    { sql: "DELETE FROM finance_categories WHERE user_id = ?", args: [userId] },
    { sql: "DELETE FROM user WHERE id = ?", args: [userId] },
    { sql: "DELETE FROM users WHERE id = ?", args: [userId] },
  ], "write");

  const response = NextResponse.json({ ok: true });
  response.cookies.set("better-auth.session_token", "", { path: "/", expires: new Date(0) });
  return response;
}
