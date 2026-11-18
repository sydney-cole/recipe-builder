import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  type MutationCtx,
} from "./_generated/server";
import { requireUser } from "./lib/auth";
import { normalizeIngredientName } from "./lib/ingredientName";
import { isRecipeLink } from "./lib/plannerRules";
import { ingredientCatalogEntry, insertUserRecipe } from "./lib/userRecipes";
import { queueRecipeSource, startRecipeIngestion, type StartIngestion } from "./recipeIngestion";

const instructionValidator = v.object({
  position: v.number(),
  text: v.string(),
  section: v.optional(v.string()),
});

const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 100;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());

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

async function requireSavedRecipe(
  ctx: MutationCtx,
  userId: Id<"users">,
  recipeId: Id<"recipes">,
) {
  const saved = await ctx.db
    .query("savedRecipes")
    .withIndex("by_user_and_recipe", (q) =>
      q.eq("userId", userId).eq("recipeId", recipeId),
    )
    .unique();
  if (saved === null) throw new Error("Recipe is not in your Recipe Book");
  return saved;
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

export const createManual = mutation({
  args: {
    title: v.string(),
    description: v.optional(nullableString),
    sourceUrl: v.optional(nullableString),
    servings: v.optional(nullableNumber),
    prepTimeMinutes: v.optional(nullableNumber),
    cookTimeMinutes: v.optional(nullableNumber),
    ingredients: v.array(v.string()),
    instructions: v.array(v.string()),
  },
  returns: v.id("recipes"),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const title = args.title.trim();
    if (title.length === 0 || title.length > 300) {
      throw new Error("Recipe title must be between 1 and 300 characters");
    }
    const ingredients = args.ingredients.map((item) => item.trim()).filter(Boolean);
    const instructions = args.instructions.map((item) => item.trim()).filter(Boolean);
    if (ingredients.length === 0 || ingredients.length > 200) {
      throw new Error("A recipe needs between 1 and 200 ingredients");
    }
    if (instructions.length === 0 || instructions.length > 100) {
      throw new Error("A recipe needs between 1 and 100 instructions");
    }
    const sourceUrl = optionalString(args.sourceUrl ?? null);
    const servings = args.servings ?? undefined;
    const prepTimeMinutes = args.prepTimeMinutes ?? undefined;
    const cookTimeMinutes = args.cookTimeMinutes ?? undefined;
    if (servings !== undefined) finiteNumber(servings, "servings", 0, 1_000);
    if (prepTimeMinutes !== undefined) finiteNumber(prepTimeMinutes, "prepTimeMinutes", 0, 10_080);
    if (cookTimeMinutes !== undefined) finiteNumber(cookTimeMinutes, "cookTimeMinutes", 0, 10_080);

    return await insertUserRecipe(ctx, userId, {
      title,
      description: optionalString(args.description ?? null)?.slice(0, 2_000),
      sourceUrl,
      servings,
      prepTimeMinutes,
      cookTimeMinutes,
      ingredients,
      instructions,
    });
  },
});

export const addToBook = mutation({
  args: { recipeId: v.id("recipes") },
  returns: v.null(),
  handler: async (ctx, { recipeId }) => {
    const userId = await requireUser(ctx);
    const recipe = await ctx.db.get(recipeId);
    if (recipe === null || recipe.deletedAt !== undefined) {
      throw new Error("Recipe was not found");
    }
    if (recipe.isPublic !== true) {
      await requireOwnedRecipe(ctx, userId, recipeId);
    }
    const existing = await ctx.db
      .query("savedRecipes")
      .withIndex("by_user_and_recipe", (q) =>
        q.eq("userId", userId).eq("recipeId", recipeId),
      )
      .unique();
    if (existing !== null) return null;
    const now = Date.now();
    await ctx.db.insert("savedRecipes", {
      userId,
      recipeId,
      isFavorite: false,
      createdAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const setCurrent = mutation({
  args: { recipeId: v.union(v.id("recipes"), v.null()) },
  returns: v.null(),
  handler: async (ctx, { recipeId }) => {
    const userId = await requireUser(ctx);
    if (recipeId !== null) {
      const recipe = await ctx.db.get(recipeId);
      if (recipe === null || recipe.deletedAt !== undefined) {
        throw new Error("Recipe was not found");
      }
      if (recipe.isPublic !== true) {
        await requireOwnedRecipe(ctx, userId, recipeId);
      }
    }
    await ctx.db.patch(userId, {
      currentRecipeId: recipeId ?? undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

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
    categories: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireOwnedRecipe(ctx, userId, args.recipeId);
    const patch: Partial<Doc<"recipes">> = { updatedAt: Date.now() };
    if (args.categories !== undefined) {
      const seen = new Set<string>();
      const categories: string[] = [];
      for (const value of args.categories) {
        const tag = value.trim().replace(/\s+/g, " ");
        if (tag.length === 0 || seen.has(tag.toLowerCase())) continue;
        if (tag.length > MAX_TAG_LENGTH) {
          throw new Error(`Each tag must be at most ${MAX_TAG_LENGTH} characters`);
        }
        seen.add(tag.toLowerCase());
        categories.push(tag);
      }
      if (categories.length > MAX_TAGS) {
        throw new Error(`A recipe can have at most ${MAX_TAGS} tags`);
      }
      patch.categories = categories;
    }
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

export const generateImageUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const setImage = mutation({
  args: { recipeId: v.id("recipes"), storageId: v.id("_storage") },
  returns: v.boolean(),
  handler: async (ctx, { recipeId, storageId }) => {
    const userId = await requireUser(ctx);
    const recipe = await requireOwnedRecipe(ctx, userId, recipeId);
    const file = await ctx.db.system.get(storageId);
    if (file === null) throw new Error("Uploaded image was not found");
    const accepted =
      recipe.imageStorageId === undefined &&
      recipe.imageUrl === undefined &&
      file.contentType !== undefined &&
      ALLOWED_IMAGE_TYPES.has(file.contentType) &&
      file.size > 0 &&
      file.size <= MAX_IMAGE_BYTES;
    if (!accepted) {
      // Returning instead of throwing lets the deletion of the rejected upload commit.
      await ctx.storage.delete(storageId);
      return false;
    }
    await ctx.db.patch(recipeId, {
      imageStorageId: storageId,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const setNotes = mutation({
  args: { recipeId: v.id("recipes"), notes: nullableString },
  returns: v.null(),
  handler: async (ctx, { recipeId, notes }) => {
    const userId = await requireUser(ctx);
    const saved = await requireSavedRecipe(ctx, userId, recipeId);
    await ctx.db.patch(saved._id, {
      notes: optionalString(notes)?.slice(0, 10_000),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setFavorite = mutation({
  args: { recipeId: v.id("recipes"), isFavorite: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { recipeId, isFavorite }) => {
    const userId = await requireUser(ctx);
    const saved = await requireSavedRecipe(ctx, userId, recipeId);
    await ctx.db.patch(saved._id, { isFavorite, updatedAt: Date.now() });
    return null;
  },
});

export const removeFromBook = mutation({
  args: { recipeId: v.id("recipes") },
  returns: v.null(),
  handler: async (ctx, { recipeId }) => {
    const userId = await requireUser(ctx);
    const saved = await ctx.db
      .query("savedRecipes")
      .withIndex("by_user_and_recipe", (q) =>
        q.eq("userId", userId).eq("recipeId", recipeId),
      )
      .unique();
    if (saved !== null) await ctx.db.delete(saved._id);
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

export const acknowledgeReview = mutation({
  args: { recipeId: v.id("recipes") },
  returns: v.null(),
  handler: async (ctx, { recipeId }) => {
    const userId = await requireUser(ctx);
    const recipe = await requireOwnedRecipe(ctx, userId, recipeId);
    if (recipe.importId === undefined) throw new Error("Recipe is not editable");
    const recipeImport = await ctx.db.get(recipe.importId);
    if (recipeImport === null || recipeImport.requestedBy !== userId) {
      throw new Error("Forbidden");
    }
    if (recipeImport.status === "completed") return null;
    if (recipeImport.status !== "needs_review") {
      throw new Error("Recipe is not awaiting review");
    }
    await ctx.db.patch(recipeImport._id, {
      status: "completed",
      updatedAt: Date.now(),
    });
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
    const user = await ctx.db.get(userId);
    if (user?.currentRecipeId === recipeId) {
      await ctx.db.patch(userId, { currentRecipeId: undefined, updatedAt: now });
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// Filling an existing recipe from a web link

/**
 * Starts the usual import of `sourceUrl` (a draft recipe the user previews)
 * for filling the owner's recipe `recipeId`. Nothing changes on that recipe
 * until `fillFromImport`.
 */
export async function startRecipeFill(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: { recipeId: Id<"recipes">; sourceUrl: string },
  startIngestion: StartIngestion = startRecipeIngestion,
): Promise<Id<"recipeImports">> {
  await requireOwnedRecipe(ctx, userId, args.recipeId);
  const sourceUrl = args.sourceUrl.trim();
  if (!isRecipeLink(sourceUrl)) throw new Error("Paste a recipe link that starts with http:// or https://");
  const { importId } = await queueRecipeSource(
    ctx,
    { userId, sourceUrl, sourceKind: "direct" },
    startIngestion,
  );
  return importId;
}

export const importIntoRecipe = mutation({
  args: { recipeId: v.id("recipes"), sourceUrl: v.string() },
  returns: v.id("recipeImports"),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await startRecipeFill(ctx, userId, args);
  },
});

const FILL_INGREDIENT_LIMIT = 200;

/**
 * Copies a finished import's recipe into the owner's existing recipe, which
 * keeps its id (and so its planner slots, notes and favourite): ingredients,
 * instructions, times, servings, image and source; the title only with
 * `useImportedTitle`. A recipe that already has ingredients or instructions
 * is replaced only with `replaceExisting`. The import's draft is then
 * discarded unless the user saved it to their Recipe Book themselves.
 */
export const fillFromImport = mutation({
  args: {
    recipeId: v.id("recipes"),
    importId: v.id("recipeImports"),
    useImportedTitle: v.boolean(),
    replaceExisting: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const target = await requireOwnedRecipe(ctx, userId, args.recipeId);
    const recipeImport = await ctx.db.get(args.importId);
    if (recipeImport === null || recipeImport.requestedBy !== userId) {
      throw new Error("Recipe import was not found");
    }
    if (
      recipeImport.recipeId === undefined ||
      (recipeImport.status !== "completed" && recipeImport.status !== "needs_review")
    ) {
      throw new Error("The imported recipe is not ready yet");
    }
    if (recipeImport.recipeId === target._id) throw new Error("A recipe can’t be filled from itself");
    const source = await ctx.db.get(recipeImport.recipeId);
    if (source === null || source.deletedAt !== undefined) {
      throw new Error("The imported recipe was removed");
    }

    const current = await ctx.db
      .query("recipeIngredients")
      .withIndex("by_recipe", (q) => q.eq("recipeId", target._id))
      .take(FILL_INGREDIENT_LIMIT + 1);
    if (!args.replaceExisting && (current.length > 0 || target.instructions.length > 0)) {
      throw new Error("This recipe already has ingredients or instructions");
    }
    const incoming = await ctx.db
      .query("recipeIngredients")
      .withIndex("by_recipe_and_position", (q) => q.eq("recipeId", source._id))
      .take(FILL_INGREDIENT_LIMIT);

    for (const ingredient of current) {
      const sources = await ctx.db
        .query("groceryListItemSources")
        .withIndex("by_recipe_ingredient", (q) => q.eq("recipeIngredientId", ingredient._id))
        .take(100);
      for (const item of sources) await ctx.db.delete(item._id);
      await ctx.db.delete(ingredient._id);
    }
    for (const ingredient of incoming) {
      const { _id, _creationTime, recipeId, ...fields } = ingredient;
      void _id;
      void _creationTime;
      void recipeId;
      await ctx.db.insert("recipeIngredients", { ...fields, recipeId: target._id });
    }

    const now = Date.now();
    const patch: Partial<Doc<"recipes">> = {
      sourceUrl: source.sourceUrl,
      normalizedSourceUrl: source.normalizedSourceUrl,
      sourceSite: source.sourceSite,
      sourceAuthor: source.sourceAuthor,
      instructions: source.instructions,
      servings: source.servings,
      yieldText: source.yieldText,
      prepTimeMinutes: source.prepTimeMinutes,
      cookTimeMinutes: source.cookTimeMinutes,
      totalTimeMinutes: source.totalTimeMinutes,
      updatedAt: now,
    };
    if (source.imageStorageId !== undefined || source.imageUrl !== undefined) {
      patch.imageStorageId = source.imageStorageId;
      patch.imageUrl = source.imageUrl;
    }
    if (args.useImportedTitle) patch.title = source.title;
    if (!target.description && source.description) patch.description = source.description;
    if (target.categories.length === 0) patch.categories = source.categories;
    if (target.cuisines.length === 0) patch.cuisines = source.cuisines;
    if (target.keywords.length === 0) patch.keywords = source.keywords;
    if (source.nutrition !== undefined) patch.nutrition = source.nutrition;
    await ctx.db.patch(target._id, patch);

    // The draft only existed to preview this import; one the user chose to
    // keep in their book stays.
    const keptDraft = await ctx.db
      .query("savedRecipes")
      .withIndex("by_user_and_recipe", (q) => q.eq("userId", userId).eq("recipeId", source._id))
      .unique();
    if (keptDraft === null) {
      await ctx.db.patch(source._id, { deletedAt: now, imageStorageId: undefined, updatedAt: now });
      const user = await ctx.db.get(userId);
      if (user?.currentRecipeId === source._id) {
        await ctx.db.patch(userId, { currentRecipeId: target._id, updatedAt: now });
      }
    }
    return null;
  },
});
