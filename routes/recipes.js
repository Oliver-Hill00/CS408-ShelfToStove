const express = require("express");
const { getDb } = require("../db/db");
const { formatAmount, formatIngredient } = require("../lib/format");

const PAGE_SIZE = 12;

const router = express.Router();

// Have = enough on hand, Low = some but not enough, Missing = none. Staples always count as on hand.
function pantryStatus(row) {
  if (row.is_staple) return { status: "Have", note: "staple" };
  if (!row.pantry_base) return { status: "Missing", note: "" };
  if (row.pantry_base >= row.qty_base) return { status: "Have", note: "" };
  return { status: "Low", note: `have ${formatAmount(row.pantry_quantity, row.pantry_unit)}` };
}

// Browse Recipes: /recipes?page=n
router.get("/", (req, res) => {
  const db = getDb();
  const total = db.prepare("SELECT COUNT(*) FROM recipes").pluck().get();
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requested = Number.parseInt(req.query.page, 10);
  const page = Math.min(requested > 0 ? requested : 1, totalPages);

  const recipes = db
    .prepare(`
      SELECT r.id, r.title, r.image_path, r.prep_minutes + r.cook_minutes AS total_minutes, c.name AS category
      FROM recipes r
      JOIN categories c ON c.id = r.category_id
      ORDER BY r.title
      LIMIT ? OFFSET ?`)
    .all(PAGE_SIZE, (page - 1) * PAGE_SIZE);

  res.render("recipes", { title: "All Recipes", recipes, page, totalPages, total });
});

// Recipe Detail: /recipes/:id
router.get("/:id", (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next();

  const db = getDb();
  const recipe = db
    .prepare(`
      SELECT r.*, c.name AS category
      FROM recipes r
      JOIN categories c ON c.id = r.category_id
      WHERE r.id = ?`)
    .get(req.params.id);
  if (!recipe) return next();

  const ingredients = db
    .prepare(`
      SELECT i.name, ri.quantity, ri.unit, ri.qty_base,
             p.quantity AS pantry_quantity, p.unit AS pantry_unit, p.qty_base AS pantry_base, p.is_staple
      FROM recipe_ingredients ri
      JOIN ingredients i ON i.id = ri.ingredient_id
      LEFT JOIN pantry_items p ON p.ingredient_id = ri.ingredient_id
      WHERE ri.recipe_id = ?
      ORDER BY ri.rowid`)
    .all(recipe.id)
    .map((row) => ({ label: formatIngredient(row.quantity, row.unit, row.name), ...pantryStatus(row) }));

  res.render("recipe", {
    title: recipe.title,
    recipe,
    ingredients,
    steps: recipe.instructions.split("\n").filter((step) => step.trim()),
  });
});

module.exports = router;
