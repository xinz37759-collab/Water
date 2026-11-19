import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";

type OwnerType = "food_entry" | "transaction";
type AttachmentKind = "meal_photo" | "receipt";

async function currentUser(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user ?? null;
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await db.execute({ sql: "SELECT id, owner_type, owner_id, kind, mime_type, size_bytes, created_at FROM attachments WHERE user_id = ? ORDER BY created_at DESC", args: [user.id] });
  return NextResponse.json({ attachments: result.rows.map((row) => ({
    id: String(row.id), ownerType: String(row.owner_type), ownerId: String(row.owner_id), kind: String(row.kind),
    mimeType: String(row.mime_type), sizeBytes: Number(row.size_bytes), createdAt: String(row.created_at),
  })) });
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const value = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = typeof value?.id === "string" ? value.id.slice(0, 80) : "";
  const ownerType = value?.ownerType as OwnerType;
  const kind = value?.kind as AttachmentKind;
  const ownerId = typeof value?.ownerId === "string" ? value.ownerId.slice(0, 80) : "";
  const mimeType = typeof value?.mimeType === "string" ? value.mimeType.slice(0, 80) : "";
  const sizeBytes = Number(value?.sizeBytes);
  const correctPair = (ownerType === "food_entry" && kind === "meal_photo") || (ownerType === "transaction" && kind === "receipt");
  if (!id || !ownerId || !correctPair || !/^image\/(jpeg|png|webp|heic)$/.test(mimeType) || !Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 12 * 1024 * 1024) {
    return NextResponse.json({ error: "invalid_attachment" }, { status: 400 });
  }
  const table = ownerType === "food_entry" ? "food_entries" : "financial_transactions";
  const owner = await db.execute({ sql: `SELECT id FROM ${table} WHERE id = ? AND user_id = ?`, args: [ownerId, user.id] });
  if (!owner.rows[0]) return NextResponse.json({ error: "owner_not_found" }, { status: 404 });
  const conflict = await db.execute({ sql: "SELECT user_id FROM attachments WHERE id = ?", args: [id] });
  if (conflict.rows[0] && String(conflict.rows[0].user_id) !== user.id) return NextResponse.json({ error: "attachment_conflict" }, { status: 409 });
  await db.execute({
    sql: "INSERT OR IGNORE INTO attachments (id, user_id, owner_type, owner_id, kind, storage_key, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    args: [id, user.id, ownerType, ownerId, kind, `device:${user.id}:${id}`, mimeType, sizeBytes],
  });
  return NextResponse.json({ ok: true, id }, { status: 201 });
}

export async function DELETE(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const value = await request.json().catch(() => null) as { id?: unknown } | null;
  const id = typeof value?.id === "string" ? value.id.slice(0, 80) : "";
  if (!id) return NextResponse.json({ error: "invalid_attachment" }, { status: 400 });
  await db.execute({ sql: "DELETE FROM attachments WHERE id = ? AND user_id = ?", args: [id, user.id] });
  return NextResponse.json({ ok: true });
}
