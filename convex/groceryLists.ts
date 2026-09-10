import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";

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

async function requireQueryUser(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Unauthenticated");
  return userId;
}

async function requireMutationUser(ctx: MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Unauthenticated");
  return userId;
}

function optionalString(value: string | null) {
  if (value === null) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function normalizeIngredientName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function validQuantity(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000) {
    throw new Error("Quantity must be between 0 and 1000000");
  }
  return value;
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

function strictNumericQuantity(item: {
  quantity?: number;
  quantityText?: string;
}) {
  if (item.quantity !== undefined && Number.isFinite(item.quantity)) {
    return item.quantity;
  }
  const quantityText = item.quantityText?.trim();
  if (!quantityText || !/^\d+(?:\.\d+)?$/.test(quantityText)) return undefined;
  const parsed = Number(quantityText);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function displayedQuantity(item: { quantity?: number; quantityText?: string }) {
  return item.quantityText?.trim() || item.quantity?.toString();
}

function combinedNotes(first?: string, second?: string) {
  const notes = [first?.trim(), second?.trim()].filter(
    (note): note is string => Boolean(note),
  );
  return [...new Set(notes)].join(" • ").slice(0, 500) || undefined;
}

async function requireOwnedList(
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

export const listMine = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const userId = await requireQueryUser(ctx);
    return await ctx.db
      .query("groceryLists")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100);
  },
});

export const get = query({
  args: { listId: v.id("groceryLists") },
  returns: v.union(
    v.null(),
    v.object({ list: v.any(), items: v.array(v.any()) }),
  ),
  handler: async (ctx, { listId }) => {
    const userId = await requireQueryUser(ctx);
    const list = await ctx.db.get(listId);
    if (list === null || list.userId !== userId) return null;
    const items = await ctx.db
      .query("groceryListItems")
      .withIndex("by_list_and_order", (q) => q.eq("listId", listId))
      .take(500);
    return { list, items };
  },
});

export const create = mutation({
  args: { name: v.string() },
  returns: v.id("groceryLists"),
  handler: async (ctx, { name }) => {
    const userId = await requireMutationUser(ctx);
    const normalizedName = name.trim();
    if (normalizedName.length === 0 || normalizedName.length > 200) {
      throw new Error("List name must be between 1 and 200 characters");
    }
    const now = Date.now();
    return await ctx.db.insert("groceryLists", {
      userId,
      name: normalizedName,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const createFromRecipe = mutation({
  args: { recipeId: v.id("recipes") },
  returns: v.id("groceryLists"),
  handler: async (ctx, { recipeId }) => {
    const userId = await requireMutationUser(ctx);
    const recipe = await ctx.db.get(recipeId);
    if (recipe === null || recipe.deletedAt !== undefined) {
      throw new Error("Recipe was not found");
    }

    const savedRecipe = await ctx.db
      .query("savedRecipes")
      .withIndex("by_user_and_recipe", (q) =>
        q.eq("userId", userId).eq("recipeId", recipeId),
      )
      .unique();
    if (recipe.isPublic !== true && savedRecipe === null) {
      throw new Error("Forbidden");
    }

    const existing = await ctx.db
      .query("groceryLists")
      .withIndex("by_user_and_source_recipe", (q) =>
        q.eq("userId", userId).eq("sourceRecipeId", recipeId),
      )
      .first();
    if (existing !== null) return existing._id;

    const recipeIngredients = await ctx.db
      .query("recipeIngredients")
      .withIndex("by_recipe_and_position", (q) => q.eq("recipeId", recipeId))
      .take(200);
    const requiredIngredients = recipeIngredients.filter(
      (ingredient) => !ingredient.isOptional,
    );
    const now = Date.now();
    const listId = await ctx.db.insert("groceryLists", {
      userId,
      name: recipe.title,
      sourceRecipeId: recipeId,
      sourceRecipeTitle: recipe.title,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    for (const [index, ingredient] of requiredIngredients.entries()) {
      const itemId = await ctx.db.insert("groceryListItems", {
        listId,
        ingredientId: ingredient.ingredientId,
        name: ingredient.name,
        normalizedName: ingredient.normalizedName,
        quantity: ingredient.quantity,
        quantityText: ingredient.quantityText,
        unit: ingredient.unit,
        category: undefined,
        notes: ingredient.notes,
        isChecked: false,
        sortOrder: index + 1,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("groceryListItemSources", {
        groceryListItemId: itemId,
        recipeId,
        recipeIngredientId: ingredient._id,
        servingsMultiplier: 1,
        quantityAdded: ingredient.quantity,
        quantityTextAdded: ingredient.quantityText,
        createdAt: now,
      });
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

export const save = mutation({
  args: {
    listId: v.optional(v.id("groceryLists")),
    requestId: v.string(),
    name: v.string(),
    items: v.array(saveItem),
  },
  returns: v.id("groceryLists"),
  handler: async (ctx, args) => {
    const userId = await requireMutationUser(ctx);
    const name = args.name.trim();
    if (name.length === 0 || name.length > 200) {
      throw new Error("List name must be between 1 and 200 characters");
    }
    if (args.items.length > 500) {
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
      .take(501);
    if (existingItems.length > 500) {
      throw new Error("A grocery list can contain at most 500 items");
    }
    const existingById = new Map(existingItems.map((item) => [item._id, item]));
    const retainedIds = new Set<Id<"groceryListItems">>();
    const now = Date.now();

    for (const item of args.items) {
      const itemName = item.name.trim();
      if (itemName.length === 0 || itemName.length > 300) {
        throw new Error("Item name must be between 1 and 300 characters");
      }
      const sortOrder = validatedSortOrder(item.sortOrder);
      const quantityText =
        item.quantityText === undefined ? undefined : optionalString(item.quantityText);
      const patch = {
        name: itemName,
        normalizedName: normalizeIngredientName(itemName),
        quantity: undefined,
        quantityText,
        unit: item.unit === undefined ? undefined : optionalString(item.unit),
        category:
          item.category === undefined ? undefined : optionalString(item.category),
        notes: item.notes === undefined ? undefined : optionalString(item.notes),
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

    for (const existingItem of existingItems) {
      if (retainedIds.has(existingItem._id)) continue;
      const sources = await ctx.db
        .query("groceryListItemSources")
        .withIndex("by_grocery_list_item", (q) =>
          q.eq("groceryListItemId", existingItem._id),
        )
        .take(100);
      for (const source of sources) await ctx.db.delete(source._id);
      await ctx.db.delete(existingItem._id);
    }

    await ctx.db.patch(listId, { name, updatedAt: now });
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
    const userId = await requireMutationUser(ctx);
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
    const combinedName = name.trim();
    if (combinedName.length === 0 || combinedName.length > 200) {
      throw new Error("List name must be between 1 and 200 characters");
    }
    const firstList = await requireOwnedList(ctx, userId, listId);
    const secondList = await requireOwnedList(ctx, userId, otherListId);

    const [firstItems, secondItems] = await Promise.all([
      ctx.db
        .query("groceryListItems")
        .withIndex("by_list_and_order", (q) => q.eq("listId", listId))
        .take(501),
      ctx.db
        .query("groceryListItems")
        .withIndex("by_list_and_order", (q) => q.eq("listId", otherListId))
        .take(501),
    ]);
    if (firstItems.length > 500 || secondItems.length > 500) {
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
      const normalizedUnit = item.unit?.trim().toLowerCase() ?? "";
      const key = `${item.normalizedName}\u0000${normalizedUnit}`;
      const existing = combinedByIngredient.get(key);
      if (existing === undefined) {
        combinedByIngredient.set(key, {
          ingredientId: item.ingredientId,
          name: item.name,
          normalizedName: item.normalizedName,
          quantity: item.quantity,
          quantityText: item.quantityText,
          unit: item.unit,
          category: item.category,
          notes: item.notes,
          sourceItemIds: [item._id],
        });
        continue;
      }

      const currentAmount = strictNumericQuantity(existing);
      const incomingAmount = strictNumericQuantity(item);
      if (currentAmount !== undefined && incomingAmount !== undefined) {
        const total = validQuantity(currentAmount + incomingAmount);
        existing.quantity = total;
        existing.quantityText = total.toString();
      } else {
        const quantities = [
          existing.quantityText ?? existing.quantity?.toString(),
          displayedQuantity(item),
        ].filter((quantity): quantity is string => Boolean(quantity));
        existing.quantity = undefined;
        existing.quantityText = quantities.join(" + ").slice(0, 100) || undefined;
      }
      existing.notes = combinedNotes(existing.notes, item.notes);
      if (existing.ingredientId !== item.ingredientId) {
        existing.ingredientId = undefined;
      }
      existing.sourceItemIds.push(item._id);
    }
    const combinedItems = [...combinedByIngredient.values()];
    if (combinedItems.length > 500) {
      throw new Error("The combined grocery list would exceed 500 items");
    }

    const now = Date.now();
    const combinedListId = await ctx.db.insert("groceryLists", {
      userId,
      clientRequestId,
      name: combinedName,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    let copiedSourceCount = 0;
    for (const [index, item] of combinedItems.entries()) {
      const newItemId = await ctx.db.insert("groceryListItems", {
        listId: combinedListId,
        ingredientId: item.ingredientId,
        name: item.name,
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

    for (const [sourceList, sourceItems] of [
      [firstList, firstItems],
      [secondList, secondItems],
    ] as const) {
      for (const item of sourceItems) {
        const sources = await ctx.db
          .query("groceryListItemSources")
          .withIndex("by_grocery_list_item", (q) =>
            q.eq("groceryListItemId", item._id),
          )
          .take(100);
        for (const source of sources) await ctx.db.delete(source._id);
        await ctx.db.delete(item._id);
      }
      if (sourceList.sourceRecipeId !== undefined) {
        const recipe = await ctx.db.get(sourceList.sourceRecipeId);
        if (recipe?.importId !== undefined) {
          const recipeImport = await ctx.db.get(recipe.importId);
          if (recipeImport?.generatedGroceryListId === sourceList._id) {
            await ctx.db.patch(recipeImport._id, {
              generatedGroceryListId: undefined,
              updatedAt: now,
            });
          }
        }
      }
      await ctx.db.delete(sourceList._id);
    }
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
    const userId = await requireMutationUser(ctx);
    await requireOwnedList(ctx, userId, args.listId);
    const patch: Partial<Doc<"groceryLists">> = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length === 0 || name.length > 200) {
        throw new Error("List name must be between 1 and 200 characters");
      }
      patch.name = name;
    }
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
    const userId = await requireMutationUser(ctx);
    await requireOwnedList(ctx, userId, args.listId);
    const name = args.name.trim();
    if (name.length === 0 || name.length > 300) {
      throw new Error("Item name must be between 1 and 300 characters");
    }
    const currentItems = await ctx.db
      .query("groceryListItems")
      .withIndex("by_list", (q) => q.eq("listId", args.listId))
      .take(500);
    if (currentItems.length >= 500) {
      throw new Error("A grocery list can contain at most 500 items");
    }
    const lastItem = await ctx.db
      .query("groceryListItems")
      .withIndex("by_list_and_order", (q) => q.eq("listId", args.listId))
      .order("desc")
      .first();
    const now = Date.now();
    return await ctx.db.insert("groceryListItems", {
      listId: args.listId,
      name,
      normalizedName: normalizeIngredientName(name),
      quantity:
        args.quantity === null || args.quantity === undefined
          ? undefined
          : validQuantity(args.quantity),
      quantityText:
        args.quantityText === undefined ? undefined : optionalString(args.quantityText),
      unit: args.unit === undefined ? undefined : optionalString(args.unit),
      category:
        args.category === undefined ? undefined : optionalString(args.category),
      notes: args.notes === undefined ? undefined : optionalString(args.notes),
      isChecked: false,
      sortOrder: (lastItem?.sortOrder ?? 0) + 1,
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
    const userId = await requireMutationUser(ctx);
    await requireOwnedItem(ctx, userId, args.itemId);
    const patch: Partial<Doc<"groceryListItems">> = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length === 0 || name.length > 300) {
        throw new Error("Item name must be between 1 and 300 characters");
      }
      patch.name = name;
      patch.normalizedName = normalizeIngredientName(name);
      // A renamed item is user-authored and may no longer match the catalog.
      patch.ingredientId = undefined;
    }
    if (args.quantity !== undefined) {
      patch.quantity =
        args.quantity === null ? undefined : validQuantity(args.quantity);
    }
    for (const field of ["quantityText", "unit", "category", "notes"] as const) {
      if (args[field] !== undefined) patch[field] = optionalString(args[field]);
    }
    if (args.isChecked !== undefined) patch.isChecked = args.isChecked;
    if (args.sortOrder !== undefined) {
      if (
        !Number.isSafeInteger(args.sortOrder) ||
        args.sortOrder < 0 ||
        args.sortOrder > 100_000
      ) {
        throw new Error("Sort order must be an integer between 0 and 100000");
      }
      patch.sortOrder = args.sortOrder;
    }
    await ctx.db.patch(args.itemId, patch);
    return null;
  },
});

export const removeItem = mutation({
  args: { itemId: v.id("groceryListItems") },
  returns: v.null(),
  handler: async (ctx, { itemId }) => {
    const userId = await requireMutationUser(ctx);
    await requireOwnedItem(ctx, userId, itemId);
    const sources = await ctx.db
      .query("groceryListItemSources")
      .withIndex("by_grocery_list_item", (q) => q.eq("groceryListItemId", itemId))
      .take(100);
    for (const source of sources) await ctx.db.delete(source._id);
    await ctx.db.delete(itemId);
    return null;
  },
});

export const removeList = mutation({
  args: { listId: v.id("groceryLists") },
  returns: v.null(),
  handler: async (ctx, { listId }) => {
    const userId = await requireMutationUser(ctx);
    const list = await requireOwnedList(ctx, userId, listId);
    const items = await ctx.db
      .query("groceryListItems")
      .withIndex("by_list", (q) => q.eq("listId", listId))
      .take(500);
    for (const item of items) {
      const sources = await ctx.db
        .query("groceryListItemSources")
        .withIndex("by_grocery_list_item", (q) =>
          q.eq("groceryListItemId", item._id),
        )
        .take(100);
      for (const source of sources) await ctx.db.delete(source._id);
      await ctx.db.delete(item._id);
    }
    if (list.sourceRecipeId !== undefined) {
      const recipe = await ctx.db.get(list.sourceRecipeId);
      if (recipe?.importId !== undefined) {
        const recipeImport = await ctx.db.get(recipe.importId);
        if (recipeImport?.generatedGroceryListId === listId) {
          await ctx.db.patch(recipeImport._id, {
            generatedGroceryListId: undefined,
            updatedAt: Date.now(),
          });
        }
      }
    }
    await ctx.db.delete(listId);
    return null;
  },
});
