const { test } = require("node:test");
const assert = require("node:assert");
const app = require("../server");

test("GET /api/health returns 200", async () => {
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.strictEqual(res.status, 200);
  } finally {
    server.close();
  }
});

test("GET / returns the landing page", async () => {
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    assert.strictEqual(res.status, 200);
    assert.match(await res.text(), /Welcome to Shelf-To-Stove/);
  } finally {
    server.close();
  }
});
