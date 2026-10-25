const { test, beforeEach } = require("node:test");
const assert = require("node:assert");
const { openDb } = require("../db/db");
const { initSchema } = require("../db/init");
const { seed } = require("../db/seed");

let db;
beforeEach(() => {
  db = openDb(":memory:");
  initSchema(db);
});

const count = (table) => db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get();

test("schema creates all 7 tables and the units", () => {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .pluck()
    .all();
  assert.deepStrictEqual(tables, [
    "categories", "ingredients", "pantry_items", "recipe_ingredients", "recipes", "shopping_list_items", "units",
  ]);
  assert.strictEqual(count("units"), 11);
});

test("seed loads 15 recipes and 60 ingredients, all used by a recipe", () => {
  const result = seed(db);
  assert.strictEqual(result.recipes, 15);
  assert.strictEqual(result.ingredients, 60);
  const unused = db
    .prepare("SELECT COUNT(*) FROM ingredients WHERE id NOT IN (SELECT ingredient_id FROM recipe_ingredients)")
    .pluck()
    .get();
  assert.strictEqual(unused, 0);
});

test("seed skips when data exists, and --force reseeds without duplicates", () => {
  seed(db);
  assert.strictEqual(seed(db).skipped, true);
  const result = seed(db, { force: true });
  assert.strictEqual(result.recipes, 15);
  assert.strictEqual(result.ingredients, 60);
});

test("qty_base is stored in base units (3 cups = 720 mL, 1 lb = 453.59 g)", () => {
  seed(db);
  const row = (title, ingredient) =>
    db.prepare(`
      SELECT ri.qty_base FROM recipe_ingredients ri
      JOIN recipes r ON r.id = ri.recipe_id JOIN ingredients i ON i.id = ri.ingredient_id
      WHERE r.title = ? AND i.name = ?`).pluck().get(title, ingredient);
  assert.strictEqual(row("Chicken Fried Rice", "cooked rice"), 720);
  assert.strictEqual(row("Chicken Fried Rice", "chicken breast"), 453.59);
});

test("foreign keys, cascades, and unit/measure-type rules are enforced", () => {
  seed(db);
  // Unknown category is rejected
  assert.throws(() =>
    db.prepare("INSERT INTO recipes (title, instructions, prep_minutes, cook_minutes, servings, category_id) VALUES ('x', 'y', 1, 1, 1, 999)").run()
  );
  // Cups for a weight ingredient is rejected
  const recipeId = db.prepare("SELECT id FROM recipes WHERE title = 'Spaghetti Marinara'").pluck().get();
  const beefId = db.prepare("SELECT id FROM ingredients WHERE name = 'ground beef'").pluck().get();
  assert.throws(
    () => db.prepare("INSERT INTO recipe_ingredients VALUES (?, ?, 1, 'cup', 240)").run(recipeId, beefId),
    /measure type/
  );
  // Deleting a recipe cascades its ingredient rows and unlinks shopping list items
  const friedRice = db.prepare("SELECT id FROM recipes WHERE title = 'Chicken Fried Rice'").pluck().get();
  db.prepare("DELETE FROM recipes WHERE id = ?").run(friedRice);
  assert.strictEqual(db.prepare("SELECT COUNT(*) FROM recipe_ingredients WHERE recipe_id = ?").pluck().get(friedRice), 0);
  assert.strictEqual(db.prepare("SELECT COUNT(*) FROM shopping_list_items WHERE recipe_id IS NULL AND ingredient_id IN (SELECT id FROM ingredients WHERE name IN ('frozen peas', 'green onion'))").pluck().get(), 2);
});

test("the spec's What Can I Cook? query runs on the seeded data", () => {
  seed(db);
  const results = db.prepare(`
    SELECT r.id, r.title,
           COUNT(*) AS total_ingredients,
           SUM(CASE WHEN p.is_staple = 1 OR p.qty_base >= ri.qty_base THEN 1 ELSE 0 END) AS fully_stocked,
           ROUND(100.0 * SUM(
             CASE WHEN p.is_staple = 1 THEN 1.0
                  ELSE MIN(COALESCE(p.qty_base, 0) / ri.qty_base, 1.0)
             END) / COUNT(*)) AS match_pct
    FROM recipes r
    JOIN recipe_ingredients ri ON ri.recipe_id = r.id
    LEFT JOIN pantry_items p ON p.ingredient_id = ri.ingredient_id
    GROUP BY r.id
    HAVING match_pct >= :minMatch
    ORDER BY match_pct DESC, total_ingredients ASC`).all({ minMatch: 0 });
  assert.strictEqual(results.length, 15);
  // Fried rice: peas are half stocked (0.5 of 1 cup) and green onion is missing -> 6.5 / 8 = 81%
  const friedRice = results.find((r) => r.title === "Chicken Fried Rice");
  assert.strictEqual(friedRice.match_pct, 81);
  assert.ok(results.every((r, i) => i === 0 || results[i - 1].match_pct >= r.match_pct));
});
