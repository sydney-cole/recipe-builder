import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import { ownedDraft, ownedImport, requireUserId } from "./lib/access";
import {
  safeImportError,
  type ImportErrorCategory,
  type RecipeDraftInput,
  validateRecipeDraft,
} from "./lib/validation";

const importErrorCategory = v.union(
  v.literal("invalid_source"),
  v.literal("no_recipe"),
  v.literal("provider_temporary"),
  v.literal("rate_limited"),
  v.literal("model_refusal"),
  v.literal("incomplete_response"),
  v.literal("invalid_output"),
  v.literal("configuration"),
);

export const claim = internalMutation({
  args: { importId: v.id("recipeImports") },
  handler: async (ctx, { importId }) => {
    const recipeImport = await ctx.db.get(importId);
    if (recipeImport === null || recipeImport.status !== "queued") return null;
    const attempt = recipeImport.attemptCount + 1;
    const now = Date.now();
    await ctx.db.patch(importId, {
      status: "scraping",
      processingStage: "retrieving",
      attemptCount: attempt,
      errorMessage: undefined,
      errorCategory: undefined,
      errorRetryable: undefined,
      startedAt: now,
      finishedAt: undefined,
      updatedAt: now,
    });
    return { attempt, sourceUrl: recipeImport.normalizedUrl };
  },
});

export const beginGeneration = internalMutation({
  args: { importId: v.id("recipeImports"), attempt: v.number() },
  handler: async (ctx, { importId, attempt }) => {
    const recipeImport = await ctx.db.get(importId);
    if (
      recipeImport === null ||
      recipeImport.status !== "scraping" ||
      recipeImport.attemptCount !== attempt
    ) {
      return false;
    }
    await ctx.db.patch(importId, {
      processingStage: "generating",
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const completeGeneration = internalMutation({
  args: {
    importId: v.id("recipeImports"),
    attempt: v.number(),
    sourceTitle: v.optional(v.string()),
    sourceSite: v.optional(v.string()),
    draft: v.any(),
    provenance: v.object({
      modelId: v.string(),
      promptVersion: v.string(),
      schemaVersion: v.string(),
      providerRequestId: v.optional(v.string()),
      generatedAt: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const recipeImport = await ctx.db.get(args.importId);
    if (
      recipeImport === null ||
      recipeImport.status !== "scraping" ||
      recipeImport.attemptCount !== args.attempt
    ) {
      return false;
    }
    const draft = validateRecipeDraft(args.draft as RecipeDraftInput);
    const previous = await ctx.db
      .query("recipeImportDrafts")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .unique();
    if (previous !== null) await ctx.db.delete(previous._id);
    const now = Date.now();
    await ctx.db.insert("recipeImportDrafts", {
      importId: args.importId,
      sourceUrl: recipeImport.normalizedUrl,
      sourceTitle: args.sourceTitle,
      sourceSite: args.sourceSite,
      ...draft,
      ...args.provenance,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.importId, {
      status: "parsed",
      processingStage: undefined,
      finishedAt: now,
      updatedAt: now,
    });
    return true;
  },
});

export const fail = internalMutation({
  args: {
    importId: v.id("recipeImports"),
    attempt: v.number(),
    category: importErrorCategory,
  },
  handler: async (ctx, { importId, attempt, category }) => {
    const recipeImport = await ctx.db.get(importId);
    if (
      recipeImport === null ||
      recipeImport.status !== "scraping" ||
      recipeImport.attemptCount !== attempt
    ) {
      return false;
    }
    const safe = safeImportError(category as ImportErrorCategory);
    const now = Date.now();
    await ctx.db.patch(importId, {
      status: "failed",
      processingStage: undefined,
      errorCategory: safe.category,
      errorMessage: safe.message,
      errorRetryable: safe.retryable,
      finishedAt: now,
      updatedAt: now,
    });
    return true;
  },
});

export const retry = mutation({
  args: { importId: v.id("recipeImports") },
  handler: async (ctx, { importId }) => {
    const userId = await requireUserId(ctx);
    const recipeImport = await ownedImport(ctx, userId, importId);
    if (recipeImport === null) throw new Error("Import not found");
    if (recipeImport.status !== "failed" || recipeImport.errorRetryable !== true) {
      throw new Error("This import cannot be retried");
    }
    await ctx.db.patch(importId, {
      status: "queued",
      errorCategory: undefined,
      errorMessage: undefined,
      errorRetryable: undefined,
      finishedAt: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.importProcessor.processImport, {
      importId,
    });
    return importId;
  },
});

export const review = query({
  args: { importId: v.id("recipeImports") },
  handler: async (ctx, { importId }) => {
    const userId = await requireUserId(ctx);
    const recipeImport = await ownedImport(ctx, userId, importId);
    if (recipeImport === null) return null;
    const draft =
      recipeImport.status === "parsed"
        ? await ownedDraft(ctx, userId, importId)
        : null;
    return { recipeImport, draft };
  },
});

export const saveReview = mutation({
  args: { importId: v.id("recipeImports"), draft: v.any() },
  handler: async (ctx, { importId, draft: draftInput }) => {
    const userId = await requireUserId(ctx);
    const recipeImport = await ownedImport(ctx, userId, importId);
    if (recipeImport === null) throw new Error("Import not found");
    if (recipeImport.status === "completed" && recipeImport.recipeId) {
      return recipeImport.recipeId;
    }
    if (recipeImport.status !== "parsed") {
      throw new Error("Import is not ready for review");
    }
    const persistedDraft = await ownedDraft(ctx, userId, importId);
    if (persistedDraft === null) throw new Error("Recipe draft not found");
    const draft = validateRecipeDraft(draftInput as RecipeDraftInput);
    const now = Date.now();
    const recipeId = await ctx.db.insert("recipes", {
      importId,
      sourceUrl: recipeImport.sourceUrl,
      normalizedSourceUrl: recipeImport.normalizedUrl,
      isPublic: false,
      sourceSite: persistedDraft.sourceSite,
      title: draft.title,
      description: draft.description,
      imageUrl: draft.imageUrl,
      yieldText: draft.yieldText,
      servings: draft.servings,
      prepTimeMinutes: draft.prepTimeMinutes,
      cookTimeMinutes: draft.cookTimeMinutes,
      totalTimeMinutes: draft.totalTimeMinutes,
      cuisines: draft.cuisines,
      categories: draft.categories,
      keywords: draft.keywords,
      instructions: draft.instructions,
      createdAt: now,
      updatedAt: now,
    });
    for (const ingredient of draft.ingredients) {
      let catalog = await ctx.db
        .query("ingredients")
        .withIndex("by_normalized_name", (q) =>
          q.eq("normalizedName", ingredient.normalizedName),
        )
        .first();
      if (catalog === null) {
        const ingredientId = await ctx.db.insert("ingredients", {
          name: ingredient.name,
          normalizedName: ingredient.normalizedName,
          defaultUnit: ingredient.unit,
          createdAt: now,
          updatedAt: now,
        });
        catalog = await ctx.db.get(ingredientId);
      }
      await ctx.db.insert("recipeIngredients", {
        recipeId,
        ingredientId: catalog?._id,
        ...ingredient,
      });
    }
    const existingSave = await ctx.db
      .query("savedRecipes")
      .withIndex("by_user_and_recipe", (q) =>
        q.eq("userId", userId).eq("recipeId", recipeId),
      )
      .first();
    if (existingSave === null) {
      await ctx.db.insert("savedRecipes", {
        userId,
        recipeId,
        isFavorite: false,
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.patch(importId, {
      recipeId,
      status: "completed",
      finishedAt: now,
      updatedAt: now,
    });
    return recipeId;
  },
});
