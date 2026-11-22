// Runs before every test file: tests always get their own in-memory database, never data/shelftostove.db
process.env.DB_PATH = ":memory:";
