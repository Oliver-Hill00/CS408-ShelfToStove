// Shared by the test files. Supertest takes the Express app and handles a throwaway port itself,
// so tests never call app.listen() or need the site to be running.
const request = require("supertest");
const { getDb } = require("../db/db");
const { initSchema } = require("../db/init");
const { seed } = require("../db/seed");
const app = require("../server");

// Jest gives each test file fresh modules, so each file gets its own seeded database
function useSeededDatabase() {
  beforeAll(() => {
    const db = getDb();
    // seed --force and db:reset erase data, so refuse to run against anything but the test database
    if (!db.memory) throw new Error(`Tests need an in-memory database, not ${db.name}`);
    initSchema(db);
    seed(db);
  });
  afterAll(() => getDb().close());
}

const result = (res) => ({ status: res.status, location: res.headers.location ?? null, html: res.text });

const get = async (path) => result(await request(app).get(path));

// A plain HTML form post (pantry, shopping list, buttons)
const post = async (path, fields = {}) => result(await request(app).post(path).type("form").send(fields));

// A multipart form post (recipe forms). parts is [[name, value], ...]
async function postMultipart(path, parts, photo = null) {
  const req = request(app).post(path);
  for (const [name, value] of parts) req.field(name, value);
  if (photo) req.attach("photo", photo.bytes, { filename: photo.name, contentType: photo.type });
  return result(await req);
}

// Adds a 10-minute recipe directly. ingredients is [[name, quantity, unit], ...] using seeded names
function addRecipe(title, ingredients) {
  const db = getDb();
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO recipes (title, instructions, prep_minutes, cook_minutes, servings, category_id)
              VALUES (?, 'Cook it.', 5, 5, 1, 1)`)
    .run(title);
  const addRow = db.prepare(`
    INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, qty_base)
    SELECT ?, i.id, ?, u.code, ? * u.to_base FROM ingredients i, units u WHERE i.name = ? AND u.code = ?`);
  for (const [name, quantity, unit] of ingredients) {
    if (!addRow.run(lastInsertRowid, quantity, quantity, name, unit).changes) throw new Error(`Unknown ${name} or ${unit}`);
  }
  return lastInsertRowid;
}

const emptyPantry = () => getDb().prepare("DELETE FROM pantry_items").run();

const decode = (html) =>
  html.replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// The recipe titles in a Search or What Can I Cook? results list, in page order
const resultTitles = (html) => [...html.matchAll(/<h2 class="h5 mb-1">(.*?)<\/h2>/g)].map((match) => decode(match[1]));

// [{ title, pct }] from What Can I Cook?
function matchResults(html) {
  const percents = [...html.matchAll(/match-pct">(\d+)%</g)].map((match) => Number(match[1]));
  return resultTitles(html).map((title, i) => ({ title, pct: percents[i] }));
}

module.exports = { useSeededDatabase, get, post, postMultipart, addRecipe, emptyPantry, resultTitles, matchResults };
