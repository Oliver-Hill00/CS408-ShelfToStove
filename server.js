const express = require("express");
const path = require("path");
const pagesRouter = require("./routes/pages");
const recipesRouter = require("./routes/recipes");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));

// CSS, images, and uploaded photos
app.use(express.static(path.join(__dirname, "public")));

// Values every view needs for the shared header and footer
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.year = new Date().getFullYear();
  next();
});

// Health check used by deploy/deploy.sh (must return 200)
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/", pagesRouter);
app.use("/recipes", recipesRouter);

app.use((req, res) => {
  res.status(404).render("error", {
    title: "Page not found",
    status: 404,
    message: "We couldn't find that page.",
  });
});

// Express treats a four-argument function as the error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render("error", {
    title: "Something went wrong",
    status: 500,
    message: "Something went wrong on our end. Please try again.",
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`App running at http://localhost:${PORT}`);
  });
}

module.exports = app;
