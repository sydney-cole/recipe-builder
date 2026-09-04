import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";

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
    await requireUser(ctx);
    return await ctx.db.query("recipes").order("desc").collect();
  },
});

export const get = query({
  args: { recipeId: v.string() },
  handler: async (ctx, { recipeId }) => {
    await requireUser(ctx);
    const id = ctx.db.normalizeId("recipes", recipeId);
    if (id === null) {
      return null;
    }

    const recipe = await ctx.db.get(id);
    if (recipe === null) {
      return null;
    }

    const ingredients = await ctx.db
      .query("recipeIngredients")
      .withIndex("by_recipe_and_position", (q) => q.eq("recipeId", id))
      .collect();

    return { recipe, ingredients };
  },
});
