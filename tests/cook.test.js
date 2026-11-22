// What Can I Cook?: match percentages, the minimum filter, ranking, and Missing / Low lists
const { getDb } = require("../db/db");
const { seed } = require("../db/seed");
const { useSeededDatabase, get, post, addRecipe, emptyPantry, resultTitles, matchResults } = require("./helpers");

useSeededDatabase();
beforeEach(() => seed(getDb(), { force: true }));

const cook = async (min = 0) => (await get(`/cook?min=${min}`)).html;
const matchOf = async (title) => matchResults(await cook()).find((result) => result.title === title).pct;
const stock = (name, quantity, unit) => post("/pantry", { name, quantity: String(quantity), unit });

// The expected ranking, worked out in plain JavaScript so it doesn't share the route's SQL
function expectedMatches() {
  const db = getDb();
  const pantry = new Map(db.prepare("SELECT * FROM pantry_items").all().map((p) => [p.ingredient_id, p]));
  return db
    .prepare("SELECT id, title FROM recipes")
    .all()
    .map(({ id, title }) => {
      const needs = db.prepare("SELECT * FROM recipe_ingredients WHERE recipe_id = ?").all(id);
      const scores = needs.map((need) => {
        const have = pantry.get(need.ingredient_id);
        if (!have) return 0;
        return have.is_staple ? 1 : Math.min(have.qty_base / need.qty_base, 1);
      });
      const rounded = Math.round((100 * scores.reduce((sum, score) => sum + score, 0)) / scores.length);
      return { title, size: needs.length, pct: scores.every((score) => score === 1) ? 100 : Math.min(rounded, 99) };
    })
    .sort((a, b) => b.pct - a.pct || a.size - b.size || (a.title < b.title ? -1 : 1));
}

test("a recipe needing 3 cups scores 33% with 1 cup and 100% with 4 cups", async () => {
  addRecipe("Just Rice", [["cooked rice", 3, "cup"]]);
  await stock("cooked rice", 1, "cup");
  expect(await matchOf("Just Rice")).toBe(33);
  await stock("cooked rice", 4, "cup");
  expect(await matchOf("Just Rice")).toBe(100);
});

test("having more than needed doesn't make up for a missing ingredient", async () => {
  addRecipe("Rice and Lime", [["cooked rice", 1, "cup"], ["lime", 1, "each"]]);
  await stock("cooked rice", 50, "cup");
  expect(await matchOf("Rice and Lime")).toBe(50);
});

test("staples count 100% with no quantity", async () => {
  addRecipe("Salt Water", [["salt", 5, "cup"]]);
  expect(await matchOf("Salt Water")).toBe(100);
});

test("an empty pantry scores every recipe 0%", async () => {
  emptyPantry();
  expect(matchResults(await cook()).map((result) => result.pct)).toEqual(Array(15).fill(0));
});

test("almost everything is shown as 99%, never rounded up to 100%", async () => {
  addRecipe("Nearly There", [["cooked rice", 100, "cup"]]);
  await stock("cooked rice", 99.8, "cup");
  expect(await matchOf("Nearly There")).toBe(99);
});

test("every minimum from 0 to 100 returns exactly the expected recipes, in ranked order", async () => {
  const expected = expectedMatches();
  for (let min = 0; min <= 100; min++) {
    const wanted = expected.filter(({ pct }) => pct >= min).map(({ title, pct }) => ({ title, pct }));
    expect({ min, results: matchResults(await cook(min)) }).toEqual({ min, results: wanted });
  }
});

test("a recipe exactly at the minimum is included, and one point higher excludes it", async () => {
  // Fried rice: peas are half stocked and green onion is missing, so 6.5 / 8 = 81%
  expect(resultTitles(await cook(81))).toContain("Chicken Fried Rice");
  expect(resultTitles(await cook(82))).not.toContain("Chicken Fried Rice");
});

test("each result lists its Missing and Low ingredients", async () => {
  const html = await cook(81);
  const row = html.slice(html.indexOf(">Chicken Fried Rice</h2>")).split("</li>")[0];
  expect(row).toContain("Missing: green onion<");
  expect(row).toContain("Low: frozen peas (have ½ cup)<");
});

test("a fully stocked recipe says Missing: none and has Add Missing disabled", async () => {
  addRecipe("Just Eggs", [["eggs", 2, "each"]]);
  const html = await cook(100);
  const row = html.slice(html.indexOf(">Just Eggs</h2>")).split("</li>")[0];
  expect(row).toContain("Missing: none<");
  expect(row).toMatch(/<button[^>]*disabled[^>]*>Add Missing/);
});

test("no matches shows a message", async () => {
  emptyPantry();
  expect(await cook(1)).toContain("No recipes reach a 1% match.");
});

test.each([
  ["", 75],
  ["?min=", 75],
  ["?min=abc", 75],
  ["?min=-5", 75],
  ["?min=20&min=30", 75],
  ["?min=999", 100],
  ["?min=0", 0],
])("/cook%s uses a minimum of %i", async (query, min) => {
  const { status, html } = await get(`/cook${query}`);
  expect(status).toBe(200);
  expect(html).toContain(`<output class="fw-semibold" id="min-match-value" for="min-match">${min}%</output>`);
});
