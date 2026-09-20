import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { parseManualIngredient } from "./lib/manualIngredient";

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
  name: v.string(),
  sourceRecipeId: v.optional(v.id("recipes")),
  sourceRecipeTitle: v.optional(v.string()),
  sourceRecipeIds: v.optional(v.array(v.id("recipes"))),
  status: groceryListStatus,
  completedAt: v.optional(v.number()),
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
  createdAt: v.number(),
  updatedAt: v.number(),
});

const TEXT_LIMITS = {
  quantityText: 100,
  unit: 100,
  category: 100,
  notes: 500,
} as const;

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

function optionalString(value: string | null, label: string, maximum: number) {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > maximum) {
    throw new Error(`${label} must be at most ${maximum} characters`);
  }
  return trimmed;
}

function normalizeIngredientName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function canonicalIngredientName(value: string) {
  const name = normalizeIngredientName(value);
  const comparable = name.replace(/[‐‑‒–—-]/g, " ").replace(/\s+/g, " ");

  if (/^(?:(?:extra )?large|medium|small|jumbo)? ?eggs?$/.test(comparable)) {
    return "eggs";
  }
  if (/^(?:all purpose )?flour$/.test(comparable)) return "flour";
  if (/^(?:kosher )?salt$/.test(comparable)) return "salt";

  return name;
}

const unitAliases: Record<string, string> = {
  teaspoon: "tsp", teaspoons: "tsp", tsp: "tsp", tsps: "tsp",
  tablespoon: "tbsp", tablespoons: "tbsp", tbsp: "tbsp", tbsps: "tbsp",
  cup: "cup", cups: "cup",
  milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml", ml: "ml",
  liter: "l", liters: "l", litre: "l", litres: "l", l: "l",
  gram: "g", grams: "g", g: "g",
  kilogram: "kg", kilograms: "kg", kg: "kg",
  ounce: "oz", ounces: "oz", oz: "oz",
  pound: "lb", pounds: "lb", lb: "lb", lbs: "lb",
};

const unitConversions: Record<string, { family: "volume" | "weight"; factor: number }> = {
  tsp: { family: "volume", factor: 4.92892159375 },
  tbsp: { family: "volume", factor: 14.78676478125 },
  cup: { family: "volume", factor: 236.5882365 },
  ml: { family: "volume", factor: 1 },
  l: { family: "volume", factor: 1_000 },
  g: { family: "weight", factor: 1 },
  kg: { family: "weight", factor: 1_000 },
  oz: { family: "weight", factor: 28.349523125 },
  lb: { family: "weight", factor: 453.59237 },
};

function normalizedIngredientUnit(ingredientName: string, value?: string) {
  if (!value?.trim()) return undefined;
  const unit = normalizeIngredientName(value).replace(/[().]/g, "").trim();
  if (
    canonicalIngredientName(ingredientName) === "eggs" &&
    /^(?:(?:extra )?large|medium|small|jumbo)? ?eggs?$/.test(
      unit.replace(/[‐‑‒–—-]/g, " ").replace(/\s+/g, " "),
    )
  ) {
    return undefined;
  }
  return unitAliases[unit] ?? unit;
}

function unitFamily(ingredientName: string, unit?: string) {
  const normalized = normalizedIngredientUnit(ingredientName, unit);
  if (normalized === undefined) return "count";
  return unitConversions[normalized]?.family ?? normalized;
}

function convertQuantity(
  quantity: number,
  ingredientName: string,
  fromUnit?: string,
  toUnit?: string,
) {
  const from = normalizedIngredientUnit(ingredientName, fromUnit);
  const to = normalizedIngredientUnit(ingredientName, toUnit);
  if (from === to) return quantity;
  if (from === undefined || to === undefined) return undefined;
  const fromConversion = unitConversions[from];
  const toConversion = unitConversions[to];
  if (!fromConversion || !toConversion || fromConversion.family !== toConversion.family) {
    return undefined;
  }
  return quantity * fromConversion.factor / toConversion.factor;
}

function formattedQuantity(value: number) {
  return Number(value.toFixed(4)).toString();
}

function ingredientMatchKey(item: {
  name: string;
  normalizedName?: string;
  unit?: string;
}) {
  const ingredient = canonicalIngredientName(item.normalizedName || item.name);
  return `${ingredient}\u0000${unitFamily(ingredient, item.unit)}`;
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

function groceryIngredient(item: Doc<"recipeIngredients">) {
  if (item.quantity !== undefined || item.quantityText || item.unit) {
    const name = normalizeIngredientName(item.name);
    const canonicalName = canonicalIngredientName(name);
    const unit = normalizedIngredientUnit(canonicalName, item.unit);
    const quantityText =
      item.quantity !== undefined && item.quantityText && !/^\d+(?:\.\d+)?(?:\s+\d+\/\d+)?$|^\d+\/\d+$/.test(item.quantityText.trim())
        ? formattedQuantity(item.quantity)
        : item.quantityText;
    return {
      ...item,
      name: canonicalName === "eggs" ? canonicalName : name,
      normalizedName: canonicalName === "eggs" ? canonicalName : name,
      quantityText,
      unit,
    };
  }
  const parsed = parseManualIngredient(item.originalText);
  if (parsed.quantity === undefined) {
    const name = normalizeIngredientName(item.name);
    return { ...item, name, normalizedName: name };
  }
  return {
    ...item,
    ingredientId: undefined,
    name: parsed.name,
    normalizedName: parsed.normalizedName,
    quantity: parsed.quantity,
    quantityText: parsed.quantityText,
    unit: parsed.unit,
    preparation: parsed.preparation,
  };
}

function groceryItemForDisplay(item: Doc<"groceryListItems">) {
  const lowercaseName = normalizeIngredientName(item.name);
  const canonicalName = canonicalIngredientName(lowercaseName);
  const isEgg = canonicalName === "eggs";
  const unit = normalizedIngredientUnit(canonicalName, item.unit);
  const quantityText =
    item.quantity !== undefined && item.quantityText && !/^\d+(?:\.\d+)?(?:\s+\d+\/\d+)?$|^\d+\/\d+$/.test(item.quantityText.trim())
      ? formattedQuantity(item.quantity)
      : item.quantityText;
  return {
    ...item,
    name: isEgg ? canonicalName : lowercaseName,
    normalizedName: isEgg ? canonicalName : lowercaseName,
    quantityText,
    unit,
  };
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
  returns: v.array(groceryListValidator),
  handler: async (ctx) => {
    const userId = await requireQueryUser(ctx);
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
    const userId = await requireQueryUser(ctx);
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
    const userId = await requireQueryUser(ctx);
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
    const visibleItems = items.map((item) => {
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
  args: { recipeId: v.id("recipes"), forceNew: v.optional(v.boolean()) },
  returns: v.id("groceryLists"),
  handler: async (ctx, { recipeId, forceNew }) => {
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
      const recipeImport =
        recipe.importId === undefined ? null : await ctx.db.get(recipe.importId);
      if (recipeImport?.requestedBy !== userId) {
        throw new Error("Forbidden");
      }
    }

    if (!forceNew) {
      const existing = await ctx.db
        .query("groceryLists")
        .withIndex("by_user_and_source_recipe", (q) =>
          q.eq("userId", userId).eq("sourceRecipeId", recipeId),
        )
        .first();
      if (existing !== null) return existing._id;
    }

    const recipeIngredients = await ctx.db
      .query("recipeIngredients")
      .withIndex("by_recipe_and_position", (q) => q.eq("recipeId", recipeId))
      .take(200);
    const requiredIngredients = recipeIngredients
      .filter((ingredient) => !ingredient.isOptional)
      .map(groceryIngredient);
    const now = Date.now();
    const listId = await ctx.db.insert("groceryLists", {
      userId,
      name: recipe.title,
      sourceRecipeId: recipeId,
      sourceRecipeTitle: recipe.title,
      sourceRecipeIds: [recipeId],
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

export const addRecipeToList = mutation({
  args: {
    recipeId: v.id("recipes"),
    listId: v.id("groceryLists"),
  },
  returns: v.id("groceryLists"),
  handler: async (ctx, { recipeId, listId }) => {
    const userId = await requireMutationUser(ctx);
    const list = await requireOwnedList(ctx, userId, listId);
    if (list.status !== "active") {
      throw new Error("Recipes can only be added to active grocery lists");
    }
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
    if (recipe.isPublic !== true && savedRecipe === null) throw new Error("Forbidden");

    const [recipeIngredients, existingItems] = await Promise.all([
      ctx.db.query("recipeIngredients").withIndex("by_recipe_and_position", (q) => q.eq("recipeId", recipeId)).take(200),
      ctx.db.query("groceryListItems").withIndex("by_list_and_order", (q) => q.eq("listId", listId)).take(501),
    ]);
    if (existingItems.length > 500) throw new Error("The grocery list is full");
    const existingByKey = new Map(
      existingItems.map((item) => [ingredientMatchKey(item), item]),
    );
    const requiredIngredients = recipeIngredients
      .filter((item) => !item.isOptional)
      .map(groceryIngredient);
    const missingKeys = new Set(
      requiredIngredients
        .map(ingredientMatchKey)
        .filter((key) => !existingByKey.has(key)),
    );
    if (existingItems.length + missingKeys.size > 500) throw new Error("The grocery list is full");
    const now = Date.now();
    let nextSortOrder = existingItems.reduce((maximum, item) => Math.max(maximum, item.sortOrder), 0) + 1;

    for (const ingredient of requiredIngredients) {
      const key = ingredientMatchKey(ingredient);
      const existing = existingByKey.get(key);
      if (existing === undefined) {
        const itemId = await ctx.db.insert("groceryListItems", {
          listId,
          ingredientId: ingredient.ingredientId,
          name: ingredient.name,
          normalizedName: ingredient.normalizedName,
          quantity: ingredient.quantity,
          quantityText: ingredient.quantityText,
          unit: ingredient.unit,
          notes: ingredient.notes,
          isChecked: false,
          sortOrder: nextSortOrder++,
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
        const inserted = await ctx.db.get(itemId);
        if (inserted !== null) existingByKey.set(key, inserted);
        continue;
      }

      const sources = await ctx.db.query("groceryListItemSources").withIndex("by_grocery_list_item", (q) => q.eq("groceryListItemId", existing._id)).take(100);
      if (sources.some((source) => source.recipeId === recipeId)) continue;
      const canonicalName = canonicalIngredientName(ingredient.name);
      const targetUnit = normalizedIngredientUnit(canonicalName, existing.unit);
      const currentAmount = strictNumericQuantity(existing);
      const incomingAmount = strictNumericQuantity(ingredient);
      const convertedIncoming = incomingAmount === undefined
        ? undefined
        : convertQuantity(incomingAmount, canonicalName, ingredient.unit, targetUnit);
      if (currentAmount !== undefined && convertedIncoming !== undefined) {
        const total = validQuantity(currentAmount + convertedIncoming);
        await ctx.db.patch(existing._id, { name: canonicalName, normalizedName: canonicalName, quantity: total, quantityText: formattedQuantity(total), unit: targetUnit, notes: combinedNotes(existing.notes, ingredient.notes), isChecked: false, updatedAt: now });
      } else {
        const quantities = [displayedQuantity(existing), displayedQuantity(ingredient)].filter((quantity): quantity is string => Boolean(quantity));
        await ctx.db.patch(existing._id, { name: canonicalName, normalizedName: canonicalName, quantity: undefined, quantityText: quantities.join(" + ").slice(0, 100) || undefined, unit: targetUnit, notes: combinedNotes(existing.notes, ingredient.notes), isChecked: false, updatedAt: now });
      }
      await ctx.db.insert("groceryListItemSources", {
        groceryListItemId: existing._id,
        recipeId,
        recipeIngredientId: ingredient._id,
        servingsMultiplier: 1,
        quantityAdded: ingredient.quantity,
        quantityTextAdded: ingredient.quantityText,
        createdAt: now,
      });
    }
    const sourceRecipeIds = [...new Set([
      ...(list.sourceRecipeIds ?? []),
      ...(list.sourceRecipeId === undefined ? [] : [list.sourceRecipeId]),
      recipeId,
    ])].slice(0, 500);
    await ctx.db.patch(listId, { sourceRecipeIds, updatedAt: now });
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
      const itemName = normalizeIngredientName(item.name);
      if (itemName.length === 0 || itemName.length > 300) {
        throw new Error("Item name must be between 1 and 300 characters");
      }
      const sortOrder = validatedSortOrder(item.sortOrder);
      const quantityText =
        item.quantityText === undefined
          ? undefined
          : optionalString(
              item.quantityText,
              "Quantity text",
              TEXT_LIMITS.quantityText,
            );
      const patch = {
        name: itemName,
        normalizedName: normalizeIngredientName(itemName),
        quantity: undefined,
        quantityText,
        unit:
          item.unit === undefined
            ? undefined
            : optionalString(item.unit, "Unit", TEXT_LIMITS.unit),
        category:
          item.category === undefined
            ? undefined
            : optionalString(item.category, "Category", TEXT_LIMITS.category),
        notes:
          item.notes === undefined
            ? undefined
            : optionalString(item.notes, "Notes", TEXT_LIMITS.notes),
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

      const currentAmount = strictNumericQuantity(existing);
      const incomingAmount = strictNumericQuantity(item);
      const convertedIncoming = incomingAmount === undefined
        ? undefined
        : convertQuantity(incomingAmount, item.name, item.unit, existing.unit);
      if (currentAmount !== undefined && convertedIncoming !== undefined) {
        const total = validQuantity(currentAmount + convertedIncoming);
        existing.quantity = total;
        existing.quantityText = formattedQuantity(total);
      } else {
        const quantities = [
          existing.quantityText ?? existing.quantity?.toString(),
          displayedQuantity(item),
        ].filter((quantity): quantity is string => Boolean(quantity));
        existing.quantity = undefined;
        existing.quantityText = quantities.join(" + ").slice(0, 100) || undefined;
      }
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
    if (combinedItems.length > 500) {
      throw new Error("The combined grocery list would exceed 500 items");
    }

    const now = Date.now();
    const sourceRecipeIds = [...new Set([
      ...(firstList.sourceRecipeIds ?? []),
      ...(firstList.sourceRecipeId === undefined ? [] : [firstList.sourceRecipeId]),
      ...(secondList.sourceRecipeIds ?? []),
      ...(secondList.sourceRecipeId === undefined ? [] : [secondList.sourceRecipeId]),
    ])].slice(0, 500);
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
    const name = normalizeIngredientName(args.name);
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
        args.quantityText === undefined
          ? undefined
          : optionalString(
              args.quantityText,
              "Quantity text",
              TEXT_LIMITS.quantityText,
            ),
      unit:
        args.unit === undefined
          ? undefined
          : optionalString(args.unit, "Unit", TEXT_LIMITS.unit),
      category:
        args.category === undefined
          ? undefined
          : optionalString(args.category, "Category", TEXT_LIMITS.category),
      notes:
        args.notes === undefined
          ? undefined
          : optionalString(args.notes, "Notes", TEXT_LIMITS.notes),
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
      const name = normalizeIngredientName(args.name);
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
      if (args[field] !== undefined) {
        const label =
          field === "quantityText"
            ? "Quantity text"
            : `${field[0].toUpperCase()}${field.slice(1)}`;
        patch[field] = optionalString(args[field], label, TEXT_LIMITS[field]);
      }
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
