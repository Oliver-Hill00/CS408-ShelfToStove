// Compares recipes to the pantry. Recipe Detail, What Can I Cook?, and Add Missing all use this file,
// so they agree on what Have, Low, and Missing mean. Amounts are compared in base units (mL, g, each).
const { formatAmount } = require("./format");

// The conversion factors are rounded (1 lb = 453.59 g but 16 oz = 453.6 g),
// so an amount within 0.01% of what's needed counts as enough.
const ENOUGH = 0.9999;

// Have = enough on hand, Low = some but not enough, Missing = none. Staples always count as on hand.
function pantryStatus(row) {
  if (row.is_staple) return "Have";
  if (!row.pantry_base) return "Missing";
  return row.pantry_base >= row.qty_base * ENOUGH ? "Have" : "Low";
}

// How much to buy, in the recipe's unit: (needed - on hand) / to_base, rounded up to the hundredth.
// The 1e-6 keeps float noise from turning 2.0000000001 into 2.01.
function shortfall(row) {
  const amount = (row.qty_base - (row.pantry_base ?? 0)) / row.to_base;
  return Math.ceil(amount * 100 - 1e-6) / 100;
}

// Each of a recipe's ingredients with its status, a note for display, and the amount still needed
function checkIngredients(db, recipeId) {
  return db
    .prepare(`
      SELECT ri.ingredient_id, i.name, ri.quantity, ri.unit, ri.qty_base, u.to_base,
             p.quantity AS pantry_quantity, p.unit AS pantry_unit, p.qty_base AS pantry_base, p.is_staple
      FROM recipe_ingredients ri
      JOIN ingredients i ON i.id = ri.ingredient_id
      JOIN units u ON u.code = ri.unit
      LEFT JOIN pantry_items p ON p.ingredient_id = ri.ingredient_id
      WHERE ri.recipe_id = ?
      ORDER BY ri.rowid`)
    .all(recipeId)
    .map((row) => {
      const status = pantryStatus(row);
      let note = "";
      if (row.is_staple) note = "staple";
      else if (status === "Low") note = `have ${formatAmount(row.pantry_quantity, row.pantry_unit)}`;
      return { ...row, status, note, needed: status === "Have" ? 0 : shortfall(row) };
    });
}

// What Can I Cook?: the spec's match query.
//   1. LEFT JOIN keeps ingredients that aren't in the pantry, with NULL pantry columns.
//   2. Each ingredient scores on hand / needed, capped at 1. A staple always scores 1.
//   3. A recipe's match is the average of those scores, as a percent.
//   4. It shows 100% only when every ingredient is fully stocked, so 99.6% can't round up to 100%.
function matchRecipes(db, minMatch) {
  return db
    .prepare(`
      WITH scores AS (
        SELECT r.id, r.title, r.image_path,
               COUNT(*) AS total_ingredients,
               SUM(CASE WHEN p.is_staple = 1 OR p.qty_base >= ri.qty_base * :enough
                        THEN 1 ELSE 0 END) AS fully_stocked,
               ROUND(100.0 * SUM(
                 CASE WHEN p.is_staple = 1 THEN 1.0
                      ELSE MIN(COALESCE(p.qty_base, 0) / ri.qty_base, 1.0)
                 END) / COUNT(*)) AS rounded_pct
        FROM recipes r
        JOIN recipe_ingredients ri ON ri.recipe_id = r.id
        LEFT JOIN pantry_items p ON p.ingredient_id = ri.ingredient_id
        GROUP BY r.id
      ),
      matches AS (
        SELECT *, CASE WHEN fully_stocked = total_ingredients THEN 100
                       ELSE MIN(rounded_pct, 99) END AS match_pct
        FROM scores
      )
      SELECT id, title, image_path, total_ingredients, fully_stocked, match_pct
      FROM matches
      WHERE match_pct >= :minMatch
      ORDER BY match_pct DESC, total_ingredients ASC, title`)
    .all({ minMatch, enough: ENOUGH });
}

// Puts each shortfall on the shopping list and returns how many ingredients were short. Clicking again
// sets this recipe's unbought rows to the current shortfall instead of adding a second copy.
function addMissingToList(db, recipeId) {
  return db.transaction(() => {
    const short = checkIngredients(db, recipeId).filter((ingredient) => ingredient.status !== "Have");
    const findRow = db
      .prepare("SELECT id FROM shopping_list_items WHERE recipe_id = ? AND ingredient_id = ? AND checked = 0")
      .pluck();
    const updateRow = db.prepare("UPDATE shopping_list_items SET quantity = ?, unit = ? WHERE id = ?");
    const addRow = db.prepare(
      "INSERT INTO shopping_list_items (ingredient_id, quantity, unit, recipe_id) VALUES (?, ?, ?, ?)"
    );
    for (const { ingredient_id, needed, unit } of short) {
      const id = findRow.get(recipeId, ingredient_id);
      if (id === undefined) addRow.run(ingredient_id, needed, unit, recipeId);
      else updateRow.run(needed, unit, id);
    }
    return short.length;
  })();
}

module.exports = { checkIngredients, matchRecipes, addMissingToList };
