import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { initAuthTest, signedInUser, type AuthTest } from "./testing.helpers";

async function createRecipe(
  t: AuthTest,
  userId: Id<"users">,
  title: string,
  options: { servings?: number; ingredients?: { name: string; quantity: number; unit: string }[] } = {},
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const recipeId = await ctx.db.insert("recipes", {
      sourceUrl: `https://example.com/${title}`,
      normalizedSourceUrl: `https://example.com/${title}`,
      title,
      servings: options.servings,
      cuisines: [],
      categories: [],
      keywords: [],
      instructions: [],
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("savedRecipes", { userId, recipeId, isFavorite: false, createdAt: now, updatedAt: now });
    for (const [position, ingredient] of (options.ingredients ?? []).entries()) {
      await ctx.db.insert("recipeIngredients", {
        recipeId,
        position,
        originalText: `${ingredient.quantity} ${ingredient.unit} ${ingredient.name}`,
        name: ingredient.name,
        normalizedName: ingredient.name,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        isOptional: false,
      });
    }
    return recipeId;
  });
}

async function listItems(t: AuthTest, listId: Id<"groceryLists">) {
  return await t.run(async (ctx) =>
    (await ctx.db.query("groceryListItems").withIndex("by_list", (q) => q.eq("listId", listId)).collect())
      .map((item) => ({ name: item.name, quantity: item.quantity }))
      .sort((first, second) => first.name.localeCompare(second.name)),
  );
}

const week = { startDate: "2026-11-15", endDate: "2026-11-21" };

describe("meal plan entries", () => {
  it("adds free-text and recipe meals and lists them for the week", async () => {
    const t = initAuthTest();
    const ada = await signedInUser(t, "ada@example.com");
    const recipeId = await createRecipe(t, ada.userId, "Chili", { servings: 4 });

    await ada.as.mutation(api.mealPlans.add, { date: "2026-11-16", slot: "lunch", title: "  Eating out  ", isLeftovers: true });
    await ada.as.mutation(api.mealPlans.add, { date: "2026-11-16", slot: "dinner", recipeId, title: "ignored" });
    await ada.as.mutation(api.mealPlans.add, { date: "2026-11-22", slot: "dinner", title: "Next week" });

    expect(await ada.as.query(api.mealPlans.listRange, week)).toMatchObject([
      { date: "2026-11-16", slot: "lunch", title: "Eating out", isLeftovers: false, recipe: null },
      { date: "2026-11-16", slot: "dinner", title: "Chili", recipe: { id: recipeId, title: "Chili", servings: 4, isSaved: true } },
    ]);
  });

  it("keeps each user's plan private", async () => {
    const t = initAuthTest();
    const ada = await signedInUser(t, "ada@example.com");
    const grace = await signedInUser(t, "grace@example.com");
    const privateRecipe = await createRecipe(t, ada.userId, "Secret stew");
    const entryId = await ada.as.mutation(api.mealPlans.add, { date: "2026-11-16", slot: "dinner", recipeId: privateRecipe });

    expect(await grace.as.query(api.mealPlans.listRange, week)).toEqual([]);
    await expect(grace.as.mutation(api.mealPlans.add, { date: "2026-11-16", slot: "dinner", recipeId: privateRecipe })).rejects.toThrow(/Forbidden/);
    await expect(grace.as.mutation(api.mealPlans.remove, { entryId })).rejects.toThrow(/Forbidden/);
    await expect(grace.as.mutation(api.mealPlans.setLeftovers, { entryId, isLeftovers: true })).rejects.toThrow(/Forbidden/);
    await expect(t.query(api.mealPlans.listRange, week)).rejects.toThrow(/Unauthenticated/);

    await ada.as.mutation(api.mealPlans.remove, { entryId });
    expect(await ada.as.query(api.mealPlans.listRange, week)).toEqual([]);
    await expect(ada.as.mutation(api.mealPlans.remove, { entryId })).rejects.toThrow(/not found/);
  });

  it("validates dates, names and slot size", async () => {
    const t = initAuthTest();
    const ada = await signedInUser(t, "ada@example.com");
    const add = (args: { date: string; title?: string }) =>
      ada.as.mutation(api.mealPlans.add, { slot: "dinner", ...args });

    await expect(add({ date: "11/16/2026", title: "Soup" })).rejects.toThrow(/YYYY-MM-DD/);
    await expect(add({ date: "2026-02-30", title: "Soup" })).rejects.toThrow(/YYYY-MM-DD/);
    await expect(add({ date: "2026-11-16", title: "   " })).rejects.toThrow(/between 1 and 80/);
    await expect(add({ date: "2026-11-16" })).rejects.toThrow(/between 1 and 80/);
    await expect(add({ date: "2026-11-16", title: "x".repeat(81) })).rejects.toThrow(/between 1 and 80/);
    await expect(ada.as.query(api.mealPlans.listRange, { startDate: "2026-11-21", endDate: "2026-11-15" })).rejects.toThrow(/before the start/);
    await expect(ada.as.query(api.mealPlans.listRange, { startDate: "2026-01-01", endDate: "2026-03-01" })).rejects.toThrow(/at most 31 days/);

    for (let count = 0; count < 10; count++) await add({ date: "2026-11-16", title: `Meal ${count}` });
    await expect(add({ date: "2026-11-16", title: "One too many" })).rejects.toThrow(/at most 10/);
    await ada.as.mutation(api.mealPlans.add, { date: "2026-11-16", slot: "lunch", title: "Other slots still have room" });
  });

  it("marks leftovers and servings on recipe meals only", async () => {
    const t = initAuthTest();
    const ada = await signedInUser(t, "ada@example.com");
    const recipeId = await createRecipe(t, ada.userId, "Chili", { servings: 4 });
    const recipeEntry = await ada.as.mutation(api.mealPlans.add, { date: "2026-11-16", slot: "dinner", recipeId, isLeftovers: true });
    const textEntry = await ada.as.mutation(api.mealPlans.add, { date: "2026-11-17", slot: "dinner", title: "Takeout" });

    await ada.as.mutation(api.mealPlans.setLeftovers, { entryId: recipeEntry, isLeftovers: false });
    await ada.as.mutation(api.mealPlans.setServings, { entryId: recipeEntry, servings: 6 });
    expect(await ada.as.query(api.mealPlans.listRange, week)).toMatchObject([
      { isLeftovers: false, servings: 6 },
      { title: "Takeout" },
    ]);

    await expect(ada.as.mutation(api.mealPlans.setServings, { entryId: recipeEntry, servings: 0 })).rejects.toThrow(/whole number/);
    await expect(ada.as.mutation(api.mealPlans.setServings, { entryId: recipeEntry, servings: 2.5 })).rejects.toThrow(/whole number/);
    await expect(ada.as.mutation(api.mealPlans.setServings, { entryId: textEntry, servings: 2 })).rejects.toThrow(/linked to a recipe/);
    await expect(ada.as.mutation(api.mealPlans.setLeftovers, { entryId: textEntry, isLeftovers: true })).rejects.toThrow(/linked to a recipe/);
  });

  it("keeps a meal readable after its recipe is deleted", async () => {
    const t = initAuthTest();
    const ada = await signedInUser(t, "ada@example.com");
    const recipeId = await createRecipe(t, ada.userId, "Chili");
    await ada.as.mutation(api.mealPlans.add, { date: "2026-11-16", slot: "dinner", recipeId });
    await t.run(async (ctx) => ctx.db.patch(recipeId, { deletedAt: Date.now() }));

    expect(await ada.as.query(api.mealPlans.listRange, week)).toMatchObject([{ title: "Chili", recipe: null }]);
    await expect(ada.as.mutation(api.mealPlans.add, { date: "2026-11-17", slot: "dinner", recipeId })).rejects.toThrow(/not found/);
    await expect(ada.as.mutation(api.groceryLists.createFromMealPlan, { ...week, name: "Week" })).rejects.toThrow(/Nothing to buy is planned/);
  });
});

describe("grocery list from a meal plan", () => {
  it("combines the week's recipes, scaled by planned servings, and skips leftovers", async () => {
    const t = initAuthTest();
    const ada = await signedInUser(t, "ada@example.com");
    const chili = await createRecipe(t, ada.userId, "Chili", {
      servings: 4,
      ingredients: [{ name: "beans", quantity: 2, unit: "cups" }, { name: "onion", quantity: 1, unit: "whole" }],
    });
    const soup = await createRecipe(t, ada.userId, "Soup", {
      ingredients: [{ name: "onion", quantity: 1, unit: "whole" }, { name: "carrot", quantity: 3, unit: "whole" }],
    });
    const add = (date: string, recipeId: Id<"recipes">, isLeftovers = false) =>
      ada.as.mutation(api.mealPlans.add, { date, slot: "dinner", recipeId, isLeftovers });

    const bigBatch = await add("2026-11-15", chili);
    await ada.as.mutation(api.mealPlans.setServings, { entryId: bigBatch, servings: 8 });
    await add("2026-11-16", chili, true);
    await add("2026-11-17", chili);
    await add("2026-11-18", soup);
    await add("2026-11-22", soup);
    await ada.as.mutation(api.mealPlans.add, { date: "2026-11-19", slot: "dinner", title: "Eating out" });

    const listId = await ada.as.mutation(api.groceryLists.createFromMealPlan, { ...week, name: " Meal plan " });

    expect(await listItems(t, listId)).toEqual([
      { name: "beans", quantity: 6 },
      { name: "carrot", quantity: 3 },
      { name: "onion", quantity: 4 },
    ]);
    const list = await t.run(async (ctx) => ctx.db.get(listId));
    expect(list).toMatchObject({ name: "Meal plan", status: "active", userId: ada.userId });
    expect(list?.sourceRecipeIds).toEqual([chili, soup]);
  });

  it("adds the items to buy for meals without a recipe, merged with recipe ingredients", async () => {
    const t = initAuthTest();
    const ada = await signedInUser(t, "ada@example.com");
    const soup = await createRecipe(t, ada.userId, "Soup", {
      ingredients: [{ name: "bread", quantity: 1, unit: "loaf" }],
    });
    await ada.as.mutation(api.mealPlans.add, { date: "2026-11-16", slot: "dinner", recipeId: soup, groceryItems: ["ignored"] });
    const toast = await ada.as.mutation(api.mealPlans.add, {
      date: "2026-11-17", slot: "breakfast", title: "Toast with jelly", groceryItems: [" 2 loaves  bread ", "", "Jelly"],
    });
    await ada.as.mutation(api.mealPlans.add, { date: "2026-11-18", slot: "breakfast", title: "More toast", groceryItems: ["jelly"] });

    expect(await ada.as.query(api.mealPlans.listRange, week)).toMatchObject([
      { title: "Soup", groceryItems: [] },
      { title: "Toast with jelly", groceryItems: ["2 loaves bread", "Jelly"] },
      { title: "More toast", groceryItems: ["jelly"] },
    ]);

    const listId = await ada.as.mutation(api.groceryLists.createFromMealPlan, { ...week, name: "Week" });
    expect(await listItems(t, listId)).toEqual([
      { name: "bread", quantity: 3 },
      { name: "jelly", quantity: undefined },
    ]);

    await ada.as.mutation(api.mealPlans.setGroceryItems, { entryId: toast, groceryItems: [] });
    expect((await ada.as.query(api.mealPlans.listRange, week))[1].groceryItems).toEqual([]);
  });

  it("creates a list from items to buy alone and validates them", async () => {
    const t = initAuthTest();
    const ada = await signedInUser(t, "ada@example.com");
    const grace = await signedInUser(t, "grace@example.com");
    const soup = await createRecipe(t, ada.userId, "Soup");
    const recipeEntry = await ada.as.mutation(api.mealPlans.add, { date: "2026-11-16", slot: "dinner", recipeId: soup, isLeftovers: true });
    const toast = await ada.as.mutation(api.mealPlans.add, { date: "2026-11-17", slot: "breakfast", title: "Toast" });
    const setItems = (entryId: Id<"mealPlanEntries">, groceryItems: string[], as = ada.as) =>
      as.mutation(api.mealPlans.setGroceryItems, { entryId, groceryItems });

    await expect(setItems(recipeEntry, ["bread"])).rejects.toThrow(/from the recipe/);
    await expect(setItems(toast, ["bread"], grace.as)).rejects.toThrow(/Forbidden/);
    await expect(setItems(toast, Array.from({ length: 21 }, (_, index) => `item ${index}`))).rejects.toThrow(/at most 20/);
    await expect(setItems(toast, ["x".repeat(101)])).rejects.toThrow(/at most 100 characters/);

    await setItems(toast, ["bread"]);
    const listId = await ada.as.mutation(api.groceryLists.createFromMealPlan, { ...week, name: "Week" });
    expect(await listItems(t, listId)).toEqual([{ name: "bread", quantity: undefined }]);
  });

  it("rejects weeks with nothing to cook, long ranges and extreme servings", async () => {
    const t = initAuthTest();
    const ada = await signedInUser(t, "ada@example.com");
    const chili = await createRecipe(t, ada.userId, "Chili", { servings: 1 });
    const create = (range = week) => ada.as.mutation(api.groceryLists.createFromMealPlan, { ...range, name: "Week" });

    await expect(create()).rejects.toThrow(/Nothing to buy is planned/);
    await ada.as.mutation(api.mealPlans.add, { date: "2026-11-16", slot: "dinner", recipeId: chili, isLeftovers: true });
    await expect(create()).rejects.toThrow(/Nothing to buy is planned/);
    await expect(create({ startDate: "2026-11-15", endDate: "2026-11-22" })).rejects.toThrow(/at most 7 days/);
    await expect(t.mutation(api.groceryLists.createFromMealPlan, { ...week, name: "Week" })).rejects.toThrow(/Unauthenticated/);

    for (const date of ["2026-11-17", "2026-11-18"]) {
      const entryId = await ada.as.mutation(api.mealPlans.add, { date, slot: "dinner", recipeId: chili });
      await ada.as.mutation(api.mealPlans.setServings, { entryId, servings: 60 });
    }
    await expect(create()).rejects.toThrow(/planned servings for Chili/);
  });
});
