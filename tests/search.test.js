// Recipe Search: each filter, and every combination of them, returns only matching recipes
const { getDb } = require("../db/db");
const { seed } = require("../db/seed");
const { useSeededDatabase, get, addRecipe, resultTitles } = require("./helpers");

useSeededDatabase();
beforeEach(() => seed(getDb(), { force: true }));

const search = (filters = {}) => get(`/search?${new URLSearchParams(filters)}`);
const titlesFor = async (filters) => resultTitles((await search(filters)).html);
const categoryId = (name) => getDb().prepare("SELECT id FROM categories WHERE name = ?").pluck().get(name);

// The expected answer, worked out in plain JavaScript so it doesn't share the route's SQL
function expectedTitles({ q = "", category = "", max = "" }) {
  return getDb()
    .prepare("SELECT title, category_id, prep_minutes, cook_minutes FROM recipes")
    .all()
    .filter((r) => r.title.toLowerCase().includes(q.toLowerCase()))
    .filter((r) => category === "" || r.category_id === Number(category))
    .filter((r) => max === "" || r.prep_minutes + r.cook_minutes <= Number(max))
    .map((r) => r.title)
    .sort();
}

test("keyword returns only titles containing it, ignoring case", async () => {
  expect(await titlesFor({ q: "RICE" })).toEqual(["Chicken Fried Rice"]);
  expect(await titlesFor({ q: "chicken" })).toEqual(["Chicken Fried Rice", "Honey Garlic Chicken Stir-Fry"]);
});

test("category returns only that category", async () => {
  expect(await titlesFor({ category: categoryId("Breakfast") })).toEqual([
    "Banana Peanut Butter Oatmeal", "Fluffy Pancakes", "Scrambled Eggs on Toast",
  ]);
});

test("max minutes counts prep plus cook, and includes a recipe exactly at the limit", async () => {
  // Scrambled eggs take 5 + 5 = 10 minutes
  expect(await titlesFor({ max: "10" })).toEqual([
    "Banana Peanut Butter Oatmeal", "Peanut Butter Banana Smoothie", "Scrambled Eggs on Toast",
  ]);
  expect(await titlesFor({ max: "9" })).not.toContain("Scrambled Eggs on Toast");
});

test("every combination of the three filters returns exactly the expected subset", async () => {
  const categories = ["", ...getDb().prepare("SELECT id FROM categories").pluck().all().map(String)];
  for (const q of ["", "chicken", "an", "zzz"]) {
    for (const category of categories) {
      for (const max of ["", "0", "15", "30", "45"]) {
        const filters = { q, category, max };
        expect({ filters, titles: await titlesFor(filters) }).toEqual({ filters, titles: expectedTitles(filters) });
      }
    }
  }
});

test("no filters returns at most 20 rows, with the rest on page 2", async () => {
  for (let n = 10; n < 20; n++) addRecipe(`Zed Recipe ${n}`, [["eggs", 1, "each"]]);
  const first = await search();
  expect(resultTitles(first.html)).toHaveLength(20);
  expect(first.html).toContain("Showing 20 of 25 results");

  const second = await titlesFor({ page: "2" });
  expect(second).toHaveLength(5);
  expect([...resultTitles(first.html), ...second]).toEqual(expectedTitles({}));
});

test("page links keep the filters", async () => {
  for (let n = 10; n < 35; n++) addRecipe(`Salt & Pepper ${n}`, [["eggs", 1, "each"]]);
  const { html } = await search({ q: "Salt & Pepper", max: "60" });
  expect(html).toContain('href="/search?q=Salt+%26+Pepper&amp;category=&amp;max=60&amp;page=2"');
});

test("an out-of-range page shows the nearest real page", async () => {
  expect(await titlesFor({ page: "99" })).toEqual(expectedTitles({}));
  expect(await titlesFor({ page: "-3" })).toEqual(expectedTitles({}));
});

test("% _ \\ and quotes are searched literally", async () => {
  addRecipe("100% Juice_Mix \\ Mom's", [["eggs", 1, "each"]]);
  for (const q of ["%", "_", "\\", "'"]) {
    expect(await titlesFor({ q })).toEqual(["100% Juice_Mix \\ Mom's"]);
  }
});

test("SQL in the keyword is treated as text", async () => {
  const { status, html } = await search({ q: "' OR 1=1 --" });
  expect(status).toBe(200);
  expect(resultTitles(html)).toEqual([]);
  expect(html).toContain("No recipes match those filters.");
});

test("HTML in the keyword is escaped", async () => {
  const { html } = await search({ q: '"><script>alert(1)</script>' });
  expect(html).not.toContain("<script>alert");
});

test("invalid filters show errors instead of results", async () => {
  const { status, html } = await search({ category: "999", max: "-1", q: "x".repeat(121) });
  expect(status).toBe(400);
  expect(html).toContain("Choose a category from the list.");
  expect(html).toContain("Enter a whole number of minutes, 0 or more.");
  expect(html).toContain("Keep the keyword under 120 characters.");
  expect(resultTitles(html)).toEqual([]);
});

test("the form keeps what was entered", async () => {
  const category = categoryId("Dinner");
  const { html } = await search({ q: "fried", category, max: "40" });
  expect(html).toContain('value="fried"');
  expect(html).toContain('value="40"');
  expect(html).toMatch(new RegExp(`<option value="${category}" selected(="selected")?>Dinner`));
  expect(html).toContain("Showing 1 result<");
});
