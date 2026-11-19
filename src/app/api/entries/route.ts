import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";

const mealTypes = new Set(["breakfast", "lunch", "dinner", "snack"]);
const drinkTypes = new Set(["water", "tea", "coffee", "juice", "other"]);
const sourceTypes = new Set(["home", "cafe", "delivery", "ready_meal"]);
const validFoodTags = new Set(["useful", "fastfood", "sweet", "alcohol", "coffee"]);
const validExpenseTags = new Set(["useful", "fastfood", "delivery", "impulsive"]);
const expenseCategoryKeys: Record<string, string> = {
  Продукты: "food_products",
  "Заказ еды": "food_delivery",
  "Кафе и рестораны": "food_cafe",
  "Перекусы и кофе": "food_snacks",
  "Вода и напитки": "food_drinks",
  Алкоголь: "food_alcohol",
  Спортпит: "food_supplements",
};

function text(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function number(value: unknown, max = 1_000_000) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= max ? parsed : null;
}

function isoDate(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

async function currentUser(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user ?? null;
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [foods, drinks, expenses, tags, ingredients, expenseTags] = await Promise.all([
    db.execute({ sql: "SELECT id, meal_type, notes, source_type, occurred_at, portion_quantity, portion_unit, calories_kcal, protein_g, fat_g, carbs_g, hunger_level, satiety_level, mood FROM food_entries WHERE user_id = ? ORDER BY occurred_at DESC", args: [user.id] }),
    db.execute({ sql: "SELECT id, drink_type, volume_ml, occurred_at FROM drink_entries WHERE user_id = ? ORDER BY occurred_at DESC", args: [user.id] }),
    db.execute({ sql: "SELECT t.id, t.amount_minor, t.currency, c.name AS category, t.merchant, t.payment_method, t.comment, t.occurred_at FROM financial_transactions t JOIN finance_categories c ON c.id = t.category_id WHERE t.user_id = ? AND t.transaction_type = 'expense' ORDER BY t.occurred_at DESC", args: [user.id] }),
    db.execute({ sql: "SELECT t.food_entry_id, t.tag FROM food_entry_tags t JOIN food_entries f ON f.id = t.food_entry_id WHERE f.user_id = ?", args: [user.id] }),
    db.execute({ sql: "SELECT i.food_entry_id, i.name, i.quantity_g, i.calories_per_100g FROM food_entry_ingredients i JOIN food_entries f ON f.id = i.food_entry_id WHERE f.user_id = ?", args: [user.id] }),
    db.execute({ sql: "SELECT t.transaction_id, t.tag FROM financial_transaction_tags t JOIN financial_transactions f ON f.id = t.transaction_id WHERE f.user_id = ?", args: [user.id] }),
  ]);
  const foodTags = new Map<string, string[]>();
  for (const row of tags.rows) {
    const key = String(row.food_entry_id);
    foodTags.set(key, [...(foodTags.get(key) ?? []), String(row.tag)]);
  }
  const recipes = new Map<string, { name: string; grams: number; caloriesPer100: number }[]>();
  for (const row of ingredients.rows) {
    const key = String(row.food_entry_id);
    recipes.set(key, [...(recipes.get(key) ?? []), { name: String(row.name), grams: Number(row.quantity_g), caloriesPer100: Number(row.calories_per_100g) }]);
  }
  const expenseTagMap = new Map<string, string[]>();
  for (const row of expenseTags.rows) {
    const key = String(row.transaction_id);
    expenseTagMap.set(key, [...(expenseTagMap.get(key) ?? []), String(row.tag)]);
  }
  const entries = [
    ...foods.rows.map((row) => ({
      id: String(row.id), kind: "food" as const, mealType: String(row.meal_type), name: String(row.notes || "Приём пищи"),
      sourceType: String(row.source_type || "home"), createdAt: String(row.occurred_at),
      portionGrams: row.portion_unit === "g" && row.portion_quantity != null ? Number(row.portion_quantity) : undefined,
      calories: Number(row.calories_kcal ?? 0), protein: row.protein_g == null ? undefined : Number(row.protein_g),
      fat: row.fat_g == null ? undefined : Number(row.fat_g), carbs: row.carbs_g == null ? undefined : Number(row.carbs_g),
      hungerLevel: row.hunger_level == null ? undefined : Number(row.hunger_level), satietyLevel: row.satiety_level == null ? undefined : Number(row.satiety_level), mood: row.mood == null ? undefined : String(row.mood),
      tags: foodTags.get(String(row.id)) ?? [], recipeIngredients: recipes.get(String(row.id)),
    })),
    ...drinks.rows.map((row) => ({ id: String(row.id), kind: "drink" as const, drinkType: String(row.drink_type), volumeMl: Number(row.volume_ml), createdAt: String(row.occurred_at) })),
    ...expenses.rows.map((row) => ({ id: String(row.id), kind: "expense" as const, amount: Number(row.amount_minor) / 100, currency: String(row.currency), category: String(row.category), merchant: String(row.merchant ?? ""), paymentMethod: String(row.payment_method ?? ""), comment: String(row.comment ?? ""), tags: expenseTagMap.get(String(row.id)) ?? [], createdAt: String(row.occurred_at) })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ entries });
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const value = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!value) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const id = text(value.id, 80);
  const createdAt = isoDate(value.createdAt);
  const kind = text(value.kind, 20);
  if (!id || !createdAt) return NextResponse.json({ error: "invalid_entry" }, { status: 400 });

  if (kind === "food") {
    const mealType = text(value.mealType);
    const name = text(value.name, 100);
    const sourceType = text(value.sourceType || "home");
    const calories = number(value.calories);
    const portionGrams = number(value.portionGrams, 100_000);
    if (!mealTypes.has(mealType) || !sourceTypes.has(sourceType) || !name || calories == null) return NextResponse.json({ error: "invalid_food" }, { status: 400 });
    const tags = Array.isArray(value.tags) ? value.tags.map((tag) => text(tag, 30)).filter((tag) => validFoodTags.has(tag)) : [];
    const ingredients = Array.isArray(value.recipeIngredients) ? value.recipeIngredients.slice(0, 40) : [];
    await db.execute({
      sql: "INSERT OR IGNORE INTO food_entries (id, user_id, meal_type, source_type, occurred_at, portion_quantity, portion_unit, calories_kcal, protein_g, fat_g, carbs_g, hunger_level, satiety_level, mood, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [id, user.id, mealType, sourceType, createdAt, portionGrams, portionGrams == null ? null : "g", calories, number(value.protein), number(value.fat), number(value.carbs), number(value.hungerLevel, 5), number(value.satietyLevel, 5), text(value.mood, 40) || null, name],
    });
    const ownership = await db.execute({ sql: "SELECT user_id FROM food_entries WHERE id = ?", args: [id] });
    if (!ownership.rows[0] || String(ownership.rows[0].user_id) !== user.id) return NextResponse.json({ error: "entry_conflict" }, { status: 409 });
    for (const tag of tags) await db.execute({ sql: "INSERT OR IGNORE INTO food_entry_tags (food_entry_id, tag) VALUES (?, ?)", args: [id, tag] });
    for (const [index, ingredient] of ingredients.entries()) {
      if (!ingredient || typeof ingredient !== "object") continue;
      const item = ingredient as Record<string, unknown>;
      const ingredientName = text(item.name, 100);
      const grams = number(item.grams, 100_000);
      const caloriesPer100 = number(item.caloriesPer100, 10_000);
      if (ingredientName && grams != null && caloriesPer100 != null) {
        await db.execute({ sql: "INSERT OR IGNORE INTO food_entry_ingredients (id, food_entry_id, name, quantity_g, calories_per_100g) VALUES (?, ?, ?, ?, ?)", args: [`${id}-${index}`, id, ingredientName, grams, caloriesPer100] });
      }
    }
  } else if (kind === "drink") {
    const drinkType = text(value.drinkType);
    const volume = number(value.volumeMl, 20_000);
    if (!drinkTypes.has(drinkType) || volume == null || volume < 1) return NextResponse.json({ error: "invalid_drink" }, { status: 400 });
    await db.execute({ sql: "INSERT OR IGNORE INTO drink_entries (id, user_id, drink_type, volume_ml, occurred_at) VALUES (?, ?, ?, ?, ?)", args: [id, user.id, drinkType, Math.round(volume), createdAt] });
    const ownership = await db.execute({ sql: "SELECT user_id FROM drink_entries WHERE id = ?", args: [id] });
    if (!ownership.rows[0] || String(ownership.rows[0].user_id) !== user.id) return NextResponse.json({ error: "entry_conflict" }, { status: 409 });
  } else if (kind === "expense") {
    const amount = number(value.amount, 100_000_000);
    const currency = text(value.currency, 3).toUpperCase();
    const categoryKey = expenseCategoryKeys[text(value.category)] ?? "food_products";
    const merchant = text(value.merchant, 160);
    if (amount == null || amount < 0.01 || currency.length !== 3) return NextResponse.json({ error: "invalid_expense" }, { status: 400 });
    const category = await db.execute({ sql: "SELECT id FROM finance_categories WHERE category_key = ? AND category_type = 'expense' LIMIT 1", args: [categoryKey] });
    if (!category.rows[0]) return NextResponse.json({ error: "category_missing" }, { status: 500 });
    await db.execute({ sql: "INSERT OR IGNORE INTO financial_transactions (id, user_id, category_id, transaction_type, amount_minor, currency, occurred_at, merchant, payment_method, comment) VALUES (?, ?, ?, 'expense', ?, ?, ?, ?, ?, ?)", args: [id, user.id, String(category.rows[0].id), Math.round(amount * 100), currency, createdAt, merchant, text(value.paymentMethod, 40) || null, text(value.comment, 500) || null] });
    const ownership = await db.execute({ sql: "SELECT user_id FROM financial_transactions WHERE id = ?", args: [id] });
    if (!ownership.rows[0] || String(ownership.rows[0].user_id) !== user.id) return NextResponse.json({ error: "entry_conflict" }, { status: 409 });
    const tags = Array.isArray(value.tags) ? value.tags.map((tag) => text(tag, 30)).filter((tag) => validExpenseTags.has(tag)) : [];
    for (const tag of tags) await db.execute({ sql: "INSERT OR IGNORE INTO financial_transaction_tags (transaction_id, tag) VALUES (?, ?)", args: [id, tag] });
  } else {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id }, { status: 201 });
}

export async function DELETE(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const value = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = text(value?.id, 80);
  const kind = text(value?.kind);
  if (!id || !["food", "drink", "expense"].includes(kind)) return NextResponse.json({ error: "invalid_entry" }, { status: 400 });
  const table = kind === "food" ? "food_entries" : kind === "drink" ? "drink_entries" : "financial_transactions";
  if (kind === "food" || kind === "expense") {
    const ownerType = kind === "food" ? "food_entry" : "transaction";
    await db.execute({ sql: "DELETE FROM attachments WHERE user_id = ? AND owner_type = ? AND owner_id = ?", args: [user.id, ownerType, id] });
  }
  if (kind === "expense") await db.execute({ sql: "DELETE FROM financial_transaction_tags WHERE transaction_id = ? AND EXISTS (SELECT 1 FROM financial_transactions WHERE id = ? AND user_id = ?)", args: [id, id, user.id] });
  await db.execute({ sql: `DELETE FROM ${table} WHERE id = ? AND user_id = ?`, args: [id, user.id] });
  return NextResponse.json({ ok: true });
}
