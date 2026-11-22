// Unit conversion, as it affects Have / Low, match percentages, and saved quantities
const { getDb } = require("../db/db");
const { seed } = require("../db/seed");
const { useSeededDatabase, get, post, postMultipart, addRecipe, matchResults } = require("./helpers");

useSeededDatabase();
beforeEach(() => seed(getDb(), { force: true }));

test.each([
  ["milk", [48, "tsp"], [1, "cup"]],
  ["milk", [1, "L"], [1000, "mL"]],
  ["chicken breast", [1, "lb"], [16, "oz"]], // 453.59 g vs 453.6 g with the rounded factors
  ["chicken breast", [16, "oz"], [1, "lb"]],
  ["chicken breast", [1, "kg"], [1000, "g"]],
  ["eggs", [1, "dozen"], [12, "each"]],
])("%s: having %j fully covers needing %j", async (name, [haveQty, haveUnit], [needQty, needUnit]) => {
  const id = addRecipe("Conversion Check", [[name, needQty, needUnit]]);
  await post("/pantry", { name, quantity: String(haveQty), unit: haveUnit });

  const detail = (await get(`/recipes/${id}`)).html;
  expect(detail).toContain(">Have</span>");
  expect(detail).not.toContain(">Low</span>");
  expect(matchResults((await get("/cook?min=100")).html)).toContainEqual({ title: "Conversion Check", pct: 100 });
});

test("a little short is still Low: 47 tsp doesn't cover 1 cup", async () => {
  const id = addRecipe("Conversion Check", [["milk", 1, "cup"]]);
  await post("/pantry", { name: "milk", quantity: "47", unit: "tsp" });
  expect((await get(`/recipes/${id}`)).html).toContain(">Low</span>");
});

test("1 lb converts to 453.59 g", () => {
  const id = addRecipe("One Pound", [["chicken breast", 1, "lb"]]);
  expect(getDb().prepare("SELECT qty_base FROM recipe_ingredients WHERE recipe_id = ?").pluck().get(id)).toBe(453.59);
});

test("qty_base is recalculated when a recipe quantity is edited", async () => {
  const id = addRecipe("Edit Amount", [["milk", 1, "cup"]]);
  const { status } = await postMultipart(`/recipes/${id}/edit`, [
    ["title", "Edit Amount"], ["category_id", "1"], ["description", ""], ["prep_minutes", "1"], ["cook_minutes", "1"],
    ["servings", "1"], ["instructions", "Pour."],
    ["ingredients[0][name]", "milk"], ["ingredients[0][quantity]", "4"], ["ingredients[0][unit]", "tbsp"],
  ]);
  expect(status).toBe(303);
  expect(getDb().prepare("SELECT qty_base FROM recipe_ingredients WHERE recipe_id = ?").pluck().get(id)).toBe(60);
});

test("an accented name in capitals still has its unit checked", async () => {
  expect((await post("/pantry", { name: "jalapeño", quantity: "2", unit: "each" })).status).toBe(303);
  for (const path of ["/pantry", "/shopping-list"]) {
    const { status, html } = await post(path, { name: "JALAPEÑO", quantity: "1", unit: "cup" });
    expect(status).toBe(400);
    expect(html).toContain("Use a count unit");
  }
});
