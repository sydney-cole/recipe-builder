import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const recipeValidator = v.object({
  _id: v.id("recipes"),
  _creationTime: v.number(),
  importId: v.optional(v.id("recipeImports")),
  sourceUrl: v.string(),
  normalizedSourceUrl: v.string(),
  isPublic: v.optional(v.boolean()),
  sourceSite: v.optional(v.string()),
  sourceAuthor: v.optional(v.string()),
  title: v.string(),
  description: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  yieldText: v.optional(v.string()),
  servings: v.optional(v.number()),
  prepTimeMinutes: v.optional(v.number()),
  cookTimeMinutes: v.optional(v.number()),
  totalTimeMinutes: v.optional(v.number()),
  cuisines: v.array(v.string()),
  categories: v.array(v.string()),
  keywords: v.array(v.string()),
  instructions: v.array(
    v.object({
      position: v.number(),
      text: v.string(),
      section: v.optional(v.string()),
    }),
  ),
  nutrition: v.optional(
    v.object({
      servingSize: v.optional(v.string()),
      calories: v.optional(v.string()),
      protein: v.optional(v.string()),
      carbohydrates: v.optional(v.string()),
      fat: v.optional(v.string()),
      fiber: v.optional(v.string()),
      sugar: v.optional(v.string()),
      sodium: v.optional(v.string()),
    }),
  ),
  deletedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const recipeIngredientValidator = v.object({
  _id: v.id("recipeIngredients"),
  _creationTime: v.number(),
  recipeId: v.id("recipes"),
  ingredientId: v.optional(v.id("ingredients")),
  position: v.number(),
  section: v.optional(v.string()),
  originalText: v.string(),
  name: v.string(),
  normalizedName: v.string(),
  quantity: v.optional(v.number()),
  quantityText: v.optional(v.string()),
  unit: v.optional(v.string()),
  preparation: v.optional(v.string()),
  notes: v.optional(v.string()),
  isOptional: v.boolean(),
});

async function requireUser(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Unauthenticated");
  }
  return userId;
}

export const list = query({
  args: {},
  returns: v.array(recipeValidator),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const [publicRecipes, imports, savedRecipes] = await Promise.all([
      ctx.db
        .query("recipes")
        .withIndex("by_public_and_deleted_at", (q) =>
          q.eq("isPublic", true).eq("deletedAt", undefined),
        )
        .take(200),
      ctx.db
        .query("recipeImports")
        .withIndex("by_requester", (q) => q.eq("requestedBy", userId))
        .take(200),
      ctx.db
        .query("savedRecipes")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(200),
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
      if (recipe !== null && recipe.deletedAt === undefined) {
        recipesById.set(recipe._id, recipe);
      }
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
  returns: v.union(
    v.null(),
    v.object({
      recipe: recipeValidator,
      ingredients: v.array(recipeIngredientValidator),
      saved: v.union(
        v.null(),
        v.object({
          notes: v.optional(v.string()),
          isFavorite: v.boolean(),
        }),
      ),
    }),
  ),
  handler: async (ctx, { recipeId }) => {
    const userId = await requireUser(ctx);
    const id = ctx.db.normalizeId("recipes", recipeId);
    if (id === null) {
      return null;
    }

    const recipe = await ctx.db.get(id);
    if (recipe === null || recipe.deletedAt !== undefined) {
      return null;
    }
    if (!(await canAccessRecipe(ctx, userId, recipe))) {
      return null;
    }

    const ingredients = await ctx.db
      .query("recipeIngredients")
      .withIndex("by_recipe_and_position", (q) => q.eq("recipeId", id))
      .take(200);

    const savedRecipe = await ctx.db
      .query("savedRecipes")
      .withIndex("by_user_and_recipe", (q) =>
        q.eq("userId", userId).eq("recipeId", id),
      )
      .unique();

    return {
      recipe,
      ingredients,
      saved:
        savedRecipe === null
          ? null
          : { notes: savedRecipe.notes, isFavorite: savedRecipe.isFavorite },
    };
  },
});
