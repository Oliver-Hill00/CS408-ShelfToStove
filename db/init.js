// Creates the tables from db/schema.sql.
//   npm run db:init            create any missing tables (keeps existing data)
//   npm run db:init -- --reset drop every table first, then recreate (deletes all data)
const fs = require("fs");
const path = require("path");
const { openDb } = require("./db");

const SCHEMA_PATH = path.join(__dirname, "schema.sql");

// Child tables first so foreign keys never block a drop
const TABLES = [
  "shopping_list_items",
  "pantry_items",
  "recipe_ingredients",
  "recipes",
  "ingredients",
  "categories",
  "units",
];

function initSchema(db, { reset = false } = {}) {
  if (reset) {
    db.transaction(() => {
      for (const table of TABLES) db.exec(`DROP TABLE IF EXISTS ${table}`);
    })();
  }
  db.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
}

if (require.main === module) {
  const reset = process.argv.includes("--reset");
  const db = openDb();
  initSchema(db, { reset });
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .pluck()
    .all();
  console.log(`${reset ? "Reset and created" : "Created"} ${tables.length} tables in ${db.name}: ${tables.join(", ")}`);
  db.close();
}

module.exports = { initSchema, TABLES };
