// Creating a recipe that belongs to one user. A recipe's owner is the
// `requestedBy` of its `recipeImports` row (see `requireOwnedRecipe`), so a
// recipe typed in by hand gets a synthetic completed import.
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { parseManualIngredient } from "./manualIngredient";
import { normalizeRecipeUrl } from "./urls";

export type UserRecipeFields = {
  title: string;
  description?: string;
  sourceUrl?: string;
  servings?: number;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  /** One line per ingredient; may be empty for a bare recipe. */
  ingredients: string[];
  /** One line per step; may be empty for a bare recipe. */
  instructions: string[];
};

export async function ingredientCatalogEntry(
  ctx: MutationCtx,
  name: string,
  normalizedName: string,
  unit?: string,
) {
  const existing = await ctx.db
    .query("ingredients")
    .withIndex("by_normalized_name", (q) => q.eq("normalizedName", normalizedName))
    .first();
  if (existing !== null) return existing._id;
  const now = Date.now();
  return await ctx.db.insert("ingredients", {
    name,
    normalizedName,
    defaultUnit: unit,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Inserts a recipe owned by `userId` and saves it to their Recipe Book.
 * Callers validate the fields; this applies no minimum counts.
 */
export async function insertUserRecipe(
  ctx: MutationCtx,
  userId: Id<"users">,
  fields: UserRecipeFields,
): Promise<Id<"recipes">> {
  const { sourceUrl, prepTimeMinutes, cookTimeMinutes } = fields;
  const normalizedSourceUrl = sourceUrl
    ? normalizeRecipeUrl(sourceUrl)
    : `manual:${userId}:${Date.now()}`;
  const now = Date.now();
  const importId = await ctx.db.insert("recipeImports", {
    requestedBy: userId,
    sourceUrl: sourceUrl ?? "",
    normalizedUrl: normalizedSourceUrl,
    status: "completed",
    attemptCount: 0,
    startedAt: now,
    finishedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  const recipeId = await ctx.db.insert("recipes", {
    importId,
    sourceUrl: sourceUrl ?? "",
    normalizedSourceUrl,
    isPublic: false,
    sourceSite: sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, "") : "Manual recipe",
    title: fields.title,
    description: fields.description,
    servings: fields.servings,
    prepTimeMinutes,
    cookTimeMinutes,
    totalTimeMinutes:
      prepTimeMinutes !== undefined && cookTimeMinutes !== undefined
        ? prepTimeMinutes + cookTimeMinutes
        : undefined,
    cuisines: [],
    categories: [],
    keywords: [],
    instructions: fields.instructions.map((text, index) => ({ position: index + 1, text })),
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(importId, { recipeId });
  await ctx.db.insert("savedRecipes", {
    userId,
    recipeId,
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
  });
  for (const [index, originalText] of fields.ingredients.entries()) {
    const parsed = parseManualIngredient(originalText);
    const ingredientId = await ingredientCatalogEntry(ctx, parsed.name, parsed.normalizedName, parsed.unit);
    await ctx.db.insert("recipeIngredients", {
      recipeId,
      ingredientId,
      position: index + 1,
      ...parsed,
      isOptional: false,
    });
  }
  return recipeId;
}
