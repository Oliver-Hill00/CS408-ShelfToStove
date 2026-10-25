// Loads starter data: 6 categories, 60 ingredients, 15 recipes, a starter pantry and shopping list.
//   npm run db:seed            seed only if there are no recipes yet (safe to run again)
//   npm run db:seed -- --force delete existing data first, then seed
const { openDb } = require("./db");
const { initSchema } = require("./init");

const CATEGORIES = ["Breakfast", "Lunch", "Dinner", "Side", "Snack", "Dessert"];

const INGREDIENTS = {
  volume: [
    "cooked rice", "frozen peas", "soy sauce", "vegetable oil", "olive oil", "dried basil",
    "salt", "black pepper", "milk", "all-purpose flour", "sugar", "baking powder",
    "baking soda", "butter", "shredded cheddar", "salsa", "ground cumin", "sour cream",
    "broccoli florets", "honey", "chicken broth", "chili powder", "shredded lettuce", "rolled oats",
    "ground cinnamon", "peanut butter", "kalamata olives", "dried oregano", "brown sugar", "vanilla extract",
    "chocolate chips", "dried lentils", "coconut milk", "curry powder", "vegetable broth", "plain yogurt",
  ],
  weight: [
    "chicken breast", "spaghetti", "crushed tomatoes", "parmesan cheese", "black beans",
    "ground beef", "elbow macaroni", "feta cheese", "potatoes", "spinach",
  ],
  count: [
    "eggs", "green onion", "garlic clove", "yellow onion", "bread slice", "flour tortilla", "bell pepper",
    "carrot", "corn tortilla", "tomato", "lime", "banana", "cucumber", "red onion",
  ],
};

// ingredients: [name, quantity, unit]; instructions: one step per line
const RECIPES = [
  {
    title: "Chicken Fried Rice",
    category: "Dinner",
    description: "Quick weeknight fried rice that turns leftover rice into dinner.",
    prep: 15, cook: 20, servings: 4,
    ingredients: [
      ["cooked rice", 3, "cup"], ["chicken breast", 1, "lb"], ["eggs", 2, "each"], ["frozen peas", 1, "cup"],
      ["soy sauce", 3, "tbsp"], ["green onion", 3, "each"], ["vegetable oil", 2, "tbsp"], ["garlic clove", 2, "each"],
    ],
    instructions: [
      "Dice the chicken into bite-size pieces and mince the garlic.",
      "Heat 1 tbsp oil in a large pan over medium-high heat and cook the chicken until no longer pink. Set aside.",
      "Scramble the eggs in the same pan, then set aside with the chicken.",
      "Heat the remaining oil, add the garlic and rice, and fry for 3 to 4 minutes, breaking up clumps.",
      "Stir in the peas, chicken, eggs, and soy sauce and cook 2 more minutes.",
      "Top with sliced green onion and serve.",
    ],
  },
  {
    title: "Spaghetti Marinara",
    category: "Dinner",
    description: "A simple pantry tomato sauce over spaghetti.",
    prep: 10, cook: 25, servings: 4,
    ingredients: [
      ["spaghetti", 1, "lb"], ["crushed tomatoes", 28, "oz"], ["olive oil", 2, "tbsp"], ["garlic clove", 3, "each"],
      ["yellow onion", 1, "each"], ["dried basil", 1, "tsp"], ["salt", 1, "tsp"], ["parmesan cheese", 50, "g"],
    ],
    instructions: [
      "Dice the onion and mince the garlic.",
      "Warm the olive oil in a saucepan and cook the onion until soft, about 5 minutes. Add the garlic for 1 minute.",
      "Add the crushed tomatoes, basil, and salt. Simmer 15 to 20 minutes, stirring now and then.",
      "Meanwhile, cook the spaghetti in salted boiling water until al dente and drain.",
      "Toss the pasta with the sauce and top with grated parmesan.",
    ],
  },
  {
    title: "Scrambled Eggs on Toast",
    category: "Breakfast",
    description: "Soft scrambled eggs on buttered toast in ten minutes.",
    prep: 5, cook: 5, servings: 1,
    ingredients: [
      ["eggs", 3, "each"], ["butter", 1, "tbsp"], ["milk", 2, "tbsp"], ["bread slice", 2, "each"],
      ["salt", 0.25, "tsp"], ["black pepper", 0.25, "tsp"],
    ],
    instructions: [
      "Whisk the eggs, milk, salt, and pepper in a bowl.",
      "Toast the bread.",
      "Melt the butter in a nonstick pan over low heat and add the eggs.",
      "Stir slowly with a spatula until just set, about 3 minutes.",
      "Spoon the eggs over the toast and serve.",
    ],
  },
  {
    title: "Fluffy Pancakes",
    category: "Breakfast",
    description: "Classic stack of pancakes from basic baking staples.",
    prep: 10, cook: 15, servings: 4,
    ingredients: [
      ["all-purpose flour", 1.5, "cup"], ["sugar", 2, "tbsp"], ["baking powder", 2, "tsp"], ["salt", 0.5, "tsp"],
      ["milk", 1.25, "cup"], ["eggs", 1, "each"], ["butter", 3, "tbsp"],
    ],
    instructions: [
      "Melt the butter and let it cool slightly.",
      "Whisk the flour, sugar, baking powder, and salt in a large bowl.",
      "In another bowl, whisk the milk, egg, and melted butter.",
      "Pour the wet ingredients into the dry and stir until just combined. A few lumps are fine.",
      "Cook 1/4 cup portions on a greased pan over medium heat until bubbles form, then flip and cook 1 more minute.",
    ],
  },
  {
    title: "Black Bean Quesadillas",
    category: "Lunch",
    description: "Crispy cheesy quesadillas with a seasoned black bean filling.",
    prep: 10, cook: 10, servings: 2,
    ingredients: [
      ["flour tortilla", 4, "each"], ["black beans", 15, "oz"], ["shredded cheddar", 1, "cup"], ["salsa", 0.5, "cup"],
      ["ground cumin", 1, "tsp"], ["sour cream", 0.25, "cup"],
    ],
    instructions: [
      "Drain and rinse the black beans, then mash half of them with the cumin.",
      "Spread the bean mixture over two tortillas and top with cheese and the remaining whole beans.",
      "Cover each with another tortilla.",
      "Cook in a dry pan over medium heat for 3 minutes per side, until golden and the cheese melts.",
      "Cut into wedges and serve with salsa and sour cream.",
    ],
  },
  {
    title: "Honey Garlic Chicken Stir-Fry",
    category: "Dinner",
    description: "Chicken and crisp vegetables in a sweet and savory sauce over rice.",
    prep: 15, cook: 15, servings: 4,
    ingredients: [
      ["chicken breast", 1, "lb"], ["broccoli florets", 2, "cup"], ["bell pepper", 1, "each"], ["carrot", 2, "each"],
      ["soy sauce", 3, "tbsp"], ["honey", 1, "tbsp"], ["garlic clove", 2, "each"], ["vegetable oil", 2, "tbsp"],
      ["cooked rice", 3, "cup"],
    ],
    instructions: [
      "Slice the chicken, bell pepper, and carrots into thin strips and mince the garlic.",
      "Stir the soy sauce, honey, and garlic together in a small bowl.",
      "Heat the oil in a large pan over high heat and cook the chicken until browned, about 5 minutes.",
      "Add the vegetables and stir-fry 4 to 5 minutes until crisp-tender.",
      "Pour in the sauce and toss for 1 minute. Serve over rice.",
    ],
  },
  {
    title: "Tomato Basil Soup",
    category: "Lunch",
    description: "Creamy tomato soup made from canned tomatoes.",
    prep: 10, cook: 30, servings: 4,
    ingredients: [
      ["crushed tomatoes", 28, "oz"], ["yellow onion", 1, "each"], ["garlic clove", 3, "each"], ["chicken broth", 2, "cup"],
      ["milk", 0.5, "cup"], ["dried basil", 2, "tsp"], ["butter", 2, "tbsp"], ["salt", 1, "tsp"],
    ],
    instructions: [
      "Dice the onion and mince the garlic.",
      "Melt the butter in a pot and cook the onion until soft, about 5 minutes. Add the garlic for 1 minute.",
      "Add the tomatoes, broth, basil, and salt. Simmer 20 minutes.",
      "Blend until smooth with an immersion blender (or carefully in batches).",
      "Stir in the milk and heat through without boiling.",
    ],
  },
  {
    title: "Beef Tacos",
    category: "Dinner",
    description: "Seasoned ground beef tacos with fresh toppings.",
    prep: 10, cook: 15, servings: 4,
    ingredients: [
      ["ground beef", 1, "lb"], ["chili powder", 1, "tbsp"], ["ground cumin", 1, "tsp"], ["corn tortilla", 8, "each"],
      ["shredded lettuce", 2, "cup"], ["tomato", 2, "each"], ["shredded cheddar", 1, "cup"], ["sour cream", 0.5, "cup"],
      ["lime", 1, "each"],
    ],
    instructions: [
      "Brown the ground beef in a skillet over medium-high heat, breaking it up. Drain the fat.",
      "Stir in the chili powder, cumin, and 1/4 cup water. Simmer 5 minutes.",
      "Dice the tomatoes and cut the lime into wedges.",
      "Warm the tortillas in a dry pan or the microwave.",
      "Fill the tortillas with beef and top with lettuce, tomato, cheese, sour cream, and a squeeze of lime.",
    ],
  },
  {
    title: "Stovetop Mac and Cheese",
    category: "Dinner",
    description: "Creamy homemade mac and cheese in one pot.",
    prep: 5, cook: 20, servings: 4,
    ingredients: [
      ["elbow macaroni", 8, "oz"], ["butter", 2, "tbsp"], ["all-purpose flour", 2, "tbsp"], ["milk", 2, "cup"],
      ["shredded cheddar", 2, "cup"], ["salt", 0.5, "tsp"], ["black pepper", 0.25, "tsp"],
    ],
    instructions: [
      "Cook the macaroni in salted boiling water until al dente and drain.",
      "In the same pot, melt the butter, whisk in the flour, and cook 1 minute.",
      "Slowly whisk in the milk and simmer until thickened, about 5 minutes.",
      "Remove from heat and stir in the cheese until melted. Season with salt and pepper.",
      "Stir the macaroni into the sauce and serve.",
    ],
  },
  {
    title: "Banana Peanut Butter Oatmeal",
    category: "Breakfast",
    description: "A filling bowl of oats with banana, peanut butter, and cinnamon.",
    prep: 2, cook: 5, servings: 1,
    ingredients: [
      ["rolled oats", 0.5, "cup"], ["milk", 1, "cup"], ["banana", 1, "each"], ["honey", 1, "tbsp"],
      ["ground cinnamon", 0.5, "tsp"], ["peanut butter", 1, "tbsp"],
    ],
    instructions: [
      "Bring the milk to a simmer in a small pot.",
      "Stir in the oats and cinnamon and cook 4 to 5 minutes, stirring often.",
      "Slice the banana.",
      "Top the oatmeal with banana, peanut butter, and a drizzle of honey.",
    ],
  },
  {
    title: "Greek Salad",
    category: "Side",
    description: "Crunchy cucumber and tomato salad with feta and olives.",
    prep: 15, cook: 0, servings: 4,
    ingredients: [
      ["cucumber", 1, "each"], ["tomato", 2, "each"], ["red onion", 0.5, "each"], ["feta cheese", 100, "g"],
      ["kalamata olives", 0.5, "cup"], ["olive oil", 3, "tbsp"], ["dried oregano", 1, "tsp"], ["salt", 0.25, "tsp"],
    ],
    instructions: [
      "Chop the cucumber and tomatoes into chunks and thinly slice the red onion.",
      "Combine the vegetables and olives in a bowl.",
      "Drizzle with olive oil and sprinkle with oregano and salt. Toss gently.",
      "Crumble the feta over the top and serve.",
    ],
  },
  {
    title: "Chocolate Chip Cookies",
    category: "Dessert",
    description: "Chewy chocolate chip cookies, about two dozen.",
    prep: 15, cook: 12, servings: 24,
    ingredients: [
      ["all-purpose flour", 2.25, "cup"], ["baking soda", 1, "tsp"], ["salt", 1, "tsp"], ["butter", 1, "cup"],
      ["sugar", 0.75, "cup"], ["brown sugar", 0.75, "cup"], ["vanilla extract", 1, "tsp"], ["eggs", 2, "each"],
      ["chocolate chips", 2, "cup"],
    ],
    instructions: [
      "Heat the oven to 375°F (190°C) and soften the butter.",
      "Whisk the flour, baking soda, and salt in a bowl.",
      "Beat the butter, sugar, brown sugar, and vanilla until creamy. Beat in the eggs one at a time.",
      "Mix in the flour mixture, then stir in the chocolate chips.",
      "Drop rounded tablespoons onto a baking sheet and bake 9 to 11 minutes until golden at the edges.",
    ],
  },
  {
    title: "Roasted Potatoes and Carrots",
    category: "Side",
    description: "Crispy oven-roasted potatoes and carrots with garlic and oregano.",
    prep: 10, cook: 35, servings: 4,
    ingredients: [
      ["potatoes", 1.5, "lb"], ["carrot", 3, "each"], ["red onion", 1, "each"], ["olive oil", 3, "tbsp"],
      ["garlic clove", 4, "each"], ["salt", 1, "tsp"], ["black pepper", 0.5, "tsp"], ["dried oregano", 1, "tsp"],
    ],
    instructions: [
      "Heat the oven to 425°F (220°C).",
      "Cut the potatoes and carrots into 1-inch pieces and the onion into wedges. Smash the garlic cloves.",
      "Toss everything with olive oil, salt, pepper, and oregano on a baking sheet.",
      "Roast 30 to 35 minutes, flipping halfway, until browned and tender.",
    ],
  },
  {
    title: "Coconut Lentil Curry",
    category: "Dinner",
    description: "Hearty red lentil curry with spinach, served over rice.",
    prep: 10, cook: 30, servings: 4,
    ingredients: [
      ["dried lentils", 1, "cup"], ["coconut milk", 400, "mL"], ["yellow onion", 1, "each"], ["garlic clove", 3, "each"],
      ["curry powder", 2, "tbsp"], ["crushed tomatoes", 14, "oz"], ["spinach", 100, "g"], ["vegetable broth", 2, "cup"],
      ["cooked rice", 3, "cup"],
    ],
    instructions: [
      "Dice the onion, mince the garlic, and rinse the lentils.",
      "Cook the onion in a little oil until soft, then add the garlic and curry powder for 1 minute.",
      "Add the lentils, tomatoes, coconut milk, and broth. Simmer 20 to 25 minutes until the lentils are tender.",
      "Stir in the spinach until wilted.",
      "Serve over rice.",
    ],
  },
  {
    title: "Peanut Butter Banana Smoothie",
    category: "Snack",
    description: "A thick, protein-packed smoothie in five minutes.",
    prep: 5, cook: 0, servings: 1,
    ingredients: [
      ["banana", 1, "each"], ["peanut butter", 2, "tbsp"], ["milk", 1, "cup"], ["plain yogurt", 0.5, "cup"],
      ["honey", 1, "tbsp"],
    ],
    instructions: [
      "Add everything to a blender.",
      "Blend until smooth, about 1 minute. Add a splash more milk if it is too thick.",
      "Pour into a glass and serve.",
    ],
  },
];

// [name, quantity, unit, expires in N days (null = no date), is_staple]
const PANTRY = [
  ["milk", 2, "L", 3], ["eggs", 12, "each", 12], ["cooked rice", 4, "cup", 5], ["spinach", 250, "g", 2],
  ["chicken breast", 2, "lb", 4], ["shredded cheddar", 2, "cup", 20], ["butter", 2, "cup", 30],
  ["spaghetti", 2, "lb", null], ["crushed tomatoes", 28, "oz", 365], ["garlic clove", 10, "each", 21],
  ["yellow onion", 3, "each", 30], ["banana", 3, "each", 4], ["all-purpose flour", 8, "cup", null],
  ["sugar", 4, "cup", null], ["rolled oats", 6, "cup", null], ["peanut butter", 1, "cup", 90],
  ["flour tortilla", 8, "each", 10], ["frozen peas", 0.5, "cup", 120],
  ["salt", null, null, null, true], ["black pepper", null, null, null, true],
  ["olive oil", null, null, null, true], ["vegetable oil", null, null, null, true],
  ["soy sauce", null, null, 160, true], ["honey", null, null, null, true],
];

// [name, quantity, unit, from recipe title (null = added manually), checked]
const SHOPPING_LIST = [
  ["frozen peas", 0.5, "cup", "Chicken Fried Rice"],
  ["green onion", 3, "each", "Chicken Fried Rice"],
  ["banana", 6, "each", null],
  ["plain yogurt", 2, "cup", null, true],
];

function daysFromToday(days) {
  return days === null ? null : new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

function seed(db, { force = false } = {}) {
  const existing = db.prepare("SELECT COUNT(*) FROM recipes").pluck().get();
  if (existing > 0 && !force) return { skipped: true, recipes: existing };

  const toBase = new Map(db.prepare("SELECT code, to_base FROM units").all().map((u) => [u.code, u.to_base]));
  const base = (qty, unit) => {
    if (qty === null) return null;
    if (!toBase.has(unit)) throw new Error(`Unknown unit: ${unit}`);
    return qty * toBase.get(unit);
  };

  const run = db.transaction(() => {
    if (force) {
      for (const table of ["shopping_list_items", "pantry_items", "recipe_ingredients", "recipes", "ingredients", "categories"]) {
        db.exec(`DELETE FROM ${table}`);
      }
      db.exec("DELETE FROM sqlite_sequence");
    }

    const categoryId = new Map();
    const insertCategory = db.prepare("INSERT INTO categories (name) VALUES (?)");
    for (const name of CATEGORIES) categoryId.set(name, insertCategory.run(name).lastInsertRowid);

    const ingredientId = new Map();
    const insertIngredient = db.prepare("INSERT INTO ingredients (name, measure_type) VALUES (?, ?)");
    for (const [type, names] of Object.entries(INGREDIENTS)) {
      for (const name of names) ingredientId.set(name, insertIngredient.run(name, type).lastInsertRowid);
    }
    const idOf = (name) => {
      if (!ingredientId.has(name)) throw new Error(`Unknown ingredient: ${name}`);
      return ingredientId.get(name);
    };

    const recipeId = new Map();
    const insertRecipe = db.prepare(`
      INSERT INTO recipes (title, description, instructions, prep_minutes, cook_minutes, servings, category_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const insertRecipeIngredient = db.prepare(`
      INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, qty_base) VALUES (?, ?, ?, ?, ?)`);
    for (const r of RECIPES) {
      const id = insertRecipe.run(
        r.title, r.description, r.instructions.join("\n"), r.prep, r.cook, r.servings, categoryId.get(r.category)
      ).lastInsertRowid;
      recipeId.set(r.title, id);
      for (const [name, qty, unit] of r.ingredients) {
        insertRecipeIngredient.run(id, idOf(name), qty, unit, base(qty, unit));
      }
    }

    const insertPantry = db.prepare(`
      INSERT INTO pantry_items (ingredient_id, quantity, unit, qty_base, is_staple, expires_on) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const [name, qty, unit, days, staple = false] of PANTRY) {
      insertPantry.run(idOf(name), qty, unit, base(qty, unit), staple ? 1 : 0, daysFromToday(days));
    }

    const insertShopping = db.prepare(`
      INSERT INTO shopping_list_items (ingredient_id, quantity, unit, recipe_id, checked) VALUES (?, ?, ?, ?, ?)`);
    for (const [name, qty, unit, fromRecipe, checked = false] of SHOPPING_LIST) {
      insertShopping.run(idOf(name), qty, unit, fromRecipe ? recipeId.get(fromRecipe) : null, checked ? 1 : 0);
    }
  });
  run();

  const count = (table) => db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get();
  return {
    skipped: false,
    categories: count("categories"),
    ingredients: count("ingredients"),
    recipes: count("recipes"),
    recipe_ingredients: count("recipe_ingredients"),
    pantry_items: count("pantry_items"),
    shopping_list_items: count("shopping_list_items"),
  };
}

if (require.main === module) {
  const db = openDb();
  initSchema(db); // make sure the tables exist
  const result = seed(db, { force: process.argv.includes("--force") });
  if (result.skipped) {
    console.log(`Database already has ${result.recipes} recipes; skipping seed. Use "npm run db:seed -- --force" to reseed.`);
  } else {
    const { skipped, ...counts } = result;
    console.log("Seeded:", Object.entries(counts).map(([t, n]) => `${t}=${n}`).join(", "));
  }
  db.close();
}

module.exports = { seed, CATEGORIES, INGREDIENTS, RECIPES };
