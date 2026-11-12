// My Pantry: add, edit, delete, expiration dates, against a seeded in-memory database
process.env.DB_PATH = ":memory:";

const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { getDb } = require("../db/db");
const { initSchema } = require("../db/init");
const { seed } = require("../db/seed");
const app = require("../server");

let server;
let baseUrl;

before(() => {
  initSchema(getDb());
  seed(getDb());
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const db = () => getDb();
const pantryCount = () => db().prepare("SELECT COUNT(*) FROM pantry_items").pluck().get();
const itemFor = (name) =>
  db()
    .prepare("SELECT p.* FROM pantry_items p JOIN ingredients i ON i.id = p.ingredient_id WHERE i.name = ?")
    .get(name);
const daysFromToday = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

async function post(path, fields) {
  const res = await fetch(baseUrl + path, { method: "POST", body: new URLSearchParams(fields), redirect: "manual" });
  return { status: res.status, location: res.headers.get("location"), html: await res.text() };
}

const getPage = async (path) => (await fetch(baseUrl + path)).text();

test("My Pantry lists items sorted by expiration date, with Soon and Expired badges", async () => {
  const html = await getPage("/pantry");
  assert.match(html, /<h1 class="h2 mb-4">My Pantry<\/h1>/);
  // seeded: spinach expires in 2 days, milk in 3, eggs in 12; spaghetti has no date (last)
  const order = ["spinach", "milk", "eggs", "spaghetti"].map((name) => html.indexOf(`<td>${name}</td>`));
  assert.ok(order.every((position, i) => position > 0 && (i === 0 || position > order[i - 1])), `order ${order}`);
  assert.match(html, /<td>spinach<\/td>(?:(?!<\/tr>)[\s\S])*Soon/);
  assert.match(html, /<td>soy sauce<\/td><td>—<\/td><td>—<\/td><td>Yes<\/td>/); // staple
  assert.match(html, /<datalist id="ingredient-names">/);
});

test("adding an item converts it to base units and shows it", async () => {
  const before = pantryCount();
  const { status, location } = await post("/pantry", {
    name: "Brown Sugar", quantity: "2", unit: "cup", expires_on: daysFromToday(30),
  });
  assert.strictEqual(status, 303);
  assert.strictEqual(location, "/pantry?notice=added");
  assert.strictEqual(pantryCount(), before + 1);
  const item = itemFor("brown sugar");
  assert.strictEqual(item.qty_base, 480);
  assert.match(await getPage(location), /Item added to your pantry\./);
});

test("adding an ingredient that's already in the pantry updates it instead of adding a row", async () => {
  const before = pantryCount();
  const { location } = await post("/pantry", { name: "Eggs", quantity: "18", unit: "each", expires_on: "" });
  assert.strictEqual(location, "/pantry?notice=merged");
  assert.strictEqual(pantryCount(), before);
  const eggs = itemFor("eggs");
  assert.strictEqual(eggs.quantity, 18);
  assert.strictEqual(eggs.expires_on, null);
});

test("a new ingredient takes its measure type from the unit, and a staple needs no quantity", async () => {
  await post("/pantry", { name: "fish sauce", quantity: "", unit: "tbsp", is_staple: "on" });
  const item = itemFor("fish sauce");
  assert.strictEqual(item.is_staple, 1);
  assert.strictEqual(item.quantity, null);
  assert.strictEqual(item.unit, null);
  assert.strictEqual(db().prepare("SELECT measure_type FROM ingredients WHERE name = 'fish sauce'").pluck().get(), "volume");
});

test("invalid items show errors, keep the values, and save nothing", async () => {
  const before = pantryCount();
  const { status, html } = await post("/pantry", { name: "", quantity: "-1", unit: "", expires_on: "2026-02-30" });
  assert.strictEqual(status, 400);
  assert.strictEqual(pantryCount(), before);
  assert.match(html, /Please fix the highlighted fields/);
  assert.match(html, /Enter an ingredient\./);
  assert.match(html, /Enter a quantity greater than 0\./);
  assert.match(html, /Choose a unit\./);
  assert.match(html, /Enter a real date\./);
  assert.match(html, /value="2026-02-30"/);
});

test("a unit that doesn't match the ingredient's measure type is rejected", async () => {
  const { status, html } = await post("/pantry", { name: "chicken breast", quantity: "2", unit: "cup" });
  assert.strictEqual(status, 400);
  assert.match(html, /Use a weight unit \(g, oz, lb, kg\)\./);
  assert.strictEqual(itemFor("chicken breast").unit, "lb"); // seeded value unchanged
});

test("a measured item needs a quantity unless it's a staple", async () => {
  const { status, html } = await post("/pantry", { name: "rolled oats", quantity: "", unit: "" });
  assert.strictEqual(status, 400);
  assert.match(html, /Enter a quantity, or mark it as a staple\./);
});

test("editing changes quantity, unit, and date, and recalculates qty_base", async () => {
  const milk = itemFor("milk");
  const { status, location } = await post(`/pantry/${milk.id}/edit`, {
    quantity: "3", unit: "cup", expires_on: daysFromToday(5),
  });
  assert.strictEqual(status, 303);
  assert.strictEqual(location, "/pantry?notice=updated");
  const updated = itemFor("milk");
  assert.strictEqual(updated.quantity, 3);
  assert.strictEqual(updated.unit, "cup");
  assert.strictEqual(updated.qty_base, 720);
  assert.strictEqual(updated.expires_on, daysFromToday(5));
});

test("an invalid edit reopens that row's form with the errors and changes nothing", async () => {
  const banana = itemFor("banana");
  const { status, html } = await post(`/pantry/${banana.id}/edit`, { quantity: "0", unit: "lb", expires_on: "" });
  assert.strictEqual(status, 400);
  assert.match(html, new RegExp(`<tr class="collapse show" id="edit-${banana.id}">`));
  assert.match(html, /Enter a quantity greater than 0\./);
  assert.match(html, /Use a count unit \(each, dozen\)\./);
  assert.deepStrictEqual(itemFor("banana"), banana);
});

test("deleting removes the item and recipe pages then show it as Missing", async () => {
  const peas = itemFor("frozen peas");
  const { status, location } = await post(`/pantry/${peas.id}/delete`, {});
  assert.strictEqual(status, 303);
  assert.strictEqual(location, "/pantry?notice=deleted");
  assert.strictEqual(itemFor("frozen peas"), undefined);

  const friedRice = db().prepare("SELECT id FROM recipes WHERE title = 'Chicken Fried Rice'").pluck().get();
  assert.match(await getPage(`/recipes/${friedRice}`), /1 cup frozen peas[\s\S]*?>Missing</);
});

test("edit and delete return 404 for items that don't exist", async () => {
  assert.strictEqual((await post("/pantry/99999/edit", { quantity: "1", unit: "cup" })).status, 404);
  assert.strictEqual((await post("/pantry/abc/delete", {})).status, 404);
});

test("the navbar and Home link to My Pantry", async () => {
  const home = await getPage("/");
  assert.match(home, /<a class="nav-link" href="\/pantry">Pantry<\/a>/);
  assert.match(home, /<a class="btn btn-outline-secondary" href="\/pantry">Open Pantry<\/a>/);
  assert.match(await getPage("/pantry"), /<a class="nav-link active" href="\/pantry" aria-current="page">Pantry<\/a>/);
});
