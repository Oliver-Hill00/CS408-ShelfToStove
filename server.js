const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Landing page
app.use(express.static(path.join(__dirname, "public")));

// Health check used by deploy/deploy.sh (must return 200)
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`App running at http://localhost:${PORT}`);
  });
}

module.exports = app;
