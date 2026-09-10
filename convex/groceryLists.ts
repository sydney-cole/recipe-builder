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
