// The two conditional retrieval pages: Recipe Search and What Can I Cook?
const express = require("express");
const { getDb } = require("../db/db");
const { checkIngredients, matchRecipes } = require("../lib/matching");

const PAGE_SIZE = 20;
const DEFAULT_MIN_MATCH = 75;

const router = express.Router();

// A repeated parameter (?q=a&q=b) arrives as an array, so only accept strings
const text = (value) => (typeof value === "string" ? value.trim() : "");

// % and _ are wildcards in LIKE, so escape them to search for those characters literally
const escapeLike = (value) => value.replace(/[\\%_]/g, "\\$&");

// A NULL filter makes its line true, which switches that filter off
const SEARCH_WHERE = `
  WHERE r.title LIKE '%' || :q || '%' ESCAPE '\\'
    AND (:category IS NULL OR r.category_id = :category)
    AND (:maxMinutes IS NULL OR (r.prep_minutes + r.cook_minutes) <= :maxMinutes)`;

// Recipe Search: /search?q=rice&category=3&max=30&page=1
router.get("/search", (req, res) => {
  const db = getDb();
  const categories = db.prepare("SELECT id, name FROM categories ORDER BY name").all();
  const values = { q: text(req.query.q), category: text(req.query.category), max: text(req.query.max) };

  const errors = {};
  if (values.q.length > 120) errors.q = "Keep the keyword under 120 characters.";
  if (values.category && !categories.some((category) => String(category.id) === values.category)) {
    errors.category = "Choose a category from the list.";
  }
  if (values.max && !/^\d{1,5}$/.test(values.max)) errors.max = "Enter a whole number of minutes, 0 or more.";

  const view = { title: "Search Recipes", categories, values, errors, recipes: [], total: 0, page: 1, totalPages: 1 };
  if (Object.keys(errors).length) return res.status(400).render("search", view);

  const filters = {
    q: escapeLike(values.q),
    category: values.category ? Number(values.category) : null,
    maxMinutes: values.max ? Number(values.max) : null,
  };
  const total = db.prepare(`SELECT COUNT(*) FROM recipes r ${SEARCH_WHERE}`).pluck().get(filters);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requested = Number.parseInt(req.query.page, 10);
  const page = Math.min(requested > 0 ? requested : 1, totalPages);

  const recipes = db
    .prepare(`
      SELECT r.id, r.title, r.image_path, c.name AS category, r.prep_minutes + r.cook_minutes AS total_minutes
      FROM recipes r
      JOIN categories c ON c.id = r.category_id
      ${SEARCH_WHERE}
      ORDER BY r.title, r.id
      LIMIT :limit OFFSET :offset`)
    .all({ ...filters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });

  // Page links have to carry the filters along
  const pageUrl = (n) => `/search?${new URLSearchParams({ ...values, page: n })}`;
  res.render("search", { ...view, recipes, total, page, totalPages, pageUrl });
});

// What Can I Cook?: /cook?min=75
router.get("/cook", (req, res) => {
  const db = getDb();
  const requested = text(req.query.min);
  const minMatch = /^\d{1,3}$/.test(requested) ? Math.min(Number(requested), 100) : DEFAULT_MIN_MATCH;

  const results = matchRecipes(db, minMatch).map((recipe) => {
    const ingredients = checkIngredients(db, recipe.id);
    return {
      ...recipe,
      missing: ingredients.filter((i) => i.status === "Missing").map((i) => i.name),
      low: ingredients.filter((i) => i.status === "Low").map((i) => `${i.name} (${i.note})`),
    };
  });

  res.render("cook", { title: "What Can I Cook?", minMatch, results });
});

module.exports = router;
