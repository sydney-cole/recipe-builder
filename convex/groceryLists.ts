import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { groceryCategory } from "./lib/groceryCategory";
import {
  canonicalIngredientName,
  combinedNotes,
  groceryIngredient,
  groceryItemForDisplay,
  ingredientMatchKey,
  mergedAmount,
  normalizedIngredientUnit,
  normalizeIngredientName,
  scaledIngredient,
  validQuantity,
} from "./lib/groceryMerge";
import { parseManualIngredient } from "./lib/manualIngredient";
import { requireUser } from "./lib/auth";
import { canAccessRecipe } from "./lib/recipeAccess";
import { notIncludedValidator } from "./lib/plannerValidators";

const groceryListStatus = v.union(
  v.literal("active"),
  v.literal("completed"),
  v.literal("archived"),
);
const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());
const saveItem = v.object({
  itemId: v.optional(v.id("groceryListItems")),
  name: v.string(),
  quantityText: v.optional(nullableString),
  unit: v.optional(nullableString),
  category: v.optional(nullableString),
  notes: v.optional(nullableString),
  isChecked: v.boolean(),
  sortOrder: v.number(),
});
const groceryListValidator = v.object({
  _id: v.id("groceryLists"),
  _creationTime: v.number(),
  userId: v.id("users"),
  clientRequestId: v.optional(v.string()),
  needsInitialSave: v.optional(v.boolean()),
  name: v.string(),
  sourceRecipeId: v.optional(v.id("recipes")),
  sourceRecipeTitle: v.optional(v.string()),
  sourceRecipeIds: v.optional(v.array(v.id("recipes"))),
  status: groceryListStatus,
  completedAt: v.optional(v.number()),
  plannerId: v.optional(v.id("planners")),
  planWeekStart: v.optional(v.string()),
  planSyncedAt: v.optional(v.number()),
  planFingerprint: v.optional(v.string()),
  planNotIncluded: v.optional(v.array(notIncludedValidator)),
  createdAt: v.number(),
  updatedAt: v.number(),
});
const groceryListItemValidator = v.object({
  _id: v.id("groceryListItems"),
  _creationTime: v.number(),
  listId: v.id("groceryLists"),
  ingredientId: v.optional(v.id("ingredients")),
  name: v.string(),
  normalizedName: v.string(),
  quantity: v.optional(v.number()),
  quantityText: v.optional(v.string()),
  unit: v.optional(v.string()),
  category: v.optional(v.string()),
  notes: v.optional(v.string()),
  isChecked: v.boolean(),
  sortOrder: v.number(),
  planKey: v.optional(v.string()),
  planQuantityText: v.optional(v.string()),
  planUnit: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const TEXT_FIELDS = {
  quantityText: { label: "Quantity text", maximum: 100 },
  unit: { label: "Unit", maximum: 100 },
  category: { label: "Category", maximum: 100 },
  notes: { label: "Notes", maximum: 500 },
} as const;
type TextField = keyof typeof TEXT_FIELDS;

const MAX_LIST_ITEMS = 500;

function optionalTextField(field: TextField, value: string | null | undefined) {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const { label, maximum } = TEXT_FIELDS[field];
  if (trimmed.length > maximum) {
    throw new Error(`${label} must be at most ${maximum} characters`);
  }
  return trimmed;
}

function optionalTextFields(values: Partial<Record<TextField, string | null>>) {
  return {
    quantityText: optionalTextField("quantityText", values.quantityText),
    unit: optionalTextField("unit", values.unit),
    category: optionalTextField("category", values.category),
    notes: optionalTextField("notes", values.notes),
  };
}

function validListName(value: string) {
  const name = value.trim();
  if (name.length === 0 || name.length > 200) {
    throw new Error("List name must be between 1 and 200 characters");
  }
  return name;
}

function validItemName(value: string) {
  const name = normalizeIngredientName(value);
  if (name.length === 0 || name.length > 300) {
    throw new Error("Item name must be between 1 and 300 characters");
  }
  return name;
}

function validatedSortOrder(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 100_000) {
    throw new Error("Sort order must be an integer between 0 and 100000");
  }
  return value;
}

function validateRequestId(value: string) {
  const requestId = value.trim();
  if (requestId.length < 8 || requestId.length > 200) {
    throw new Error("Request ID must be between 8 and 200 characters");
  }
  return requestId;
}

function validatedServingsMultiplier(value: number | undefined) {
  if (value === undefined) return 1;
  if (!Number.isFinite(value) || value < 0.01 || value > 100) {
    throw new Error("Servings multiplier must be between 0.01 and 100");
  }
  return value;
}

export async function catalogCategory(
  ctx: QueryCtx | MutationCtx,
  ingredientId: Id<"ingredients"> | undefined,
) {
  if (ingredientId === undefined) return undefined;
  return groceryCategory((await ctx.db.get(ingredientId))?.category);
}

type GroceryIngredient = ReturnType<typeof groceryIngredient>;

type RecipeAddition = { recipeId: Id<"recipes">; multiplier: number; now: number };

async function insertItemSource(
  ctx: MutationCtx,
  itemId: Id<"groceryListItems">,
  ingredient: GroceryIngredient,
  { recipeId, multiplier, now }: RecipeAddition,
) {
  await ctx.db.insert("groceryListItemSources", {
    groceryListItemId: itemId,
    recipeId,
    recipeIngredientId: ingredient._id,
    servingsMultiplier: multiplier,
    quantityAdded: ingredient.quantity,
    quantityTextAdded: ingredient.quantityText,
    createdAt: now,
  });
}

async function insertRecipeItem(
  ctx: MutationCtx,
  listId: Id<"groceryLists">,
  ingredient: GroceryIngredient,
  sortOrder: number,
  addition: RecipeAddition,
) {
  const itemId = await ctx.db.insert("groceryListItems", {
    listId,
    ingredientId: ingredient.ingredientId,
    name: ingredient.name,
    normalizedName: ingredient.normalizedName,
    quantity: ingredient.quantity,
    quantityText: ingredient.quantityText,
    unit: ingredient.unit,
    category: await catalogCategory(ctx, ingredient.ingredientId),
    notes: ingredient.notes,
    isChecked: false,
    sortOrder,
    createdAt: addition.now,
    updatedAt: addition.now,
  });
  await insertItemSource(ctx, itemId, ingredient, addition);
  return itemId;
}

async function requiredRecipeIngredients(
  ctx: MutationCtx,
  recipeId: Id<"recipes">,
  multiplier: number,
) {
  const recipeIngredients = await ctx.db
    .query("recipeIngredients")
    .withIndex("by_recipe_and_position", (q) => q.eq("recipeId", recipeId))
    .take(200);
  return recipeIngredients
    .filter((ingredient) => !ingredient.isOptional)
    .map(groceryIngredient)
    .map((ingredient) => scaledIngredient(ingredient, multiplier));
}

function sourceRecipeIdsOf(lists: Doc<"groceryLists">[], ...extra: Id<"recipes">[]) {
  return [...new Set([
    ...lists.flatMap((list) => [
      ...(list.sourceRecipeIds ?? []),
      ...(list.sourceRecipeId === undefined ? [] : [list.sourceRecipeId]),
    ]),
    ...extra,
  ])].slice(0, 500);
}

async function deleteItemWithSources(
  ctx: MutationCtx,
  itemId: Id<"groceryListItems">,
) {
  const sources = await ctx.db
    .query("groceryListItemSources")
    .withIndex("by_grocery_list_item", (q) => q.eq("groceryListItemId", itemId))
    .take(100);
  for (const source of sources) await ctx.db.delete(source._id);
  await ctx.db.delete(itemId);
}

async function deleteListWithItems(
  ctx: MutationCtx,
  list: Doc<"groceryLists">,
  items: Doc<"groceryListItems">[],
  now: number,
) {
  for (const item of items) await deleteItemWithSources(ctx, item._id);
  if (list.sourceRecipeId !== undefined) {
    const recipe = await ctx.db.get(list.sourceRecipeId);
    if (recipe?.importId !== undefined) {
      const recipeImport = await ctx.db.get(recipe.importId);
      if (recipeImport?.generatedGroceryListId === list._id) {
        await ctx.db.patch(recipeImport._id, {
          generatedGroceryListId: undefined,
          updatedAt: now,
        });
      }
    }
  }
  await ctx.db.delete(list._id);
}

export async function requireOwnedList(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  listId: Id<"groceryLists">,
) {
  const list = await ctx.db.get(listId);
  if (list === null) throw new Error("Grocery list was not found");
  if (list.userId !== userId) throw new Error("Forbidden");
  return list;
}

async function requireOwnedItem(
  ctx: MutationCtx,
  userId: Id<"users">,
  itemId: Id<"groceryListItems">,
) {
  const item = await ctx.db.get(itemId);
  if (item === null) throw new Error("Grocery item was not found");
  await requireOwnedList(ctx, userId, item.listId);
  return item;
}

async function requireAccessibleRecipe(
  ctx: MutationCtx,
  userId: Id<"users">,
  recipeId: Id<"recipes">,
) {
  const recipe = await ctx.db.get(recipeId);
  if (recipe === null || recipe.deletedAt !== undefined) {
    throw new Error("Recipe was not found");
  }
  if (!(await canAccessRecipe(ctx, userId, recipe))) throw new Error("Forbidden");
  return recipe;
}

export const listMine = query({
  args: {},
  returns: v.array(groceryListValidator),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return await ctx.db
      .query("groceryLists")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100);
  },
});

export const itemProgress = query({
  args: { listId: v.id("groceryLists") },
  returns: v.union(v.null(), v.object({ total: v.number(), checked: v.number() })),
  handler: async (ctx, { listId }) => {
    const userId = await requireUser(ctx);
    const list = await ctx.db.get(listId);
    if (list === null || list.userId !== userId) return null;
    const items = await ctx.db
      .query("groceryListItems")
      .withIndex("by_list", (q) => q.eq("listId", listId))
      .take(500);
    return {
      total: items.length,
      checked: items.filter((item) => item.isChecked).length,
    };
  },
});

export const get = query({
  args: { listId: v.id("groceryLists") },
  returns: v.union(
    v.null(),
    v.object({
      list: groceryListValidator,
      items: v.array(groceryListItemValidator),
      itemSources: v.array(v.object({
        itemId: v.id("groceryListItems"),
        recipeTitles: v.array(v.string()),
      })),
    }),
  ),
  handler: async (ctx, { listId }) => {
    const userId = await requireUser(ctx);
    const list = await ctx.db.get(listId);
    if (list === null || list.userId !== userId) return null;
    const items = await ctx.db
      .query("groceryListItems")
      .withIndex("by_list_and_order", (q) => q.eq("listId", listId))
      .take(500);
    const itemSources = await Promise.all(items.map(async (item) => {
      const sources = await ctx.db
        .query("groceryListItemSources")
        .withIndex("by_grocery_list_item", (q) => q.eq("groceryListItemId", item._id))
        .take(100);
      const sourceIngredients = await Promise.all(
        sources.map((source) => ctx.db.get(source.recipeIngredientId)),
      );
      const recipeIds = new Set<Id<"recipes">>();
      for (const [index, source] of sources.entries()) {
        // The ingredient relationship is authoritative. Some older source rows
        // inherited the grocery list's original recipeId when another recipe
        // was added to that list.
        recipeIds.add(sourceIngredients[index]?.recipeId ?? source.recipeId);
      }
      const recipes = await Promise.all(
        [...recipeIds].map((recipeId) => ctx.db.get(recipeId)),
      );
      return {
        itemId: item._id,
        recipeTitles: [...new Set(recipes.flatMap((recipe) => recipe === null ? [] : [recipe.title]))],
      };
    }));
    const sourcedItemIds = new Set(
      itemSources.filter((source) => source.recipeTitles.length > 0).map((source) => source.itemId),
    );
    const categorizedItems = await Promise.all(
      items.map(async (item) => ({
        ...item,
        category:
          item.category ?? (await catalogCategory(ctx, item.ingredientId)),
      })),
    );
    const visibleItems = categorizedItems.map((item) => {
      if (!sourcedItemIds.has(item._id) || item.quantity !== undefined || item.quantityText || item.unit) {
        return groceryItemForDisplay(item);
      }
      const parsed = parseManualIngredient(item.name);
      if (parsed.quantity === undefined) {
        return groceryItemForDisplay(item);
      }
      return groceryItemForDisplay({
        ...item,
        name: parsed.name,
        normalizedName: parsed.normalizedName,
        quantity: parsed.quantity,
        quantityText: parsed.quantityText,
        unit: parsed.unit,
      });
    });
    return { list, items: visibleItems, itemSources };
  },
});

export const summary = query({
  args: { listId: v.id("groceryLists") },
  returns: v.union(v.null(), v.object({ isComplete: v.boolean() })),
  handler: async (ctx, { listId }) => {
    const userId = await requireUser(ctx);
    const list = await ctx.db.get(listId);
    if (list === null || list.userId !== userId) return null;

    const [firstItem, firstRemainingItem] = await Promise.all([
      ctx.db
        .query("groceryListItems")
        .withIndex("by_list", (q) => q.eq("listId", listId))
        .first(),
      ctx.db
        .query("groceryListItems")
        .withIndex("by_list_and_checked", (q) =>
          q.eq("listId", listId).eq("isChecked", false),
        )
        .first(),
    ]);

    return {
      isComplete: firstItem !== null && firstRemainingItem === null,
    };
  },
});

export const create = mutation({
  args: { name: v.string() },
  returns: v.id("groceryLists"),
  handler: async (ctx, { name }) => {
    const userId = await requireUser(ctx);
    const now = Date.now();
    return await ctx.db.insert("groceryLists", {
      userId,
      name: validListName(name),
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const createFromRecipe = mutation({
  args: {
    recipeId: v.id("recipes"),
    forceNew: v.optional(v.boolean()),
    servingsMultiplier: v.optional(v.number()),
  },
  returns: v.id("groceryLists"),
  handler: async (ctx, { recipeId, forceNew, servingsMultiplier }) => {
    const userId = await requireUser(ctx);
    const recipe = await requireAccessibleRecipe(ctx, userId, recipeId);
    const multiplier = validatedServingsMultiplier(servingsMultiplier);

    if (!forceNew) {
      const existing = await ctx.db
        .query("groceryLists")
        .withIndex("by_user_and_source_recipe", (q) =>
          q.eq("userId", userId).eq("sourceRecipeId", recipeId),
        )
        .first();
      if (existing !== null) return existing._id;
    }

    const requiredIngredients = await requiredRecipeIngredients(ctx, recipeId, multiplier);
    const now = Date.now();
    const listId = await ctx.db.insert("groceryLists", {
      userId,
      needsInitialSave: true,
      name: recipe.title,
      sourceRecipeId: recipeId,
      sourceRecipeTitle: recipe.title,
      sourceRecipeIds: [recipeId],
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const addition = { recipeId, multiplier, now };
    for (const [index, ingredient] of requiredIngredients.entries()) {
      await insertRecipeItem(ctx, listId, ingredient, index + 1, addition);
    }

    if (recipe.importId !== undefined) {
      const recipeImport = await ctx.db.get(recipe.importId);
      if (recipeImport?.requestedBy === userId) {
        await ctx.db.patch(recipe.importId, {
          generatedGroceryListId: listId,
          updatedAt: now,
        });
      }
    }
    return listId;
  },
});

export const addRecipeToList = mutation({
  args: {
    recipeId: v.id("recipes"),
    listId: v.id("groceryLists"),
    servingsMultiplier: v.optional(v.number()),
  },
  returns: v.id("groceryLists"),
  handler: async (ctx, { recipeId, listId, servingsMultiplier }) => {
    const multiplier = validatedServingsMultiplier(servingsMultiplier);
    const userId = await requireUser(ctx);
    const list = await requireOwnedList(ctx, userId, listId);
    if (list.status !== "active") {
      throw new Error("Recipes can only be added to active grocery lists");
    }
    await requireAccessibleRecipe(ctx, userId, recipeId);

    const [requiredIngredients, existingItems] = await Promise.all([
      requiredRecipeIngredients(ctx, recipeId, multiplier),
      ctx.db.query("groceryListItems").withIndex("by_list_and_order", (q) => q.eq("listId", listId)).take(MAX_LIST_ITEMS + 1),
    ]);
    if (existingItems.length > MAX_LIST_ITEMS) throw new Error("The grocery list is full");
    const existingByKey = new Map(
      existingItems.map((item) => [ingredientMatchKey(item), item]),
    );
    const missingKeys = new Set(
      requiredIngredients
        .map(ingredientMatchKey)
        .filter((key) => !existingByKey.has(key)),
    );
    if (existingItems.length + missingKeys.size > MAX_LIST_ITEMS) throw new Error("The grocery list is full");
    const now = Date.now();
    const addition = { recipeId, multiplier, now };
    let nextSortOrder = existingItems.reduce((maximum, item) => Math.max(maximum, item.sortOrder), 0) + 1;

    for (const ingredient of requiredIngredients) {
      const key = ingredientMatchKey(ingredient);
      const existing = existingByKey.get(key);
      if (existing === undefined) {
        const itemId = await insertRecipeItem(ctx, listId, ingredient, nextSortOrder++, addition);
        const inserted = await ctx.db.get(itemId);
        if (inserted !== null) existingByKey.set(key, inserted);
        continue;
      }

      const sources = await ctx.db.query("groceryListItemSources").withIndex("by_grocery_list_item", (q) => q.eq("groceryListItemId", existing._id)).take(100);
      if (sources.some((source) => source.recipeId === recipeId)) continue;
      const canonicalName = canonicalIngredientName(ingredient.name);
      await ctx.db.patch(existing._id, {
        name: canonicalName,
        normalizedName: canonicalName,
        ...mergedAmount(canonicalName, existing, ingredient),
        notes: combinedNotes(existing.notes, ingredient.notes),
        isChecked: false,
        updatedAt: now,
      });
      await insertItemSource(ctx, existing._id, ingredient, addition);
    }
    await ctx.db.patch(listId, { sourceRecipeIds: sourceRecipeIdsOf([list], recipeId), updatedAt: now });
    return listId;
  },
});

export const save = mutation({
  args: {
    listId: v.optional(v.id("groceryLists")),
    requestId: v.string(),
    name: v.string(),
    items: v.array(saveItem),
    removedItemIds: v.optional(v.array(v.id("groceryListItems"))),
  },
  returns: v.id("groceryLists"),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const name = validListName(args.name);
    if (args.items.length > MAX_LIST_ITEMS) {
      throw new Error("A grocery list can contain at most 500 items");
    }

    const requestId = validateRequestId(args.requestId);
    let listId = args.listId;
    if (listId === undefined) {
      const existingRequest = await ctx.db
        .query("groceryLists")
        .withIndex("by_user_and_client_request", (q) =>
          q.eq("userId", userId).eq("clientRequestId", requestId),
        )
        .unique();
      if (existingRequest !== null) return existingRequest._id;
      const now = Date.now();
      listId = await ctx.db.insert("groceryLists", {
        userId,
        clientRequestId: requestId,
        name,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await requireOwnedList(ctx, userId, listId);
    }

    const existingItems = await ctx.db
      .query("groceryListItems")
      .withIndex("by_list", (q) => q.eq("listId", listId))
      .take(MAX_LIST_ITEMS + 1);
    if (existingItems.length > MAX_LIST_ITEMS) {
      throw new Error("A grocery list can contain at most 500 items");
    }
    const existingById = new Map(existingItems.map((item) => [item._id, item]));
    const retainedIds = new Set<Id<"groceryListItems">>();
    const now = Date.now();

    for (const item of args.items) {
      const itemName = validItemName(item.name);
      const sortOrder = validatedSortOrder(item.sortOrder);
      const patch = {
        name: itemName,
        normalizedName: itemName,
        quantity: undefined,
        ...optionalTextFields(item),
        isChecked: item.isChecked,
        sortOrder,
        updatedAt: now,
      };

      if (item.itemId !== undefined) {
        const existingItem = existingById.get(item.itemId);
        if (existingItem === undefined) {
          throw new Error("Grocery item does not belong to this list");
        }
        retainedIds.add(item.itemId);
        await ctx.db.patch(item.itemId, {
          ...patch,
          ingredientId:
            existingItem.normalizedName === patch.normalizedName
              ? existingItem.ingredientId
              : undefined,
        });
      } else {
        await ctx.db.insert("groceryListItems", {
          listId,
          ...patch,
          createdAt: now,
        });
      }
    }

    // Items the client never loaded (added from another device or tab while
    // this editor was open) are kept; only explicit removals are deleted.
    const removedIds =
      args.removedItemIds === undefined ? null : new Set(args.removedItemIds);
    for (const existingItem of existingItems) {
      if (retainedIds.has(existingItem._id)) continue;
      if (removedIds !== null && !removedIds.has(existingItem._id)) continue;
      await deleteItemWithSources(ctx, existingItem._id);
    }

    await ctx.db.patch(listId, { name, needsInitialSave: false, updatedAt: now });
    return listId;
  },
});

export const combineLists = mutation({
  args: {
    listId: v.id("groceryLists"),
    otherListId: v.id("groceryLists"),
    requestId: v.string(),
    name: v.string(),
  },
  returns: v.id("groceryLists"),
  handler: async (ctx, { listId, otherListId, requestId, name }) => {
    const userId = await requireUser(ctx);
    if (listId === otherListId) {
      throw new Error("Choose two different grocery lists");
    }
    const clientRequestId = validateRequestId(requestId);
    const existingRequest = await ctx.db
      .query("groceryLists")
      .withIndex("by_user_and_client_request", (q) =>
        q.eq("userId", userId).eq("clientRequestId", clientRequestId),
      )
      .unique();
    if (existingRequest !== null) return existingRequest._id;
    const combinedName = validListName(name);
    const firstList = await requireOwnedList(ctx, userId, listId);
    const secondList = await requireOwnedList(ctx, userId, otherListId);

    const [firstItems, secondItems] = await Promise.all([
      ctx.db
        .query("groceryListItems")
        .withIndex("by_list_and_order", (q) => q.eq("listId", listId))
        .take(MAX_LIST_ITEMS + 1),
      ctx.db
        .query("groceryListItems")
        .withIndex("by_list_and_order", (q) => q.eq("listId", otherListId))
        .take(MAX_LIST_ITEMS + 1),
    ]);
    if (firstItems.length > MAX_LIST_ITEMS || secondItems.length > MAX_LIST_ITEMS) {
      throw new Error("A source grocery list contains too many items");
    }

    type CombinedItem = {
      ingredientId?: Id<"ingredients">;
      name: string;
      normalizedName: string;
      quantity?: number;
      quantityText?: string;
      unit?: string;
      category?: string;
      notes?: string;
      sourceItemIds: Id<"groceryListItems">[];
    };
    const combinedByIngredient = new Map<string, CombinedItem>();
    for (const item of [...firstItems, ...secondItems]) {
      const key = ingredientMatchKey(item);
      const existing = combinedByIngredient.get(key);
      if (existing === undefined) {
        combinedByIngredient.set(key, {
          ingredientId: item.ingredientId,
          name: normalizeIngredientName(item.name),
          normalizedName: item.normalizedName,
          quantity: item.quantity,
          quantityText: item.quantityText,
          unit: normalizedIngredientUnit(item.name, item.unit),
          category: item.category,
          notes: item.notes,
          sourceItemIds: [item._id],
        });
        continue;
      }

      const amount = mergedAmount(item.name, existing, item);
      existing.quantity = amount.quantity;
      existing.quantityText = amount.quantityText;
      existing.notes = combinedNotes(existing.notes, item.notes);
      const canonicalName = canonicalIngredientName(item.name);
      existing.name = canonicalName;
      existing.normalizedName = canonicalName;
      if (existing.ingredientId !== item.ingredientId) {
        existing.ingredientId = undefined;
      }
      existing.sourceItemIds.push(item._id);
    }
    const combinedItems = [...combinedByIngredient.values()];
    if (combinedItems.length > MAX_LIST_ITEMS) {
      throw new Error("The combined grocery list would exceed 500 items");
    }

    const now = Date.now();
    const sourceRecipeIds = sourceRecipeIdsOf([firstList, secondList]);
    const combinedListId = await ctx.db.insert("groceryLists", {
      userId,
      clientRequestId,
      name: combinedName,
      sourceRecipeIds: sourceRecipeIds.length > 0 ? sourceRecipeIds : undefined,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    let copiedSourceCount = 0;
    for (const [index, item] of combinedItems.entries()) {
      const newItemId = await ctx.db.insert("groceryListItems", {
        listId: combinedListId,
        ingredientId: item.ingredientId,
        name: normalizeIngredientName(item.name),
        normalizedName: item.normalizedName,
        quantity: item.quantity,
        quantityText: item.quantityText,
        unit: item.unit,
        category: item.category,
        notes: item.notes,
        isChecked: false,
        sortOrder: index + 1,
        createdAt: now,
        updatedAt: now,
      });
      for (const sourceItemId of item.sourceItemIds) {
        if (copiedSourceCount >= 1_000) break;
        const sources = await ctx.db
          .query("groceryListItemSources")
          .withIndex("by_grocery_list_item", (q) =>
            q.eq("groceryListItemId", sourceItemId),
          )
          .take(Math.min(20, 1_000 - copiedSourceCount));
        for (const source of sources) {
          await ctx.db.insert("groceryListItemSources", {
            groceryListItemId: newItemId,
            recipeId: source.recipeId,
            recipeIngredientId: source.recipeIngredientId,
            servingsMultiplier: source.servingsMultiplier,
            quantityAdded: source.quantityAdded,
            quantityTextAdded: source.quantityTextAdded,
            createdAt: now,
          });
          copiedSourceCount += 1;
        }
      }
    }

    await deleteListWithItems(ctx, firstList, firstItems, now);
    await deleteListWithItems(ctx, secondList, secondItems, now);
    return combinedListId;
  },
});

export const updateList = mutation({
  args: {
    listId: v.id("groceryLists"),
    name: v.optional(v.string()),
    status: v.optional(groceryListStatus),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireOwnedList(ctx, userId, args.listId);
    const patch: Partial<Doc<"groceryLists">> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = validListName(args.name);
    if (args.status !== undefined) {
      patch.status = args.status;
      patch.completedAt = args.status === "completed" ? Date.now() : undefined;
    }
    await ctx.db.patch(args.listId, patch);
    return null;
  },
});

export const addItem = mutation({
  args: {
    listId: v.id("groceryLists"),
    name: v.string(),
    quantity: v.optional(nullableNumber),
    quantityText: v.optional(nullableString),
    unit: v.optional(nullableString),
    category: v.optional(nullableString),
    notes: v.optional(nullableString),
  },
  returns: v.id("groceryListItems"),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireOwnedList(ctx, userId, args.listId);
    const name = validItemName(args.name);
    const currentItems = await ctx.db
      .query("groceryListItems")
      .withIndex("by_list_and_order", (q) => q.eq("listId", args.listId))
      .take(MAX_LIST_ITEMS);
    if (currentItems.length >= MAX_LIST_ITEMS) {
      throw new Error("A grocery list can contain at most 500 items");
    }
    const now = Date.now();
    return await ctx.db.insert("groceryListItems", {
      listId: args.listId,
      name,
      normalizedName: name,
      quantity:
        args.quantity === null || args.quantity === undefined
          ? undefined
          : validQuantity(args.quantity),
      ...optionalTextFields(args),
      isChecked: false,
      sortOrder: (currentItems.at(-1)?.sortOrder ?? 0) + 1,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateItem = mutation({
  args: {
    itemId: v.id("groceryListItems"),
    name: v.optional(v.string()),
    quantity: v.optional(nullableNumber),
    quantityText: v.optional(nullableString),
    unit: v.optional(nullableString),
    category: v.optional(nullableString),
    notes: v.optional(nullableString),
    isChecked: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireOwnedItem(ctx, userId, args.itemId);
    const patch: Partial<Doc<"groceryListItems">> = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      const name = validItemName(args.name);
      patch.name = name;
      patch.normalizedName = name;
      // A renamed item is user-authored and may no longer match the catalog.
      patch.ingredientId = undefined;
    }
    if (args.quantity !== undefined) {
      patch.quantity =
        args.quantity === null ? undefined : validQuantity(args.quantity);
    }
    for (const field of ["quantityText", "unit", "category", "notes"] as const) {
      if (args[field] !== undefined) {
        patch[field] = optionalTextField(field, args[field]);
      }
    }
    if (args.isChecked !== undefined) patch.isChecked = args.isChecked;
    if (args.sortOrder !== undefined) {
      patch.sortOrder = validatedSortOrder(args.sortOrder);
    }
    await ctx.db.patch(args.itemId, patch);
    return null;
  },
});

export const removeItem = mutation({
  args: { itemId: v.id("groceryListItems") },
  returns: v.null(),
  handler: async (ctx, { itemId }) => {
    const userId = await requireUser(ctx);
    await requireOwnedItem(ctx, userId, itemId);
    await deleteItemWithSources(ctx, itemId);
    return null;
  },
});

export const removeList = mutation({
  args: { listId: v.id("groceryLists") },
  returns: v.null(),
  handler: async (ctx, { listId }) => {
    const userId = await requireUser(ctx);
    const list = await requireOwnedList(ctx, userId, listId);
    const items = await ctx.db
      .query("groceryListItems")
      .withIndex("by_list", (q) => q.eq("listId", listId))
      .take(MAX_LIST_ITEMS);
    await deleteListWithItems(ctx, list, items, Date.now());
    return null;
  },
});
