import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const listMissing = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      recipeId: v.id("recipes"),
      sourceUrl: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_image_storage_id_and_deleted_at", (q) =>
        q.eq("imageStorageId", undefined).eq("deletedAt", undefined),
      )
      .take(10);
    return recipes.map((recipe) => ({
      recipeId: recipe._id,
      sourceUrl: recipe.sourceUrl,
    }));
  },
});

export const attach = internalMutation({
  args: {
    recipeId: v.id("recipes"),
    imageStorageId: v.id("_storage"),
  },
  returns: v.boolean(),
  handler: async (ctx, { recipeId, imageStorageId }) => {
    const recipe = await ctx.db.get(recipeId);
    if (
      recipe === null ||
      recipe.deletedAt !== undefined ||
      recipe.imageStorageId !== undefined
    ) {
      return false;
    }
    await ctx.db.patch(recipeId, { imageStorageId, updatedAt: Date.now() });
    return true;
  },
});
