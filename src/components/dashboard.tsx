"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import NextImage from "next/image";
import { authClient } from "@/lib/auth-client";
import { deleteAllLocalAttachments, deleteLocalAttachment, exportLocalAttachments, readLocalAttachment, saveLocalAttachment } from "@/lib/local-attachments";

type EntryKind = "food" | "drink" | "expense";
type MealType = "breakfast" | "lunch" | "snack" | "dinner";
type DrinkType = "water" | "tea" | "coffee" | "juice" | "other";
type SectionId = "today" | "diary" | "analytics" | "settings";
type DiaryFilter = "all" | EntryKind | "photo";
type DiaryPeriod = "today" | "7days" | "all";
type ModalState = { step: "type" } | { step: "details"; kind: EntryKind; mealType?: MealType };
type UserPreferences = {
  waterGoalMl: number | null;
  caloriesGoalKcal: number | null;
  proteinGoalG: number | null;
  fatGoalG: number | null;
  carbsGoalG: number | null;
  volumeUnit: "ml" | "l";
  massUnit: "g" | "kg";
  currency: string;
  remindersEnabled: boolean;
  reminderTime: string;
  photoCompression: "balanced" | "detail";
};
type RecipeIngredientDraft = {
  id: string;
  foodId: string;
  customName: string;
  quantity: string;
  unit: "g" | "piece";
  caloriesPer100: string;
};
type SavedRecipeIngredient = { name: string; grams: number; caloriesPer100: number };
type IngredientReference = { id: string; name: string; caloriesPer100: number; gramsPerPiece?: number };

type SettingsDraft = {
  waterGoal: string;
  caloriesGoal: string;
  proteinGoal: string;
  fatGoal: string;
  carbsGoal: string;
  volumeUnit: "ml" | "l";
  massUnit: "g" | "kg";
  currency: string;
  remindersEnabled: boolean;
  reminderTime: string;
  photoCompression: "balanced" | "detail";
};

type FoodEntry = {
  id: string;
  kind: "food";
  mealType: MealType;
  name: string;
  calories: number;
  sourceType: "home" | "cafe" | "delivery" | "ready_meal";
  tags: string[];
  protein?: number;
  fat?: number;
  carbs?: number;
  hungerLevel?: number;
  satietyLevel?: number;
  mood?: string;
  portionGrams?: number;
  recipeIngredients?: SavedRecipeIngredient[];
  recipeServings?: number;
  createdAt: string;
};

type DrinkEntry = {
  id: string;
  kind: "drink";
  drinkType: DrinkType;
  volumeMl: number;
  createdAt: string;
};

type ExpenseEntry = {
  id: string;
  kind: "expense";
  amount: number;
  currency: string;
  category: string;
  merchant: string;
  paymentMethod: string;
  comment: string;
  tags: string[];
  createdAt: string;
};

type Entry = FoodEntry | DrinkEntry | ExpenseEntry;
type Favorite = { id: string; label: string; entry: FoodEntry | DrinkEntry };
type FavoriteStore = { id: string; label: string; merchant: string; category: string };
type AttachmentMeta = { id: string; ownerType: "food_entry" | "transaction"; ownerId: string; kind: "meal_photo" | "receipt"; mimeType: string; sizeBytes: number; createdAt: string };
type BudgetPeriod = "day" | "week" | "month";
type BudgetInfo = { period: BudgetPeriod; periodStart: string; currency: string; amountMinor: number | null; spentMinor: number; remainingMinor: number | null };

const RECIPE_INGREDIENTS: IngredientReference[] = [
  { id: "cottage-cheese-5", name: "Творог 5%", caloriesPer100: 121 },
  { id: "egg", name: "Яйцо", caloriesPer100: 143, gramsPerPiece: 50 },
  { id: "wheat-flour", name: "Мука пшеничная", caloriesPer100: 364 },
  { id: "sugar", name: "Сахар", caloriesPer100: 387 },
  { id: "sunflower-oil", name: "Масло растительное", caloriesPer100: 884 },
  { id: "sour-cream-15", name: "Сметана 15%", caloriesPer100: 162 },
  { id: "milk-25", name: "Молоко 2,5%", caloriesPer100: 52 },
  { id: "butter", name: "Масло сливочное", caloriesPer100: 717 },
  { id: "banana", name: "Банан", caloriesPer100: 89, gramsPerPiece: 118 },
  { id: "apple", name: "Яблоко", caloriesPer100: 52, gramsPerPiece: 182 },
  { id: "oats", name: "Овсяные хлопья", caloriesPer100: 389 },
  { id: "rice-cooked", name: "Рис варёный", caloriesPer100: 130 },
  { id: "chicken", name: "Куриная грудка", caloriesPer100: 165 },
  { id: "salt", name: "Соль", caloriesPer100: 0 },
];
const DEFAULT_PREFERENCES: UserPreferences = {
  waterGoalMl: null,
  caloriesGoalKcal: null,
  proteinGoalG: null,
  fatGoalG: null,
  carbsGoalG: null,
  volumeUnit: "ml",
  massUnit: "g",
  currency: "UZS",
  remindersEnabled: false,
  reminderTime: "10:00",
  photoCompression: "balanced",
};
const DEFAULT_SETTINGS_DRAFT: SettingsDraft = {
  waterGoal: "",
  caloriesGoal: "",
  proteinGoal: "",
  fatGoal: "",
  carbsGoal: "",
  volumeUnit: "ml",
  massUnit: "g",
  currency: "UZS",
  remindersEnabled: false,
  reminderTime: "10:00",
  photoCompression: "balanced",
};
const mealOptions: { value: MealType; label: string; icon: string; time: string }[] = [
  { value: "breakfast", label: "Завтрак", icon: "🌅", time: "08:00" },
  { value: "lunch", label: "Обед", icon: "☀️", time: "13:00" },
  { value: "snack", label: "Перекус", icon: "🍎", time: "16:00" },
  { value: "dinner", label: "Ужин", icon: "🌙", time: "19:00" },
];
const tagLabels: Record<string, string> = { useful: "Полезное", fastfood: "Фастфуд", sweet: "Сладкое", alcohol: "Алкоголь", coffee: "Кофе" };
const foodTagOptions = Object.entries(tagLabels);
const expenseTagLabels: Record<string, string> = { useful: "Полезное", fastfood: "Фастфуд", delivery: "Доставка", impulsive: "Импульсивно" };

const navItems = [
  { id: "today" as const, icon: "⌂", label: "Сегодня" },
  { id: "diary" as const, icon: "▤", label: "Дневник" },
  { id: "analytics" as const, icon: "◉", label: "Аналитика" },
  { id: "settings" as const, icon: "⚙", label: "Настройки" },
];

const emptyForm = {
  name: "",
  occurredAt: "",
  mealType: "breakfast" as MealType,
  sourceType: "home" as FoodEntry["sourceType"],
  protein: "",
  fat: "",
  carbs: "",
  hunger: "",
  satiety: "",
  mood: "",
  tags: [] as string[],
  calories: "",
  caloriesPer100: "",
  portionGrams: "",
  photoDataUrl: "",
  receiptDataUrl: "",
  drinkType: "water" as DrinkType,
  volumeMl: "250",
  amount: "",
  currency: "UZS",
  category: "Продукты",
  merchant: "",
  paymentMethod: "card",
  comment: "",
};

function createRecipeIngredient(): RecipeIngredientDraft {
  return { id: newEntryId(), foodId: "", customName: "", quantity: "", unit: "g", caloriesPer100: "" };
}

function Navigation({
  mobile = false,
  activeSection,
  onNavigate,
}: {
  mobile?: boolean;
  activeSection: SectionId;
  onNavigate: (section: SectionId) => void;
}) {
  return (
    <nav aria-label="Основная навигация" className={mobile ? "mobile-navigation" : "side-navigation"}>
      {navItems.map((item) => (
        <button
          aria-current={activeSection === item.id ? "page" : undefined}
          className={activeSection === item.id ? "nav-item active" : "nav-item"}
          onClick={() => onNavigate(item.id)}
          key={item.id}
          type="button"
        >
          <span aria-hidden="true" className="nav-icon">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localDateTimeInput(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function moneyLabel(amount: number, currency: string) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: currency === "UZS" ? 0 : 2,
  }).format(amount);
}

function newEntryId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function dataUrlByteSize(dataUrl: string) {
  const base64 = dataUrl.split(",", 2)[1] ?? "";
  return Math.max(1, Math.floor(base64.length * 3 / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0));
}

export default function Dashboard({ userId, email }: { userId: string; email: string }) {
  const storageKey = `nutrition-water.${encodeURIComponent(userId)}.entries.v1`;
  const favoritesStorageKey = `nutrition-water.${encodeURIComponent(userId)}.favorites.v1`;
  const favoriteStoresStorageKey = `nutrition-water.${encodeURIComponent(userId)}.favorite-stores.v1`;
  const attachmentsStorageKey = `nutrition-water.${encodeURIComponent(userId)}.attachments.v1`;
  const deletedStorageKey = `nutrition-water.${encodeURIComponent(userId)}.pending-deletions.v1`;
  const deletedAttachmentsKey = `nutrition-water.${encodeURIComponent(userId)}.pending-attachment-deletions.v1`;
  const pendingBudgetKey = `nutrition-water.${encodeURIComponent(userId)}.pending-budget.v1`;
  const pendingPreferencesKey = `nutrition-water.${encodeURIComponent(userId)}.pending-preferences.v1`;
  const pendingFavoriteDeletesKey = `nutrition-water.${encodeURIComponent(userId)}.pending-favorite-deletions.v1`;
  const preferencesStorageKey = `nutrition-water.${encodeURIComponent(userId)}.preferences.v1`;
  const reminderStorageKey = `nutrition-water.${encodeURIComponent(userId)}.last-reminder-date`;
  const [entries, setEntries] = useState<Entry[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [favoriteStores, setFavoriteStores] = useState<FavoriteStore[]>([]);
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [attachmentData, setAttachmentData] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState("Подключаем дневник к аккаунту…");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [selectedKind, setSelectedKind] = useState<EntryKind>("food");
  const [form, setForm] = useState(emptyForm);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoViewer, setPhotoViewer] = useState<string | null>(null);
  const [photoViewerLabel, setPhotoViewerLabel] = useState("Фото вложения");
  const [expenseChartCurrency, setExpenseChartCurrency] = useState("UZS");
  const [activeSection, setActiveSection] = useState<SectionId>("today");
  const [diaryFilter, setDiaryFilter] = useState<DiaryFilter>("all");
  const [diaryPeriod, setDiaryPeriod] = useState<DiaryPeriod>("7days");
  const [analyticsPeriod, setAnalyticsPeriod] = useState<7 | 30>(7);
  const [quickKcalPer100, setQuickKcalPer100] = useState("");
  const [quickPortionGrams, setQuickPortionGrams] = useState("");
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>(DEFAULT_SETTINGS_DRAFT);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [budgetPeriod, setBudgetPeriod] = useState<BudgetPeriod>("week");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetInfo, setBudgetInfo] = useState<BudgetInfo | null>(null);
  const [budgetMessage, setBudgetMessage] = useState("");
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredientDraft[]>([]);
  const [recipeServings, setRecipeServings] = useState("1");
  const [recipeError, setRecipeError] = useState("");

  const refreshBudget = useCallback(async (period: BudgetPeriod = budgetPeriod) => {
    try {
      const pending = localStorage.getItem(pendingBudgetKey);
      if (pending) {
        const draft = JSON.parse(pending) as { period: BudgetPeriod; amount: number; currency: string };
        const sync = await fetch("/api/budget", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
        if (!sync.ok) throw new Error("budget sync pending");
        localStorage.removeItem(pendingBudgetKey);
      }
      const response = await fetch(`/api/budget?period=${period}`, { cache: "no-store" });
      if (!response.ok) return;
      const result = await response.json() as BudgetInfo;
      setBudgetInfo(result);
      setBudgetAmount(result.amountMinor == null ? "" : String(result.amountMinor / 100));
    } catch {
      try {
        const pending = JSON.parse(localStorage.getItem(pendingBudgetKey) ?? "null") as { period: BudgetPeriod; amount: number; currency: string } | null;
        if (pending?.period === period) {
          const amountMinor = Math.round(pending.amount * 100);
          setBudgetInfo({ period, periodStart: "", currency: pending.currency, amountMinor, spentMinor: 0, remainingMinor: amountMinor });
          setBudgetAmount(String(pending.amount));
        }
      } catch { /* no cached budget */ }
    }
  }, [budgetPeriod, pendingBudgetKey]);

  useEffect(() => { void refreshBudget(budgetPeriod); }, [refreshBudget, budgetPeriod]);

  useEffect(() => {
    let cancelled = false;
    const loadEntries = async () => {
      let localEntries: Entry[] = [];
      let pendingDeletes: { id: string; kind: EntryKind }[] = [];
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved) as (Entry & { photoDataUrl?: string })[];
          if (Array.isArray(parsed)) {
            const legacyMeta: AttachmentMeta[] = [];
            const legacyData: Record<string, string> = {};
            for (const entry of parsed) {
              if (entry.kind === "food" && entry.photoDataUrl) {
                const id = `meal-${entry.id}`.slice(0, 80);
                const dataUrl = entry.photoDataUrl;
                void saveLocalAttachment(id, userId, dataUrl).catch(() => undefined);
                legacyMeta.push({ id, ownerType: "food_entry", ownerId: entry.id, kind: "meal_photo", mimeType: dataUrl.match(/^data:([^;,]+)/)?.[1] ?? "image/jpeg", sizeBytes: dataUrlByteSize(dataUrl), createdAt: entry.createdAt });
                legacyData[id] = dataUrl;
                const withoutPhoto = { ...entry };
                delete withoutPhoto.photoDataUrl;
                localEntries.push(withoutPhoto);
              } else localEntries.push(entry);
            }
            if (legacyMeta.length) {
              setAttachments((current) => [...current, ...legacyMeta.filter((item) => !current.some((old) => old.id === item.id))]);
              setAttachmentData((current) => ({ ...current, ...legacyData }));
              const existing = JSON.parse(localStorage.getItem(attachmentsStorageKey) ?? "[]") as AttachmentMeta[];
              localStorage.setItem(attachmentsStorageKey, JSON.stringify([...existing, ...legacyMeta.filter((item) => !existing.some((old) => old.id === item.id))]));
            }
          }
        }
        const deleted = localStorage.getItem(deletedStorageKey);
        if (deleted) pendingDeletes = JSON.parse(deleted) as { id: string; kind: EntryKind }[];
      } catch {
        localStorage.removeItem(storageKey);
        localStorage.removeItem(deletedStorageKey);
      }
      try {
        const stillPending: { id: string; kind: EntryKind }[] = [];
        for (const deletion of pendingDeletes) {
          const response = await fetch("/api/entries", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(deletion) });
          if (!response.ok) stillPending.push(deletion);
        }
        pendingDeletes = stillPending;
        localStorage.setItem(deletedStorageKey, JSON.stringify(pendingDeletes));
        const deletedIds = new Set(pendingDeletes.map((deletion) => deletion.id));
        const response = await fetch("/api/entries", { cache: "no-store" });
        if (!response.ok) throw new Error("Не удалось загрузить записи");
        const result = await response.json() as { entries: Entry[] };
        const remoteEntries = (Array.isArray(result.entries) ? result.entries : []).filter((entry) => !deletedIds.has(entry.id));
        localEntries = localEntries.filter((entry) => !deletedIds.has(entry.id));
        const remoteIds = new Set(remoteEntries.map((entry) => entry.id));
        const merged: Entry[] = [...remoteEntries];
        for (const entry of localEntries.filter((candidate) => !remoteIds.has(candidate.id))) {
          const saved = await fetch("/api/entries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) });
          if (!saved.ok) throw new Error("entry sync pending");
          merged.push(entry);
        }
        if (!cancelled) {
          setEntries(merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
          setSyncStatus("Синхронизировано с аккаунтом");
        }
      } catch {
        if (!cancelled) {
          const deletedIds = new Set(pendingDeletes.map((deletion) => deletion.id));
          setEntries(localEntries.filter((entry) => !deletedIds.has(entry.id)));
          setSyncStatus("Офлайн: изменения пока только на этом устройстве");
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };
    void loadEntries();
    return () => { cancelled = true; };
  }, [storageKey, deletedStorageKey, attachmentsStorageKey, userId]);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    const loadAttachments = async () => {
      let local: AttachmentMeta[] = [];
      try {
        const raw = localStorage.getItem(attachmentsStorageKey);
        if (raw) local = JSON.parse(raw) as AttachmentMeta[];
      } catch { localStorage.removeItem(attachmentsStorageKey); }
      let combined = local;
      try {
        const pendingDeletes = JSON.parse(localStorage.getItem(deletedAttachmentsKey) ?? "[]") as string[];
        const stillPending: string[] = [];
        for (const id of pendingDeletes) {
          const removed = await fetch("/api/attachments", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
          if (!removed.ok) stillPending.push(id);
        }
        localStorage.setItem(deletedAttachmentsKey, JSON.stringify(stillPending));
        const response = await fetch("/api/attachments", { cache: "no-store" });
        if (response.ok) {
          const result = await response.json() as { attachments: AttachmentMeta[] };
          const deletedIds = new Set(stillPending);
          const remote = (Array.isArray(result.attachments) ? result.attachments : []).filter((item) => !deletedIds.has(item.id));
          const remoteIds = new Set(remote.map((item) => item.id));
          combined = [...remote, ...local.filter((item) => !remoteIds.has(item.id))];
          for (const pending of local.filter((item) => !remoteIds.has(item.id))) {
            await fetch("/api/attachments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pending) });
          }
        }
      } catch { /* local IndexedDB remains the source while offline */ }
      if (cancelled) return;
      setAttachments(combined);
      const nextData: Record<string, string> = {};
      for (const attachment of combined) {
        const data = await readLocalAttachment(attachment.id, userId).catch(() => null);
        if (data) nextData[attachment.id] = data;
      }
      if (!cancelled) setAttachmentData(nextData);
    };
    void loadAttachments();
    return () => { cancelled = true; };
  }, [loaded, attachmentsStorageKey, deletedAttachmentsKey, userId]);

  useEffect(() => {
    try { localStorage.setItem(attachmentsStorageKey, JSON.stringify(attachments)); } catch { /* images remain in IndexedDB */ }
  }, [attachments, attachmentsStorageKey]);

  useEffect(() => {
    let cancelled = false;
    let localFavorites: Favorite[] = [];
    let localStores: FavoriteStore[] = [];
    let pendingFavoriteDeletes: string[] = [];
    try {
      const saved = localStorage.getItem(favoritesStorageKey);
      if (saved) localFavorites = JSON.parse(saved) as Favorite[];
      const savedStores = localStorage.getItem(favoriteStoresStorageKey);
      if (savedStores) localStores = JSON.parse(savedStores) as FavoriteStore[];
      pendingFavoriteDeletes = JSON.parse(localStorage.getItem(pendingFavoriteDeletesKey) ?? "[]") as string[];
      setFavorites(localFavorites);
      setFavoriteStores(localStores);
    } catch { localStorage.removeItem(favoritesStorageKey); localStorage.removeItem(favoriteStoresStorageKey); }
    fetch("/api/favorites", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const stillPending: string[] = [];
      for (const id of pendingFavoriteDeletes) {
        const deleted = await fetch("/api/favorites", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
        if (!deleted.ok) stillPending.push(id);
      }
      localStorage.setItem(pendingFavoriteDeletesKey, JSON.stringify(stillPending));
      const result = await response.json() as { favorites: Favorite[]; stores?: FavoriteStore[] };
      if (!cancelled) {
        const deletedIds = new Set(stillPending);
        const remote = (Array.isArray(result.favorites) ? result.favorites : []).filter((item) => !deletedIds.has(item.id));
        const remoteIds = new Set(remote.map((favorite) => favorite.id));
        const merged = [...remote, ...localFavorites.filter((favorite) => !deletedIds.has(favorite.id) && !remoteIds.has(favorite.id))];
        setFavorites(merged);
        const remoteStores = (Array.isArray(result.stores) ? result.stores : []).filter((item) => !deletedIds.has(item.id));
        const remoteStoreIds = new Set(remoteStores.map((store) => store.id));
        setFavoriteStores([...remoteStores, ...localStores.filter((store) => !deletedIds.has(store.id) && !remoteStoreIds.has(store.id))]);
        for (const store of localStores.filter((item) => !deletedIds.has(item.id) && !remoteStoreIds.has(item.id))) {
          await fetch("/api/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...store, type: "store" }) });
        }
        for (const favorite of localFavorites.filter((item) => !deletedIds.has(item.id) && !remoteIds.has(item.id))) {
          await fetch("/api/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(favorite) });
        }
      }
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [userId, favoritesStorageKey, favoriteStoresStorageKey, pendingFavoriteDeletesKey]);

  useEffect(() => {
    try { localStorage.setItem(favoritesStorageKey, JSON.stringify(favorites)); } catch { /* retain in memory until storage is available */ }
  }, [favorites, favoritesStorageKey]);

  useEffect(() => {
    try { localStorage.setItem(favoriteStoresStorageKey, JSON.stringify(favoriteStores)); } catch { /* retain in memory until storage is available */ }
  }, [favoriteStores, favoriteStoresStorageKey]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(preferencesStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<UserPreferences>;
        const loaded: UserPreferences = {
          ...DEFAULT_PREFERENCES,
          ...parsed,
          volumeUnit: parsed.volumeUnit === "l" ? "l" : "ml",
          massUnit: parsed.massUnit === "kg" ? "kg" : "g",
          currency: typeof parsed.currency === "string" ? parsed.currency : DEFAULT_PREFERENCES.currency,
          remindersEnabled: Boolean(parsed.remindersEnabled),
          reminderTime: typeof parsed.reminderTime === "string" ? parsed.reminderTime : DEFAULT_PREFERENCES.reminderTime,
          photoCompression: parsed.photoCompression === "detail" ? "detail" : "balanced",
        };
        setPreferences(loaded);
        setSettingsDraft({
          waterGoal: loaded.waterGoalMl == null ? "" : String(loaded.waterGoalMl / (loaded.volumeUnit === "l" ? 1000 : 1)),
          caloriesGoal: loaded.caloriesGoalKcal == null ? "" : String(loaded.caloriesGoalKcal),
          proteinGoal: loaded.proteinGoalG == null ? "" : String(loaded.proteinGoalG),
          fatGoal: loaded.fatGoalG == null ? "" : String(loaded.fatGoalG),
          carbsGoal: loaded.carbsGoalG == null ? "" : String(loaded.carbsGoalG),
          volumeUnit: loaded.volumeUnit,
          massUnit: loaded.massUnit,
          currency: loaded.currency,
          remindersEnabled: loaded.remindersEnabled,
          reminderTime: loaded.reminderTime,
          photoCompression: loaded.photoCompression,
        });
      }
    } catch {
      localStorage.removeItem(preferencesStorageKey);
    } finally {
      setPreferencesLoaded(true);
    }
  }, [preferencesStorageKey]);

  useEffect(() => {
    let cancelled = false;
    const loadPreferencesFromAccount = async () => {
      try {
        const pending = localStorage.getItem(pendingPreferencesKey);
        if (pending) {
          const synced = await fetch("/api/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: pending });
          if (!synced.ok) throw new Error("preferences sync pending");
          localStorage.removeItem(pendingPreferencesKey);
        }
        const response = await fetch("/api/preferences", { cache: "no-store" });
        if (!response.ok) return;
        const result = await response.json() as {
          preferences: { currency?: string; mass_unit?: string; volume_unit?: string; reminders_enabled?: number; reminder_time?: string } | null;
          goals: { water_goal_ml?: number | null; calories_goal_kcal?: number | null; protein_goal_g?: number | null; fat_goal_g?: number | null; carbs_goal_g?: number | null } | null;
        };
        let saved: Partial<UserPreferences> = {};
        try { saved = JSON.parse(localStorage.getItem(preferencesStorageKey) ?? "{}") as Partial<UserPreferences>; } catch { /* use defaults */ }
        const p = result.preferences;
        const g = result.goals;
        const loaded: UserPreferences = p || g ? {
          ...DEFAULT_PREFERENCES,
          photoCompression: saved.photoCompression === "detail" ? "detail" : "balanced",
          ...(g ? { waterGoalMl: g.water_goal_ml ?? null, caloriesGoalKcal: g.calories_goal_kcal ?? null, proteinGoalG: g.protein_goal_g ?? null, fatGoalG: g.fat_goal_g ?? null, carbsGoalG: g.carbs_goal_g ?? null } : {}),
          ...(p ? { currency: String(p.currency ?? "UZS"), massUnit: p.mass_unit === "kg" ? "kg" : "g", volumeUnit: p.volume_unit === "l" ? "l" : "ml", remindersEnabled: Boolean(p.reminders_enabled), reminderTime: String(p.reminder_time ?? "10:00") } : {}),
        } : { ...DEFAULT_PREFERENCES, ...saved };
        if (cancelled) return;
        setPreferences(loaded);
        setSettingsDraft({
          waterGoal: loaded.waterGoalMl == null ? "" : String(loaded.waterGoalMl / (loaded.volumeUnit === "l" ? 1000 : 1)),
          caloriesGoal: loaded.caloriesGoalKcal == null ? "" : String(loaded.caloriesGoalKcal),
          proteinGoal: loaded.proteinGoalG == null ? "" : String(loaded.proteinGoalG),
          fatGoal: loaded.fatGoalG == null ? "" : String(loaded.fatGoalG),
          carbsGoal: loaded.carbsGoalG == null ? "" : String(loaded.carbsGoalG),
          volumeUnit: loaded.volumeUnit, massUnit: loaded.massUnit, currency: loaded.currency,
          remindersEnabled: loaded.remindersEnabled, reminderTime: loaded.reminderTime,
          photoCompression: loaded.photoCompression,
        });
        if (!p && !g) {
          await fetch("/api/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferences: loaded, goals: loaded }) });
        }
      } catch {
        // Preferences remain available from the account-specific local cache while offline.
      }
    };
    void loadPreferencesFromAccount();
    return () => { cancelled = true; };
  }, [preferencesStorageKey, pendingPreferencesKey]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(entries));
    } catch {
      // The current browser may block local storage; the entry remains visible until refresh.
    }
  }, [entries, loaded, storageKey]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    try {
      localStorage.setItem(preferencesStorageKey, JSON.stringify(preferences));
    } catch {
      // Settings remain active until the page is closed if local storage is unavailable.
    }
  }, [preferences, preferencesLoaded, preferencesStorageKey]);

  useEffect(() => {
    if (!modal && !photoViewer) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModal(null);
        setPhotoViewer(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal, photoViewer]);

  useEffect(() => {
    if (!preferencesLoaded || !preferences.remindersEnabled || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const reminderKey = reminderStorageKey;
    const checkReminder = () => {
      const now = new Date();
      const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const today = localDateKey(now);
      if (clock !== preferences.reminderTime || localStorage.getItem(reminderKey) === today) return;
      new Notification("Пора сделать глоток воды", { body: "Добавьте выпитую воду в дневник." });
      localStorage.setItem(reminderKey, today);
    };
    checkReminder();
    const timer = window.setInterval(checkReminder, 30_000);
    return () => window.clearInterval(timer);
  }, [preferences, preferencesLoaded, reminderStorageKey]);

  const todayEntries = useMemo(() => {
    const today = localDateKey(new Date());
    return entries.filter((entry) => localDateKey(new Date(entry.createdAt)) === today);
  }, [entries]);

  const waterTotal = todayEntries.reduce(
    (total, entry) => total + (entry.kind === "drink" && entry.drinkType === "water" ? entry.volumeMl : 0),
    0,
  );
  const caloriesTotal = todayEntries.reduce(
    (total, entry) => total + (entry.kind === "food" ? entry.calories : 0),
    0,
  );
  const macrosToday = todayEntries.reduce((totals, entry) => entry.kind === "food" ? {
    protein: totals.protein + (entry.protein ?? 0), fat: totals.fat + (entry.fat ?? 0), carbs: totals.carbs + (entry.carbs ?? 0),
  } : totals, { protein: 0, fat: 0, carbs: 0 });
  const expenseTotals = todayEntries.reduce<Record<string, number>>((totals, entry) => {
    if (entry.kind === "expense") totals[entry.currency] = (totals[entry.currency] ?? 0) + entry.amount;
    return totals;
  }, {});
  const foodCountToday = todayEntries.filter((entry) => entry.kind === "food").length;
  const waterGoalMl = preferences.waterGoalMl;
  const waterProgress = waterGoalMl ? Math.min(100, waterTotal / waterGoalMl * 100) : 0;
  const calorieProgress = preferences.caloriesGoalKcal ? Math.min(100, caloriesTotal / preferences.caloriesGoalKcal * 100) : 0;
  const volumeLabel = preferences.volumeUnit === "l"
    ? new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(waterTotal / 1000)
    : moneyLabel(waterTotal, "UZS");
  const waterGoalLabel = waterGoalMl === null
    ? "Цель не задана"
    : `Цель ${preferences.volumeUnit === "l" ? new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(waterGoalMl / 1000) : moneyLabel(waterGoalMl, "UZS")} ${preferences.volumeUnit}`;
  const expenseCurrencies = Array.from(new Set(entries.flatMap((entry) => entry.kind === "expense" ? [entry.currency] : [])));
  const activeExpenseCurrency = expenseCurrencies.includes(expenseChartCurrency)
    ? expenseChartCurrency
    : expenseCurrencies[0] ?? "UZS";
  const chartDays = useMemo(() => {
    const now = new Date();
    return Array.from({ length: analyticsPeriod }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - analyticsPeriod + 1 + index);
      const key = localDateKey(date);
      const dayEntries = entries.filter((entry) => localDateKey(new Date(entry.createdAt)) === key);
      return {
        key,
        label: analyticsPeriod === 7
          ? new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(date).replace(".", "")
          : String(date.getDate()),
        fullDate: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(date),
        calories: dayEntries.reduce((sum, entry) => sum + (entry.kind === "food" ? entry.calories : 0), 0),
        water: dayEntries.reduce((sum, entry) => sum + (entry.kind === "drink" && entry.drinkType === "water" ? entry.volumeMl : 0), 0),
        protein: dayEntries.reduce((sum, entry) => sum + (entry.kind === "food" ? entry.protein ?? 0 : 0), 0),
        fat: dayEntries.reduce((sum, entry) => sum + (entry.kind === "food" ? entry.fat ?? 0 : 0), 0),
        carbs: dayEntries.reduce((sum, entry) => sum + (entry.kind === "food" ? entry.carbs ?? 0 : 0), 0),
        expenses: dayEntries.reduce((sum, entry) => sum + (entry.kind === "expense" && entry.currency === activeExpenseCurrency ? entry.amount : 0), 0),
      };
    });
  }, [entries, activeExpenseCurrency, analyticsPeriod]);
  const maxCalories = Math.max(...chartDays.map((day) => day.calories), 0);
  const maxWater = Math.max(...chartDays.map((day) => day.water), 0);
  const maxExpenses = Math.max(...chartDays.map((day) => day.expenses), 0);
  const analyticsDates = useMemo(() => new Set(chartDays.map((day) => day.key)), [chartDays]);
  const analyticsEntries = useMemo(
    () => entries.filter((entry) => analyticsDates.has(localDateKey(new Date(entry.createdAt)))),
    [entries, analyticsDates],
  );
  const periodCalories = analyticsEntries.reduce((sum, entry) => sum + (entry.kind === "food" ? entry.calories : 0), 0);
  const periodWater = analyticsEntries.reduce((sum, entry) => sum + (entry.kind === "drink" && entry.drinkType === "water" ? entry.volumeMl : 0), 0);
  const periodFoodCount = analyticsEntries.filter((entry) => entry.kind === "food").length;
  const periodExpenses = analyticsEntries.reduce((sum, entry) => sum + (entry.kind === "expense" && entry.currency === activeExpenseCurrency ? entry.amount : 0), 0);
  const periodMacros = analyticsEntries.reduce((totals, entry) => entry.kind === "food" ? {
    protein: totals.protein + (entry.protein ?? 0), fat: totals.fat + (entry.fat ?? 0), carbs: totals.carbs + (entry.carbs ?? 0),
  } : totals, { protein: 0, fat: 0, carbs: 0 });
  const periodExpensesList = analyticsEntries.filter((entry): entry is ExpenseEntry => entry.kind === "expense" && entry.currency === activeExpenseCurrency);
  const orderCount = periodExpensesList.filter((entry) => entry.category === "Заказ еды").length;
  const averageCheck = periodExpensesList.length ? periodExpenses / periodExpensesList.length : 0;
  const activeFoodDays = new Set(analyticsEntries.filter((entry) => entry.kind === "food").map((entry) => localDateKey(new Date(entry.createdAt)))).size;
  const averageFoodDaySpend = activeFoodDays ? periodExpenses / activeFoodDays : 0;
  const averageMealSpend = periodFoodCount ? periodExpenses / periodFoodCount : 0;
  const merchantTotals = periodExpensesList.reduce<Record<string, number>>((totals, entry) => {
    if (entry.merchant) totals[entry.merchant] = (totals[entry.merchant] ?? 0) + entry.amount;
    return totals;
  }, {});
  const topMerchants = Object.entries(merchantTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const moodRows = Object.entries(analyticsEntries.filter((entry): entry is FoodEntry => entry.kind === "food" && Boolean(entry.mood)).reduce<Record<string, { count: number; calories: number; days: Set<string> }>>((totals, entry) => {
    const row = totals[entry.mood!] ?? { count: 0, calories: 0, days: new Set<string>() };
    row.count += 1; row.calories += entry.calories; row.days.add(localDateKey(new Date(entry.createdAt))); totals[entry.mood!] = row; return totals;
  }, {})).map(([mood, row]) => {
    const dates = Array.from(row.days);
    const sameDayExpenses = periodExpensesList.filter((entry) => dates.includes(localDateKey(new Date(entry.createdAt)))).reduce((sum, entry) => sum + entry.amount, 0);
    return { mood, count: row.count, calories: row.count ? row.calories / row.count : 0, days: row.days.size, sameDayExpenses };
  });
  const caloriesPer100 = Number(form.caloriesPer100);
  const portionInput = Number(form.portionGrams);
  const portionGrams = portionInput * (preferences.massUnit === "kg" ? 1000 : 1);
  const manualCalculatedCalories = caloriesPer100 > 0 && portionInput > 0
    ? Math.round(caloriesPer100 * portionGrams / 100)
    : null;
  const resolvedRecipeIngredients = recipeIngredients.map((ingredient) => {
    const catalogItem = RECIPE_INGREDIENTS.find((item) => item.id === ingredient.foodId);
    const name = ingredient.foodId === "custom" ? ingredient.customName.trim() : catalogItem?.name ?? "";
    const quantity = Number(ingredient.quantity);
    const grams = quantity * (ingredient.unit === "piece" && catalogItem?.gramsPerPiece ? catalogItem.gramsPerPiece : 1);
    const caloriesPer100 = Number(ingredient.caloriesPer100);
    return { name, grams, caloriesPer100, valid: Boolean(name) && quantity > 0 && Number.isFinite(caloriesPer100) && caloriesPer100 >= 0 };
  });
  const recipeReady = recipeIngredients.length > 0 && resolvedRecipeIngredients.every((ingredient) => ingredient.valid);
  const recipeTotalCalories = recipeReady
    ? resolvedRecipeIngredients.reduce((total, ingredient) => total + ingredient.caloriesPer100 * ingredient.grams / 100, 0)
    : 0;
  const recipeServingsCount = Math.max(1, Number(recipeServings) || 1);
  const recipeCaloriesPerServing = Math.round(recipeTotalCalories / recipeServingsCount);
  const calculatedCalories = recipeReady
    ? recipeCaloriesPerServing
    : manualCalculatedCalories;
  const quickCalories = Number(quickKcalPer100) > 0 && Number(quickPortionGrams) > 0
    ? Math.round(Number(quickKcalPer100) * Number(quickPortionGrams) * (preferences.massUnit === "kg" ? 1000 : 1) / 100)
    : null;
  const foodPhotos = entries
    .filter((entry): entry is FoodEntry => {
      if (entry.kind !== "food") return false;
      const attachment = attachmentForOwner(entry.id, "meal_photo");
      return Boolean(attachment && attachmentData[attachment.id]);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);
  const expenseByCategory = analyticsEntries.reduce<Record<string, { category: string; currency: string; amount: number }>>((totals, entry) => {
    if (entry.kind !== "expense" || entry.currency !== activeExpenseCurrency) return totals;
    const key = `${entry.category}::${entry.currency}`;
    const current = totals[key] ?? { category: entry.category, currency: entry.currency, amount: 0 };
    current.amount += entry.amount;
    totals[key] = current;
    return totals;
  }, {});
  const topExpenseCategories = Object.values(expenseByCategory).sort((a, b) => b.amount - a.amount).slice(0, 5);
  const diaryEntries = useMemo(() => {
    const today = localDateKey(new Date());
    const weekStartDate = new Date();
    weekStartDate.setDate(weekStartDate.getDate() - 6);
    const weekStart = localDateKey(weekStartDate);
    return entries
      .filter((entry) => {
        const dateKey = localDateKey(new Date(entry.createdAt));
        const inPeriod = diaryPeriod === "all" || (diaryPeriod === "today" ? dateKey === today : dateKey >= weekStart && dateKey <= today);
        const matchesFilter = diaryFilter === "all"
          || (diaryFilter === "photo" && (() => { const item = attachments.find((candidate) => candidate.ownerId === entry.id && candidate.kind === (entry.kind === "expense" ? "receipt" : "meal_photo")); return Boolean(item && attachmentData[item.id]); })())
          || (diaryFilter !== "photo" && entry.kind === diaryFilter);
        return inPeriod && matchesFilter;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [entries, attachments, attachmentData, diaryFilter, diaryPeriod]);
  const diaryGroups = useMemo(() => {
    const grouped = new Map<string, Entry[]>();
    for (const entry of diaryEntries) {
      const key = localDateKey(new Date(entry.createdAt));
      grouped.set(key, [...(grouped.get(key) ?? []), entry]);
    }
    return Array.from(grouped.entries());
  }, [diaryEntries]);

  function openModal(kind?: EntryKind, mealType?: MealType) {
    setForm({ ...emptyForm, occurredAt: localDateTimeInput(), currency: preferences.currency, ...(mealType ? { mealType } : {}) });
    setRecipeIngredients([]);
    setRecipeServings("1");
    setRecipeError("");
    setPhotoError(null);
    setSelectedKind(kind ?? "food");
    setModal(kind ? { step: "details", kind, mealType } : { step: "type" });
  }

  function openQuickExpense(category: string) {
    const lastExpense = entries.find((entry): entry is ExpenseEntry => entry.kind === "expense");
    setForm({ ...emptyForm, occurredAt: localDateTimeInput(), currency: lastExpense?.currency ?? preferences.currency, category, amount: lastExpense ? String(lastExpense.amount) : "", merchant: lastExpense?.merchant ?? "" });
    setSelectedKind("expense");
    setModal({ step: "details", kind: "expense" });
  }

  function addCalculatedMeal() {
    setForm({
      ...emptyForm,
      occurredAt: localDateTimeInput(),
      currency: preferences.currency,
      caloriesPer100: quickKcalPer100,
      portionGrams: quickPortionGrams,
    });
    setPhotoError(null);
    setRecipeIngredients([]);
    setRecipeServings("1");
    setRecipeError("");
    setSelectedKind("food");
    setModal({ step: "details", kind: "food" });
  }

  function updateRecipeIngredient(index: number, field: keyof RecipeIngredientDraft, value: string) {
    setRecipeError("");
    setRecipeIngredients((current) => current.map((ingredient, ingredientIndex) => {
      if (ingredientIndex !== index) return ingredient;
      if (field !== "foodId") return { ...ingredient, [field]: value };
      if (value === "custom") return { ...ingredient, foodId: value, unit: "g", customName: "", caloriesPer100: "" };
      const catalogItem = RECIPE_INGREDIENTS.find((item) => item.id === value);
      return {
        ...ingredient,
        foodId: value,
        customName: "",
        unit: catalogItem?.gramsPerPiece ? "piece" : "g",
        caloriesPer100: catalogItem ? String(catalogItem.caloriesPer100) : "",
      };
    }));
  }

  function changeVolumeUnit(nextUnit: "ml" | "l") {
    setSettingsDraft((current) => {
      const entered = Number(current.waterGoal);
      const goalMl = Number.isFinite(entered) && entered > 0
        ? entered * (current.volumeUnit === "l" ? 1000 : 1)
        : null;
      return {
        ...current,
        volumeUnit: nextUnit,
        waterGoal: goalMl === null ? current.waterGoal : String(goalMl / (nextUnit === "l" ? 1000 : 1)),
      };
    });
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const readOptionalPositive = (value: string) => {
      if (!value.trim()) return null;
      const number = Number(value);
      return Number.isFinite(number) && number > 0 ? number : null;
    };
    const enteredWaterGoal = readOptionalPositive(settingsDraft.waterGoal);
    if (settingsDraft.waterGoal.trim() && enteredWaterGoal === null) {
      setSettingsMessage("Цель воды должна быть числом больше нуля.");
      return;
    }
    const nextPreferences: UserPreferences = {
      waterGoalMl: enteredWaterGoal === null ? null : Math.round(enteredWaterGoal * (settingsDraft.volumeUnit === "l" ? 1000 : 1)),
      caloriesGoalKcal: readOptionalPositive(settingsDraft.caloriesGoal),
      proteinGoalG: readOptionalPositive(settingsDraft.proteinGoal),
      fatGoalG: readOptionalPositive(settingsDraft.fatGoal),
      carbsGoalG: readOptionalPositive(settingsDraft.carbsGoal),
      volumeUnit: settingsDraft.volumeUnit,
      massUnit: settingsDraft.massUnit,
      currency: settingsDraft.currency,
      remindersEnabled: settingsDraft.remindersEnabled,
      reminderTime: settingsDraft.reminderTime,
      photoCompression: settingsDraft.photoCompression,
    };
    setPreferences(nextPreferences);
    try {
      const response = await fetch("/api/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferences: nextPreferences, goals: nextPreferences }) });
      if (!response.ok) throw new Error("save failed");
      setSettingsMessage("Настройки сохранены в аккаунте.");
      setSyncStatus("Синхронизировано с аккаунтом");
    } catch {
      localStorage.setItem(pendingPreferencesKey, JSON.stringify({ preferences: nextPreferences, goals: nextPreferences }));
      setSettingsMessage("Настройки сохранены на этом устройстве; синхронизация возобновится при подключении.");
      setSyncStatus("Офлайн: настройки сохранены локально");
    }
  }

  async function saveBudget() {
    const amount = Number(budgetAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setBudgetMessage("Введите лимит больше нуля.");
      return;
    }
    try {
      const response = await fetch("/api/budget", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period: budgetPeriod, amount, currency: preferences.currency }) });
      if (!response.ok) throw new Error("save failed");
      localStorage.removeItem(pendingBudgetKey);
      await refreshBudget();
      setBudgetMessage("Лимит сохранён в аккаунте.");
    } catch {
      const pending = { period: budgetPeriod, amount, currency: preferences.currency };
      localStorage.setItem(pendingBudgetKey, JSON.stringify(pending));
      const amountMinor = Math.round(amount * 100);
      setBudgetInfo({ period: budgetPeriod, periodStart: "", currency: preferences.currency, amountMinor, spentMinor: 0, remainingMinor: amountMinor });
      setBudgetMessage("Лимит сохранён на устройстве и синхронизируется при подключении.");
    }
  }

  async function requestReminderPermission() {
    if (typeof Notification === "undefined") {
      setSettingsMessage("Этот браузер не поддерживает уведомления.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        setSettingsDraft((current) => ({ ...current, remindersEnabled: true }));
        setSettingsMessage("Разрешение получено. Сохраните настройки, чтобы включить напоминание.");
      } else {
        setSettingsDraft((current) => ({ ...current, remindersEnabled: false }));
        setSettingsMessage("Браузер не разрешил уведомления.");
      }
    } catch {
      setSettingsMessage("Браузер не смог запросить разрешение на уведомления.");
    }
  }

  async function exportData() {
    try {
    const localAttachments = await exportLocalAttachments(userId);
    const payload = JSON.stringify({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      account: { id: userId, email },
      preferences,
      goals: { waterMl: preferences.waterGoalMl, caloriesKcal: preferences.caloriesGoalKcal, proteinG: preferences.proteinGoalG, fatG: preferences.fatGoalG, carbsG: preferences.carbsGoalG },
      budget: budgetInfo,
      entries,
      favorites,
      favoriteStores,
      attachments: attachments.map((metadata) => ({ ...metadata, dataUrl: localAttachments.find((file) => file.id === metadata.id)?.dataUrl ?? null })),
    }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nutrition-water-${localDateKey(new Date())}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSettingsMessage("Экспорт дневника, настроек и доступных на этом устройстве фото подготовлен.");
    } catch { setSettingsMessage("Не удалось подготовить экспорт. Проверьте доступность локальных фото."); }
  }

  async function clearLocalData() {
    if (!window.confirm("Удалить все записи и настройки из этого браузера? Это действие нельзя отменить.")) return;
    for (const key of [storageKey, favoritesStorageKey, favoriteStoresStorageKey, attachmentsStorageKey, deletedStorageKey, deletedAttachmentsKey, pendingBudgetKey, pendingPreferencesKey, pendingFavoriteDeletesKey, preferencesStorageKey, reminderStorageKey]) localStorage.removeItem(key);
    await deleteAllLocalAttachments(userId).catch(() => undefined);
    setEntries([]);
    setAttachments([]);
    setAttachmentData({});
    setFavorites([]);
    setFavoriteStores([]);
    setPreferences(DEFAULT_PREFERENCES);
    setSettingsDraft(DEFAULT_SETTINGS_DRAFT);
    setSettingsMessage("Локальные данные этого аккаунта удалены. Данные в аккаунте не затронуты.");
  }

  async function deleteAccount() {
    if (!window.confirm("Удалить аккаунт и все записи, цели, расходы, фото на этом устройстве и связанные данные? Восстановить их будет нельзя.")) return;
    if (window.prompt('Для подтверждения введите DELETE') !== "DELETE") {
      setSettingsMessage("Удаление аккаунта отменено: подтверждение не совпало.");
      return;
    }
    setSettingsMessage("Удаляем аккаунт и данные…");
    try {
      const response = await fetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: "DELETE" }) });
      if (!response.ok) throw new Error("delete failed");
      for (const key of Object.keys(localStorage)) if (key.startsWith(`nutrition-water.${encodeURIComponent(userId)}.`)) localStorage.removeItem(key);
      await deleteAllLocalAttachments(userId).catch(() => undefined);
      await authClient.signOut().catch(() => undefined);
      window.location.assign("/login");
    } catch {
      setSettingsMessage("Не удалось удалить аккаунт. Проверьте подключение и повторите попытку.");
    }
  }

  function handlePhotoChange(file?: File, kind: "meal_photo" | "receipt" = "meal_photo") {
    setPhotoError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError("Выберите файл изображения.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setPhotoError("Размер исходного фото должен быть меньше 12 МБ.");
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => setPhotoError("Не удалось прочитать файл. Попробуйте другое фото.");
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => setPhotoError("Не удалось открыть изображение.");
      image.onload = () => {
        const maximumDimension = kind === "receipt" ? (preferences.photoCompression === "detail" ? 2400 : 1800) : (preferences.photoCompression === "detail" ? 1800 : 1200);
        const quality = kind === "receipt" ? (preferences.photoCompression === "detail" ? 0.9 : 0.84) : (preferences.photoCompression === "detail" ? 0.86 : 0.76);
        const scale = Math.min(1, maximumDimension / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          setPhotoError("Браузер не смог обработать изображение.");
          return;
        }
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL("image/jpeg", quality);
        setForm((current) => kind === "receipt" ? { ...current, receiptDataUrl: compressed } : { ...current, photoDataUrl: compressed });
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  function attachmentForOwner(ownerId: string, kind: AttachmentMeta["kind"]) {
    return attachments.find((item) => item.ownerId === ownerId && item.kind === kind);
  }

  async function saveAttachment(ownerType: AttachmentMeta["ownerType"], ownerId: string, kind: AttachmentMeta["kind"], dataUrl: string, syncToServer = true) {
    const id = newEntryId();
    const mimeType = dataUrl.match(/^data:([^;,]+)/)?.[1] ?? "image/jpeg";
    const sizeBytes = dataUrlByteSize(dataUrl);
    const attachment: AttachmentMeta = { id, ownerType, ownerId, kind, mimeType, sizeBytes, createdAt: new Date().toISOString() };
    try {
      await saveLocalAttachment(id, userId, dataUrl);
      setAttachmentData((current) => ({ ...current, [id]: dataUrl }));
      setAttachments((current) => [...current, attachment]);
      if (syncToServer) {
        const response = await fetch("/api/attachments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(attachment) });
        if (!response.ok) setSyncStatus("Фото сохранено на устройстве; метаданные синхронизируются позже");
      }
    } catch {
      setPhotoError("Не удалось сохранить файл во внутреннем хранилище браузера.");
    }
  }

  async function removeAttachment(attachment: AttachmentMeta) {
    setAttachments((current) => current.filter((item) => item.id !== attachment.id));
    setAttachmentData((current) => { const next = { ...current }; delete next[attachment.id]; return next; });
    await deleteLocalAttachment(attachment.id, userId).catch(() => undefined);
    let pending: string[] = [];
    try { pending = JSON.parse(localStorage.getItem(deletedAttachmentsKey) ?? "[]") as string[]; } catch { pending = []; }
    if (!pending.includes(attachment.id)) pending.push(attachment.id);
    localStorage.setItem(deletedAttachmentsKey, JSON.stringify(pending));
    const response = await fetch("/api/attachments", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: attachment.id }) }).catch(() => null);
    if (response?.ok) localStorage.setItem(deletedAttachmentsKey, JSON.stringify(pending.filter((id) => id !== attachment.id)));
  }

  function addWater(volumeMl: number) {
    const entry: DrinkEntry = {
      id: newEntryId(),
      kind: "drink",
      drinkType: "water",
      volumeMl,
      createdAt: new Date().toISOString(),
    };
    setEntries((current) => [entry, ...current]);
    void persistEntry(entry);
  }

  async function persistEntry(entry: Entry): Promise<boolean> {
    try {
      const response = await fetch("/api/entries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) });
      if (!response.ok) throw new Error("save failed");
      setSyncStatus("Синхронизировано с аккаунтом");
      if (entry.kind === "expense") void refreshBudget();
      return true;
    } catch {
      setSyncStatus("Офлайн: запись сохранена на этом устройстве");
      return false;
    }
  }

  async function toggleFavorite(entry: Entry) {
    if (entry.kind === "expense") return;
    const favorite = favorites.find((item) => item.entry.id === entry.id);
    if (favorite) {
      setFavorites((current) => current.filter((item) => item.id !== favorite.id));
      try {
        const response = await fetch("/api/favorites", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: favorite.id }) });
        if (!response.ok) throw new Error("delete favorite failed");
      } catch {
        const pending = JSON.parse(localStorage.getItem(pendingFavoriteDeletesKey) ?? "[]") as string[];
        if (!pending.includes(favorite.id)) pending.push(favorite.id);
        localStorage.setItem(pendingFavoriteDeletesKey, JSON.stringify(pending));
        setSyncStatus("Изменение избранного сохранено до восстановления сети");
      }
      return;
    }
    const created: Favorite = { id: newEntryId(), label: entry.kind === "food" ? entry.name : entry.drinkType === "water" ? "Вода" : entry.drinkType, entry };
    setFavorites((current) => [created, ...current]);
    const response = await fetch("/api/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(created) }).catch(() => null);
    if (!response?.ok) setSyncStatus("Избранное сохранено локально до синхронизации");
  }

  async function toggleFavoriteStore(entry: ExpenseEntry) {
    if (!entry.merchant) return;
    const existing = favoriteStores.find((store) => store.merchant.toLocaleLowerCase("ru-RU") === entry.merchant.toLocaleLowerCase("ru-RU"));
    if (existing) {
      setFavoriteStores((current) => current.filter((store) => store.id !== existing.id));
      const response = await fetch("/api/favorites", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: existing.id }) }).catch(() => null);
      if (!response?.ok) {
        const pending = JSON.parse(localStorage.getItem(pendingFavoriteDeletesKey) ?? "[]") as string[];
        if (!pending.includes(existing.id)) pending.push(existing.id);
        localStorage.setItem(pendingFavoriteDeletesKey, JSON.stringify(pending));
      }
      return;
    }
    const store: FavoriteStore = { id: newEntryId(), label: entry.merchant, merchant: entry.merchant, category: entry.category };
    setFavoriteStores((current) => [store, ...current]);
    const response = await fetch("/api/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...store, type: "store" }) }).catch(() => null);
    if (!response?.ok) setSyncStatus("Магазин сохранён локально до синхронизации");
  }

  function openFavoriteStore(store: FavoriteStore) {
    openQuickExpense(store.category);
    setForm((current) => ({ ...current, merchant: store.merchant }));
  }

  function reuseFavorite(favorite: Favorite) {
    const entry = { ...favorite.entry, id: newEntryId(), createdAt: new Date().toISOString() } as Entry;
    setEntries((current) => [entry, ...current]);
    void persistEntry(entry);
  }

  function submitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal) return;
    if (modal.step === "type") {
      setModal({ step: "details", kind: selectedKind });
      return;
    }
    if (modal.kind === "food" && recipeIngredients.length > 0 && !recipeReady) {
      setRecipeError("Заполните продукт, количество и калорийность в каждой строке рецепта — или удалите незаполненную строку.");
      return;
    }

    const createdAt = form.occurredAt ? new Date(form.occurredAt).toISOString() : new Date().toISOString();
    let entry: Entry;

    if (modal.kind === "food") {
      entry = {
        id: newEntryId(),
        kind: "food",
        mealType: modal.mealType ?? form.mealType,
        name: form.name.trim(),
        calories: calculatedCalories ?? (Number(form.calories) || 0),
        sourceType: form.sourceType,
        tags: form.tags,
        ...(Number(form.protein) > 0 ? { protein: Number(form.protein) } : {}),
        ...(Number(form.fat) > 0 ? { fat: Number(form.fat) } : {}),
        ...(Number(form.carbs) > 0 ? { carbs: Number(form.carbs) } : {}),
        ...(Number(form.hunger) > 0 ? { hungerLevel: Number(form.hunger) } : {}),
        ...(Number(form.satiety) > 0 ? { satietyLevel: Number(form.satiety) } : {}),
        ...(form.mood ? { mood: form.mood } : {}),
        ...(portionGrams > 0 ? { portionGrams } : {}),
        ...(recipeReady ? {
          recipeIngredients: resolvedRecipeIngredients.map(({ name, grams, caloriesPer100 }) => ({ name, grams, caloriesPer100 })),
          recipeServings: recipeServingsCount,
        } : {}),
        createdAt,
      };
    } else if (modal.kind === "drink") {
      entry = {
        id: newEntryId(),
        kind: "drink",
        drinkType: form.drinkType,
        volumeMl: Math.round(Number(form.volumeMl) * (preferences.volumeUnit === "l" ? 1000 : 1)),
        createdAt,
      };
    } else {
      entry = {
        id: newEntryId(),
        kind: "expense",
        amount: Number(form.amount),
        currency: form.currency,
        category: form.category,
        merchant: form.merchant.trim(),
        paymentMethod: form.paymentMethod,
        comment: form.comment.trim(),
        tags: form.tags,
        createdAt,
      };
    }

    setEntries((current) => [entry, ...current]);
    const mealPhoto = form.photoDataUrl;
    const receiptPhoto = form.receiptDataUrl;
    void (async () => {
      const synced = await persistEntry(entry);
      if (entry.kind === "food" && mealPhoto) await saveAttachment("food_entry", entry.id, "meal_photo", mealPhoto, synced);
      if (entry.kind === "expense" && receiptPhoto) await saveAttachment("transaction", entry.id, "receipt", receiptPhoto, synced);
    })();
    setModal(null);
  }

  function mealDescription(mealType: MealType) {
    const items = todayEntries.filter((entry): entry is FoodEntry => entry.kind === "food" && entry.mealType === mealType);
    if (!items.length) return "Пока ничего не добавлено";
    const calories = items.reduce((sum, item) => sum + item.calories, 0);
    const names = items.slice(0, 2).map((item) => item.name).join(", ");
    const extra = items.length > 2 ? ` и ещё ${items.length - 2}` : "";
    return `${names}${extra}${calories ? ` · ${calories} ккал` : ""}`;
  }

  function mealPhoto(mealType: MealType) {
    const entry = todayEntries.find((item): item is FoodEntry => item.kind === "food" && item.mealType === mealType && Boolean(attachmentForOwner(item.id, "meal_photo")));
    const attachment = entry ? attachmentForOwner(entry.id, "meal_photo") : undefined;
    return attachment ? attachmentData[attachment.id] : undefined;
  }

  function removeEntry(entryId: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (entry) {
      const deletion = { id: entry.id, kind: entry.kind };
      let queue: typeof deletion[] = [];
      try { queue = JSON.parse(localStorage.getItem(deletedStorageKey) ?? "[]") as typeof deletion[]; } catch { queue = []; }
      if (!queue.some((item) => item.id === deletion.id)) queue.push(deletion);
      localStorage.setItem(deletedStorageKey, JSON.stringify(queue));
      void fetch("/api/entries", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(deletion) }).then((response) => {
        if (!response.ok) throw new Error("delete failed");
        const pending = (JSON.parse(localStorage.getItem(deletedStorageKey) ?? "[]") as typeof deletion[]).filter((item) => item.id !== deletion.id);
        localStorage.setItem(deletedStorageKey, JSON.stringify(pending));
        if (entry.kind === "expense") void refreshBudget();
      }).catch(() => setSyncStatus("Удаление сохранено и синхронизируется при подключении"));
    }
    for (const attachment of attachments.filter((item) => item.ownerId === entryId)) void removeAttachment(attachment);
    setEntries((current) => current.filter((entry) => entry.id !== entryId));
  }

  function diaryEntryDetails(entry: Entry) {
    if (entry.kind === "food") {
      const mealName = mealOptions.find((meal) => meal.value === entry.mealType)?.label ?? "Приём пищи";
      const portion = entry.portionGrams
        ? preferences.massUnit === "kg"
          ? ` · ${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(entry.portionGrams / 1000)} кг`
          : ` · ${entry.portionGrams} г`
        : "";
      const recipeNote = entry.recipeIngredients?.length ? ` · расчёт по ${entry.recipeIngredients.length} продуктам` : "";
      const macros = entry.protein || entry.fat || entry.carbs ? ` · Б ${entry.protein ?? 0} / Ж ${entry.fat ?? 0} / У ${entry.carbs ?? 0} г` : "";
      const tags = entry.tags?.length ? ` · ${entry.tags.map((tag) => tagLabels[tag] ?? tag).join(", ")}` : "";
      const mood = entry.mood ? ` · ${entry.mood}` : "";
      const bodySignals = entry.hungerLevel || entry.satietyLevel ? ` · голод ${entry.hungerLevel ?? "—"}/5 · сытость ${entry.satietyLevel ?? "—"}/5` : "";
      return { icon: "🍽️", title: entry.name, subtitle: `${mealName}${portion}${entry.calories ? ` · ${entry.calories} ккал` : ""}${macros}${tags}${bodySignals}${mood}${recipeNote}` };
    }
    if (entry.kind === "drink") {
      const drinkNames: Record<DrinkType, string> = { water: "Вода", tea: "Чай", coffee: "Кофе", juice: "Сок", other: "Напиток" };
      const volume = preferences.volumeUnit === "l"
        ? `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(entry.volumeMl / 1000)} л`
        : `${entry.volumeMl} мл`;
      return { icon: entry.drinkType === "water" ? "💧" : "🥤", title: drinkNames[entry.drinkType], subtitle: volume };
    }
    return {
      icon: "🧾",
      title: entry.merchant || entry.category,
      subtitle: `${entry.category} · ${moneyLabel(entry.amount, entry.currency)} ${entry.currency}${entry.paymentMethod ? ` · ${entry.paymentMethod}` : ""}${entry.tags?.length ? ` · ${entry.tags.map((tag) => expenseTagLabels[tag] ?? tag).join(", ")}` : ""}${entry.comment ? ` · ${entry.comment}` : ""}`,
    };
  }

  function diaryDateLabel(dateKey: string) {
    const today = localDateKey(new Date());
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    if (dateKey === today) return "Сегодня";
    if (dateKey === localDateKey(yesterdayDate)) return "Вчера";
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${dateKey}T12:00:00`));
  }

  function renderCharts() {
    return (
      <div className="chart-grid">
        <article className="chart-card">
          <div className="chart-card-heading"><div><strong>Калории</strong><span>Всего по дням</span></div><span className="chart-unit">ккал</span></div>
          <div aria-label={`График калорий за ${analyticsPeriod} дней`} className={analyticsPeriod === 30 ? "bar-chart month-chart" : "bar-chart"}>
            {chartDays.map((day) => (
              <div className="bar-column" key={`calories-${day.key}`} title={`${day.fullDate}: ${day.calories} ккал`}>
                <span className="bar-value">{day.calories || "—"}</span>
                <div className="bar-track"><span className="calorie-bar" style={{ height: `${maxCalories ? Math.max(5, day.calories / maxCalories * 100) : 3}%` }} /></div>
                <span className="bar-day">{day.label}</span>
              </div>
            ))}
          </div>
        </article>
        <article className="chart-card">
          <div className="chart-card-heading"><div><strong>Вода</strong><span>Вода по дням</span></div><span className="chart-unit">{preferences.volumeUnit}</span></div>
          <div aria-label={`График выпитой воды за ${analyticsPeriod} дней`} className={analyticsPeriod === 30 ? "bar-chart month-chart" : "bar-chart"}>
            {chartDays.map((day) => {
              const amount = preferences.volumeUnit === "l" ? day.water / 1000 : day.water;
              const max = preferences.volumeUnit === "l" ? maxWater / 1000 : maxWater;
              return <div className="bar-column" key={`water-${day.key}`} title={`${day.fullDate}: ${amount} ${preferences.volumeUnit}`}>
                <span className="bar-value">{amount ? new Intl.NumberFormat("ru-RU", { maximumFractionDigits: preferences.volumeUnit === "l" ? 1 : 0 }).format(amount) : "—"}</span>
                <div className="bar-track"><span className="water-bar" style={{ height: `${max ? Math.max(5, amount / max * 100) : 3}%` }} /></div>
                <span className="bar-day">{day.label}</span>
              </div>;
            })}
          </div>
        </article>
        <article className="chart-card">
          <div className="chart-card-heading">
            <div><strong>Расходы на еду</strong><span>Суммы по дням</span></div>
            <select aria-label="Валюта графика расходов" className="chart-currency" value={activeExpenseCurrency} onChange={(event) => setExpenseChartCurrency(event.target.value)}>
              {[...new Set(["UZS", ...expenseCurrencies])].map((currency) => <option key={currency} value={currency}>{currency}</option>)}
            </select>
          </div>
          <div aria-label={`График расходов за ${analyticsPeriod} дней, ${activeExpenseCurrency}`} className={analyticsPeriod === 30 ? "bar-chart month-chart" : "bar-chart"}>
            {chartDays.map((day) => (
              <div className="bar-column" key={`expenses-${day.key}`} title={`${day.fullDate}: ${moneyLabel(day.expenses, activeExpenseCurrency)} ${activeExpenseCurrency}`}>
                <span className="bar-value">{day.expenses ? moneyLabel(day.expenses, activeExpenseCurrency) : "—"}</span>
                <div className="bar-track"><span className="expense-bar" style={{ height: `${maxExpenses ? Math.max(5, day.expenses / maxExpenses * 100) : 3}%` }} /></div>
                <span className="bar-day">{day.label}</span>
              </div>
            ))}
          </div>
        </article>
      </div>
    );
  }

  const headerDate = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  const sectionHeader = {
    today: { eyebrow: headerDate.toLocaleUpperCase("ru-RU"), title: "Хороший день начинается с заботы о себе" },
    diary: { eyebrow: "ХРОНОЛОГИЯ ЗАПИСЕЙ", title: "Дневник" },
    analytics: { eyebrow: "СВОДНЫЕ ДАННЫЕ", title: "Аналитика" },
    settings: { eyebrow: "ПЕРСОНАЛЬНЫЕ ПАРАМЕТРЫ", title: "Настройки" },
  }[activeSection];

  return (
    <main className="app-shell" id="overview">
      <aside className="sidebar">
        <a aria-label="Ритм дня — главная" className="brand" href="#overview">
          <span aria-hidden="true" className="brand-mark">+</span>
          <span>ритм<span className="brand-accent"> дня</span></span>
        </a>
        <p className="sidebar-caption">МОЁ ЗДОРОВЬЕ</p>
        <Navigation activeSection={activeSection} onNavigate={setActiveSection} />
        <div className="sidebar-note">
          <span aria-hidden="true">☀</span>
          <p>Маленькие шаги<br />каждый день</p>
        </div>
        <button className="profile-button" type="button">
          <span className="profile-avatar">Я</span>
          <span className="profile-copy"><strong>Мой профиль</strong><small>Настроить цели</small></span>
          <span aria-hidden="true" className="profile-more">···</span>
        </button>
      </aside>

      <section className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">{sectionHeader.eyebrow}</p>
            <h1>{sectionHeader.title}</h1>
          </div>
          <div className="topbar-account"><small className="sync-status">{syncStatus}</small><span title={email}>{email}</span><button className="button-secondary" type="button" onClick={async () => { await authClient.signOut(); window.location.assign("/login"); }}>Выйти</button></div>
        </header>

        {activeSection === "today" && <>
        <div className="welcome-row">
          <div>
            <h2>Твоя сводка</h2>
            <p>Заполняй дневник в своём темпе — каждый шаг важен.</p>
          </div>
          <div className="welcome-actions">
            <button className="date-button" type="button">Сегодня <span aria-hidden="true">⌄</span></button>
            <button className="primary-action" onClick={() => openModal()} type="button">＋ Добавить</button>
          </div>
        </div>

        <section aria-label="Сводка за сегодня" className="summary-grid">
          <article className="summary-card water-card">
            <div className="card-topline"><span className="summary-icon">💧</span><span className="card-kicker">ВОДА</span></div>
            <strong className="summary-number">{volumeLabel} <small>{preferences.volumeUnit}</small></strong>
            <p className="summary-caption">{waterGoalLabel}</p>
            <div aria-label={waterGoalMl ? `Выпито ${volumeLabel} из цели ${waterGoalLabel}` : "Цель не задана"} className="progress-track"><span style={{ width: `${waterProgress}%` }} /></div>
            <div className="water-quick-actions" aria-label="Быстро добавить воду">
              {[200, 250, 500].map((volume) => (
                <button key={volume} onClick={() => addWater(volume)} type="button">+{preferences.volumeUnit === "l" ? (volume / 1000).toFixed(2) : volume}</button>
              ))}
              <button className="water-more" onClick={() => openModal("drink")} type="button">Другое</button>
            </div>
          </article>

          <article className="summary-card food-card">
            <div className="card-topline"><span className="summary-icon">🍽️</span><span className="card-kicker">ПИТАНИЕ</span></div>
            <strong className="summary-number">{moneyLabel(caloriesTotal, "UZS")} <small>ккал</small></strong>
            <p className="summary-caption">{foodCountToday} {foodCountToday === 1 ? "запись еды" : foodCountToday > 1 && foodCountToday < 5 ? "записи еды" : "записей еды"} · {preferences.caloriesGoalKcal ? `цель ${moneyLabel(preferences.caloriesGoalKcal, "UZS")} ккал` : "цель не задана"}</p>
            <div aria-label={preferences.caloriesGoalKcal ? `Съедено ${caloriesTotal} из ${preferences.caloriesGoalKcal} ккал` : "Цель не задана"} className="progress-track"><span style={{ width: `${calorieProgress}%` }} /></div>
            <div className="macro-totals">{(["protein", "fat", "carbs"] as const).map((key) => {
              const labels = { protein: ["Б", preferences.proteinGoalG], fat: ["Ж", preferences.fatGoalG], carbs: ["У", preferences.carbsGoalG] } as const;
              const [label, goal] = labels[key];
              const total = Math.round(macrosToday[key] * 10) / 10;
              return <span key={key}>{label} {total}{goal ? ` / ${goal}` : ""} г</span>;
            })}</div>
            <button className="card-action" onClick={() => openModal("food")} type="button">+ Добавить приём пищи</button>
          </article>

          <article className="summary-card expense-card">
            <div className="card-topline"><span className="summary-icon">🧾</span><span className="card-kicker">РАСХОДЫ НА ЕДУ</span></div>
            <strong className="summary-number">
              {Object.keys(expenseTotals).length
                ? Object.entries(expenseTotals).map(([currency, amount]) => `${moneyLabel(amount, currency)} ${currency}`).join(" · ")
                : "0 сум"}
            </strong>
            <p className="summary-caption">Сегодня</p>
            <p className="summary-caption">{budgetInfo?.amountMinor == null ? "Лимит не задан" : budgetInfo.remainingMinor != null && budgetInfo.remainingMinor < 0 ? `Превышение ${moneyLabel(Math.abs(budgetInfo.remainingMinor) / 100, budgetInfo.currency)} ${budgetInfo.currency}` : `Остаток бюджета: ${moneyLabel((budgetInfo.remainingMinor ?? 0) / 100, budgetInfo.currency)} ${budgetInfo.currency}`}</p>
            {budgetInfo?.amountMinor != null && <div className="progress-track"><span style={{ width: `${Math.min(100, budgetInfo.spentMinor / Math.max(1, budgetInfo.amountMinor) * 100)}%` }} /></div>}
            {budgetInfo?.remainingMinor != null && budgetInfo.remainingMinor < 0 && <p className="budget-warning" role="status">Лимит питания превышен.</p>}
            <div className="expense-quick-actions"><button type="button" onClick={() => openQuickExpense("Продукты")}>Продукты</button><button type="button" onClick={() => openQuickExpense("Заказ еды")}>Заказ еды</button><button type="button" onClick={() => openQuickExpense("Кафе и рестораны")}>Кафе</button></div>
            {favoriteStores.length > 0 && <div className="expense-quick-actions favorite-stores">{favoriteStores.slice(0, 4).map((store) => <button key={store.id} onClick={() => openFavoriteStore(store)} type="button">★ {store.merchant}</button>)}</div>}
            <button className="card-action" onClick={() => openModal("expense")} type="button">+ Добавить расход</button>
          </article>
        </section>

        <section aria-label="Калькулятор калорий" className="quick-calorie-card">
          <div className="quick-calorie-copy">
            <p className="eyebrow">БЫСТРЫЙ РАСЧЁТ</p>
            <h2>Калькулятор калорий</h2>
            <p>Укажите калорийность продукта и размер порции в граммах.</p>
          </div>
          <div className="quick-calorie-fields">
            <label>Ккал на 100 г<input min="0" step="1" type="number" value={quickKcalPer100} onChange={(event) => setQuickKcalPer100(event.target.value)} /></label>
            <span aria-hidden="true" className="calculation-symbol">×</span>
            <label>Порция, {preferences.massUnit}<input min="0" step="1" type="number" value={quickPortionGrams} onChange={(event) => setQuickPortionGrams(event.target.value)} /></label>
          </div>
          <div className="quick-calorie-result"><span>Итого</span><strong>{quickCalories === null ? "—" : `${quickCalories} ккал`}</strong><small>{quickCalories === null ? "Введите оба значения" : `${quickKcalPer100} × ${quickPortionGrams}${preferences.massUnit === "kg" ? " × 1000" : ""} / 100`}</small></div>
          <button className="button-primary" disabled={quickCalories === null} onClick={addCalculatedMeal} type="button">Добавить в дневник</button>
        </section>

        {favorites.length > 0 && <section aria-label="Избранные записи" className="favorites-section">
          <div className="section-heading"><div><p className="eyebrow">БЫСТРЫЙ ДОСТУП</p><h2>Избранное</h2></div><span>Нажмите, чтобы добавить снова</span></div>
          <div className="favorites-list">{favorites.map((favorite) => <button className="favorite-chip" key={favorite.id} onClick={() => reuseFavorite(favorite)} type="button"><span aria-hidden="true">★</span>{favorite.label}<small>Добавить</small></button>)}</div>
        </section>}

        <div className="section-heading">
          <div><p className="eyebrow">ТВОЙ ДЕНЬ</p><h2>Приёмы пищи</h2></div>
          <button className="text-button" onClick={() => openModal("food")} type="button">Весь дневник <span aria-hidden="true">→</span></button>
        </div>

        <section aria-label="Приёмы пищи за сегодня" className="meal-list">
          {mealOptions.map((meal) => (
            <article className="meal-row" key={meal.value}>
              <div className="meal-time">{meal.time}</div><span aria-hidden="true" className="meal-emoji">{meal.icon}</span>
              <div className="meal-copy"><strong>{meal.label}</strong><span>{mealDescription(meal.value)}</span></div>
              {mealPhoto(meal.value) ? (
                <button aria-label={`Открыть фото: ${meal.label}`} className="meal-photo-button" onClick={() => { setPhotoViewerLabel(`Фото блюда: ${meal.label}`); setPhotoViewer(mealPhoto(meal.value) ?? null); }} type="button"><NextImage alt="Фото блюда" height={80} src={mealPhoto(meal.value)!} unoptimized width={80} /></button>
              ) : (
                <button aria-label={`Добавить фото к ${meal.label}`} className="meal-photo-placeholder" onClick={() => openModal("food", meal.value)} type="button"><span aria-hidden="true">▧</span></button>
              )}
              <button aria-label={`Добавить: ${meal.label}`} className="add-button" onClick={() => openModal("food", meal.value)} type="button">+</button>
            </article>
          ))}
        </section>

        <section aria-label="Фото блюд" className="photo-gallery-section">
          <div className="section-heading photo-gallery-heading">
            <div><p className="eyebrow">ГАЛЕРЕЯ</p><h2>Фото блюд</h2></div>
            {foodPhotos.length > 0 && <button className="text-button" onClick={() => { setDiaryFilter("photo"); setDiaryPeriod("all"); setActiveSection("diary"); }} type="button">Все фото <span aria-hidden="true">→</span></button>}
          </div>
          {foodPhotos.length ? (
            <div className="photo-gallery-grid">
              {foodPhotos.map((entry) => {
                const mealName = mealOptions.find((meal) => meal.value === entry.mealType)?.label ?? "Приём пищи";
                const attachment = attachmentForOwner(entry.id, "meal_photo");
                const source = attachment ? attachmentData[attachment.id] : undefined;
                return (
                  <article className="photo-gallery-card" key={entry.id}>
                    {source && <button aria-label={`Открыть фото: ${entry.name}`} className="gallery-photo-button" onClick={() => { setPhotoViewerLabel(`Фото блюда ${entry.name}`); setPhotoViewer(source); }} type="button"><NextImage alt={`Фото блюда ${entry.name}`} height={480} src={source} unoptimized width={480} /></button>}
                    {attachment && <button className="attachment-delete" onClick={() => void removeAttachment(attachment)} type="button">Удалить фото</button>}
                    <strong>{entry.name}</strong><span>{mealName} · {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(entry.createdAt))}</span>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="photo-gallery-empty">
              <span aria-hidden="true">▧</span>
              <div><strong>Здесь будут фото ваших блюд</strong><p>Добавьте фото при создании приёма пищи — оно сохранится рядом с записью.</p></div>
              <button className="button-secondary" onClick={() => openModal("food")} type="button">＋ Добавить фото</button>
            </div>
          )}
        </section>
        </>}

        {activeSection === "diary" && (
          <section className="diary-page">
            <div className="page-intro">
              <p>Хронология отдельных записей: что и когда вы съели, выпили или купили.</p>
              <button className="primary-action" onClick={() => openModal()} type="button">＋ Добавить запись</button>
            </div>
            <div className="diary-toolbar">
              <div aria-label="Фильтр периода дневника" className="period-tabs">
                {(["today", "7days", "all"] as DiaryPeriod[]).map((period) => (
                  <button aria-pressed={diaryPeriod === period} className={diaryPeriod === period ? "period-tab active" : "period-tab"} key={period} onClick={() => setDiaryPeriod(period)} type="button">
                    {period === "today" ? "Сегодня" : period === "7days" ? "7 дней" : "Всё время"}
                  </button>
                ))}
              </div>
              <div aria-label="Фильтр типа записи" className="filter-tabs">
                {([
                  ["all", "Все"], ["food", "Еда"], ["drink", "Напитки"], ["expense", "Расходы"], ["photo", "С фото"],
                ] as [DiaryFilter, string][]).map(([filter, label]) => (
                  <button aria-pressed={diaryFilter === filter} className={diaryFilter === filter ? "filter-tab active" : "filter-tab"} key={filter} onClick={() => setDiaryFilter(filter)} type="button">{label}</button>
                ))}
              </div>
            </div>
            <div className="diary-count">Показано записей: <strong>{diaryEntries.length}</strong></div>
            {diaryGroups.length ? diaryGroups.map(([dateKey, group]) => (
              <section aria-label={`Записи за ${diaryDateLabel(dateKey)}`} className="diary-day-group" key={dateKey}>
                <div className="diary-date-heading"><h2>{diaryDateLabel(dateKey)}</h2><span>{group.length} {group.length === 1 ? "запись" : "записей"}</span></div>
                <div className="diary-entry-list">
                  {group.map((entry) => {
                    const details = diaryEntryDetails(entry);
                    const kind = entry.kind === "expense" ? "receipt" : "meal_photo";
                    const attachment = attachmentForOwner(entry.id, kind);
                    const photo = attachment ? attachmentData[attachment.id] : undefined;
                    return (
                      <article className="diary-entry" key={entry.id}>
                        <time className="diary-entry-time" dateTime={entry.createdAt}>{new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(entry.createdAt))}</time>
                        <span aria-hidden="true" className="diary-entry-icon">{details.icon}</span>
                        <div className="diary-entry-copy"><strong>{details.title}</strong><span>{details.subtitle}</span></div>
                        {photo && <button aria-label={entry.kind === "expense" ? "Открыть фото чека" : "Открыть фото блюда"} className="diary-entry-photo" onClick={() => { setPhotoViewerLabel(entry.kind === "expense" ? "Фото чека" : "Фото блюда"); setPhotoViewer(photo); }} type="button"><NextImage alt={entry.kind === "expense" ? "Фото чека" : "Фото блюда"} height={86} src={photo} unoptimized width={86} /></button>}
                        {attachment && <button aria-label="Удалить фото вложения" className="attachment-delete-icon" onClick={() => void removeAttachment(attachment)} title="Удалить фото отдельно от записи" type="button">⌫</button>}
                        {entry.kind !== "expense" && <button aria-label={favorites.some((favorite) => favorite.entry.id === entry.id) ? "Убрать из избранного" : "Добавить в избранное"} className={favorites.some((favorite) => favorite.entry.id === entry.id) ? "favorite-toggle selected" : "favorite-toggle"} onClick={() => void toggleFavorite(entry)} title="Избранное" type="button">★</button>}
                        {entry.kind === "expense" && entry.merchant && <button aria-label={favoriteStores.some((store) => store.merchant.toLocaleLowerCase("ru-RU") === entry.merchant.toLocaleLowerCase("ru-RU")) ? "Убрать магазин из избранного" : "Добавить магазин в избранное"} className={favoriteStores.some((store) => store.merchant.toLocaleLowerCase("ru-RU") === entry.merchant.toLocaleLowerCase("ru-RU")) ? "favorite-toggle selected" : "favorite-toggle"} onClick={() => void toggleFavoriteStore(entry)} title="Избранный магазин" type="button">★</button>}
                        <button aria-label={`Удалить запись: ${details.title}`} className="diary-delete-button" onClick={() => removeEntry(entry.id)} title="Удалить запись" type="button">×</button>
                      </article>
                    );
                  })}
                </div>
              </section>
            )) : (
              <section className="diary-empty">
                <span aria-hidden="true">▤</span>
                <strong>Записей по этому фильтру пока нет</strong>
                <p>Добавьте приём пищи, напиток или расход — запись появится здесь по времени.</p>
                <button className="primary-action" onClick={() => openModal()} type="button">＋ Добавить запись</button>
              </section>
            )}
          </section>
        )}

        {activeSection === "analytics" && (
          <section className="analytics-page">
            <div className="page-intro analytics-intro">
              <p>Сводные итоги и изменения за выбранный период. Здесь нет ленты отдельных записей — её смотри в дневнике.</p>
              <div aria-label="Период аналитики" className="period-tabs">
                {([7, 30] as const).map((period) => (
                  <button aria-pressed={analyticsPeriod === period} className={analyticsPeriod === period ? "period-tab active" : "period-tab"} key={period} onClick={() => setAnalyticsPeriod(period)} type="button">{period} дней</button>
                ))}
              </div>
            </div>

            <div className="analytics-stat-grid">
              <article className="analytics-stat calories-stat"><span>Калории за период</span><strong>{moneyLabel(periodCalories, "UZS")} <small>ккал</small></strong><small>в среднем {moneyLabel(Math.round(periodCalories / analyticsPeriod), "UZS")} ккал в день</small></article>
              <article className="analytics-stat food-stat"><span>Приёмы пищи</span><strong>{periodFoodCount}</strong><small>отдельных записей еды</small></article>
              <article className="analytics-stat water-stat"><span>Выпито воды</span><strong>{preferences.volumeUnit === "l" ? new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(periodWater / 1000) : moneyLabel(periodWater, "UZS")} <small>{preferences.volumeUnit}</small></strong><small>в среднем {preferences.volumeUnit === "l" ? new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(periodWater / analyticsPeriod / 1000) : moneyLabel(Math.round(periodWater / analyticsPeriod), "UZS")} {preferences.volumeUnit} в день</small></article>
              <article className="analytics-stat expense-stat"><span>Расходы · {activeExpenseCurrency}</span><strong>{moneyLabel(periodExpenses, activeExpenseCurrency)} <small>{activeExpenseCurrency}</small></strong><small>в среднем {moneyLabel(Math.round(periodExpenses / analyticsPeriod), activeExpenseCurrency)} в день</small></article>
              <article className="analytics-stat macro-stat"><span>БЖУ за период</span><strong>Б {Math.round(periodMacros.protein)} · Ж {Math.round(periodMacros.fat)} · У {Math.round(periodMacros.carbs)} г</strong><small>сумма введённых значений</small></article>
              <article className="analytics-stat order-stat"><span>Заказы еды</span><strong>{orderCount}</strong><small>{periodExpensesList.length ? `средний чек ${moneyLabel(Math.round(averageCheck), activeExpenseCurrency)} ${activeExpenseCurrency}` : "за период нет расходов"}</small></article>
            </div>

            <div className="analytics-section-heading"><div><p className="eyebrow">ТРЕНДЫ</p><h2>День за днём</h2></div><span>Последние {analyticsPeriod} дней</span></div>
            {renderCharts()}

            <div className="analytics-detail-grid">
              <article className="analytics-detail-card">
                <div className="analytics-section-heading compact"><div><p className="eyebrow">СТРУКТУРА ТРАТ</p><h2>По категориям</h2></div></div>
                {topExpenseCategories.length ? (
                  <ul className="category-breakdown">
                    {topExpenseCategories.map((item) => (
                      <li key={`${item.category}-${item.currency}`}>
                        <div><span>{item.category} <small>{item.currency}</small></span><strong>{moneyLabel(item.amount, item.currency)}</strong></div>
                        <div className="category-bar"><span style={{ width: `${Math.max(4, item.amount / topExpenseCategories[0].amount * 100)}%` }} /></div>
                      </li>
                    ))}
                  </ul>
                ) : <p className="analytics-empty-note">Добавьте расход, чтобы увидеть разбивку по категориям.</p>}
              </article>
              <article className="analytics-detail-card">
                <div className="analytics-section-heading compact"><div><p className="eyebrow">СРАВНЕНИЕ</p><h2>Продукты, доставка и кафе</h2></div></div>
                <ul className="comparison-list">{["Продукты", "Заказ еды", "Кафе и рестораны"].map((category) => {
                  const amount = analyticsEntries.reduce((sum, entry) => sum + (entry.kind === "expense" && entry.currency === activeExpenseCurrency && entry.category === category ? entry.amount : 0), 0);
                  return <li key={category}><span>{category}</span><strong>{moneyLabel(amount, activeExpenseCurrency)} {activeExpenseCurrency}</strong></li>;
                })}</ul>
              </article>
              <article className="analytics-detail-card">
                <div className="analytics-section-heading compact"><div><p className="eyebrow">СТОИМОСТЬ</p><h2>На порцию и день</h2></div></div>
                <div className="price-estimate-grid"><div><span>Расходы на одну запись еды</span><strong>{periodFoodCount ? `${moneyLabel(Math.round(averageMealSpend), activeExpenseCurrency)} ${activeExpenseCurrency}` : "—"}</strong></div><div><span>В день с записями еды</span><strong>{activeFoodDays ? `${moneyLabel(Math.round(averageFoodDaySpend), activeExpenseCurrency)} ${activeExpenseCurrency}` : "—"}</strong></div></div>
                <p className="analytics-empty-note">Оценка делит расходы выбранной валюты на число приёмов пищи или дней с едой за период.</p>
              </article>
              <article className="analytics-detail-card">
                <div className="analytics-section-heading compact"><div><p className="eyebrow">МЕСТА</p><h2>Магазины и заведения</h2></div></div>
                {topMerchants.length ? <ol className="merchant-ranking">{topMerchants.map(([merchant, amount]) => <li key={merchant}><span>{merchant}</span><strong>{moneyLabel(amount, activeExpenseCurrency)} {activeExpenseCurrency}</strong></li>)}</ol> : <p className="analytics-empty-note">Укажите магазин или заведение в расходе, чтобы увидеть рейтинг.</p>}
              </article>
              <article className="analytics-detail-card">
                <div className="analytics-section-heading compact"><div><p className="eyebrow">КОНТЕКСТ</p><h2>Настроение и расходы</h2></div></div>
                {moodRows.length ? <><ul className="mood-ranking">{moodRows.map((row) => <li key={row.mood}><span>{row.mood}<small>{row.count} приёмов · {row.days} дней</small></span><strong>{Math.round(row.calories)} ккал / приём<br /><small>{moneyLabel(Math.round(row.sameDayExpenses), activeExpenseCurrency)} {activeExpenseCurrency} в эти дни</small></strong></li>)}</ul><p className="analytics-empty-note">Это совпадения по дням, а не доказательство причинной связи.</p></> : <p className="analytics-empty-note">Добавляйте настроение к еде, чтобы увидеть совпадения с калориями и тратами.</p>}
                <p className="analytics-empty-note">Данные сна и тренировок пока не подключены.</p>
              </article>
              <article className="analytics-detail-card insight-card">
                <div className="analytics-section-heading compact"><div><p className="eyebrow">КАК ЧИТАТЬ</p><h2>Аналитика и дневник</h2></div></div>
                <p><strong>Дневник</strong> хранит конкретные записи с датой, временем, деталями и фото.</p>
                <p><strong>Аналитика</strong> складывает эти записи за 7 или 30 дней: показывает итоги, средние значения и распределение расходов.</p>
                <button className="text-button" onClick={() => setActiveSection("diary")} type="button">Открыть дневник <span aria-hidden="true">→</span></button>
              </article>
            </div>
          </section>
        )}

        {activeSection === "settings" && (
          <section className="settings-page">
            <div className="page-intro"><p>Задайте личные ориентиры и формат отображения. Настройки аккаунта синхронизируются с дневником.</p></div>
            <form className="settings-form" onSubmit={saveSettings}>
              <section className="settings-card">
                <div className="settings-card-heading"><span className="settings-icon">◎</span><div><h2>Ежедневные цели</h2><p>Цели показываются в сводке и прогрессе за день.</p></div></div>
                <div className="settings-fields settings-goals-grid">
                  <label>Вода, {settingsDraft.volumeUnit}<input min="0" placeholder="Например, 2" step={settingsDraft.volumeUnit === "l" ? "0.1" : "50"} type="number" value={settingsDraft.waterGoal} onChange={(event) => setSettingsDraft({ ...settingsDraft, waterGoal: event.target.value })} /></label>
                  <label>Калории, ккал<input min="0" placeholder="Например, 2000" step="50" type="number" value={settingsDraft.caloriesGoal} onChange={(event) => setSettingsDraft({ ...settingsDraft, caloriesGoal: event.target.value })} /></label>
                  <label>Белки, г<input min="0" placeholder="Не задано" step="1" type="number" value={settingsDraft.proteinGoal} onChange={(event) => setSettingsDraft({ ...settingsDraft, proteinGoal: event.target.value })} /></label>
                  <label>Жиры, г<input min="0" placeholder="Не задано" step="1" type="number" value={settingsDraft.fatGoal} onChange={(event) => setSettingsDraft({ ...settingsDraft, fatGoal: event.target.value })} /></label>
                  <label>Углеводы, г<input min="0" placeholder="Не задано" step="1" type="number" value={settingsDraft.carbsGoal} onChange={(event) => setSettingsDraft({ ...settingsDraft, carbsGoal: event.target.value })} /></label>
                </div>
              </section>

              <section className="settings-card">
                <div className="settings-card-heading"><span className="settings-icon">⚖</span><div><h2>Единицы и валюта</h2><p>Выбор влияет на поля ввода и отображение новых расходов.</p></div></div>
                <div className="settings-fields settings-unit-grid">
                  <label>Объём<select value={settingsDraft.volumeUnit} onChange={(event) => changeVolumeUnit(event.target.value as "ml" | "l")}><option value="ml">Миллилитры (мл)</option><option value="l">Литры (л)</option></select></label>
                  <label>Вес порции<select value={settingsDraft.massUnit} onChange={(event) => setSettingsDraft({ ...settingsDraft, massUnit: event.target.value as "g" | "kg" })}><option value="g">Граммы (г)</option><option value="kg">Килограммы (кг)</option></select></label>
                  <label>Валюта по умолчанию<select value={settingsDraft.currency} onChange={(event) => setSettingsDraft({ ...settingsDraft, currency: event.target.value })}><option value="UZS">UZS — сум</option><option value="USD">USD — доллар США</option><option value="EUR">EUR — евро</option><option value="RUB">RUB — рубль</option></select></label>
                </div>
              </section>

              <section className="settings-card">
                <div className="settings-card-heading"><span className="settings-icon">◫</span><div><h2>Бюджет на питание</h2><p>Лимит и остаток появятся в сводке расходов.</p></div></div>
                <div className="settings-fields settings-unit-grid">
                  <label>Период<select value={budgetPeriod} onChange={(event) => setBudgetPeriod(event.target.value as BudgetPeriod)}><option value="day">День</option><option value="week">Неделя</option><option value="month">Месяц</option></select></label>
                  <label>Лимит, {preferences.currency}<input min="0" step="0.01" type="number" value={budgetAmount} onChange={(event) => setBudgetAmount(event.target.value)} placeholder="Например, 500000" /></label>
                </div>
                {budgetMessage && <p aria-live="polite" className="settings-message">{budgetMessage}</p>}
                <button className="button-primary" onClick={() => void saveBudget()} type="button">Сохранить бюджет</button>
              </section>

              <section className="settings-card">
                <div className="settings-card-heading"><span className="settings-icon">◷</span><div><h2>Напоминания о воде</h2><p>Уведомление сработает, пока приложение открыто в этом браузере.</p></div></div>
                <div className="reminder-settings">
                  <label className="toggle-row"><input checked={settingsDraft.remindersEnabled} onChange={(event) => setSettingsDraft({ ...settingsDraft, remindersEnabled: event.target.checked })} type="checkbox" /><span className="toggle-copy"><strong>Включить одно ежедневное напоминание</strong><small>Нужно разрешить уведомления в браузере.</small></span></label>
                  <label className="reminder-time">Время<input type="time" value={settingsDraft.reminderTime} onChange={(event) => setSettingsDraft({ ...settingsDraft, reminderTime: event.target.value })} /></label>
                  <button className="button-secondary permission-button" onClick={requestReminderPermission} type="button">Разрешить уведомления</button>
                </div>
              </section>

              <section className="settings-card">
                <div className="settings-card-heading"><span className="settings-icon">▧</span><div><h2>Фото и вложения</h2><p>Файлы хранятся в IndexedDB этого устройства, отдельно от записей и метаданных аккаунта.</p></div></div>
                <div className="settings-fields settings-unit-grid">
                  <label>Сжатие изображений<select value={settingsDraft.photoCompression} onChange={(event) => setSettingsDraft({ ...settingsDraft, photoCompression: event.target.value as UserPreferences["photoCompression"] })}><option value="balanced">Сбалансированное</option><option value="detail">Больше деталей</option></select></label>
                  <p className="field-help">Для чека сохраняется больше деталей, чем для фото блюда. Облачное хранилище пока не подключено.</p>
                </div>
              </section>

              {settingsMessage && <p aria-live="polite" className="settings-message">{settingsMessage}</p>}
              <div className="settings-save-row"><span>Пустые значения означают, что цель не задана.</span><button className="button-primary" type="submit">Сохранить настройки</button></div>
            </form>

            <section className="settings-card privacy-card">
              <div className="settings-card-heading"><span className="settings-icon">⌑</span><div><h2>Данные и приватность</h2><p>Записи и цели синхронизируются с вашим аккаунтом. Фото пока остаются в этом браузере.</p></div></div>
              <div className="privacy-actions">
                <button className="button-secondary" onClick={exportData} type="button">Экспортировать данные (JSON)</button>
                <button className="danger-button" onClick={clearLocalData} type="button">Удалить локальные данные</button>
              </div>
              <div className="account-delete-row"><div><strong>Удалить аккаунт и данные</strong><p>Удалятся записи, цели, расходы, вложения и профиль. Действие необратимо.</p></div><button className="danger-button" onClick={() => void deleteAccount()} type="button">Удалить аккаунт</button></div>
            </section>
          </section>
        )}

        <footer className="page-footer">Записи и цели хранятся в аккаунте; фотографии блюд пока хранятся на этом устройстве.</footer>
      </section>

      <Navigation activeSection={activeSection} mobile onNavigate={setActiveSection} />

      {modal && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
          <section aria-labelledby="entry-modal-title" aria-modal="true" className="entry-modal" role="dialog">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">БЫСТРАЯ ЗАПИСЬ</p>
                <h2 id="entry-modal-title">{modal.step === "type" ? "Что добавим?" : modal.kind === "food" ? "Приём пищи" : modal.kind === "drink" ? "Напиток" : "Расход на еду"}</h2>
              </div>
              <button aria-label="Закрыть" className="modal-close" onClick={() => setModal(null)} type="button">×</button>
            </div>

            <form onSubmit={submitEntry}>
              {modal.step === "type" ? (
                <>
                  <div className="entry-type-grid">
                    {([
                      ["food", "🍽️", "Еда"],
                      ["drink", "💧", "Вода и напитки"],
                      ["expense", "🧾", "Расход"],
                    ] as [EntryKind, string, string][]).map(([kind, icon, label]) => (
                      <button aria-pressed={selectedKind === kind} className={selectedKind === kind ? "entry-type-option selected" : "entry-type-option"} key={kind} onClick={() => setSelectedKind(kind)} type="button">
                        <span>{icon}</span>{label}
                      </button>
                    ))}
                  </div>
                  <div className="modal-actions">
                    <button className="button-secondary" onClick={() => setModal(null)} type="button">Отмена</button>
                    <button className="button-primary" type="submit">Продолжить</button>
                  </div>
                </>
              ) : (
                <>
                  {modal.kind === "food" && (
                    <div className="form-fields">
                      {!modal.mealType && <label>Приём пищи<select value={form.mealType} onChange={(event) => setForm({ ...form, mealType: event.target.value as MealType })}>{mealOptions.map((meal) => <option key={meal.value} value={meal.value}>{meal.label}</option>)}</select></label>}
                      <label>Что вы съели?<input autoFocus maxLength={100} placeholder="Например, овсяная каша" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
                      {form.name.trim() && (
                        <section aria-label="Расчёт блюда по рецепту" className="recipe-assistant">
                          <div className="recipe-assistant-heading"><span aria-hidden="true">✦</span><div><strong>Рассчитаем «{form.name.trim()}» по рецепту</strong><p>Укажите ингредиенты и количество — я сложу калории и посчитаю на порцию.</p></div></div>
                          {form.name.toLocaleLowerCase("ru-RU").includes("сырник") && <p className="recipe-hint">Для сырников проверьте творог, яйца, муку, сахар и масло; масло для жарки тоже добавьте в рецепт.</p>}
                          <div className="recipe-ingredient-list">
                            {recipeIngredients.map((ingredient, index) => {
                              const selectedIngredient = RECIPE_INGREDIENTS.find((item) => item.id === ingredient.foodId);
                              const ingredientGrams = Number(ingredient.quantity) * (ingredient.unit === "piece" && selectedIngredient?.gramsPerPiece ? selectedIngredient.gramsPerPiece : 1);
                              const ingredientCalories = Number(ingredient.caloriesPer100);
                              const lineCalories = ingredientGrams > 0 && Number.isFinite(ingredientCalories) ? Math.round(ingredientCalories * ingredientGrams / 100) : 0;
                              return (
                                <div className="recipe-ingredient-row" key={ingredient.id}>
                                  <label className="recipe-product-select">Продукт<select required value={ingredient.foodId} onChange={(event) => updateRecipeIngredient(index, "foodId", event.target.value)}><option value="">Выберите продукт</option>{RECIPE_INGREDIENTS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="custom">Другой продукт</option></select></label>
                                  {ingredient.foodId === "custom" && <label className="recipe-custom-name">Название<input maxLength={70} placeholder="Название продукта" required value={ingredient.customName} onChange={(event) => updateRecipeIngredient(index, "customName", event.target.value)} /></label>}
                                  <label className="recipe-quantity">Количество<input min="0.1" step="0.1" type="number" required value={ingredient.quantity} onChange={(event) => updateRecipeIngredient(index, "quantity", event.target.value)} /></label>
                                  {selectedIngredient?.gramsPerPiece ? <label className="recipe-unit">Ед.<select value={ingredient.unit} onChange={(event) => updateRecipeIngredient(index, "unit", event.target.value as "g" | "piece")}><option value="g">г</option><option value="piece">шт.</option></select></label> : <span className="recipe-unit-label">г</span>}
                                  <label className="recipe-density">Ккал / 100 г<input min="0" step="1" type="number" required value={ingredient.caloriesPer100} onChange={(event) => updateRecipeIngredient(index, "caloriesPer100", event.target.value)} /></label>
                                  <strong className="recipe-line-total">{lineCalories} ккал</strong>
                                  <button aria-label="Убрать ингредиент" className="recipe-remove" onClick={() => setRecipeIngredients((current) => current.filter((_, ingredientIndex) => ingredientIndex !== index))} type="button">×</button>
                                </div>
                              );
                            })}
                          </div>
                          <button className="recipe-add-ingredient" onClick={() => { setRecipeIngredients((current) => [...current, createRecipeIngredient()]); setRecipeError(""); }} type="button">＋ Добавить ингредиент</button>
                          <div className="recipe-summary">
                            <label>Количество порций<input min="1" step="1" type="number" value={recipeServings} onChange={(event) => setRecipeServings(event.target.value)} /></label>
                            <div><span>Весь рецепт</span><strong>{recipeReady ? `≈ ${Math.round(recipeTotalCalories)} ккал` : "—"}</strong></div>
                            <div><span>На порцию</span><strong>{recipeReady ? `≈ ${recipeCaloriesPerServing} ккал` : "—"}</strong></div>
                          </div>
                          <p className="recipe-source-note">Справочная калорийность приблизительная. Если знаете данные с упаковки, поправьте поле «Ккал / 100 г».</p>
                          {recipeError && <p className="recipe-error" role="alert">{recipeError}</p>}
                        </section>
                      )}
                      <div className="form-row">
                        <label>Калории вручную, ккал<input min="0" step="1" type="number" value={form.calories} onChange={(event) => setForm({ ...form, calories: event.target.value })} /><span className="field-help">Используется, если рецепт не заполнен.</span></label>
                        <label>Тип записи<select value={form.sourceType} onChange={(event) => setForm({ ...form, sourceType: event.target.value as FoodEntry["sourceType"] })}><option value="home">Домашняя еда</option><option value="cafe">Кафе</option><option value="delivery">Доставка</option><option value="ready_meal">Готовая еда</option></select></label>
                      </div>
                      <div className="form-row">
                        <label>Белки, г<input min="0" step="0.1" type="number" value={form.protein} onChange={(event) => setForm({ ...form, protein: event.target.value })} /></label>
                        <label>Жиры, г<input min="0" step="0.1" type="number" value={form.fat} onChange={(event) => setForm({ ...form, fat: event.target.value })} /></label>
                        <label>Углеводы, г<input min="0" step="0.1" type="number" value={form.carbs} onChange={(event) => setForm({ ...form, carbs: event.target.value })} /></label>
                      </div>
                      <fieldset className="food-tags-field"><legend>Метки</legend>{foodTagOptions.map(([tag, label]) => <label key={tag}><input checked={form.tags.includes(tag)} onChange={(event) => setForm({ ...form, tags: event.target.checked ? [...form.tags, tag] : form.tags.filter((item) => item !== tag) })} type="checkbox" />{label}</label>)}</fieldset>
                      <div className="form-row">
                        <label>Голод до еды<select value={form.hunger} onChange={(event) => setForm({ ...form, hunger: event.target.value })}><option value="">Не указывать</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} из 5</option>)}</select></label>
                        <label>Сытость после еды<select value={form.satiety} onChange={(event) => setForm({ ...form, satiety: event.target.value })}><option value="">Не указывать</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} из 5</option>)}</select></label>
                        <label>Настроение<select value={form.mood} onChange={(event) => setForm({ ...form, mood: event.target.value })}><option value="">Не указывать</option><option value="Хорошее">Хорошее</option><option value="Нейтральное">Нейтральное</option><option value="Усталость">Усталость</option><option value="Стресс">Стресс</option></select></label>
                      </div>
                      <section aria-label="Калькулятор калорий порции" className="calorie-calculator">
                        <div className="calculator-heading"><strong>Калькулятор калорий</strong><span>для одной порции</span></div>
                        <div className="form-row">
                          <label>Ккал на 100 г<input min="0" step="1" type="number" value={form.caloriesPer100} onChange={(event) => setForm({ ...form, caloriesPer100: event.target.value })} /></label>
                          <label>Вес порции, {preferences.massUnit}<input min="0" step="1" type="number" value={form.portionGrams} onChange={(event) => setForm({ ...form, portionGrams: event.target.value })} /></label>
                        </div>
                        <output className="calculator-result">
                          <span>{recipeReady ? `${Math.round(recipeTotalCalories)} ккал в рецепте / ${recipeServingsCount} порц.` : calculatedCalories === null ? "Введите калорийность и вес порции" : `${form.caloriesPer100} × ${form.portionGrams}${preferences.massUnit === "kg" ? " × 1000" : ""} / 100`}</span>
                          <strong>{calculatedCalories === null ? "—" : `${calculatedCalories} ккал`}</strong>
                        </output>
                        <p>{recipeReady ? `В записи сохранится результат рецепта: ${recipeCaloriesPerServing} ккал на порцию.` : "Если заполнить оба поля, в запись попадёт рассчитанное значение."}</p>
                      </section>
                      <label className="photo-upload-label">
                        <span>Фото блюда <span className="optional-label">необязательно</span></span>
                        <span className="photo-upload-control">{form.photoDataUrl ? "Заменить фото" : "＋ Добавить фото"}</span>
                        <input accept="image/*" className="photo-file-input" onChange={(event) => handlePhotoChange(event.target.files?.[0])} type="file" />
                      </label>
                      {photoError && <p className="photo-error" role="alert">{photoError}</p>}
                      {form.photoDataUrl && <NextImage alt="Предпросмотр фото блюда" className="food-photo-preview" height={900} src={form.photoDataUrl} unoptimized width={1200} />}
                      <p className="photo-help">Фото уменьшается в браузере перед сохранением на этом устройстве.</p>
                    </div>
                  )}

                  {modal.kind === "drink" && (
                    <div className="form-fields">
                      <label>Напиток<select value={form.drinkType} onChange={(event) => setForm({ ...form, drinkType: event.target.value as DrinkType })}><option value="water">Вода</option><option value="tea">Чай</option><option value="coffee">Кофе</option><option value="juice">Сок</option><option value="other">Другое</option></select></label>
                      <label>Объём, {preferences.volumeUnit}<input autoFocus min={preferences.volumeUnit === "l" ? "0.01" : "1"} max={preferences.volumeUnit === "l" ? "10" : "10000"} step={preferences.volumeUnit === "l" ? "0.05" : "1"} type="number" required value={form.volumeMl} onChange={(event) => setForm({ ...form, volumeMl: event.target.value })} /></label>
                      <div className="modal-presets">Быстро: {[200, 250, 500].map((volume) => <button key={volume} onClick={() => setForm({ ...form, volumeMl: String(preferences.volumeUnit === "l" ? volume / 1000 : volume) })} type="button">{volume} мл</button>)}</div>
                    </div>
                  )}

                  {modal.kind === "expense" && (
                    <div className="form-fields">
                      <div className="form-row">
                        <label>Сумма<input autoFocus min="0.01" step="0.01" type="number" required value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
                        <label>Валюта<select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}><option value="UZS">UZS</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="RUB">RUB</option></select></label>
                      </div>
                      <label>Категория<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option>Продукты</option><option>Заказ еды</option><option>Кафе и рестораны</option><option>Перекусы и кофе</option><option>Вода и напитки</option><option>Алкоголь</option><option>Спортпит</option></select></label>
                      <label>Магазин или заведение <span className="optional-label">необязательно</span><input maxLength={100} placeholder="Например, супермаркет" value={form.merchant} onChange={(event) => setForm({ ...form, merchant: event.target.value })} /></label>
                      <label>Способ оплаты<select value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}><option value="card">Карта</option><option value="cash">Наличные</option><option value="online">Онлайн</option><option value="other">Другое</option></select></label>
                      <fieldset className="food-tags-field"><legend>Метки расхода</legend>{Object.entries(expenseTagLabels).map(([tag, label]) => <label key={tag}><input checked={form.tags.includes(tag)} onChange={(event) => setForm({ ...form, tags: event.target.checked ? [...form.tags, tag] : form.tags.filter((item) => item !== tag) })} type="checkbox" />{label}</label>)}</fieldset>
                      <label>Комментарий <span className="optional-label">необязательно</span><textarea maxLength={500} rows={2} value={form.comment} onChange={(event) => setForm({ ...form, comment: event.target.value })} /></label>
                      <label className="photo-upload-label">
                        <span>Фото чека <span className="optional-label">необязательно</span></span>
                        <span className="photo-upload-control">{form.receiptDataUrl ? "Заменить фото чека" : "＋ Добавить чек"}</span>
                        <input accept="image/*" className="photo-file-input" onChange={(event) => handlePhotoChange(event.target.files?.[0], "receipt")} type="file" />
                      </label>
                      {form.receiptDataUrl && <NextImage alt="Предпросмотр фото чека" className="food-photo-preview" height={1200} src={form.receiptDataUrl} unoptimized width={900} />}
                      {photoError && <p className="photo-error" role="alert">{photoError}</p>}
                    </div>
                  )}
                  <label className="entry-datetime">Дата и время<input type="datetime-local" value={form.occurredAt} onChange={(event) => setForm({ ...form, occurredAt: event.target.value })} /></label>
                  <div className="modal-actions">
                    {modal.mealType && modal.kind === "food"
                      ? <button className="button-secondary" onClick={() => setModal({ step: "type" })} type="button">← К выбору типа</button>
                      : <button className="button-secondary" onClick={() => setModal({ step: "type" })} type="button">← Назад</button>}
                    <button className="button-primary" type="submit">Сохранить запись</button>
                  </div>
                </>
              )}
            </form>
          </section>
        </div>
      )}

      {photoViewer && (
        <div className="photo-viewer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPhotoViewer(null); }}>
          <section aria-label={`Полноэкранный просмотр: ${photoViewerLabel}`} aria-modal="true" className="photo-viewer" role="dialog">
            <button aria-label="Закрыть фото" className="modal-close photo-viewer-close" onClick={() => setPhotoViewer(null)} type="button">×</button>
            <NextImage alt={photoViewerLabel} height={1200} src={photoViewer} unoptimized width={1600} />
          </section>
        </div>
      )}
    </main>
  );
}
