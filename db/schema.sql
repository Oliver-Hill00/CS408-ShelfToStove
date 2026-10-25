-- Shelf-To-Stove database schema (SQLite)
-- Every quantity is also stored in a base unit (mL, g, or each) as qty_base so recipe and pantry
-- amounts can be compared directly. Foreign keys are enabled in db/db.js (PRAGMA foreign_keys = ON).
-- Safe to run more than once: tables are only created if they do not exist.

-- Allowed units and their conversion to the base unit for their measure type
CREATE TABLE IF NOT EXISTS units (
  code          TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  measure_type  TEXT NOT NULL CHECK (measure_type IN ('volume', 'weight', 'count')),
  to_base       REAL NOT NULL CHECK (to_base > 0)
);

-- Recipe categories (Breakfast, Dinner, Dessert, ...)
CREATE TABLE IF NOT EXISTS categories (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL UNIQUE COLLATE NOCASE
);

-- One row per recipe
CREATE TABLE IF NOT EXISTS recipes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description   TEXT,
  instructions  TEXT NOT NULL,
  prep_minutes  INTEGER NOT NULL CHECK (prep_minutes >= 0),
  cook_minutes  INTEGER NOT NULL CHECK (cook_minutes >= 0),
  servings      INTEGER NOT NULL CHECK (servings > 0),
  category_id   INTEGER NOT NULL REFERENCES categories(id),
  image_path    TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Master list of ingredient names, shared by recipes, the pantry, and the shopping list
CREATE TABLE IF NOT EXISTS ingredients (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  measure_type  TEXT NOT NULL CHECK (measure_type IN ('volume', 'weight', 'count'))
);

-- Join table: which ingredients each recipe uses, and how much
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  recipe_id      INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id  INTEGER NOT NULL REFERENCES ingredients(id),
  quantity       REAL NOT NULL CHECK (quantity > 0),
  unit           TEXT NOT NULL REFERENCES units(code),
  qty_base       REAL NOT NULL CHECK (qty_base > 0),
  PRIMARY KEY (recipe_id, ingredient_id)
);

-- What the household currently has. Staples (salt, oil, ...) always count as on hand.
CREATE TABLE IF NOT EXISTS pantry_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredient_id  INTEGER NOT NULL UNIQUE REFERENCES ingredients(id),
  quantity       REAL CHECK (quantity IS NULL OR quantity >= 0),
  unit           TEXT REFERENCES units(code),
  qty_base       REAL CHECK (qty_base IS NULL OR qty_base >= 0),
  is_staple      INTEGER NOT NULL DEFAULT 0 CHECK (is_staple IN (0, 1)),
  expires_on     TEXT CHECK (expires_on IS NULL OR date(expires_on) = expires_on),
  added_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  CHECK (is_staple = 1 OR qty_base IS NOT NULL)
);

-- Items to buy. Items added from a recipe hold only the shortfall.
CREATE TABLE IF NOT EXISTS shopping_list_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredient_id  INTEGER NOT NULL REFERENCES ingredients(id),
  quantity       REAL CHECK (quantity IS NULL OR quantity > 0),
  unit           TEXT REFERENCES units(code),
  recipe_id      INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
  checked        INTEGER NOT NULL DEFAULT 0 CHECK (checked IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes(category_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_ingredient ON recipe_ingredients(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_pantry_expires ON pantry_items(expires_on);

-- A unit must match its ingredient's measure type (no comparing cups to pounds)
CREATE TRIGGER IF NOT EXISTS trg_recipe_ingredients_unit_ins
BEFORE INSERT ON recipe_ingredients
WHEN (SELECT measure_type FROM units WHERE code = NEW.unit)
  <> (SELECT measure_type FROM ingredients WHERE id = NEW.ingredient_id)
BEGIN
  SELECT RAISE(ABORT, 'unit does not match the ingredient measure type');
END;

CREATE TRIGGER IF NOT EXISTS trg_recipe_ingredients_unit_upd
BEFORE UPDATE OF unit, ingredient_id ON recipe_ingredients
WHEN (SELECT measure_type FROM units WHERE code = NEW.unit)
  <> (SELECT measure_type FROM ingredients WHERE id = NEW.ingredient_id)
BEGIN
  SELECT RAISE(ABORT, 'unit does not match the ingredient measure type');
END;

CREATE TRIGGER IF NOT EXISTS trg_pantry_items_unit_ins
BEFORE INSERT ON pantry_items
WHEN NEW.unit IS NOT NULL
 AND (SELECT measure_type FROM units WHERE code = NEW.unit)
  <> (SELECT measure_type FROM ingredients WHERE id = NEW.ingredient_id)
BEGIN
  SELECT RAISE(ABORT, 'unit does not match the ingredient measure type');
END;

CREATE TRIGGER IF NOT EXISTS trg_pantry_items_unit_upd
BEFORE UPDATE OF unit, ingredient_id ON pantry_items
WHEN NEW.unit IS NOT NULL
 AND (SELECT measure_type FROM units WHERE code = NEW.unit)
  <> (SELECT measure_type FROM ingredients WHERE id = NEW.ingredient_id)
BEGIN
  SELECT RAISE(ABORT, 'unit does not match the ingredient measure type');
END;

-- Units are reference data the app depends on, so they ship with the schema.
-- Volume conversions use NIST kitchen equivalents (1 tsp = 5 mL, 1 tbsp = 15 mL, 1 cup = 240 mL).
INSERT OR IGNORE INTO units (code, label, measure_type, to_base) VALUES
  ('tsp',   'teaspoon',   'volume', 5),
  ('tbsp',  'tablespoon', 'volume', 15),
  ('cup',   'cup',        'volume', 240),
  ('mL',    'milliliter', 'volume', 1),
  ('L',     'liter',      'volume', 1000),
  ('g',     'gram',       'weight', 1),
  ('kg',    'kilogram',   'weight', 1000),
  ('oz',    'ounce',      'weight', 28.35),
  ('lb',    'pound',      'weight', 453.59),
  ('each',  'each',       'count',  1),
  ('dozen', 'dozen',      'count',  12);
