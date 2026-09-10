import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  accessibleRecipe,
  ownedList,
  ownedListItem,
  requireUserId,
} from "./lib/access";
import {
  normalizeGroceryUnit,
  normalizeListItem,
  normalizeListName,
  normalizeRequestKey,
} from "./lib/validation";

const UNDO_WINDOW_MS = 30_000;

async function requireOwnedList(ctx: Parameters<typeof ownedList>[0], listId: Id<"groceryLists">) {
  const userId = await requireUserId(ctx);
  const list = await ownedList(ctx, userId, listId);
  if (list === null) throw new Error("Grocery list not found");
  return { userId, list };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const lists = await ctx.db
      .query("groceryLists")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return await Promise.all(
      lists
        .filter((item) => item.status !== "archived")
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map(async (groceryList) => {
          const items = await ctx.db
            .query("groceryListItems")
            .withIndex("by_list", (q) => q.eq("listId", groceryList._id))
            .collect();
          const visible = items.filter((item) => item.removedAt === undefined);
          return {
            ...groceryList,
            itemCount: visible.length,
            checkedCount: visible.filter((item) => item.isChecked).length,
          };
        }),
    );
  },
});

export const detail = query({
  args: { listId: v.id("groceryLists") },
  handler: async (ctx, { listId }) => {
    const userId = await requireUserId(ctx);
    const groceryList = await ownedList(ctx, userId, listId);
    if (groceryList === null) return null;
    const items = (
      await ctx.db
        .query("groceryListItems")
        .withIndex("by_list_and_order", (q) => q.eq("listId", listId))
        .collect()
    ).filter((item) => item.removedAt === undefined);
    return {
      groceryList,
      items: await Promise.all(
        items.map(async (item) => {
          const rows = await ctx.db
            .query("groceryListItemSources")
            .withIndex("by_grocery_list_item", (q) =>
              q.eq("groceryListItemId", item._id),
            )
            .collect();
          const sources = await Promise.all(
            rows.map(async (source) => {
              const recipe = await accessibleRecipe(ctx, userId, source.recipeId);
              return {
                ...source,
                recipeTitle: recipe?.title ?? "Unavailable recipe",
                recipeHref: recipe ? `/app/recipe-book/${recipe._id}` : undefined,
              };
            }),
          );
          return { ...item, sources };
        }),
      ),
    };
  },
});

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    return await ctx.db.insert("groceryLists", {
      userId,
      name: normalizeListName(name),
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const rename = mutation({
  args: { listId: v.id("groceryLists"), name: v.string() },
  handler: async (ctx, { listId, name }) => {
    await requireOwnedList(ctx, listId);
    await ctx.db.patch(listId, { name: normalizeListName(name), updatedAt: Date.now() });
  },
});

export const setStatus = mutation({
  args: {
    listId: v.id("groceryLists"),
    status: v.union(v.literal("active"), v.literal("completed"), v.literal("archived")),
  },
  handler: async (ctx, { listId, status }) => {
    await requireOwnedList(ctx, listId);
    const now = Date.now();
    await ctx.db.patch(listId, {
      status,
      completedAt: status === "completed" ? now : undefined,
      updatedAt: now,
    });
  },
});

export const addItem = mutation({
  args: {
    listId: v.id("groceryLists"),
    name: v.string(),
    quantity: v.optional(v.number()),
    quantityText: v.optional(v.string()),
    unit: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOwnedList(ctx, args.listId);
    const item = normalizeListItem(args);
    const existing = await ctx.db
      .query("groceryListItems")
      .withIndex("by_list_and_order", (q) => q.eq("listId", args.listId))
      .collect();
    const now = Date.now();
    return await ctx.db.insert("groceryListItems", {
      listId: args.listId,
      ...item,
      isChecked: false,
      sortOrder: (existing.at(-1)?.sortOrder ?? -1) + 1,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateItem = mutation({
  args: {
    itemId: v.id("groceryListItems"),
    name: v.string(),
    quantity: v.optional(v.number()),
    quantityText: v.optional(v.string()),
    unit: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const item = await ownedListItem(ctx, userId, args.itemId);
    if (item === null) throw new Error("Grocery item not found");
    await ctx.db.patch(args.itemId, { ...normalizeListItem(args), updatedAt: Date.now() });
  },
});

export const checkItem = mutation({
  args: { itemId: v.id("groceryListItems"), isChecked: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const item = await ownedListItem(ctx, userId, args.itemId);
    if (item === null) throw new Error("Grocery item not found");
    await ctx.db.patch(args.itemId, { isChecked: args.isChecked, updatedAt: Date.now() });
  },
});

export const removeItem = mutation({
  args: { itemId: v.id("groceryListItems") },
  handler: async (ctx, { itemId }) => {
    const userId = await requireUserId(ctx);
    const item = await ownedListItem(ctx, userId, itemId);
    if (item === null) throw new Error("Grocery item not found");
    if (item.removedAt !== undefined) return item.removalExpiresAt;
    const now = Date.now();
    const removalExpiresAt = now + UNDO_WINDOW_MS;
    await ctx.db.patch(itemId, { removedAt: now, removalExpiresAt, updatedAt: now });
    return removalExpiresAt;
  },
});

export const undoRemove = mutation({
  args: { itemId: v.id("groceryListItems") },
  handler: async (ctx, { itemId }) => {
    const userId = await requireUserId(ctx);
    const item = await ownedListItem(ctx, userId, itemId);
    if (item === null) throw new Error("Grocery item not found");
    if (item.removedAt === undefined) return true;
    if ((item.removalExpiresAt ?? 0) < Date.now()) throw new Error("Undo period expired");
    await ctx.db.patch(itemId, { removedAt: undefined, removalExpiresAt: undefined, updatedAt: Date.now() });
    return true;
  },
});

export const cleanupExpired = mutation({
  args: { listId: v.id("groceryLists") },
  handler: async (ctx, { listId }) => {
    await requireOwnedList(ctx, listId);
    const items = await ctx.db
      .query("groceryListItems")
      .withIndex("by_list", (q) => q.eq("listId", listId))
      .collect();
    const expired = items.filter((item) =>
      item.removalExpiresAt !== undefined && item.removalExpiresAt <= Date.now(),
    );
    for (const item of expired) {
      const sources = await ctx.db
        .query("groceryListItemSources")
        .withIndex("by_grocery_list_item", (q) => q.eq("groceryListItemId", item._id))
        .collect();
      for (const source of sources) await ctx.db.delete(source._id);
      await ctx.db.delete(item._id);
    }
    return expired.length;
  },
});

export const addRecipe = mutation({
  args: {
    listId: v.id("groceryLists"),
    recipeId: v.id("recipes"),
    ingredientIds: v.array(v.id("recipeIngredients")),
    servings: v.number(),
    requestKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireOwnedList(ctx, args.listId);
    const recipe = await accessibleRecipe(ctx, userId, args.recipeId);
    if (recipe === null) throw new Error("Recipe not found");
    if (args.ingredientIds.length === 0) throw new Error("Select at least one ingredient");
    if (!Number.isFinite(args.servings) || args.servings <= 0) throw new Error("Servings must be positive");
    const requestKey = normalizeRequestKey(args.requestKey);
    const previous = await ctx.db
      .query("groceryListAdditions")
      .withIndex("by_list_and_request", (q) =>
        q.eq("listId", args.listId).eq("requestKey", requestKey),
      )
      .unique();
    if (previous !== null) return { itemIds: previous.itemIds, duplicate: true };
    const uniqueIds = [...new Set(args.ingredientIds)];
    const ingredients = await Promise.all(uniqueIds.map((id) => ctx.db.get(id)));
    if (ingredients.some((item) => item?.recipeId !== args.recipeId)) {
      throw new Error("Ingredient selection is invalid");
    }
    const multiplier = args.servings / (recipe.servings && recipe.servings > 0 ? recipe.servings : args.servings);
    const existing = await ctx.db
      .query("groceryListItems")
      .withIndex("by_list_and_order", (q) => q.eq("listId", args.listId))
      .collect();
    let nextOrder = (existing.at(-1)?.sortOrder ?? -1) + 1;
    const itemIds: Id<"groceryListItems">[] = [];
    const now = Date.now();
    for (const ingredient of ingredients) {
      if (ingredient === null) throw new Error("Ingredient selection is invalid");
      const scaledQuantity = ingredient.quantity === undefined ? undefined : ingredient.quantity * multiplier;
      const unit = normalizeGroceryUnit(ingredient.unit);
      const mergeTarget = existing.find((item) =>
        item.removedAt === undefined &&
        !item.isChecked &&
        item.normalizedName === ingredient.normalizedName &&
        normalizeGroceryUnit(item.unit) === unit &&
        item.quantity !== undefined &&
        scaledQuantity !== undefined &&
        item.quantityText === undefined &&
        ingredient.quantityText === undefined,
      );
      let itemId: Id<"groceryListItems">;
      if (mergeTarget) {
        await ctx.db.patch(mergeTarget._id, {
          quantity: (mergeTarget.quantity ?? 0) + (scaledQuantity ?? 0),
          updatedAt: now,
        });
        itemId = mergeTarget._id;
        mergeTarget.quantity = (mergeTarget.quantity ?? 0) + (scaledQuantity ?? 0);
      } else {
        itemId = await ctx.db.insert("groceryListItems", {
          listId: args.listId,
          ingredientId: ingredient.ingredientId,
          name: ingredient.name,
          normalizedName: ingredient.normalizedName,
          quantity: scaledQuantity,
          quantityText: ingredient.quantityText,
          unit,
          notes: ingredient.notes,
          isChecked: false,
          sortOrder: nextOrder++,
          createdAt: now,
          updatedAt: now,
        });
        existing.push((await ctx.db.get(itemId))!);
      }
      itemIds.push(itemId);
      await ctx.db.insert("groceryListItemSources", {
        groceryListItemId: itemId,
        recipeId: args.recipeId,
        recipeIngredientId: ingredient._id,
        servingsMultiplier: multiplier,
        quantityAdded: scaledQuantity,
        quantityTextAdded: ingredient.quantityText,
        createdAt: now,
      });
    }
    await ctx.db.insert("groceryListAdditions", {
      listId: args.listId,
      recipeId: args.recipeId,
      requestKey,
      itemIds,
      createdAt: now,
    });
    return { itemIds, duplicate: false };
  },
});
