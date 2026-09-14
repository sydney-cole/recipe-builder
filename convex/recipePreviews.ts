import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { normalizeRecipeUrl } from "./lib/urls";

const nullableNumber = v.union(v.number(), v.null());

function boundedText(value: string, label: string, maximum: number) {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum) {
    throw new Error(`${label} must be between 1 and ${maximum} characters`);
  }
  return normalized;
}

function sourceSite(url: string) {
  return new URL(url).hostname.replace(/^www\./, "");
}

export const createFromDiscovery = mutation({
  args: {
    url: v.string(),
    title: v.string(),
    description: v.string(),
    source: v.string(),
    totalTimeMinutes: nullableNumber,
    matchedTerms: v.array(v.string()),
    ingredients: v.array(v.string()),
    instructions: v.array(v.string()),
    sourceQuery: v.string(),
  },
  returns: v.id("recipes"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Unauthenticated");

    const normalizedUrl = normalizeRecipeUrl(args.url);
    const title = boundedText(args.title, "Recipe title", 300);
    const description = args.description.trim().slice(0, 2_000);
    const query = boundedText(args.sourceQuery, "Source query", 500);
    if (args.ingredients.length === 0 || args.ingredients.length > 200) {
      throw new Error("A recipe must have between 1 and 200 ingredients");
    }
    if (args.instructions.length === 0 || args.instructions.length > 100) {
      throw new Error("A recipe must have between 1 and 100 instructions");
    }
    if (
      args.totalTimeMinutes !== null &&
      (!Number.isFinite(args.totalTimeMinutes) ||
        args.totalTimeMinutes < 0 ||
        args.totalTimeMinutes > 10_080)
    ) {
      throw new Error("Total time must be between 0 and 10080 minutes");
    }

    const existingImport = await ctx.db
      .query("recipeImports")
      .withIndex("by_requester_and_normalized_url", (q) =>
        q.eq("requestedBy", userId).eq("normalizedUrl", normalizedUrl),
      )
      .order("desc")
      .first();
    if (existingImport?.recipeId !== undefined) {
      const existingRecipe = await ctx.db.get(existingImport.recipeId);
      if (existingRecipe !== null && existingRecipe.deletedAt === undefined) {
        return existingRecipe._id;
      }
    }

    const now = Date.now();
    const importId = await ctx.db.insert("recipeImports", {
      requestedBy: userId,
      sourceUrl: args.url.trim(),
      normalizedUrl,
      sourceKind: "agent_discovery",
      sourceQuery: query,
      status: "completed",
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
      finishedAt: now,
    });
    const recipeId = await ctx.db.insert("recipes", {
      importId,
      sourceUrl: args.url.trim(),
      normalizedSourceUrl: normalizedUrl,
      isPublic: false,
      sourceSite: args.source.trim().slice(0, 200) || sourceSite(normalizedUrl),
      title,
      description: description || undefined,
      totalTimeMinutes: args.totalTimeMinutes ?? undefined,
      cuisines: [],
      categories: args.matchedTerms
        .map((term) => term.trim())
        .filter(Boolean)
        .slice(0, 20),
      keywords: [],
      instructions: args.instructions.map((instruction, index) => ({
        position: index + 1,
        text: boundedText(instruction, "Instruction", 5_000),
      })),
      createdAt: now,
      updatedAt: now,
    });

    for (const [index, ingredient] of args.ingredients.entries()) {
      const originalText = boundedText(ingredient, "Ingredient", 1_000);
      const normalizedName = originalText.toLowerCase().replace(/\s+/g, " ");
      await ctx.db.insert("recipeIngredients", {
        recipeId,
        position: index + 1,
        originalText,
        name: originalText,
        normalizedName,
        isOptional: false,
      });
    }
    await ctx.db.patch(importId, { recipeId });
    return recipeId;
  },
});
