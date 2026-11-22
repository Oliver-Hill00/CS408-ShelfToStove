// Add Missing to Shopping List: adds only the shortfall, and only once
const { getDb } = require("../db/db");
const { seed } = require("../db/seed");
const { useSeededDatabase, get, post, addRecipe, emptyPantry } = require("./helpers");

useSeededDatabase();
beforeEach(() => {
  seed(getDb(), { force: true });
  getDb().prepare("DELETE FROM shopping_list_items").run();
});

const stock = (name, quantity, unit) => post("/pantry", { name, quantity: String(quantity), unit });
const addMissing = (id) => post(`/recipes/${id}/add-missing`);
const list = () =>
  getDb()
    .prepare(`SELECT i.name, s.quantity, s.unit, s.recipe_id, s.checked
              FROM shopping_list_items s JOIN ingredients i ON i.id = s.ingredient_id ORDER BY s.id`)
    .all();
const friedRiceId = () => getDb().prepare("SELECT id FROM recipes WHERE title = 'Chicken Fried Rice'").pluck().get();

test("needs 3 cups, has 1 cup: the list gets 2 cups", async () => {
  const id = addRecipe("Just Rice", [["cooked rice", 3, "cup"]]);
  await stock("cooked rice", 1, "cup");
  const { status, location } = await addMissing(id);
  expect(status).toBe(303);
  expect(location).toBe("/shopping-list?notice=shortfall");
  expect(list()).toEqual([{ name: "cooked rice", quantity: 2, unit: "cup", recipe_id: id, checked: 0 }]);
});

test("a missing ingredient gets the full amount, and stocked ones and staples are skipped", async () => {
  const id = friedRiceId();
  await addMissing(id);
  expect(list()).toEqual([
    { name: "frozen peas", quantity: 0.5, unit: "cup", recipe_id: id, checked: 0 },
    { name: "green onion", quantity: 3, unit: "each", recipe_id: id, checked: 0 },
  ]);
});

test("a shortfall across different units is given in the recipe's unit", async () => {
  const id = addRecipe("Cup of Milk", [["milk", 1, "cup"]]);
  await stock("milk", 12, "tbsp"); // 180 of the 240 mL
  await addMissing(id);
  expect(list()).toMatchObject([{ name: "milk", quantity: 0.25, unit: "cup" }]);
});

test("an awkward shortfall rounds up, so you never buy too little", async () => {
  const id = addRecipe("Cup of Milk", [["milk", 1, "cup"]]);
  await stock("milk", 1, "tbsp"); // 225 mL short is 0.9375 cup
  await addMissing(id);
  expect(list()).toMatchObject([{ quantity: 0.94 }]);
});

test("float noise doesn't round 1.1 up to 1.11", async () => {
  // (288 mL - 24 mL) / 240 * 100 comes out as 110.00000000000001 in floating point
  const id = addRecipe("Float Rice", [["cooked rice", 1.2, "cup"]]);
  await stock("cooked rice", 0.1, "cup");
  await addMissing(id);
  expect(list()).toMatchObject([{ quantity: 1.1 }]);
});

test("clicking twice doesn't duplicate or double anything", async () => {
  await addMissing(friedRiceId());
  const once = list();
  await addMissing(friedRiceId());
  expect(list()).toEqual(once);
});

test("clicking again after the pantry changes updates the shortfall", async () => {
  const id = addRecipe("Just Rice", [["cooked rice", 3, "cup"]]);
  emptyPantry();
  await addMissing(id);
  await stock("cooked rice", 2, "cup");
  await addMissing(id);
  expect(list()).toMatchObject([{ quantity: 1 }]);
});

test("an item already checked off is left alone", async () => {
  const id = addRecipe("Just Limes", [["lime", 2, "each"]]);
  await addMissing(id);
  getDb().prepare("UPDATE shopping_list_items SET checked = 1").run();
  await addMissing(id);
  expect(list()).toMatchObject([{ checked: 1, quantity: 2 }, { checked: 0, quantity: 2 }]);
});

test("items added by hand and by Add Missing don't overwrite each other", async () => {
  const id = addRecipe("Just Limes", [["lime", 2, "each"]]);
  await addMissing(id);
  await post("/shopping-list", { name: "lime", quantity: "5", unit: "each" });
  await addMissing(id);
  expect(list()).toMatchObject([{ quantity: 2, recipe_id: id }, { quantity: 5, recipe_id: null }]);
});

test("two recipes each keep their own row", async () => {
  const first = addRecipe("Two Limes", [["lime", 2, "each"]]);
  const second = addRecipe("Three Limes", [["lime", 3, "each"]]);
  await addMissing(first);
  await addMissing(second);
  expect(list()).toMatchObject([{ recipe_id: first, quantity: 2 }, { recipe_id: second, quantity: 3 }]);
});

test("a fully stocked recipe adds nothing and says so", async () => {
  const id = addRecipe("Just Eggs", [["eggs", 2, "each"]]);
  const { location } = await addMissing(id);
  expect(location).toBe("/shopping-list?notice=stocked");
  expect(list()).toEqual([]);
  expect((await get(location)).html).toContain("Your pantry already has everything for that recipe.");
});

test("the recipe page's button is enabled only when something is short", async () => {
  const stocked = addRecipe("Just Eggs", [["eggs", 2, "each"]]);
  const button = async (id) => (await get(`/recipes/${id}`)).html.match(/<button[^>]*>Add Missing to Shopping List/)[0];
  expect(await button(stocked)).toContain("disabled");
  expect(await button(friedRiceId())).not.toContain("disabled");
});

test("missing or invalid recipe ids return 404", async () => {
  for (const id of ["99999", "abc"]) expect((await addMissing(id)).status).toBe(404);
  expect(list()).toEqual([]);
});
