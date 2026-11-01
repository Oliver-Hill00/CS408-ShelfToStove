const express = require("express");
const { getDb } = require("../db/db");
const { formatAmount, formatDate } = require("../lib/format");

const router = express.Router();

// Home: stats plus pantry items that are expired or expire within 7 days
router.get("/", (req, res) => {
  const db = getDb();
  const count = (sql) => db.prepare(sql).pluck().get();

  const expiring = db
    .prepare(`
      SELECT i.name, p.quantity, p.unit, p.expires_on, p.expires_on < date('now') AS expired
      FROM pantry_items p
      JOIN ingredients i ON i.id = p.ingredient_id
      WHERE p.expires_on IS NOT NULL AND p.expires_on <= date('now', '+7 days')
      ORDER BY p.expires_on, i.name`)
    .all()
    .map((item) => ({
      name: item.name,
      amount: formatAmount(item.quantity, item.unit) || "—",
      expiresOn: formatDate(item.expires_on),
      expired: item.expired === 1,
    }));

  res.render("home", {
    recipeCount: count("SELECT COUNT(*) FROM recipes"),
    pantryCount: count("SELECT COUNT(*) FROM pantry_items"),
    shoppingCount: count("SELECT COUNT(*) FROM shopping_list_items WHERE checked = 0"),
    expiring,
  });
});

router.get("/about", (req, res) => {
  res.render("about", { title: "About" });
});

module.exports = router;
