const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const { body, validationResult } = require("express-validator");
const { getDb } = require("../db/db");
const { formatAmount, formatIngredient } = require("../lib/format");
const { cleanName, unitProblem, findOrCreateIngredient, toBase, ingredientOptions } = require("../lib/ingredients");

const PAGE_SIZE = 12;
const UPLOAD_DIR = path.join(__dirname, "..", "public", "uploads");
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

// JPEG and PNG files start with these bytes; checking them is safer than trusting the browser's file type
const PHOTO_TYPES = [
  { ext: ".jpg", magic: [0xff, 0xd8, 0xff] },
  { ext: ".png", magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

// Photos stay in memory until the whole form is valid, so rejected forms leave no stray files.
// The 5 MB cap matches Nginx's client_max_body_size; the 2 MB rule is checked in photoProblem().
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

const router = express.Router();

// Have = enough on hand, Low = some but not enough, Missing = none. Staples always count as on hand.
function pantryStatus(row) {
  if (row.is_staple) return { status: "Have", note: "staple" };
  if (!row.pantry_base) return { status: "Missing", note: "" };
  if (row.pantry_base >= row.qty_base) return { status: "Have", note: "" };
  return { status: "Low", note: `have ${formatAmount(row.pantry_quantity, row.pantry_unit)}` };
}

// Data the Add and Edit forms need for their dropdowns and ingredient autocomplete
function formOptions(db) {
  return {
    categories: db.prepare("SELECT id, name FROM categories ORDER BY name").all(),
    ...ingredientOptions(),
  };
}

const emptyRow = () => ({ name: "", quantity: "", unit: "" });

function renderForm(res, { status = 200, title, action, recipe, ingredients, errors = {} }) {
  res.status(status).render("recipe-form", {
    title,
    action,
    recipe,
    ingredients: ingredients.length ? ingredients : [emptyRow()],
    errors,
    ...formOptions(getDb()),
  });
}

// ---------- Reading and validating the Add / Edit form ----------

const text = (value) => (typeof value === "string" ? value.trim() : "");

// Rows arrive as ingredients[0][name], ingredients[0][quantity], ... Removed rows leave gaps in
// the numbering and blank rows are ignored, so this returns a compact array of filled-in rows.
function compactIngredients(raw) {
  if (!raw || typeof raw !== "object") return [];
  return Object.values(raw)
    .filter((row) => row && typeof row === "object")
    .map((row) => ({ name: cleanName(row.name), quantity: text(row.quantity), unit: text(row.unit) }))
    .filter((row) => row.name || row.quantity || row.unit);
}

// Runs Multer for the multipart form. Upload problems become a form error instead of an error page.
function receiveForm(req, res, next) {
  upload.single("photo")(req, res, (err) => {
    if (err && !(err instanceof multer.MulterError)) return next(err);
    if (err) req.photoError = err.code === "LIMIT_FILE_SIZE" ? "Photo must be under 2 MB." : "Upload one JPG or PNG photo.";
    req.body ??= {};
    req.body.ingredients = compactIngredients(req.body.ingredients);
    next();
  });
}

const rowIndex = (fieldPath) => Number(fieldPath.match(/\[(\d+)\]/)[1]);

function checkUnit(unit, { req, path: fieldPath }) {
  const problem = unitProblem(req.body.ingredients[rowIndex(fieldPath)].name, unit);
  if (problem) throw new Error(problem);
  return true;
}

function checkNotDuplicate(name, { req, path: fieldPath }) {
  const key = name.toLowerCase();
  const earlier = req.body.ingredients.slice(0, rowIndex(fieldPath));
  if (earlier.some((row) => row.name.toLowerCase() === key)) throw new Error("This ingredient is already listed.");
  return true;
}

const minutesRule = (field, label) =>
  body(field).trim().isInt({ min: 0, max: 10000 }).withMessage(`${label} must be a whole number of minutes, 0 or more.`);

const recipeRules = [
  body("title")
    .trim()
    .notEmpty().withMessage("Enter a title.")
    .bail()
    .isLength({ max: 120 }).withMessage("Keep the title under 120 characters."),
  body("category_id")
    .isInt({ min: 1 }).withMessage("Choose a category.")
    .bail()
    .custom((id) => {
      if (!getDb().prepare("SELECT 1 FROM categories WHERE id = ?").get(Number(id))) throw new Error("Choose a category.");
      return true;
    }),
  body("description").trim().isLength({ max: 500 }).withMessage("Keep the description under 500 characters."),
  minutesRule("prep_minutes", "Prep time"),
  minutesRule("cook_minutes", "Cook time"),
  body("servings").trim().isInt({ min: 1, max: 100 }).withMessage("Servings must be a whole number from 1 to 100."),
  body("instructions").trim().notEmpty().withMessage("Add at least one step."),
  body("ingredients")
    .isArray({ min: 1 }).withMessage("Add at least one ingredient.")
    .bail()
    .isArray({ max: 50 }).withMessage("A recipe can have up to 50 ingredients."),
  body("ingredients.*.name")
    .notEmpty().withMessage("Enter an ingredient name.")
    .bail()
    .isLength({ max: 60 }).withMessage("Keep the name under 60 characters.")
    .bail()
    .custom(checkNotDuplicate),
  body("ingredients.*.quantity").isFloat({ gt: 0, max: 100000 }).withMessage("Enter a quantity greater than 0."),
  body("ingredients.*.unit")
    .notEmpty().withMessage("Choose a unit.")
    .bail()
    .custom(checkUnit),
];

function photoType(buffer) {
  return PHOTO_TYPES.find(({ magic }) => magic.every((byte, i) => buffer[i] === byte))?.ext;
}

function photoProblem(file) {
  if (!file) return null;
  if (file.size > MAX_PHOTO_BYTES) return "Photo must be under 2 MB.";
  if (!photoType(file.buffer)) return "Photo must be a JPG or PNG image.";
  return null;
}

// express-validator errors as { "title": "Enter a title.", "ingredients[0].unit": "..." }, plus the photo
function formErrors(req) {
  const errors = Object.fromEntries(
    Object.entries(validationResult(req).mapped()).map(([field, error]) => [field, error.msg])
  );
  const photoError = req.photoError || photoProblem(req.file);
  if (photoError) errors.photo = photoError;
  // A browser can't refill a file input, so ask for the photo again when other fields fail
  else if (req.file && Object.keys(errors).length) errors.photo = "Please choose the photo again.";
  return errors;
}

// What the user typed, for re-showing the form after an error
function submittedRecipe(form) {
  const fields = ["title", "category_id", "description", "instructions", "prep_minutes", "cook_minutes", "servings"];
  return Object.fromEntries(fields.map((field) => [field, typeof form[field] === "string" ? form[field] : ""]));
}

// ---------- Saving ----------

function storePhoto(file) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const filename = `${crypto.randomUUID()}${photoType(file.buffer)}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), file.buffer);
  return `/uploads/${filename}`;
}

function removePhoto(imagePath) {
  if (!imagePath) return;
  fs.rmSync(path.join(UPLOAD_DIR, path.basename(imagePath)), { force: true });
}

// Inserts a recipe's ingredient rows, adding any new ingredient names, with qty_base in base units
function insertIngredientRows(db, recipeId, rows) {
  const addRow = db.prepare(
    "INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, qty_base) VALUES (?, ?, ?, ?, ?)"
  );
  for (const row of rows) {
    const quantity = Number(row.quantity);
    addRow.run(recipeId, findOrCreateIngredient(db, row.name, row.unit), quantity, row.unit, toBase(quantity, row.unit));
  }
}

function createRecipe(db, form, imagePath) {
  return db.transaction(() => {
    const { lastInsertRowid: recipeId } = db
      .prepare(`
        INSERT INTO recipes (title, description, instructions, prep_minutes, cook_minutes, servings, category_id, image_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        form.title, form.description || null, form.instructions, Number(form.prep_minutes),
        Number(form.cook_minutes), Number(form.servings), Number(form.category_id), imagePath
      );
    insertIngredientRows(db, recipeId, form.ingredients);
    return recipeId;
  })();
}

// Saves the edited fields and replaces the ingredient rows. imagePath is null to keep the current photo.
function updateRecipe(db, recipeId, form, imagePath) {
  db.transaction(() => {
    db.prepare(`
      UPDATE recipes
      SET title = ?, description = ?, instructions = ?, prep_minutes = ?, cook_minutes = ?, servings = ?,
          category_id = ?, image_path = COALESCE(?, image_path),
          updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE id = ?`)
      .run(
        form.title, form.description || null, form.instructions, Number(form.prep_minutes),
        Number(form.cook_minutes), Number(form.servings), Number(form.category_id), imagePath, recipeId
      );
    db.prepare("DELETE FROM recipe_ingredients WHERE recipe_id = ?").run(recipeId);
    insertIngredientRows(db, recipeId, form.ingredients);
  })();
}

// The recipe for an :id route, or undefined (non-numeric or missing ids become a 404)
function findRecipe(db, id) {
  if (!/^\d+$/.test(id)) return undefined;
  return db.prepare("SELECT * FROM recipes WHERE id = ?").get(id);
}

// Browse Recipes: /recipes?page=n
router.get("/", (req, res) => {
  const db = getDb();
  const total = db.prepare("SELECT COUNT(*) FROM recipes").pluck().get();
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requested = Number.parseInt(req.query.page, 10);
  const page = Math.min(requested > 0 ? requested : 1, totalPages);

  const recipes = db
    .prepare(`
      SELECT r.id, r.title, r.image_path, r.prep_minutes + r.cook_minutes AS total_minutes, c.name AS category
      FROM recipes r
      JOIN categories c ON c.id = r.category_id
      ORDER BY r.title
      LIMIT ? OFFSET ?`)
    .all(PAGE_SIZE, (page - 1) * PAGE_SIZE);

  res.render("recipes", { title: "All Recipes", recipes, page, totalPages, total, deleted: req.query.deleted === "1" });
});

// Add Recipe form: /recipes/new
router.get("/new", (req, res) => {
  renderForm(res, {
    title: "Add New Recipe",
    action: "/recipes",
    recipe: {
      title: "", category_id: "", description: "", instructions: "",
      prep_minutes: 0, cook_minutes: 0, servings: 1, image_path: null,
    },
    // Three empty rows to start, like the wireframe
    ingredients: [emptyRow(), emptyRow(), emptyRow()],
  });
});

// Create a recipe from the Add Recipe form
router.post("/", receiveForm, recipeRules, (req, res) => {
  const errors = formErrors(req);
  if (Object.keys(errors).length) {
    return renderForm(res, {
      status: 400,
      title: "Add New Recipe",
      action: "/recipes",
      recipe: submittedRecipe(req.body),
      ingredients: req.body.ingredients,
      errors,
    });
  }

  const imagePath = req.file ? storePhoto(req.file) : null;
  let recipeId;
  try {
    recipeId = createRecipe(getDb(), req.body, imagePath);
  } catch (err) {
    removePhoto(imagePath);
    throw err;
  }
  res.redirect(303, `/recipes/${recipeId}?saved=1`);
});

// Edit Recipe form, pre-filled: /recipes/:id/edit
router.get("/:id/edit", (req, res, next) => {
  const db = getDb();
  const recipe = findRecipe(db, req.params.id);
  if (!recipe) return next();

  const ingredients = db
    .prepare(`
      SELECT i.name, ri.quantity, ri.unit
      FROM recipe_ingredients ri
      JOIN ingredients i ON i.id = ri.ingredient_id
      WHERE ri.recipe_id = ?
      ORDER BY ri.rowid`)
    .all(recipe.id);

  renderForm(res, { title: "Edit Recipe", action: `/recipes/${recipe.id}/edit`, recipe, ingredients });
});

// Save the Edit Recipe form
router.post("/:id/edit", receiveForm, recipeRules, (req, res, next) => {
  const db = getDb();
  const existing = findRecipe(db, req.params.id);
  if (!existing) return next();

  const errors = formErrors(req);
  if (Object.keys(errors).length) {
    return renderForm(res, {
      status: 400,
      title: "Edit Recipe",
      action: `/recipes/${existing.id}/edit`,
      recipe: { ...submittedRecipe(req.body), id: existing.id, image_path: existing.image_path },
      ingredients: req.body.ingredients,
      errors,
    });
  }

  const newPhoto = req.file ? storePhoto(req.file) : null;
  try {
    updateRecipe(db, existing.id, req.body, newPhoto);
  } catch (err) {
    removePhoto(newPhoto);
    throw err;
  }
  if (newPhoto) removePhoto(existing.image_path); // replaced, so the old file is no longer used
  res.redirect(303, `/recipes/${existing.id}?saved=1`);
});

// Delete a recipe. Its ingredient rows are removed by ON DELETE CASCADE, and shopping list
// items that came from it stay on the list (ON DELETE SET NULL).
router.post("/:id/delete", (req, res, next) => {
  const db = getDb();
  const recipe = findRecipe(db, req.params.id);
  if (!recipe) return next();

  db.prepare("DELETE FROM recipes WHERE id = ?").run(recipe.id);
  removePhoto(recipe.image_path);
  res.redirect(303, "/recipes?deleted=1");
});

// Recipe Detail: /recipes/:id
router.get("/:id", (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next();

  const db = getDb();
  const recipe = db
    .prepare(`
      SELECT r.*, c.name AS category
      FROM recipes r
      JOIN categories c ON c.id = r.category_id
      WHERE r.id = ?`)
    .get(req.params.id);
  if (!recipe) return next();

  const ingredients = db
    .prepare(`
      SELECT i.name, ri.quantity, ri.unit, ri.qty_base,
             p.quantity AS pantry_quantity, p.unit AS pantry_unit, p.qty_base AS pantry_base, p.is_staple
      FROM recipe_ingredients ri
      JOIN ingredients i ON i.id = ri.ingredient_id
      LEFT JOIN pantry_items p ON p.ingredient_id = ri.ingredient_id
      WHERE ri.recipe_id = ?
      ORDER BY ri.rowid`)
    .all(recipe.id)
    .map((row) => ({ label: formatIngredient(row.quantity, row.unit, row.name), ...pantryStatus(row) }));

  res.render("recipe", {
    title: recipe.title,
    recipe,
    ingredients,
    steps: recipe.instructions.split("\n").filter((step) => step.trim()),
    saved: req.query.saved === "1",
  });
});

module.exports = router;
