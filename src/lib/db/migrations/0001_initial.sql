PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  email_verified_at TEXT,
  password_hash TEXT,
  display_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'Asia/Tashkent',
  currency TEXT NOT NULL DEFAULT 'UZS',
  mass_unit TEXT NOT NULL DEFAULT 'g' CHECK (mass_unit IN ('g', 'kg')),
  volume_unit TEXT NOT NULL DEFAULT 'ml' CHECK (volume_unit IN ('ml', 'l')),
  reminders_enabled INTEGER NOT NULL DEFAULT 0 CHECK (reminders_enabled IN (0, 1)),
  water_quick_amounts_json TEXT NOT NULL DEFAULT '[200,250,500]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id, expires_at);

CREATE TABLE IF NOT EXISTS user_goals (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  water_goal_ml INTEGER CHECK (water_goal_ml IS NULL OR water_goal_ml > 0),
  calories_goal_kcal INTEGER CHECK (calories_goal_kcal IS NULL OR calories_goal_kcal > 0),
  protein_goal_g REAL CHECK (protein_goal_g IS NULL OR protein_goal_g > 0),
  fat_goal_g REAL CHECK (fat_goal_g IS NULL OR fat_goal_g > 0),
  carbs_goal_g REAL CHECK (carbs_goal_g IS NULL OR carbs_goal_g > 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS food_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  source_type TEXT NOT NULL CHECK (source_type IN ('home', 'cafe', 'delivery', 'ready_meal')),
  occurred_at TEXT NOT NULL,
  portion_quantity REAL CHECK (portion_quantity IS NULL OR portion_quantity > 0),
  portion_unit TEXT CHECK (portion_unit IS NULL OR portion_unit IN ('g', 'piece', 'serving')),
  calories_kcal REAL CHECK (calories_kcal IS NULL OR calories_kcal >= 0),
  protein_g REAL CHECK (protein_g IS NULL OR protein_g >= 0),
  fat_g REAL CHECK (fat_g IS NULL OR fat_g >= 0),
  carbs_g REAL CHECK (carbs_g IS NULL OR carbs_g >= 0),
  hunger_level INTEGER CHECK (hunger_level IS NULL OR hunger_level BETWEEN 1 AND 5),
  satiety_level INTEGER CHECK (satiety_level IS NULL OR satiety_level BETWEEN 1 AND 5),
  mood TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_food_entries_user_time ON food_entries(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_food_entries_user_meal_time ON food_entries(user_id, meal_type, occurred_at DESC);

CREATE TABLE IF NOT EXISTS food_entry_tags (
  food_entry_id TEXT NOT NULL REFERENCES food_entries(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (food_entry_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_food_entry_tags_tag ON food_entry_tags(tag, food_entry_id);

CREATE TABLE IF NOT EXISTS drink_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  drink_type TEXT NOT NULL CHECK (drink_type IN ('water', 'tea', 'coffee', 'juice', 'other')),
  volume_ml INTEGER NOT NULL CHECK (volume_ml > 0),
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_drink_entries_user_time ON drink_entries(user_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS finance_categories (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  category_type TEXT NOT NULL CHECK (category_type IN ('income', 'expense')),
  category_key TEXT NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '•',
  color TEXT NOT NULL DEFAULT '#ef784a',
  is_optional INTEGER NOT NULL DEFAULT 0 CHECK (is_optional IN (0, 1)),
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, category_type, category_key)
);

CREATE TABLE IF NOT EXISTS financial_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES finance_categories(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('income', 'expense')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'UZS',
  occurred_at TEXT NOT NULL,
  merchant TEXT,
  payment_method TEXT,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_user_time ON financial_transactions(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_user_type_time ON financial_transactions(user_id, transaction_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_category ON financial_transactions(category_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS financial_transaction_tags (
  transaction_id TEXT NOT NULL REFERENCES financial_transactions(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (transaction_id, tag)
);

CREATE TABLE IF NOT EXISTS food_entry_transactions (
  food_entry_id TEXT NOT NULL REFERENCES food_entries(id) ON DELETE CASCADE,
  transaction_id TEXT NOT NULL REFERENCES financial_transactions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (food_entry_id, transaction_id)
);
CREATE INDEX IF NOT EXISTS idx_food_entry_transactions_user ON food_entry_transactions(user_id, transaction_id);

CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL CHECK (period_type IN ('day', 'week', 'month')),
  period_start TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'UZS',
  category_id TEXT REFERENCES finance_categories(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_budgets_user_period ON budgets(user_id, period_type, period_start);

CREATE TABLE IF NOT EXISTS favorites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('food', 'drink', 'store', 'dish')),
  label TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_favorites_user_type ON favorites(user_id, item_type, created_at DESC);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('food_entry', 'transaction')),
  owner_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('meal_photo', 'receipt')),
  storage_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_attachments_owner ON attachments(user_id, owner_type, owner_id);

INSERT OR IGNORE INTO finance_categories (id, user_id, category_type, category_key, name, icon, color, is_optional)
VALUES
  ('food_products', NULL, 'expense', 'food_products', 'Продукты', '🛒', '#e9a653', 0),
  ('food_delivery', NULL, 'expense', 'food_delivery', 'Заказ еды', '🛵', '#ef784a', 0),
  ('food_cafe', NULL, 'expense', 'food_cafe', 'Кафе и рестораны', '🍽️', '#db8067', 0),
  ('food_snacks', NULL, 'expense', 'food_snacks', 'Перекусы и кофе', '☕', '#b98667', 0),
  ('food_drinks', NULL, 'expense', 'food_drinks', 'Вода и напитки', '🥤', '#62b9ca', 0),
  ('food_alcohol', NULL, 'expense', 'food_alcohol', 'Алкоголь', '🍷', '#aa7187', 1),
  ('food_supplements', NULL, 'expense', 'food_supplements', 'Спортпит', '🏋️', '#92b777', 1);
