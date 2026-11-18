// Validators shared by the planner schema and functions.
import { v } from "convex/values";

export const mealValidator = v.union(v.literal("breakfast"), v.literal("lunch"), v.literal("dinner"));
export const slotTypeValidator = v.union(
  v.literal("cook"),
  v.literal("left"),
  v.literal("out"),
  v.literal("skip"),
);
export const weekStartValidator = v.union(v.literal(0), v.literal(1), v.literal(6));
export const slotRefValidator = v.object({ date: v.string(), meal: mealValidator });
export const importStatusValidator = v.union(
  v.literal("queued"),
  v.literal("scraping"),
  v.literal("scraped"),
  v.literal("processing"),
  v.literal("parsed"),
  v.literal("needs_review"),
  v.literal("completed"),
  v.literal("failed"),
);
export const leftoverFromValidator = v.union(slotRefValidator, v.literal("other"));
/** A Cook slot a week's grocery list leaves out, and why (`convex/lib/planGrocery.ts`). */
export const notIncludedValidator = v.object({
  date: v.string(),
  meal: mealValidator,
  name: v.string(),
  reason: v.union(
    v.literal("no-recipe"),
    v.literal("recipe-unavailable"),
    v.literal("import-pending"),
    v.literal("no-ingredients"),
  ),
});

const slotBase = {
  plannerId: v.id("planners"),
  date: v.string(),
  meal: mealValidator,
  updatedBy: v.id("users"),
  updatedAt: v.number(),
};

/** One planned slot. The type belongs to the slot, not to the meal it names. */
export const planSlotValidator = v.union(
  v.object({
    ...slotBase,
    type: v.literal("cook"),
    recipeId: v.optional(v.id("recipes")),
    // A typed name with no recipe attached. Typing never creates a recipe;
    // the user attaches, creates or imports one deliberately.
    name: v.optional(v.string()),
    // A recipe link pasted into the slot: the import the user reviews and
    // saves in the app's import flow, and a name to show until then.
    importId: v.optional(v.id("recipeImports")),
    importName: v.optional(v.string()),
  }),
  v.object({ ...slotBase, type: v.literal("out"), mealId: v.optional(v.id("plannerMeals")) }),
  v.object({
    ...slotBase,
    type: v.literal("left"),
    from: leftoverFromValidator,
    mealId: v.optional(v.id("plannerMeals")),
  }),
  v.object({ ...slotBase, type: v.literal("skip") }),
);
