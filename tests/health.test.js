const assert = require("node:assert");
const { get } = require("./helpers");

test("GET /api/health returns 200", async () => {
  assert.strictEqual((await get("/api/health")).status, 200);
});
