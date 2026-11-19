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
  const [result, savedStores] = await Promise.all([
    db.execute({ sql: "SELECT id, label, payload_json FROM favorites WHERE user_id = ? AND item_type IN ('food', 'drink') ORDER BY created_at DESC", args: [user.id] }),
    db.execute({ sql: "SELECT id, label, payload_json FROM favorites WHERE user_id = ? AND item_type = 'store' ORDER BY created_at DESC", args: [user.id] }),
  ]);
  const favorites = result.rows.map((row) => ({ id: String(row.id), label: String(row.label), entry: JSON.parse(String(row.payload_json)) }));
  const stores = savedStores.rows.map((row) => ({ id: String(row.id), label: String(row.label), ...JSON.parse(String(row.payload_json)) }));
  return NextResponse.json({ favorites, stores });
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const value = await request.json().catch(() => null) as { id?: unknown; label?: unknown; entry?: Record<string, unknown>; type?: unknown; merchant?: unknown; category?: unknown } | null;
  const id = typeof value?.id === "string" ? value.id.slice(0, 80) : "";
  if (value?.type === "store") {
    const merchant = typeof value.merchant === "string" ? value.merchant.trim().slice(0, 100) : "";
    const category = typeof value.category === "string" ? value.category.trim().slice(0, 60) : "Продукты";
    if (!id || !merchant) return NextResponse.json({ error: "invalid_store" }, { status: 400 });
    await db.execute({ sql: "INSERT OR IGNORE INTO favorites (id, user_id, item_type, label, payload_json) VALUES (?, ?, 'store', ?, ?)", args: [id, user.id, merchant, JSON.stringify({ merchant, category })] });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  }
  const entry = value?.entry;
  if (!id || !entry || !["food", "drink"].includes(String(entry.kind))) return NextResponse.json({ error: "invalid_favorite" }, { status: 400 });
  const label = typeof value?.label === "string" ? value.label.trim().slice(0, 100) : "Избранное";
  const payload = { ...entry };
  delete payload.photoDataUrl;
  await db.execute({ sql: "INSERT OR IGNORE INTO favorites (id, user_id, item_type, label, payload_json) VALUES (?, ?, ?, ?, ?)", args: [id, user.id, String(entry.kind), label, JSON.stringify(payload)] });
  return NextResponse.json({ ok: true, id }, { status: 201 });
}

export async function DELETE(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const value = await request.json().catch(() => null) as { id?: unknown } | null;
  const id = typeof value?.id === "string" ? value.id.slice(0, 80) : "";
  if (!id) return NextResponse.json({ error: "invalid_favorite" }, { status: 400 });
  await db.execute({ sql: "DELETE FROM favorites WHERE id = ? AND user_id = ?", args: [id, user.id] });
  return NextResponse.json({ ok: true });
}
