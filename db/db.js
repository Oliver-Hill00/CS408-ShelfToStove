const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

// Load .env from the project root 
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const DEFAULT_DB_PATH = path.join(__dirname, "..", "data", "shelftostove.db");

// Opens a connection with foreign keys enforced. Pass ":memory:" for tests.
function openDb(dbPath = process.env.DB_PATH || DEFAULT_DB_PATH) {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  if (dbPath !== ":memory:") {
    db.pragma("journal_mode = WAL");
  }
  return db;
}

// Shared connection for the app, opened on first use
let sharedDb;
function getDb() {
  if (!sharedDb) sharedDb = openDb();
  return sharedDb;
}

module.exports = { openDb, getDb, DEFAULT_DB_PATH };
