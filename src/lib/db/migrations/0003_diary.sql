-- Keep the original user foreign keys usable while Better Auth owns identities.
INSERT OR IGNORE INTO users (id, email, email_verified_at, display_name)
SELECT id, email, CASE WHEN emailVerified = 1 THEN CURRENT_TIMESTAMP ELSE NULL END, name FROM user;

CREATE TRIGGER IF NOT EXISTS better_auth_user_insert AFTER INSERT ON user
BEGIN
  INSERT OR IGNORE INTO users (id, email, email_verified_at, display_name)
  VALUES (NEW.id, NEW.email, CASE WHEN NEW.emailVerified = 1 THEN CURRENT_TIMESTAMP ELSE NULL END, NEW.name);
END;

CREATE TRIGGER IF NOT EXISTS better_auth_user_update AFTER UPDATE OF email, emailVerified, name ON user
BEGIN
  UPDATE users SET email = NEW.email,
    email_verified_at = CASE WHEN NEW.emailVerified = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
    display_name = NEW.name, updated_at = CURRENT_TIMESTAMP
  WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS better_auth_user_delete AFTER DELETE ON user
BEGIN
  DELETE FROM users WHERE id = OLD.id;
END;

CREATE TABLE IF NOT EXISTS food_entry_ingredients (
  id TEXT PRIMARY KEY,
  food_entry_id TEXT NOT NULL REFERENCES food_entries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity_g REAL NOT NULL CHECK (quantity_g >= 0),
  calories_per_100g REAL NOT NULL CHECK (calories_per_100g >= 0)
);
CREATE INDEX IF NOT EXISTS idx_food_ingredients_entry ON food_entry_ingredients(food_entry_id);
