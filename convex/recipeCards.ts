import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  type MutationCtx,
} from "./_generated/server";

const instructionValidator = v.object({
  position: v.number(),
  text: v.string(),
  section: v.optional(v.string()),
});

const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());

async function requireUser(ctx: MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Unauthenticated");
  return userId;
}

async function requireOwnedRecipe(
  ctx: MutationCtx,
  userId: Id<"users">,
  recipeId: Id<"recipes">,
) {
  const recipe = await ctx.db.get(recipeId);
  if (recipe === null || recipe.deletedAt !== undefined) {
    throw new Error("Recipe was not found");
  }
  if (recipe.importId === undefined) throw new Error("Recipe is not editable");
  const recipeImport = await ctx.db.get(recipe.importId);
  if (recipeImport?.requestedBy !== userId) throw new Error("Forbidden");
  return recipe;
}

function finiteNumber(
  value: number,
  label: string,
  minimum: number,
  maximum: number,
) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function optionalString(value: string | null) {
  if (value === null) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function normalizeIngredientName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

async function ingredientCatalogEntry(
  ctx: MutationCtx,
  name: string,
  normalizedName: string,
  unit?: string,
) {
  const existing = await ctx.db
    .query("ingredients")
    .withIndex("by_normalized_name", (q) =>
      q.eq("normalizedName", normalizedName),
    )
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

export const updateCard = mutation({
  args: {
    recipeId: v.id("recipes"),
    title: v.optional(v.string()),
    description: v.optional(nullableString),
    yieldText: v.optional(nullableString),
    servings: v.optional(nullableNumber),
    prepTimeMinutes: v.optional(nullableNumber),
    cookTimeMinutes: v.optional(nullableNumber),
    totalTimeMinutes: v.optional(nullableNumber),
    instructions: v.optional(v.array(instructionValidator)),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireOwnedRecipe(ctx, userId, args.recipeId);
    const patch: Partial<Doc<"recipes">> = { updatedAt: Date.now() };
    if (args.title !== undefined) {
      const title = args.title.trim();
      if (title.length === 0 || title.length > 300) {
        throw new Error("Recipe title must be between 1 and 300 characters");
      }
      patch.title = title;
    }
    if (args.description !== undefined) {
      patch.description = optionalString(args.description)?.slice(0, 2_000);
    }
    if (args.yieldText !== undefined) {
      patch.yieldText = optionalString(args.yieldText)?.slice(0, 200);
    }
    for (const field of [
      "servings",
      "prepTimeMinutes",
      "cookTimeMinutes",
      "totalTimeMinutes",
    ] as const) {
      const value = args[field];
      if (value !== undefined) {
        patch[field] =
          value === null
            ? undefined
            : finiteNumber(value, field, 0, field === "servings" ? 1_000 : 10_080);
      }
    }
    if (args.instructions !== undefined) {
      if (args.instructions.length > 100) throw new Error("Too many instructions");
      patch.instructions = args.instructions.map((instruction, index) => {
        const text = instruction.text.trim();
        if (text.length === 0 || text.length > 5_000) {
          throw new Error("Each instruction must be between 1 and 5000 characters");
        }
        return {
          position: index + 1,
          text,
          ...(instruction.section?.trim()
            ? { section: instruction.section.trim().slice(0, 200) }
            : {}),
        };
      });
    }
    await ctx.db.patch(args.recipeId, patch);
    return null;
  },
});

export const setNotes = mutation({
  args: { recipeId: v.id("recipes"), notes: nullableString },
  returns: v.null(),
  handler: async (ctx, { recipeId, notes }) => {
    const userId = await requireUser(ctx);
    await requireOwnedRecipe(ctx, userId, recipeId);
    const saved = await ctx.db
      .query("savedRecipes")
      .withIndex("by_user_and_recipe", (q) =>
        q.eq("userId", userId).eq("recipeId", recipeId),
      )
      .unique();
    const now = Date.now();
    const normalizedNotes = optionalString(notes)?.slice(0, 10_000);
    if (saved === null) {
      await ctx.db.insert("savedRecipes", {
        userId,
        recipeId,
        notes: normalizedNotes,
        isFavorite: false,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(saved._id, { notes: normalizedNotes, updatedAt: now });
    }
    return null;
  },
});

export const addIngredient = mutation({
  args: {
    recipeId: v.id("recipes"),
    name: v.string(),
    originalText: v.optional(v.string()),
    quantity: v.optional(nullableNumber),
    quantityText: v.optional(nullableString),
    unit: v.optional(nullableString),
    section: v.optional(nullableString),
    preparation: v.optional(nullableString),
    notes: v.optional(nullableString),
    isOptional: v.optional(v.boolean()),
  },
  returns: v.id("recipeIngredients"),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireOwnedRecipe(ctx, userId, args.recipeId);
    const name = args.name.trim();
    if (name.length === 0 || name.length > 300) {
      throw new Error("Ingredient name must be between 1 and 300 characters");
    }
    const currentIngredients = await ctx.db
      .query("recipeIngredients")
      .withIndex("by_recipe", (q) => q.eq("recipeId", args.recipeId))
      .take(200);
    if (currentIngredients.length >= 200) {
      throw new Error("A recipe can contain at most 200 ingredients");
    }
    const existing = await ctx.db
      .query("recipeIngredients")
      .withIndex("by_recipe_and_position", (q) => q.eq("recipeId", args.recipeId))
      .order("desc")
      .first();
    const normalizedName = normalizeIngredientName(name);
    const unit = args.unit === undefined ? undefined : optionalString(args.unit);
    const ingredientId = await ingredientCatalogEntry(
      ctx,
      name,
      normalizedName,
      unit,
    );
    const quantity = args.quantity ?? undefined;
    if (quantity !== undefined && quantity !== null) {
      finiteNumber(quantity, "quantity", 0, 1_000_000);
    }
    return await ctx.db.insert("recipeIngredients", {
      recipeId: args.recipeId,
      ingredientId,
      position: (existing?.position ?? 0) + 1,
      originalText: args.originalText?.trim().slice(0, 1_000) || name,
      name,
      normalizedName,
      quantity: quantity === null ? undefined : quantity,
      quantityText:
        args.quantityText === undefined ? undefined : optionalString(args.quantityText),
      unit,
      section: args.section === undefined ? undefined : optionalString(args.section),
      preparation:
        args.preparation === undefined
          ? undefined
          : optionalString(args.preparation),
      notes: args.notes === undefined ? undefined : optionalString(args.notes),
      isOptional: args.isOptional ?? false,
    });
  },
});

export const updateIngredient = mutation({
  args: {
    recipeIngredientId: v.id("recipeIngredients"),
    name: v.optional(v.string()),
    originalText: v.optional(v.string()),
    quantity: v.optional(nullableNumber),
    quantityText: v.optional(nullableString),
    unit: v.optional(nullableString),
    section: v.optional(nullableString),
    preparation: v.optional(nullableString),
    notes: v.optional(nullableString),
    isOptional: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const ingredient = await ctx.db.get(args.recipeIngredientId);
    if (ingredient === null) throw new Error("Recipe ingredient was not found");
    await requireOwnedRecipe(ctx, userId, ingredient.recipeId);
    const patch: Partial<Doc<"recipeIngredients">> = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length === 0 || name.length > 300) {
        throw new Error("Ingredient name must be between 1 and 300 characters");
      }
      const normalizedName = normalizeIngredientName(name);
      patch.name = name;
      patch.normalizedName = normalizedName;
      patch.ingredientId = await ingredientCatalogEntry(
        ctx,
        name,
        normalizedName,
        args.unit === undefined ? ingredient.unit : optionalString(args.unit),
      );
    }
    if (args.originalText !== undefined) {
      const originalText = args.originalText.trim();
      if (originalText.length === 0 || originalText.length > 1_000) {
        throw new Error("Original ingredient text must be between 1 and 1000 characters");
      }
      patch.originalText = originalText;
    }
    if (args.quantity !== undefined) {
      patch.quantity =
        args.quantity === null
          ? undefined
          : finiteNumber(args.quantity, "quantity", 0, 1_000_000);
    }
    for (const field of [
      "quantityText",
      "unit",
      "section",
      "preparation",
      "notes",
    ] as const) {
      if (args[field] !== undefined) patch[field] = optionalString(args[field]);
    }
    if (args.isOptional !== undefined) patch.isOptional = args.isOptional;
    await ctx.db.patch(args.recipeIngredientId, patch);
    return null;
  },
});

export const removeIngredient = mutation({
  args: { recipeIngredientId: v.id("recipeIngredients") },
  returns: v.null(),
  handler: async (ctx, { recipeIngredientId }) => {
    const userId = await requireUser(ctx);
    const ingredient = await ctx.db.get(recipeIngredientId);
    if (ingredient === null) return null;
    await requireOwnedRecipe(ctx, userId, ingredient.recipeId);
    const sources = await ctx.db
      .query("groceryListItemSources")
      .withIndex("by_recipe_ingredient", (q) =>
        q.eq("recipeIngredientId", recipeIngredientId),
      )
      .take(100);
    for (const source of sources) await ctx.db.delete(source._id);
    await ctx.db.delete(recipeIngredientId);
    return null;
  },
});

export const removeCard = mutation({
  args: { recipeId: v.id("recipes") },
  returns: v.null(),
  handler: async (ctx, { recipeId }) => {
    const userId = await requireUser(ctx);
    await requireOwnedRecipe(ctx, userId, recipeId);
    const saved = await ctx.db
      .query("savedRecipes")
      .withIndex("by_user_and_recipe", (q) =>
        q.eq("userId", userId).eq("recipeId", recipeId),
      )
      .unique();
    const now = Date.now();
    if (saved !== null) await ctx.db.delete(saved._id);
    await ctx.db.patch(recipeId, { deletedAt: now, updatedAt: now });
    return null;
  },
});
