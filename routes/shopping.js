const express = require("express");
const { body, validationResult } = require("express-validator");
const { getDb } = require("../db/db");
const { formatAmount } = require("../lib/format");
const {
  cleanName, isKnownIngredient, unitProblem, findOrCreateIngredient, ingredientOptions,
} = require("../lib/ingredients");

const router = express.Router();

const NOTICES = {
  added: "Added to your shopping list.",
  merged: "That item was already on your list, so its quantity was increased.",
  deleted: "Item removed from your list.",
  cleared: "Checked items cleared.",
};

const filled = (value) => typeof value === "string" && value.trim() !== "";

// Unbought items first, oldest first within each group
function shoppingItems() {
  return getDb()
    .prepare(`
      SELECT s.id, i.name, s.quantity, s.unit, s.checked, s.recipe_id, r.title AS recipe_title
      FROM shopping_list_items s
      JOIN ingredients i ON i.id = s.ingredient_id
      LEFT JOIN recipes r ON r.id = s.recipe_id
      ORDER BY s.checked, s.id`)
    .all()
    .map((item) => ({ ...item, amount: item.quantity === null ? "" : formatAmount(item.quantity, item.unit) }));
}

function renderPage(res, { status = 200, values = { name: "", quantity: "", unit: "" }, errors = {}, notice = null }) {
  const items = shoppingItems();
  res.status(status).render("shopping-list", {
    title: "Shopping List",
    items,
    checkedCount: items.filter((item) => item.checked).length,
    values,
    errors,
    notice,
    ...ingredientOptions(),
  });
}

// Quantity and unit are optional ("bananas"), but they go together
const addRules = [
  body("name")
    .customSanitizer(cleanName)
    .notEmpty().withMessage("Enter an item.")
    .bail()
    .isLength({ max: 60 }).withMessage("Keep the name under 60 characters."),
  body("quantity")
    .trim()
    .custom((value, { req }) => {
      if (value === "") {
        if (filled(req.body.unit)) throw new Error("Enter a quantity for this unit.");
        return true;
      }
      const number = Number(value);
      if (!Number.isFinite(number) || number <= 0 || number > 100000) throw new Error("Enter a quantity greater than 0.");
      return true;
    }),
  body("unit")
    .trim()
    .custom((unit, { req }) => {
      if (unit === "") {
        if (filled(req.body.quantity)) throw new Error("Choose a unit.");
        if (req.body.name && !isKnownIngredient(req.body.name)) throw new Error("Choose a unit so this new item can be measured.");
        return true;
      }
      const problem = unitProblem(req.body.name, unit);
      if (problem) throw new Error(problem);
      return true;
    }),
];

// Loads :id, or 404s
function loadItem(req, res, next) {
  if (!/^\d+$/.test(req.params.id)) return next("route");
  req.shoppingItem = getDb().prepare("SELECT * FROM shopping_list_items WHERE id = ?").get(req.params.id);
  return req.shoppingItem ? next() : next("route");
}

// Shopping List
router.get("/", (req, res) => {
  renderPage(res, { notice: NOTICES[req.query.notice] ?? null });
});

// Add an item by hand. If the same item with the same unit is still unbought, its quantity goes up instead.
router.post("/", addRules, (req, res) => {
  const errors = Object.fromEntries(
    Object.entries(validationResult(req).mapped()).map(([field, error]) => [field, error.msg])
  );
  if (Object.keys(errors).length) {
    return renderPage(res, { status: 400, values: req.body, errors });
  }

  const db = getDb();
  const quantity = filled(req.body.quantity) ? Number(req.body.quantity) : null;
  const unit = quantity === null ? null : req.body.unit;

  const merged = db.transaction(() => {
    const ingredientId = findOrCreateIngredient(db, req.body.name, req.body.unit);
    const existing = db
      .prepare("SELECT id, quantity FROM shopping_list_items WHERE ingredient_id = ? AND checked = 0 AND unit IS ?")
      .get(ingredientId, unit);
    if (existing) {
      if (quantity !== null) {
        db.prepare("UPDATE shopping_list_items SET quantity = ? WHERE id = ?").run(existing.quantity + quantity, existing.id);
      }
      return true;
    }
    db.prepare("INSERT INTO shopping_list_items (ingredient_id, quantity, unit) VALUES (?, ?, ?)").run(ingredientId, quantity, unit);
    return false;
  })();

  res.redirect(303, `/shopping-list?notice=${merged ? "merged" : "added"}`);
});

// Remove every checked item. Registered before the /:id routes for clarity.
router.post("/clear-checked", (req, res) => {
  getDb().prepare("DELETE FROM shopping_list_items WHERE checked = 1").run();
  res.redirect(303, "/shopping-list?notice=cleared");
});

// Check an item off, or uncheck it
router.post("/:id/toggle", loadItem, (req, res) => {
  getDb().prepare("UPDATE shopping_list_items SET checked = 1 - checked WHERE id = ?").run(req.shoppingItem.id);
  res.redirect(303, "/shopping-list");
});

router.post("/:id/delete", loadItem, (req, res) => {
  getDb().prepare("DELETE FROM shopping_list_items WHERE id = ?").run(req.shoppingItem.id);
  res.redirect(303, "/shopping-list?notice=deleted");
});

module.exports = router;
