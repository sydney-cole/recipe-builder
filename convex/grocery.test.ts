import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/!(*.test).ts");

async function user(t: ReturnType<typeof convexTest>, email: string) {
  return await t.run((ctx) => ctx.db.insert("users", { email, createdAt: Date.now() }));
}

async function savedRecipe(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const recipeId = await ctx.db.insert("recipes", {
      sourceUrl: "https://example.com/soup",
      normalizedSourceUrl: "https://example.com/soup",
      title: "Soup",
      servings: 2,
      cuisines: [],
      categories: [],
      keywords: [],
      instructions: [],
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("savedRecipes", { userId, recipeId, isFavorite: false, createdAt: now, updatedAt: now });
    const onionCatalog = await ctx.db.insert("ingredients", { name: "Onion", normalizedName: "onion", defaultUnit: "cup", createdAt: now, updatedAt: now });
    const onion = await ctx.db.insert("recipeIngredients", { recipeId, ingredientId: onionCatalog, position: 0, originalText: "1 cup onion", name: "Onion", normalizedName: "onion", quantity: 1, unit: "cup", isOptional: false });
    const salt = await ctx.db.insert("recipeIngredients", { recipeId, position: 1, originalText: "Salt to taste", name: "Salt", normalizedName: "salt", quantityText: "to taste", isOptional: false });
    const grams = await ctx.db.insert("recipeIngredients", { recipeId, ingredientId: onionCatalog, position: 2, originalText: "10 g onion", name: "Onion", normalizedName: "onion", quantity: 10, unit: "g", isOptional: false });
    return { recipeId, onion, salt, grams };
  });
}

afterEach(() => vi.useRealTimers());

describe("persistent grocery lists", () => {
  it("creates, lists, renames, completes, archives, and isolates owned lists", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await user(t, "owner@example.com");
    const otherId = await user(t, "other@example.com");
    const owner = t.withIdentity({ subject: ownerId });
    const other = t.withIdentity({ subject: otherId });
    await expect(t.query(api.grocery.list)).rejects.toThrow(/Unauthenticated/);
    const listId = await owner.mutation(api.grocery.create, { name: "  This week  " });
    expect(await owner.query(api.grocery.list)).toMatchObject([{ _id: listId, name: "This week", itemCount: 0 }]);
    expect(await other.query(api.grocery.detail, { listId })).toBeNull();
    await expect(other.mutation(api.grocery.rename, { listId, name: "Stolen" })).rejects.toThrow(/not found/i);
    await owner.mutation(api.grocery.rename, { listId, name: "Weekend" });
    await owner.mutation(api.grocery.setStatus, { listId, status: "completed" });
    expect((await owner.query(api.grocery.detail, { listId }))?.groceryList).toMatchObject({ name: "Weekend", status: "completed" });
    await owner.mutation(api.grocery.setStatus, { listId, status: "archived" });
    expect(await owner.query(api.grocery.list)).toEqual([]);
    await expect(owner.mutation(api.grocery.create, { name: " " })).rejects.toThrow(/required/i);
  });

  it("persists one-off edits, checking, soft removal, undo, and cleanup", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const t = convexTest(schema, modules);
    const ownerId = await user(t, "shopper@example.com");
    const otherId = await user(t, "intruder@example.com");
    const owner = t.withIdentity({ subject: ownerId });
    const other = t.withIdentity({ subject: otherId });
    const listId = await owner.mutation(api.grocery.create, { name: "Shop" });
    const itemId = await owner.mutation(api.grocery.addItem, { listId, name: " Apples ", quantityText: "a few", unit: " Each ", notes: "ripe" });
    await owner.mutation(api.grocery.updateItem, { itemId, name: "Green apples", quantity: 3, unit: "each", notes: "tart" });
    await owner.mutation(api.grocery.checkItem, { itemId, isChecked: true });
    expect((await owner.query(api.grocery.detail, { listId }))?.items[0]).toMatchObject({ name: "Green apples", quantity: 3, unit: "each", notes: "tart", isChecked: true });
    await expect(other.mutation(api.grocery.checkItem, { itemId, isChecked: false })).rejects.toThrow(/not found/i);
    await owner.mutation(api.grocery.removeItem, { itemId });
    expect((await owner.query(api.grocery.detail, { listId }))?.items).toEqual([]);
    await owner.mutation(api.grocery.undoRemove, { itemId });
    expect((await owner.query(api.grocery.detail, { listId }))?.items).toHaveLength(1);
    await owner.mutation(api.grocery.removeItem, { itemId });
    vi.advanceTimersByTime(31_000);
    await expect(owner.mutation(api.grocery.undoRemove, { itemId })).rejects.toThrow(/expired/i);
    expect(await owner.mutation(api.grocery.cleanupExpired, { listId })).toBe(1);
    expect(await owner.mutation(api.grocery.cleanupExpired, { listId })).toBe(0);
  });

  it("adds selected recipe ingredients idempotently, scales, merges compatible units, and preserves provenance", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
    const t = convexTest(schema, modules);
    const ownerId = await user(t, "cook@example.com");
    const otherId = await user(t, "othercook@example.com");
    const owner = t.withIdentity({ subject: ownerId });
    const other = t.withIdentity({ subject: otherId });
    const recipe = await savedRecipe(t, ownerId);
    const listId = await owner.mutation(api.grocery.create, { name: "Dinner" });
    await expect(owner.mutation(api.grocery.addRecipe, { listId, recipeId: recipe.recipeId, ingredientIds: [], servings: 4, requestKey: "empty" })).rejects.toThrow(/select at least one/i);
    await expect(other.mutation(api.grocery.addRecipe, { listId, recipeId: recipe.recipeId, ingredientIds: [recipe.onion], servings: 4, requestKey: "other" })).rejects.toThrow(/not found/i);
    const otherListId = await other.mutation(api.grocery.create, { name: "Other list" });
    await expect(other.mutation(api.grocery.addRecipe, { listId: otherListId, recipeId: recipe.recipeId, ingredientIds: [recipe.onion], servings: 4, requestKey: "private-recipe" })).rejects.toThrow(/recipe not found/i);
    const first = await owner.mutation(api.grocery.addRecipe, { listId, recipeId: recipe.recipeId, ingredientIds: [recipe.onion, recipe.salt, recipe.grams], servings: 4, requestKey: "first" });
    expect(first.duplicate).toBe(false);
    const duplicate = await owner.mutation(api.grocery.addRecipe, { listId, recipeId: recipe.recipeId, ingredientIds: [recipe.onion], servings: 4, requestKey: "first" });
    expect(duplicate).toEqual({ itemIds: first.itemIds, duplicate: true });
    await owner.mutation(api.grocery.addRecipe, { listId, recipeId: recipe.recipeId, ingredientIds: [recipe.onion], servings: 2, requestKey: "deliberate-second" });
    const detail = await owner.query(api.grocery.detail, { listId });
    expect(detail?.items).toHaveLength(3);
    const cups = detail?.items.find((item) => item.unit === "cup");
    expect(cups).toMatchObject({ name: "Onion", quantity: 3 });
    if (!cups) throw new Error("Expected compatible cup item");
    expect(cups?.sources).toHaveLength(2);
    expect(cups?.sources[0]).toMatchObject({ recipeTitle: "Soup", recipeHref: `/app/recipe-book/${recipe.recipeId}` });
    expect(detail?.items.find((item) => item.unit === "g")).toMatchObject({ quantity: 20 });
    expect(detail?.items.find((item) => item.name === "Salt")).toMatchObject({ quantityText: "to taste" });
    await owner.mutation(api.grocery.removeItem, { itemId: cups._id });
    await owner.mutation(api.grocery.undoRemove, { itemId: cups._id });
    expect((await owner.query(api.grocery.detail, { listId }))?.items.find((item) => item._id === cups._id)?.sources).toHaveLength(2);
    await owner.mutation(api.grocery.removeItem, { itemId: cups._id });
    vi.advanceTimersByTime(31_000);
    await owner.mutation(api.grocery.cleanupExpired, { listId });
    const orphanedSources = await t.run((ctx) => ctx.db.query("groceryListItemSources").withIndex("by_grocery_list_item", (q) => q.eq("groceryListItemId", cups._id)).collect());
    expect(orphanedSources).toEqual([]);
  });
});
