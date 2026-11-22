// Every page runs against a seeded in-memory database, so real data is never touched
const assert = require("node:assert");
const { getDb } = require("../db/db");
const { formatQuantity, formatIngredient } = require("../lib/format");
const { useSeededDatabase, get } = require("./helpers");

useSeededDatabase();

const getPage = get;

const recipeId = (title) => getDb().prepare("SELECT id FROM recipes WHERE title = ?").pluck().get(title);

const GET_ROUTES = [
  "/", "/recipes", "/recipes?page=2", "/recipes/new", "/recipes/1", "/recipes/1/edit",
  "/search", "/cook", "/pantry", "/shopping-list", "/about",
];

for (const path of GET_ROUTES) {
  test(`GET ${path} returns 200 with the shared navbar and footer`, async () => {
    const { status, html } = await getPage(path);
    assert.strictEqual(status, 200);
    assert.match(html, /<nav class="navbar/);
    assert.match(html, /<footer/);
  });
}

test("the navbar links to every page, with none disabled", async () => {
  const { html } = await getPage("/");
  for (const path of ["/", "/recipes", "/search", "/cook", "/pantry", "/shopping-list", "/about"]) {
    expect(html).toMatch(new RegExp(`<a class="nav-link( active)?" href="${path}"`));
  }
  expect(html).not.toContain("nav-link disabled");
  expect(html).toContain("<a class=\"btn btn-light btn-lg\" href=\"/cook\">");
});

test("Home shows counts and expiring items from the database", async () => {
  const { html } = await getPage("/");
  assert.match(html, /Welcome to Shelf-To-Stove/);
  assert.match(html, /15 recipes saved/);
  assert.match(html, /24 items in your pantry/);
  assert.match(html, /3 items to buy/); // the seeded checked item is not counted
  assert.match(html, /<td>spinach<\/td>/); // seeded to expire in 2 days
  assert.doesNotMatch(html, /<td>spaghetti<\/td>/); // no expiration date
});

test("Browse Recipes shows 12 per page and pages through all 15", async () => {
  const cards = (html) => (html.match(/View Recipe/g) || []).length;
  const first = await getPage("/recipes");
  const second = await getPage("/recipes?page=2");
  assert.strictEqual(cards(first.html), 12);
  assert.strictEqual(cards(second.html), 3);
  assert.match(first.html, /Banana Peanut Butter Oatmeal/);
  assert.match(second.html, /Tomato Basil Soup/);
});

test("Browse Recipes handles bad page numbers", async () => {
  for (const path of ["/recipes?page=abc", "/recipes?page=-1", "/recipes?page=0"]) {
    assert.match((await getPage(path)).html, /aria-current="page">1</);
  }
  assert.match((await getPage("/recipes?page=99")).html, /aria-current="page">2</);
});

test("Recipe Detail shows ingredients marked Have, Low, and Missing", async () => {
  const { status, html } = await getPage(`/recipes/${recipeId("Chicken Fried Rice")}`);
  assert.strictEqual(status, 200);
  assert.match(html, /3 cups cooked rice[\s\S]*?>Have</);
  assert.match(html, /1 cup frozen peas[\s\S]*?have ½ cup[\s\S]*?>Low</);
  assert.match(html, /3 green onions[\s\S]*?>Missing</);
  assert.match(html, /3 tbsp soy sauce[\s\S]*?staple[\s\S]*?>Have</);
  assert.match(html, /Scramble the eggs/);
});

test("Recipe Detail escapes text from the database", async () => {
  const db = getDb();
  const { lastInsertRowid } = db
    .prepare("INSERT INTO recipes (title, instructions, prep_minutes, cook_minutes, servings, category_id) VALUES (?, 'Step', 1, 1, 1, 1)")
    .run("<script>alert(1)</script>");
  const { html } = await getPage(`/recipes/${lastInsertRowid}`);
  assert.doesNotMatch(html, /<script>alert/);
  db.prepare("DELETE FROM recipes WHERE id = ?").run(lastInsertRowid);
});

test("Add Recipe form renders with categories, units, ingredient rows, and autocomplete", async () => {
  const { status, html } = await getPage("/recipes/new");
  assert.strictEqual(status, 200);
  assert.match(html, /<form id="recipe-form" method="post" action="\/recipes" enctype="multipart\/form-data"/);
  assert.match(html, /<option value="\d+">Breakfast<\/option>/);
  assert.match(html, /<optgroup label="Weight" data-measure="weight">/);
  assert.match(html, /<option value="tbsp">tbsp \(tablespoon\)<\/option>/);
  assert.strictEqual((html.match(/class="row g-2 align-items-start mb-2 ingredient-row"/g) || []).length, 4); // 3 rows + template
  assert.match(html, /name="ingredients\[2\]\[quantity\]"/);
  assert.match(html, /<option value="cooked rice" data-measure="volume">/);
  assert.match(html, /<script src="\/js\/recipe-form.js">/);
  assert.doesNotMatch(html, /Delete Recipe/);
});

test("Unknown pages and recipes return the 404 page in the shared layout", async () => {
  for (const path of ["/nope", "/recipes/9999", "/recipes/abc"]) {
    const { status, html } = await getPage(path);
    assert.strictEqual(status, 404);
    assert.match(html, /<nav class="navbar/);
  }
});

test("Quantities format as fractions and plurals", () => {
  assert.strictEqual(formatQuantity(1.5), "1½");
  assert.strictEqual(formatQuantity(0.25), "¼");
  assert.strictEqual(formatQuantity(2), "2");
  assert.strictEqual(formatIngredient(2, "cup", "milk"), "2 cups milk");
  assert.strictEqual(formatIngredient(1, "cup", "milk"), "1 cup milk");
  assert.strictEqual(formatIngredient(2, "each", "tomato"), "2 tomatoes");
  assert.strictEqual(formatIngredient(0.5, "each", "red onion"), "½ red onion");
  assert.strictEqual(formatIngredient(2, "each", "eggs"), "2 eggs");
});
