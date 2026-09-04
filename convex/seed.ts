import { internalMutation } from "./_generated/server";

const recipes = [
  {
    slug: "creamy-tuscan-chickpeas",
    title: "Creamy Tuscan Chickpeas",
    description:
      "A cozy one-pan chickpea dinner with tomatoes, spinach, and a creamy garlic sauce.",
    yieldText: "4 servings",
    servings: 4,
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    cuisines: ["Italian-inspired"],
    categories: ["Dinner", "Vegetarian", "One-pan"],
    keywords: ["chickpeas", "weeknight", "plant-based"],
    nutrition: {
      servingSize: "1 bowl",
      calories: "410 kcal",
      protein: "14 g",
      carbohydrates: "48 g",
      fat: "19 g",
      fiber: "11 g",
    },
    ingredients: [
      ["Olive oil", "olive oil", 1, "tbsp", "1 tablespoon", "Pantry"],
      ["Garlic", "garlic", 3, "cloves", "3 cloves", "Produce"],
      ["Chickpeas", "chickpeas", 2, "cans", "2 (15-ounce) cans", "Canned goods"],
      ["Diced tomatoes", "diced tomatoes", 1, "can", "1 (14-ounce) can", "Canned goods"],
      ["Coconut milk", "coconut milk", 1, "cup", "1 cup", "Canned goods"],
      ["Baby spinach", "baby spinach", 3, "cups", "3 packed cups", "Produce"],
      ["Italian seasoning", "italian seasoning", 1, "tsp", "1 teaspoon", "Spices"],
      ["Kosher salt", "kosher salt", 0.5, "tsp", "1/2 teaspoon", "Spices"],
    ],
    instructions: [
      "Warm the olive oil in a large skillet over medium heat.",
      "Cook the garlic and Italian seasoning until fragrant, about 30 seconds.",
      "Add the chickpeas, tomatoes, and coconut milk; simmer for 12 minutes.",
      "Fold in the spinach and cook until wilted. Season with salt and serve.",
    ],
  },
  {
    slug: "sheet-pan-lemon-herb-chicken",
    title: "Sheet-Pan Lemon Herb Chicken",
    description:
      "Roasted chicken thighs, potatoes, and broccoli with plenty of lemon and herbs.",
    yieldText: "4 servings",
    servings: 4,
    prepTimeMinutes: 15,
    cookTimeMinutes: 35,
    cuisines: ["Mediterranean-inspired"],
    categories: ["Dinner", "Sheet pan", "High protein"],
    keywords: ["chicken", "meal prep", "family dinner"],
    nutrition: {
      servingSize: "1 plate",
      calories: "520 kcal",
      protein: "39 g",
      carbohydrates: "42 g",
      fat: "22 g",
      fiber: "7 g",
    },
    ingredients: [
      ["Boneless chicken thighs", "boneless chicken thighs", 1.5, "lb", "1 1/2 pounds", "Meat"],
      ["Baby potatoes", "baby potatoes", 1.5, "lb", "1 1/2 pounds", "Produce"],
      ["Broccoli", "broccoli", 1, "head", "1 large head", "Produce"],
      ["Lemon", "lemon", 1, undefined, "1", "Produce"],
      ["Olive oil", "olive oil", 3, "tbsp", "3 tablespoons", "Pantry"],
      ["Garlic", "garlic", 3, "cloves", "3 cloves", "Produce"],
      ["Dried oregano", "dried oregano", 2, "tsp", "2 teaspoons", "Spices"],
      ["Kosher salt", "kosher salt", 1, "tsp", "1 teaspoon", "Spices"],
      ["Black pepper", "black pepper", 0.5, "tsp", "1/2 teaspoon", "Spices"],
    ],
    instructions: [
      "Heat the oven to 425°F and line a large sheet pan.",
      "Toss the potatoes with one third of the oil and roast for 15 minutes.",
      "Coat the chicken and broccoli with the remaining oil, garlic, oregano, lemon zest, salt, and pepper.",
      "Add everything to the pan and roast until the chicken reaches 165°F, about 20 minutes. Finish with lemon juice.",
    ],
  },
  {
    slug: "ginger-peanut-noodles",
    title: "Ginger Peanut Noodles",
    description:
      "Quick noodles tossed in a savory peanut-ginger sauce and topped with scallions.",
    yieldText: "4 servings",
    servings: 4,
    prepTimeMinutes: 10,
    cookTimeMinutes: 10,
    cuisines: ["Asian-inspired"],
    categories: ["Dinner", "Quick", "Vegetarian"],
    keywords: ["noodles", "20-minute meal", "peanut sauce"],
    nutrition: {
      servingSize: "1 bowl",
      calories: "460 kcal",
      protein: "16 g",
      carbohydrates: "62 g",
      fat: "18 g",
      fiber: "5 g",
    },
    ingredients: [
      ["Noodles", "noodles", 12, "oz", "12 ounces", "Pantry"],
      ["Creamy peanut butter", "peanut butter", 0.5, "cup", "1/2 cup", "Pantry"],
      ["Soy sauce", "soy sauce", 3, "tbsp", "3 tablespoons", "Pantry"],
      ["Rice vinegar", "rice vinegar", 2, "tbsp", "2 tablespoons", "Pantry"],
      ["Sesame oil", "sesame oil", 1, "tbsp", "1 tablespoon", "Pantry"],
      ["Maple syrup", "maple syrup", 1, "tbsp", "1 tablespoon", "Pantry"],
      ["Garlic", "garlic", 1, "clove", "1 clove", "Produce"],
      ["Fresh ginger", "fresh ginger", 1, "tbsp", "1 tablespoon grated", "Produce"],
      ["Scallions", "scallions", 3, undefined, "3", "Produce"],
    ],
    instructions: [
      "Cook the noodles according to their package directions; reserve one cup of cooking water.",
      "Whisk the peanut butter, soy sauce, vinegar, sesame oil, maple syrup, garlic, and ginger.",
      "Toss the hot noodles with the sauce, adding cooking water until glossy.",
      "Divide among bowls and finish with sliced scallions.",
    ],
  },
] as const;

/** Adds safe, repeatable demo content to a development deployment. */
export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let recipesInserted = 0;
    let recipesSkipped = 0;
    let ingredientsInserted = 0;
    let recipeIngredientsInserted = 0;

    for (const sample of recipes) {
      const sourceUrl = `https://demo.perfectplate.local/recipes/${sample.slug}`;
      const existingRecipe = await ctx.db
        .query("recipes")
        .withIndex("by_normalized_source_url", (q) =>
          q.eq("normalizedSourceUrl", sourceUrl),
        )
        .unique();

      if (existingRecipe !== null) {
        if (existingRecipe.isPublic !== true) {
          await ctx.db.patch(existingRecipe._id, { isPublic: true });
        }
        const existingIngredients = await ctx.db
          .query("recipeIngredients")
          .withIndex("by_recipe", (q) => q.eq("recipeId", existingRecipe._id))
          .collect();

        for (const [index, sampleIngredient] of sample.ingredients.entries()) {
          const existingIngredient = existingIngredients.find(
            (ingredient) =>
              ingredient.normalizedName === sampleIngredient[1],
          );
          if (
            existingIngredient !== undefined &&
            existingIngredient.position !== index + 1
          ) {
            await ctx.db.patch(existingIngredient._id, { position: index + 1 });
          }
        }

        recipesSkipped += 1;
        continue;
      }

      const importId = await ctx.db.insert("recipeImports", {
        sourceUrl,
        normalizedUrl: sourceUrl,
        status: "completed",
        attemptCount: 1,
        startedAt: now,
        finishedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      const recipeId = await ctx.db.insert("recipes", {
        importId,
        sourceUrl,
        normalizedSourceUrl: sourceUrl,
        isPublic: true,
        sourceSite: "PerfectPlate Demo Kitchen",
        sourceAuthor: "PerfectPlate",
        title: sample.title,
        description: sample.description,
        yieldText: sample.yieldText,
        servings: sample.servings,
        prepTimeMinutes: sample.prepTimeMinutes,
        cookTimeMinutes: sample.cookTimeMinutes,
        totalTimeMinutes:
          sample.prepTimeMinutes + sample.cookTimeMinutes,
        cuisines: [...sample.cuisines],
        categories: [...sample.categories],
        keywords: [...sample.keywords],
        instructions: sample.instructions.map((text, index) => ({
          position: index + 1,
          text,
        })),
        nutrition: sample.nutrition,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.patch(importId, { recipeId });

      for (const [position, ingredientValues] of sample.ingredients.entries()) {
        const [
          name,
          normalizedName,
          quantity,
          unit,
          quantityText,
          category,
        ] = ingredientValues;
        let ingredient = await ctx.db
          .query("ingredients")
          .withIndex("by_normalized_name", (q) =>
            q.eq("normalizedName", normalizedName),
          )
          .unique();

        if (ingredient === null) {
          const ingredientId = await ctx.db.insert("ingredients", {
            name,
            normalizedName,
            category,
            defaultUnit: unit,
            createdAt: now,
            updatedAt: now,
          });
          ingredient = await ctx.db.get(ingredientId);
          ingredientsInserted += 1;
        }

        if (ingredient === null) {
          throw new Error(`Could not create ingredient: ${name}`);
        }

        await ctx.db.insert("recipeIngredients", {
          recipeId,
          ingredientId: ingredient._id,
          position: position + 1,
          originalText: `${quantityText} ${name}`,
          name,
          normalizedName,
          quantity,
          quantityText,
          unit,
          isOptional: false,
        });
        recipeIngredientsInserted += 1;
      }

      recipesInserted += 1;
    }

    return {
      recipesInserted,
      recipesSkipped,
      ingredientsInserted,
      recipeIngredientsInserted,
    };
  },
});
