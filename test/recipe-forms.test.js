// Add Recipe form submissions, against a seeded in-memory database
process.env.DB_PATH = ":memory:";

const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { getDb } = require("../db/db");
const { initSchema } = require("../db/init");
const { seed } = require("../db/seed");
const app = require("../server");

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const savedPhotos = [];

let server;
let baseUrl;

before(() => {
  const db = getDb();
  initSchema(db);
  seed(db);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  for (const imagePath of savedPhotos) fs.rmSync(path.join(__dirname, "..", "public", imagePath), { force: true });
});

const db = () => getDb();
const recipeCount = () => db().prepare("SELECT COUNT(*) FROM recipes").pluck().get();
const dinnerId = () => db().prepare("SELECT id FROM categories WHERE name = 'Dinner'").pluck().get();

// Builds the multipart body the real form sends
function recipeForm(fields = {}, ingredients = [], photo = null) {
  const form = new FormData();
  const values = {
    title: "Garlic Butter Noodles", category_id: String(dinnerId()), description: "Fast and cheap.",
    prep_minutes: "5", cook_minutes: "10", servings: "2", instructions: "Boil noodles.\nToss with butter and garlic.",
    ...fields,
  };
  for (const [name, value] of Object.entries(values)) form.append(name, value);
  ingredients.forEach((row, i) => {
    for (const [field, value] of Object.entries(row)) form.append(`ingredients[${i}][${field}]`, value);
  });
  if (photo) form.append("photo", new Blob([photo.bytes], { type: photo.type }), photo.name);
  return form;
}

async function submit(form, url = "/recipes") {
  const res = await fetch(baseUrl + url, { method: "POST", body: form, redirect: "manual" });
  return { status: res.status, location: res.headers.get("location"), html: await res.text() };
}

// Creates a recipe through the form and returns its id
async function createRecipe(fields = {}, rows = goodRowsForCreate(), photo = null) {
  const { location } = await submit(recipeForm(fields, rows, photo));
  return Number(location.match(/\d+/)[0]);
}

function goodRowsForCreate() {
  return [
    { name: "spaghetti", quantity: "8", unit: "oz" },
    { name: "butter", quantity: "3", unit: "tbsp" },
  ];
}

const recipeRow = (id) => db().prepare("SELECT * FROM recipes WHERE id = ?").get(id);
const ingredientNames = (id) =>
  db()
    .prepare(`SELECT i.name FROM recipe_ingredients ri JOIN ingredients i ON i.id = ri.ingredient_id
              WHERE ri.recipe_id = ? ORDER BY ri.rowid`)
    .pluck()
    .all(id);
const photoFile = (imagePath) => path.join(__dirname, "..", "public", imagePath);

const goodRows = [
  { name: "spaghetti", quantity: "8", unit: "oz" },
  { name: "Butter", quantity: "3", unit: "tbsp" },
  { name: "garlic clove", quantity: "4", unit: "each" },
];

test("a valid recipe is saved with its ingredients and redirects to its page", async () => {
  const before = recipeCount();
  const { status, location } = await submit(recipeForm({}, goodRows));
  assert.strictEqual(status, 303);
  assert.match(location, /^\/recipes\/\d+\?saved=1$/);
  assert.strictEqual(recipeCount(), before + 1);

  const id = Number(location.match(/\d+/)[0]);
  const rows = db()
    .prepare(`SELECT i.name, ri.quantity, ri.unit, ri.qty_base FROM recipe_ingredients ri
              JOIN ingredients i ON i.id = ri.ingredient_id WHERE ri.recipe_id = ? ORDER BY ri.rowid`)
    .all(id);
  assert.deepStrictEqual(rows.map((r) => r.name), ["spaghetti", "butter", "garlic clove"]); // "Butter" matched the existing ingredient
  assert.strictEqual(rows[0].qty_base, 8 * 28.35);
  assert.strictEqual(rows[1].qty_base, 45);

  const page = await (await fetch(baseUrl + location)).text();
  assert.match(page, /Recipe saved\./);
  assert.match(page, /Garlic Butter Noodles/);
});

test("blank and removed rows are skipped, and a new ingredient takes the unit's measure type", async () => {
  const form = recipeForm({ title: "Rice Bowl" });
  form.append("ingredients[0][name]", "cooked rice");
  form.append("ingredients[0][quantity]", "1.5");
  form.append("ingredients[0][unit]", "cup");
  form.append("ingredients[3][name]", "Furikake  Seasoning"); // a gap, as if rows 1-2 were removed
  form.append("ingredients[3][quantity]", "1");
  form.append("ingredients[3][unit]", "tbsp");
  form.append("ingredients[4][name]", ""); // left blank
  form.append("ingredients[4][quantity]", "");
  form.append("ingredients[4][unit]", "");

  const { status } = await submit(form);
  assert.strictEqual(status, 303);
  const added = db().prepare("SELECT name, measure_type FROM ingredients WHERE name = 'furikake seasoning'").get();
  assert.deepStrictEqual({ ...added }, { name: "furikake seasoning", measure_type: "volume" });
});

test("invalid input re-renders the form with errors, keeps the values, and saves nothing", async () => {
  const before = recipeCount();
  const { status, html } = await submit(
    recipeForm({ title: "  ", prep_minutes: "-5", servings: "0", category_id: "" }, [{ name: "My Typed Thing", quantity: "", unit: "" }])
  );
  assert.strictEqual(status, 400);
  assert.strictEqual(recipeCount(), before);
  assert.match(html, /Please fix the highlighted fields/);
  assert.match(html, /Enter a title\./);
  assert.match(html, /Choose a category\./);
  assert.match(html, /Prep time must be a whole number of minutes, 0 or more\./);
  assert.match(html, /Servings must be a whole number from 1 to 100\./);
  assert.match(html, /Enter a quantity greater than 0\./);
  assert.match(html, /Choose a unit\./);
  assert.match(html, /value="My Typed Thing"/); // kept what the user typed
  assert.match(html, /Toss with butter and garlic\./);
});

test("a recipe needs at least one ingredient", async () => {
  const { status, html } = await submit(recipeForm({}, []));
  assert.strictEqual(status, 400);
  assert.match(html, /Add at least one ingredient\./);
});

test("a known ingredient must use a unit of its measure type, and can't be listed twice", async () => {
  const { status, html } = await submit(
    recipeForm({}, [
      { name: "chicken breast", quantity: "2", unit: "cup" },
      { name: "eggs", quantity: "2", unit: "each" },
      { name: "Eggs", quantity: "1", unit: "each" },
    ])
  );
  assert.strictEqual(status, 400);
  assert.match(html, /Use a weight unit \(g, oz, lb, kg\)\./);
  assert.match(html, /This ingredient is already listed\./);
  // Errors land on the right rows
  assert.match(html, /class="form-select ingredient-unit is-invalid" id="ingredient-0-unit"/);
  assert.match(html, /class="form-control ingredient-name is-invalid" id="ingredient-2-name"/);
  assert.doesNotMatch(html, /class="form-control ingredient-name is-invalid" id="ingredient-1-name"/);
});

test("a JPG or PNG photo is stored in public/uploads", async () => {
  const { status, location } = await submit(
    recipeForm({ title: "Photo Recipe" }, goodRows, { bytes: PNG_BYTES, type: "image/png", name: "dish.png" })
  );
  assert.strictEqual(status, 303);
  const imagePath = db().prepare("SELECT image_path FROM recipes WHERE id = ?").pluck().get(Number(location.match(/\d+/)[0]));
  savedPhotos.push(imagePath);
  assert.match(imagePath, /^\/uploads\/[0-9a-f-]{36}\.png$/);
  assert.ok(fs.existsSync(path.join(__dirname, "..", "public", imagePath)));
});

test("photos that are not JPG/PNG or are over 2 MB are rejected", async () => {
  const before = recipeCount();
  const fake = await submit(recipeForm({}, goodRows, { bytes: Buffer.from("not an image"), type: "image/png", name: "fake.png" }));
  assert.strictEqual(fake.status, 400);
  assert.match(fake.html, /Photo must be a JPG or PNG image\./);

  const big = Buffer.concat([PNG_BYTES, Buffer.alloc(2 * 1024 * 1024)]);
  const tooBig = await submit(recipeForm({}, goodRows, { bytes: big, type: "image/png", name: "big.png" }));
  assert.strictEqual(tooBig.status, 400);
  assert.match(tooBig.html, /Photo must be under 2 MB\./);
  assert.strictEqual(recipeCount(), before);
});

test("Edit Recipe form is pre-filled with the recipe and its ingredients", async () => {
  const id = await createRecipe({ title: "Edit Me" });
  const res = await fetch(`${baseUrl}/recipes/${id}/edit`);
  const html = await res.text();
  assert.strictEqual(res.status, 200);
  assert.match(html, /<h1 class="h2 mb-4">Edit Recipe<\/h1>/);
  assert.match(html, new RegExp(`action="/recipes/${id}/edit"`));
  assert.match(html, /value="Edit Me"/);
  assert.match(html, /name="ingredients\[1\]\[name\]" value="butter"/);
  assert.match(html, /<option value="oz" selected="selected">/);
  assert.match(html, /Save Changes/);
  assert.match(html, /Delete Recipe/);
});

test("saving the Edit form updates the recipe and replaces its ingredients", async () => {
  const id = await createRecipe({ title: "Before Edit" });
  const { status, location } = await submit(
    recipeForm({ title: "After Edit", servings: "6" }, [
      { name: "elbow macaroni", quantity: "1", unit: "lb" },
      { name: "shredded cheddar", quantity: "2", unit: "cup" },
      { name: "milk", quantity: "1", unit: "cup" },
    ]),
    `/recipes/${id}/edit`
  );
  assert.strictEqual(status, 303);
  assert.strictEqual(location, `/recipes/${id}?saved=1`);
  const recipe = recipeRow(id);
  assert.strictEqual(recipe.title, "After Edit");
  assert.strictEqual(recipe.servings, 6);
  assert.deepStrictEqual(ingredientNames(id), ["elbow macaroni", "shredded cheddar", "milk"]);
});

test("invalid edits show errors and change nothing", async () => {
  const id = await createRecipe({ title: "Keep Me" });
  const { status, html } = await submit(recipeForm({ title: "", cook_minutes: "abc" }, []), `/recipes/${id}/edit`);
  assert.strictEqual(status, 400);
  assert.match(html, /Enter a title\./);
  assert.match(html, /Cook time must be a whole number of minutes, 0 or more\./);
  assert.match(html, /Add at least one ingredient\./);
  assert.match(html, new RegExp(`action="/recipes/${id}/delete"`)); // still the Edit form
  assert.strictEqual(recipeRow(id).title, "Keep Me");
  assert.deepStrictEqual(ingredientNames(id), ["spaghetti", "butter"]);
});

test("editing keeps the photo when none is chosen, and replacing it removes the old file", async () => {
  const id = await createRecipe({ title: "Photo Swap" }, goodRowsForCreate(), { bytes: PNG_BYTES, type: "image/png", name: "a.png" });
  const firstPhoto = recipeRow(id).image_path;
  savedPhotos.push(firstPhoto);

  await submit(recipeForm({ title: "Photo Swap 2" }, goodRowsForCreate()), `/recipes/${id}/edit`);
  assert.strictEqual(recipeRow(id).image_path, firstPhoto);

  const JPG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  await submit(recipeForm({}, goodRowsForCreate(), { bytes: JPG_BYTES, type: "image/jpeg", name: "b.jpg" }), `/recipes/${id}/edit`);
  const secondPhoto = recipeRow(id).image_path;
  savedPhotos.push(secondPhoto);
  assert.match(secondPhoto, /\.jpg$/);
  assert.ok(fs.existsSync(photoFile(secondPhoto)));
  assert.ok(!fs.existsSync(photoFile(firstPhoto)));
});

test("deleting a recipe removes it, its ingredient rows, and its photo, and keeps shopping list items", async () => {
  const id = await createRecipe({ title: "Delete Me" }, goodRowsForCreate(), { bytes: PNG_BYTES, type: "image/png", name: "c.png" });
  const photo = recipeRow(id).image_path;
  savedPhotos.push(photo);
  const spaghettiId = db().prepare("SELECT id FROM ingredients WHERE name = 'spaghetti'").pluck().get();
  const { lastInsertRowid: itemId } = db()
    .prepare("INSERT INTO shopping_list_items (ingredient_id, quantity, unit, recipe_id) VALUES (?, 1, 'lb', ?)")
    .run(spaghettiId, id);

  const res = await fetch(`${baseUrl}/recipes/${id}/delete`, { method: "POST", redirect: "manual" });
  assert.strictEqual(res.status, 303);
  assert.strictEqual(res.headers.get("location"), "/recipes?deleted=1");
  assert.strictEqual(recipeRow(id), undefined);
  assert.deepStrictEqual(ingredientNames(id), []);
  assert.ok(!fs.existsSync(photoFile(photo)));
  assert.strictEqual(db().prepare("SELECT recipe_id FROM shopping_list_items WHERE id = ?").pluck().get(itemId), null);

  const list = await (await fetch(`${baseUrl}/recipes?deleted=1`)).text();
  assert.match(list, /Recipe deleted\./);
});

test("Recipe Detail links to Edit and has a Delete button that asks first", async () => {
  const id = await createRecipe({ title: "Has Buttons" });
  const html = await (await fetch(`${baseUrl}/recipes/${id}`)).text();
  assert.match(html, new RegExp(`<a class="btn btn-outline-secondary" href="/recipes/${id}/edit">Edit</a>`));
  assert.match(html, new RegExp(`<form method="post" action="/recipes/${id}/delete" data-confirm="Delete this recipe\\? This can't be undone\\.">`));
  assert.match(html, /<script src="\/js\/confirm.js">/);
});

test("Edit and Delete return 404 for recipes that don't exist", async () => {
  assert.strictEqual((await fetch(`${baseUrl}/recipes/99999/edit`)).status, 404);
  assert.strictEqual((await fetch(`${baseUrl}/recipes/abc/edit`)).status, 404);
  assert.strictEqual((await submit(recipeForm({}, goodRowsForCreate()), "/recipes/99999/edit")).status, 404);
  assert.strictEqual((await fetch(`${baseUrl}/recipes/99999/delete`, { method: "POST" })).status, 404);
});

test("Browse Recipes links to the Add Recipe form", async () => {
  const html = await (await fetch(`${baseUrl}/recipes`)).text();
  assert.match(html, /<a class="btn btn-outline-secondary" href="\/recipes\/new">\+ Add Recipe<\/a>/);
});
