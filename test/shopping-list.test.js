// Shopping List: add, check off, delete, clear checked, against a seeded in-memory database
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
const items = () =>
  db()
    .prepare(`SELECT s.*, i.name FROM shopping_list_items s JOIN ingredients i ON i.id = s.ingredient_id ORDER BY s.id`)
    .all();
const itemFor = (name) => items().find((item) => item.name === name);

async function post(path, fields = {}) {
  const res = await fetch(baseUrl + path, { method: "POST", body: new URLSearchParams(fields), redirect: "manual" });
  return { status: res.status, location: res.headers.get("location"), html: await res.text() };
}

const getPage = async (path) => (await fetch(baseUrl + path)).text();

test("the Shopping List shows each item's amount, where it came from, and checked items struck through", async () => {
  const html = await getPage("/shopping-list");
  assert.match(html, /<h1 class="h2 mb-4">Shopping List<\/h1>/);
  assert.match(html, /frozen peas<\/span><span class="ms-2">½ cup<\/span>[\s\S]*?From: <a class="link-secondary" href="\/recipes\/\d+">Chicken Fried Rice<\/a>/);
  assert.match(html, /banana<\/span><span class="ms-2">6<\/span>[\s\S]*?Added manually/);
  assert.match(html, /text-decoration-line-through[^>]*><span class="fw-semibold">plain yogurt/);
  assert.match(html, /aria-label="Mark banana as bought"/);
  assert.match(html, /aria-label="Mark plain yogurt as not bought"/);
});

test("adding an item by hand puts it on the list", async () => {
  const before = items().length;
  const { status, location } = await post("/shopping-list", { name: "Rolled Oats", quantity: "2", unit: "cup" });
  assert.strictEqual(status, 303);
  assert.strictEqual(location, "/shopping-list?notice=added");
  assert.strictEqual(items().length, before + 1);
  const oats = itemFor("rolled oats");
  assert.deepStrictEqual([oats.quantity, oats.unit, oats.recipe_id, oats.checked], [2, "cup", null, 0]);
  assert.match(await getPage(location), /Added to your shopping list\./);
});

test("quantity and unit are optional for a known ingredient", async () => {
  await post("/shopping-list", { name: "lime" });
  const lime = itemFor("lime");
  assert.deepStrictEqual([lime.quantity, lime.unit], [null, null]);
});

test("adding the same unbought item with the same unit increases its quantity", async () => {
  const before = items().length;
  const { location } = await post("/shopping-list", { name: "banana", quantity: "2", unit: "each" });
  assert.strictEqual(location, "/shopping-list?notice=merged");
  assert.strictEqual(items().length, before);
  assert.strictEqual(itemFor("banana").quantity, 8);
});

test("invalid items show errors and save nothing", async () => {
  const before = items().length;
  const empty = await post("/shopping-list", { name: "", quantity: "2", unit: "" });
  assert.strictEqual(empty.status, 400);
  assert.match(empty.html, /Enter an item\./);
  assert.match(empty.html, /Choose a unit\./);

  const wrongUnit = await post("/shopping-list", { name: "ground beef", quantity: "1", unit: "cup" });
  assert.match(wrongUnit.html, /Use a weight unit/);

  const noQuantity = await post("/shopping-list", { name: "salsa", quantity: "", unit: "cup" });
  assert.match(noQuantity.html, /Enter a quantity for this unit\./);

  const newWithoutUnit = await post("/shopping-list", { name: "dragon fruit" });
  assert.match(newWithoutUnit.html, /Choose a unit so this new item can be measured\./);
  assert.match(newWithoutUnit.html, /value="dragon fruit"/);
  assert.strictEqual(items().length, before);
});

test("checking an item off toggles it, and toggling again unchecks it", async () => {
  const banana = itemFor("banana");
  const { status, location } = await post(`/shopping-list/${banana.id}/toggle`);
  assert.strictEqual(status, 303);
  assert.strictEqual(location, "/shopping-list");
  assert.strictEqual(itemFor("banana").checked, 1);
  await post(`/shopping-list/${banana.id}/toggle`);
  assert.strictEqual(itemFor("banana").checked, 0);
});

test("deleting removes one item", async () => {
  const lime = itemFor("lime");
  const { location } = await post(`/shopping-list/${lime.id}/delete`);
  assert.strictEqual(location, "/shopping-list?notice=deleted");
  assert.strictEqual(itemFor("lime"), undefined);
});

test("Clear Checked Items removes only checked items", async () => {
  const banana = itemFor("banana");
  await post(`/shopping-list/${banana.id}/toggle`);
  const unchecked = items().filter((item) => !item.checked).map((item) => item.id);

  const { location } = await post("/shopping-list/clear-checked");
  assert.strictEqual(location, "/shopping-list?notice=cleared");
  assert.deepStrictEqual(items().map((item) => item.id), unchecked);
  assert.match(await getPage("/shopping-list"), /<button class="btn btn-outline-secondary" type="submit" disabled>Clear Checked Items/);
});

test("toggle and delete return 404 for items that don't exist", async () => {
  assert.strictEqual((await post("/shopping-list/99999/toggle")).status, 404);
  assert.strictEqual((await post("/shopping-list/abc/delete")).status, 404);
});

test("the navbar and Home link to the Shopping List", async () => {
  const home = await getPage("/");
  assert.match(home, /<a class="nav-link" href="\/shopping-list">Shopping List<\/a>/);
  assert.match(home, /<a class="btn btn-outline-secondary" href="\/shopping-list">Open List<\/a>/);
});
