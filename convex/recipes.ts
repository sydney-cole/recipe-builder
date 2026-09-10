import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import { accessibleRecipe } from "./lib/access";

async function requireUser(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Unauthenticated");
  }
  return userId;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const savedRecipes = await ctx.db
        .query("savedRecipes")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
    const uniqueRelationships = new Map(
      [...savedRecipes]
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((relationship) => [relationship.recipeId, relationship]),
    );
    return (
      await Promise.all(
        [...uniqueRelationships.values()].map(async (relationship) => ({
          recipe: await ctx.db.get(relationship.recipeId),
          savedAt: relationship.createdAt,
        })),
      )
    ).flatMap(({ recipe, savedAt }) =>
      recipe === null ? [] : [{ ...recipe, savedAt }],
    ).sort((a, b) => b.savedAt - a.savedAt);
  },
});

export const get = query({
  args: { recipeId: v.string() },
  handler: async (ctx, { recipeId }) => {
    const userId = await requireUser(ctx);
    const id = ctx.db.normalizeId("recipes", recipeId);
    if (id === null) {
      return null;
    }

    const recipe = await accessibleRecipe(ctx, userId, id);
    if (recipe === null) return null;

    const ingredients = await ctx.db
      .query("recipeIngredients")
      .withIndex("by_recipe_and_position", (q) => q.eq("recipeId", id))
      .collect();

    return { recipe, ingredients };
  },
});

export const summary = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const [saved, imports] = await Promise.all([
      ctx.db
        .query("savedRecipes")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("recipeImports")
        .withIndex("by_requester", (q) => q.eq("requestedBy", userId))
        .collect(),
    ]);
    const recentRelationships = [...saved]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 3);
    const recentRecipes = (
      await Promise.all(
        recentRelationships.map(async (relationship) => ({
          relationship,
          recipe: await ctx.db.get(relationship.recipeId),
        })),
      )
    ).flatMap(({ relationship, recipe }) =>
      recipe === null
        ? []
        : [{ recipe, savedAt: relationship.createdAt }],
    );
    return {
      recipeCount: saved.length,
      importCount: imports.length,
      needsAttention: imports.filter((item) => item.status === "failed").length,
      processingCount: imports.filter(
        (item) => item.status === "queued" || item.status === "scraping",
      ).length,
      recentRecipes,
    };
  },
});
