import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

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
    const [publicRecipes, imports, savedRecipes] = await Promise.all([
      ctx.db
        .query("recipes")
        .withIndex("by_public", (q) => q.eq("isPublic", true))
        .collect(),
      ctx.db
        .query("recipeImports")
        .withIndex("by_requester", (q) => q.eq("requestedBy", userId))
        .collect(),
      ctx.db
        .query("savedRecipes")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    ]);

    const recipeIds = new Set<Id<"recipes">>([
      ...imports.flatMap((item) => (item.recipeId ? [item.recipeId] : [])),
      ...savedRecipes.map((item) => item.recipeId),
    ]);
    const privateRecipes = await Promise.all(
      [...recipeIds].map((recipeId) => ctx.db.get(recipeId)),
    );
    const recipesById = new Map<string, Doc<"recipes">>();
    for (const recipe of [...publicRecipes, ...privateRecipes]) {
      if (recipe !== null) recipesById.set(recipe._id, recipe);
    }

    return [...recipesById.values()].sort(
      (a, b) => b._creationTime - a._creationTime,
    );
  },
});

async function canAccessRecipe(
  ctx: QueryCtx,
  userId: Id<"users">,
  recipe: Doc<"recipes">,
) {
  if (recipe.isPublic === true) return true;

  const saved = await ctx.db
    .query("savedRecipes")
    .withIndex("by_user_and_recipe", (q) =>
      q.eq("userId", userId).eq("recipeId", recipe._id),
    )
    .first();
  if (saved !== null) return true;

  if (recipe.importId === undefined) return false;
  const recipeImport = await ctx.db.get(recipe.importId);
  return recipeImport?.requestedBy === userId;
}

export const get = query({
  args: { recipeId: v.string() },
  handler: async (ctx, { recipeId }) => {
    const userId = await requireUser(ctx);
    const id = ctx.db.normalizeId("recipes", recipeId);
    if (id === null) {
      return null;
    }

    const recipe = await ctx.db.get(id);
    if (recipe === null) {
      return null;
    }
    if (!(await canAccessRecipe(ctx, userId, recipe))) {
      return null;
    }

    const ingredients = await ctx.db
      .query("recipeIngredients")
      .withIndex("by_recipe_and_position", (q) => q.eq("recipeId", id))
      .collect();

    return { recipe, ingredients };
  },
});
