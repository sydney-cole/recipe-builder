import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireUser } from "./lib/auth";
import { canAccessRecipe } from "./lib/recipeAccess";

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

const bookRecipeValidator = v.object({
  ...recipeValidator.fields,
  isFavorite: v.boolean(),
  /** Whether this user owns the recipe, so removing it deletes it rather than only unsaving it. */
  canEdit: v.boolean(),
});

const RECIPE_BOOK_LIMIT = 500;

const importStatusValidator = v.union(
  v.literal("queued"),
  v.literal("scraping"),
  v.literal("scraped"),
  v.literal("processing"),
  v.literal("parsed"),
  v.literal("needs_review"),
  v.literal("completed"),
  v.literal("failed"),
);

const importReviewValidator = v.object({
  importId: v.id("recipeImports"),
  status: importStatusValidator,
  warnings: v.array(v.string()),
  generatedGroceryListId: v.optional(v.id("groceryLists")),
});

async function recipeView(ctx: QueryCtx, recipe: Doc<"recipes">) {
  const { imageStorageId, ...visibleRecipe } = recipe;
  const storedImageUrl = imageStorageId
    ? await ctx.storage.getUrl(imageStorageId)
    : null;
  return {
    ...visibleRecipe,
    imageUrl: storedImageUrl ?? recipe.imageUrl,
  };
}

export const listRecent = query({
  args: {},
  returns: v.array(recipeValidator),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const imports = await ctx.db
      .query("recipeImports")
      .withIndex("by_requester", (q) => q.eq("requestedBy", userId))
      .order("desc")
      .take(50);
    const recipes = await Promise.all(
      imports.flatMap((item) => item.recipeId ? [ctx.db.get(item.recipeId)] : []),
    );
    return await Promise.all(
      recipes
        .filter((recipe): recipe is Doc<"recipes"> => recipe !== null && recipe.deletedAt === undefined)
        .slice(0, 3)
        .map((recipe) => recipeView(ctx, recipe)),
    );
  },
});

export const listBook = query({
  args: {},
  returns: v.array(bookRecipeValidator),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const saved = await ctx.db
      .query("savedRecipes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(RECIPE_BOOK_LIMIT);
    const entries = await Promise.all(
      saved.map(async (item) => ({
        recipe: await ctx.db.get(item.recipeId),
        isFavorite: item.isFavorite,
      })),
    );
    return await Promise.all(
      entries
        .filter(
          (entry): entry is { recipe: Doc<"recipes">; isFavorite: boolean } =>
            entry.recipe !== null && entry.recipe.deletedAt === undefined,
        )
        .map(async ({ recipe, isFavorite }) => {
          const recipeImport = recipe.importId === undefined ? null : await ctx.db.get(recipe.importId);
          return {
            ...(await recipeView(ctx, recipe)),
            isFavorite,
            canEdit: recipeImport?.requestedBy === userId,
          };
        }),
    );
  },
});

export const savedIds = query({
  args: {},
  returns: v.array(v.id("recipes")),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const saved = await ctx.db
      .query("savedRecipes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(RECIPE_BOOK_LIMIT);
    return saved.map((item) => item.recipeId);
  },
});

export const current = query({
  args: {},
  returns: v.union(v.null(), recipeValidator),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const user = await ctx.db.get(userId);
    if (user?.currentRecipeId === undefined) return null;
    const recipe = await ctx.db.get(user.currentRecipeId);
    if (
      recipe === null ||
      recipe.deletedAt !== undefined ||
      !(await canAccessRecipe(ctx, userId, recipe))
    ) {
      return null;
    }
    return await recipeView(ctx, recipe);
  },
});

export const currentId = query({
  args: {},
  returns: v.union(v.null(), v.id("recipes")),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const user = await ctx.db.get(userId);
    return user?.currentRecipeId ?? null;
  },
});

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
      importReview: v.union(v.null(), importReviewValidator),
      canEdit: v.boolean(),
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

    const recipeImport =
      recipe.importId === undefined ? null : await ctx.db.get(recipe.importId);
    const importReview =
      recipeImport?.requestedBy === userId
        ? {
            importId: recipeImport._id,
            status: recipeImport.status,
            warnings: recipeImport.agentWarnings ?? [],
            generatedGroceryListId: recipeImport.generatedGroceryListId,
          }
        : null;

    return {
      recipe: await recipeView(ctx, recipe),
      ingredients,
      saved:
        savedRecipe === null
          ? null
          : { notes: savedRecipe.notes, isFavorite: savedRecipe.isFavorite },
      importReview,
      canEdit: recipeImport?.requestedBy === userId,
    };
  },
});
