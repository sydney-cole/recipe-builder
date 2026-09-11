import { createThread } from "@convex-dev/agent";
import { v } from "convex/values";
import { components } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { recipeExtractionValidator } from "./lib/recipeAgentTypes";

function optional<T>(value: T | null): T | undefined {
  return value === null ? undefined : value;
}

function normalizeIngredientName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function sourceSiteFromUrl(sourceUrl: string) {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export const ensureProcessingThread = internalMutation({
  args: { importId: v.id("recipeImports") },
  returns: v.object({
    threadId: v.string(),
    userId: v.id("users"),
  }),
  handler: async (ctx, { importId }) => {
    const recipeImport = await ctx.db.get(importId);
    if (recipeImport === null) throw new Error("Recipe import was not found");
    if (recipeImport.requestedBy === undefined) {
      throw new Error("Recipe import has no owning user");
    }
    if (recipeImport.status === "failed") {
      throw new Error("Failed recipe imports cannot be processed");
    }

    let threadId = recipeImport.agentThreadId;
    if (threadId === undefined) {
      threadId = await createThread(ctx, components.agent, {
        userId: recipeImport.requestedBy,
        title: `Recipe import ${importId}`,
        summary: "Structured extraction of a Firecrawl recipe artifact",
      });
    }

    await ctx.db.patch(importId, {
      agentThreadId: threadId,
      status: recipeImport.recipeId === undefined ? "processing" : recipeImport.status,
      errorMessage: undefined,
      updatedAt: Date.now(),
    });
    return { threadId, userId: recipeImport.requestedBy };
  },
});

export const processingInput = internalQuery({
  args: { importId: v.id("recipeImports") },
  returns: v.union(
    v.null(),
    v.object({
      sourceUrl: v.string(),
      sourceKind: v.optional(
        v.union(
          v.literal("direct"),
          v.literal("email"),
          v.literal("agent_discovery"),
        ),
      ),
      sourceQuery: v.optional(v.string()),
      markdown: v.string(),
      recipeJsonLd: v.optional(v.string()),
      pageTitle: v.optional(v.string()),
      pageDescription: v.optional(v.string()),
      truncated: v.boolean(),
    }),
  ),
  handler: async (ctx, { importId }) => {
    const recipeImport = await ctx.db.get(importId);
    if (
      recipeImport === null ||
      !["scraped", "processing", "parsed", "needs_review"].includes(
        recipeImport.status,
      )
    ) {
      return null;
    }
    const artifact = await ctx.db
      .query("recipeScrapeArtifacts")
      .withIndex("by_import", (q) => q.eq("importId", importId))
      .unique();
    if (artifact === null) return null;
    return {
      sourceUrl: artifact.sourceUrl,
      sourceKind: recipeImport.sourceKind,
      sourceQuery: recipeImport.sourceQuery,
      markdown: artifact.markdown,
      recipeJsonLd: artifact.recipeJsonLd,
      pageTitle: artifact.pageTitle,
      pageDescription: artifact.pageDescription,
      truncated: artifact.truncated,
    };
  },
});

export const persistGeneratedRecipe = internalMutation({
  args: {
    importId: v.id("recipeImports"),
    model: v.string(),
    extraction: recipeExtractionValidator,
    imageStorageId: v.optional(v.id("_storage")),
  },
  returns: v.object({
    recipeId: v.id("recipes"),
    needsReview: v.boolean(),
  }),
  handler: async (ctx, { importId, model, extraction, imageStorageId }) => {
    const recipeImport = await ctx.db.get(importId);
    if (recipeImport === null) throw new Error("Recipe import was not found");
    if (recipeImport.requestedBy === undefined) {
      throw new Error("Recipe import has no owning user");
    }
    if (recipeImport.recipeId !== undefined) {
      return {
        recipeId: recipeImport.recipeId,
        needsReview: recipeImport.status === "needs_review",
      };
    }

    const artifact = await ctx.db
      .query("recipeScrapeArtifacts")
      .withIndex("by_import", (q) => q.eq("importId", importId))
      .unique();
    if (artifact === null) throw new Error("Recipe scrape artifact was not found");
    if (extraction.ingredients.length === 0 || extraction.instructions.length === 0) {
      throw new Error("The agent did not find a complete recipe");
    }

    const now = Date.now();
    const recipeId = await ctx.db.insert("recipes", {
      importId,
      sourceUrl: artifact.sourceUrl,
      normalizedSourceUrl: artifact.normalizedUrl,
      isPublic: false,
      sourceSite:
        optional(extraction.sourceSite) ?? sourceSiteFromUrl(artifact.sourceUrl),
      sourceAuthor: optional(extraction.sourceAuthor),
      title: extraction.title.trim(),
      description: optional(extraction.description),
      imageStorageId,
      yieldText: optional(extraction.yieldText),
      servings: optional(extraction.servings),
      prepTimeMinutes: optional(extraction.prepTimeMinutes),
      cookTimeMinutes: optional(extraction.cookTimeMinutes),
      totalTimeMinutes: optional(extraction.totalTimeMinutes),
      cuisines: extraction.cuisines,
      categories: extraction.categories,
      keywords: extraction.keywords,
      instructions: extraction.instructions.map((instruction, index) => ({
        position: index + 1,
        text: instruction.text.trim(),
        ...(instruction.section === null
          ? {}
          : { section: instruction.section.trim() }),
      })),
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("savedRecipes", {
      userId: recipeImport.requestedBy,
      recipeId,
      isFavorite: false,
      createdAt: now,
      updatedAt: now,
    });

    for (const [index, ingredient] of extraction.ingredients.entries()) {
      const normalizedName =
        normalizeIngredientName(ingredient.normalizedName) ||
        normalizeIngredientName(ingredient.name);
      let catalogIngredient = await ctx.db
        .query("ingredients")
        .withIndex("by_normalized_name", (q) =>
          q.eq("normalizedName", normalizedName),
        )
        .first();
      if (catalogIngredient === null) {
        const ingredientId = await ctx.db.insert("ingredients", {
          name: ingredient.name.trim(),
          normalizedName,
          category: optional(ingredient.category),
          defaultUnit: optional(ingredient.unit),
          createdAt: now,
          updatedAt: now,
        });
        catalogIngredient = await ctx.db.get(ingredientId);
      }
      if (catalogIngredient === null) {
        throw new Error("Ingredient catalog write failed");
      }

      await ctx.db.insert("recipeIngredients", {
        recipeId,
        ingredientId: catalogIngredient._id,
        position: index + 1,
        section: optional(ingredient.section),
        originalText: ingredient.originalText.trim(),
        name: ingredient.name.trim(),
        normalizedName,
        quantity: optional(ingredient.quantity),
        quantityText: optional(ingredient.quantityText),
        unit: optional(ingredient.unit),
        preparation: optional(ingredient.preparation),
        notes: optional(ingredient.notes),
        isOptional: ingredient.isOptional,
      });
    }

    const warnings = [
      ...extraction.warnings.map((warning) => warning.trim()).filter(Boolean),
      ...(artifact.truncated
        ? ["The source scrape was truncated; review the generated recipe."]
        : []),
    ].slice(0, 20);
    const needsReview = warnings.length > 0;
    await ctx.db.patch(importId, {
      recipeId,
      agentModel: model,
      agentWarnings: warnings,
      status: needsReview ? "needs_review" : "completed",
      errorMessage: undefined,
      finishedAt: now,
      updatedAt: now,
    });
    return { recipeId, needsReview };
  },
});
