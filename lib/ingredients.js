// Ingredient and unit rules shared by recipes, the pantry, and the shopping list
const { getDb } = require("../db/db");

// "  Green   Onion " -> "Green Onion" (names are matched case-insensitively and stored lowercase)
const cleanName = (value) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "");

function unitInfo(code) {
  return getDb().prepare("SELECT code, measure_type, to_base FROM units WHERE code = ?").get(code);
}

function measureTypeOf(name) {
  return getDb().prepare("SELECT measure_type FROM ingredients WHERE name = ?").pluck().get(name);
}

const isKnownIngredient = (name) => measureTypeOf(name) !== undefined;

// Why `unit` can't be used for the ingredient `name`, or null if it can. A known ingredient needs a
// unit of its measure type (no cups of chicken); a new ingredient takes its type from the unit.
function unitProblem(name, unit) {
  const unitRow = unitInfo(unit);
  if (!unitRow) return "Choose a unit from the list.";
  const measure = name ? measureTypeOf(name) : undefined;
  if (measure && measure !== unitRow.measure_type) {
    const allowed = getDb().prepare("SELECT code FROM units WHERE measure_type = ? ORDER BY to_base").pluck().all(measure);
    return `Use a ${measure} unit (${allowed.join(", ")}).`;
  }
  return null;
}

// Returns the ingredient's id, adding it first if it's new. New ingredients need a valid unit code.
function findOrCreateIngredient(db, name, unitCode) {
  const lower = cleanName(name).toLowerCase();
  const id = db.prepare("SELECT id FROM ingredients WHERE name = ?").pluck().get(lower);
  if (id !== undefined) return id;
  return db
    .prepare("INSERT INTO ingredients (name, measure_type) VALUES (?, ?)")
    .run(lower, unitInfo(unitCode).measure_type).lastInsertRowid;
}

// Quantity in the base unit (mL, g, or each) so amounts can be compared
const toBase = (quantity, unitCode) => quantity * unitInfo(unitCode).to_base;

// Units for the dropdowns and known ingredient names for autocomplete
function ingredientOptions() {
  const db = getDb();
  return {
    units: db.prepare("SELECT code, label, measure_type FROM units ORDER BY measure_type, to_base").all(),
    knownIngredients: db.prepare("SELECT name, measure_type FROM ingredients ORDER BY name").all(),
  };
}

module.exports = {
  cleanName,
  unitInfo,
  measureTypeOf,
  isKnownIngredient,
  unitProblem,
  findOrCreateIngredient,
  toBase,
  ingredientOptions,
};
