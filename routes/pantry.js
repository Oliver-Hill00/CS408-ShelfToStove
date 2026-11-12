const express = require("express");
const { body, validationResult } = require("express-validator");
const { getDb } = require("../db/db");
const { formatQuantity, formatDate } = require("../lib/format");
const {
  cleanName, isKnownIngredient, unitProblem, findOrCreateIngredient, toBase, ingredientOptions,
} = require("../lib/ingredients");

const router = express.Router();

const NOTICES = {
  added: "Item added to your pantry.",
  merged: "That ingredient was already in your pantry, so its entry was updated.",
  updated: "Pantry item updated.",
  deleted: "Pantry item removed.",
};

const filled = (value) => typeof value === "string" && value.trim() !== "";

// "2026-02-30" is not a real date, so check that the date round-trips
function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  const year = date.getUTCFullYear();
  return date.toISOString().slice(0, 10) === value && year >= 2000 && year <= 2100;
}

// Pantry items sorted by expiration date (undated items last), with Soon / Expired flags
function pantryItems() {
  return getDb()
    .prepare(`
      SELECT p.id, i.name, p.quantity, p.unit, p.is_staple, p.expires_on,
             p.expires_on < date('now') AS expired,
             p.expires_on <= date('now', '+7 days') AS soon
      FROM pantry_items p
      JOIN ingredients i ON i.id = p.ingredient_id
      ORDER BY p.expires_on IS NULL, p.expires_on, i.name`)
    .all()
    .map((item) => ({
      ...item,
      quantityText: item.quantity === null ? "—" : formatQuantity(item.quantity),
      unitText: item.unit ?? "—",
      expiresText: item.expires_on ? formatDate(item.expires_on) : "—",
    }));
}

const emptyAdd = () => ({ name: "", quantity: "", unit: "", expires_on: "", is_staple: 0 });

// add: values/errors for the Add form; edit: { id, values, errors } for the one row being fixed
function renderPage(res, { status = 200, add = { values: emptyAdd(), errors: {} }, edit = null, notice = null }) {
  res.status(status).render("pantry", {
    title: "My Pantry",
    items: pantryItems(),
    add,
    edit,
    notice,
    ...ingredientOptions(),
  });
}

// Validation shared by Add and Edit. On Edit the ingredient is fixed, so its name comes from the row.
const ingredientName = (req) => req.pantryItem?.name ?? req.body.name;

const itemRules = [
  body("is_staple").customSanitizer((value) => (value === "on" || value === "1" ? 1 : 0)),
  body("quantity")
    .trim()
    .custom((value, { req }) => {
      if (value === "") {
        if (!req.body.is_staple) throw new Error("Enter a quantity, or mark it as a staple.");
        return true;
      }
      const number = Number(value);
      if (!Number.isFinite(number) || number <= 0 || number > 100000) throw new Error("Enter a quantity greater than 0.");
      return true;
    }),
  body("unit")
    .trim()
    .custom((unit, { req }) => {
      const name = ingredientName(req);
      if (unit === "") {
        if (filled(req.body.quantity)) throw new Error("Choose a unit.");
        if (name && !isKnownIngredient(name)) throw new Error("Choose a unit so this new ingredient can be measured.");
        return true;
      }
      const problem = unitProblem(name, unit);
      if (problem) throw new Error(problem);
      return true;
    }),
  body("expires_on")
    .trim()
    .custom((value) => {
      if (value !== "" && !isRealDate(value)) throw new Error("Enter a real date.");
      return true;
    }),
];

const nameRule = body("name")
  .customSanitizer(cleanName)
  .notEmpty().withMessage("Enter an ingredient.")
  .bail()
  .isLength({ max: 60 }).withMessage("Keep the name under 60 characters.");

const errorsFor = (req) =>
  Object.fromEntries(Object.entries(validationResult(req).mapped()).map(([field, error]) => [field, error.msg]));

// Column values for pantry_items. A staple with no quantity stores no amount.
function itemColumns(form) {
  const quantity = filled(form.quantity) ? Number(form.quantity) : null;
  return {
    quantity,
    unit: quantity === null ? null : form.unit,
    qty_base: quantity === null ? null : toBase(quantity, form.unit),
    is_staple: form.is_staple,
    expires_on: form.expires_on || null,
  };
}

const UPDATE_ITEM = `
  UPDATE pantry_items
  SET quantity = :quantity, unit = :unit, qty_base = :qty_base, is_staple = :is_staple, expires_on = :expires_on
  WHERE id = :id`;

// Loads :id with its ingredient name, or 404s
function loadItem(req, res, next) {
  if (!/^\d+$/.test(req.params.id)) return next("route");
  req.pantryItem = getDb()
    .prepare("SELECT p.*, i.name FROM pantry_items p JOIN ingredients i ON i.id = p.ingredient_id WHERE p.id = ?")
    .get(req.params.id);
  return req.pantryItem ? next() : next("route");
}

// My Pantry
router.get("/", (req, res) => {
  renderPage(res, { notice: NOTICES[req.query.notice] ?? null });
});

// Add an item. If the ingredient is already in the pantry, that entry is updated instead.
router.post("/", nameRule, itemRules, (req, res) => {
  const errors = errorsFor(req);
  if (Object.keys(errors).length) {
    return renderPage(res, { status: 400, add: { values: req.body, errors } });
  }

  const db = getDb();
  const merged = db.transaction(() => {
    const ingredientId = findOrCreateIngredient(db, req.body.name, req.body.unit);
    const columns = itemColumns(req.body);
    const existingId = db.prepare("SELECT id FROM pantry_items WHERE ingredient_id = ?").pluck().get(ingredientId);
    if (existingId !== undefined) {
      db.prepare(UPDATE_ITEM).run({ ...columns, id: existingId });
      return true;
    }
    db.prepare(`
      INSERT INTO pantry_items (ingredient_id, quantity, unit, qty_base, is_staple, expires_on)
      VALUES (:ingredient_id, :quantity, :unit, :qty_base, :is_staple, :expires_on)`)
      .run({ ...columns, ingredient_id: ingredientId });
    return false;
  })();

  res.redirect(303, `/pantry?notice=${merged ? "merged" : "added"}`);
});

// Edit an item's quantity, unit, expiration date, or staple flag
router.post("/:id/edit", loadItem, itemRules, (req, res) => {
  const errors = errorsFor(req);
  if (Object.keys(errors).length) {
    return renderPage(res, { status: 400, edit: { id: req.pantryItem.id, values: req.body, errors } });
  }
  getDb().prepare(UPDATE_ITEM).run({ ...itemColumns(req.body), id: req.pantryItem.id });
  res.redirect(303, "/pantry?notice=updated");
});

router.post("/:id/delete", loadItem, (req, res) => {
  getDb().prepare("DELETE FROM pantry_items WHERE id = ?").run(req.pantryItem.id);
  res.redirect(303, "/pantry?notice=deleted");
});

module.exports = router;
