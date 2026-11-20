import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { groceryCategory } from "./lib/groceryCategory";
import { parseManualIngredient } from "./lib/manualIngredient";
import { requireUser } from "./lib/auth";
import { mealPlanEntriesInRange, validateDateRange } from "./lib/mealPlan";
import { canAccessRecipe } from "./lib/recipeAccess";
import { normalizeIngredientName } from "./lib/ingredientName";

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
  mealPlanStartDate: v.optional(v.string()),
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

const TEXT_FIELDS = {
  quantityText: { label: "Quantity text", maximum: 100 },
  unit: { label: "Unit", maximum: 100 },
  category: { label: "Category", maximum: 100 },
  notes: { label: "Notes", maximum: 500 },
} as const;
type TextField = keyof typeof TEXT_FIELDS;

const MAX_LIST_ITEMS = 500;
const EGG_NAME = /^(?:(?:extra )?large|medium|small|jumbo)? ?eggs?$/;
const PLAIN_QUANTITY_TEXT = /^\d+(?:\.\d+)?(?:\s+\d+\/\d+)?$|^\d+\/\d+$/;

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

function comparableName(value: string) {
  return value.replace(/[‐‑‒–—-]/g, " ").replace(/\s+/g, " ");
}

function canonicalIngredientName(value: string) {
  const name = normalizeIngredientName(value);
  const comparable = comparableName(name);

  if (EGG_NAME.test(comparable)) return "eggs";
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
  if (canonicalIngredientName(ingredientName) === "eggs" && EGG_NAME.test(comparableName(unit))) {
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

function validatedServingsMultiplier(value: number | undefined) {
  if (value === undefined) return 1;
  if (!Number.isFinite(value) || value < 0.01 || value > 100) {
    throw new Error("Servings multiplier must be between 0.01 and 100");
  }
  return value;
}

function scaledIngredient<
  T extends { quantity?: number; quantityText?: string },
>(ingredient: T, multiplier: number): T {
  if (multiplier === 1) return ingredient;
  const amount = strictNumericQuantity(ingredient);
  if (amount === undefined) return ingredient;
  const quantity = validQuantity(amount * multiplier);
  return { ...ingredient, quantity, quantityText: formattedQuantity(quantity) };
}

async function catalogCategory(
  ctx: QueryCtx | MutationCtx,
  ingredientId: Id<"ingredients"> | undefined,
) {
  if (ingredientId === undefined) return undefined;
  return groceryCategory((await ctx.db.get(ingredientId))?.category);
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

function mergedQuantity(
  existing: { quantity?: number; quantityText?: string; unit?: string },
  incoming: { name: string; quantity?: number; quantityText?: string; unit?: string },
) {
  const currentAmount = strictNumericQuantity(existing);
  const incomingAmount = strictNumericQuantity(incoming);
  const convertedIncoming = incomingAmount === undefined
    ? undefined
    : convertQuantity(incomingAmount, incoming.name, incoming.unit, existing.unit);
  if (currentAmount !== undefined && convertedIncoming !== undefined) {
    const total = validQuantity(currentAmount + convertedIncoming);
    return { quantity: total, quantityText: formattedQuantity(total) };
  }
  const quantities = [displayedQuantity(existing), displayedQuantity(incoming)].filter(
    (quantity): quantity is string => Boolean(quantity),
  );
  return { quantity: undefined, quantityText: quantities.join(" + ").slice(0, 100) || undefined };
}

function hasQuantity(item: { quantity?: number; quantityText?: string; unit?: string }) {
  return item.quantity !== undefined || Boolean(item.quantityText) || Boolean(item.unit);
}

function normalizedGroceryItem<
  T extends { name: string; quantity?: number; quantityText?: string; unit?: string },
>(item: T) {
  const lowercaseName = normalizeIngredientName(item.name);
  const canonicalName = canonicalIngredientName(lowercaseName);
  const name = canonicalName === "eggs" ? canonicalName : lowercaseName;
  const quantityText =
    item.quantity !== undefined && item.quantityText && !PLAIN_QUANTITY_TEXT.test(item.quantityText.trim())
      ? formattedQuantity(item.quantity)
      : item.quantityText;
  return {
    ...item,
    name,
    normalizedName: name,
    quantityText,
    unit: normalizedIngredientUnit(canonicalName, item.unit),
  };
}

function groceryIngredient(item: Doc<"recipeIngredients">) {
  if (hasQuantity(item)) return normalizedGroceryItem(item);
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

async function mealPlanList(ctx: QueryCtx, userId: Id<"users">, startDate: string) {
  return await ctx.db
    .query("groceryLists")
    .withIndex("by_user_and_meal_plan_start", (q) =>
      q.eq("userId", userId).eq("mealPlanStartDate", startDate),
    )
    .order("desc")
    .first();
}

async function addRecipeIngredients(
  ctx: MutationCtx,
  list: Doc<"groceryLists">,
  recipeId: Id<"recipes">,
  multiplier: number,
) {
  const listId = list._id;
  const [requiredIngredients, existingItems] = await Promise.all([
    requiredRecipeIngredients(ctx, recipeId, multiplier),
    ctx.db.query("groceryListItems").withIndex("by_list_and_order", (q) => q.eq("listId", listId)).take(MAX_LIST_ITEMS + 1),
  ]);
  if (existingItems.length > MAX_LIST_ITEMS) throw new ConvexError("The grocery list is full");
  const existingByKey = new Map(
    existingItems.map((item) => [ingredientMatchKey(item), item]),
  );
  const missingKeys = new Set(
    requiredIngredients
      .map(ingredientMatchKey)
      .filter((key) => !existingByKey.has(key)),
  );
  if (existingItems.length + missingKeys.size > MAX_LIST_ITEMS) throw new ConvexError("The grocery list is full");
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
    const targetUnit = normalizedIngredientUnit(canonicalName, existing.unit);
    await ctx.db.patch(existing._id, {
      ...mergedQuantity({ ...existing, unit: targetUnit }, ingredient),
      name: canonicalName,
      normalizedName: canonicalName,
      unit: targetUnit,
      notes: combinedNotes(existing.notes, ingredient.notes),
      isChecked: false,
      updatedAt: now,
    });
    await insertItemSource(ctx, existing._id, ingredient, addition);
  }
  await ctx.db.patch(listId, { sourceRecipeIds: sourceRecipeIdsOf([list], recipeId), updatedAt: now });
}

async function addManualItems(
  ctx: MutationCtx,
  listId: Id<"groceryLists">,
  texts: string[],
) {
  const existingItems = await ctx.db
    .query("groceryListItems")
    .withIndex("by_list_and_order", (q) => q.eq("listId", listId))
    .take(MAX_LIST_ITEMS + 1);
  const existingByKey = new Map(existingItems.map((item) => [ingredientMatchKey(item), item]));
  let nextSortOrder = existingItems.reduce((maximum, item) => Math.max(maximum, item.sortOrder), 0) + 1;
  const now = Date.now();

  for (const text of texts) {
    const { name, normalizedName, quantity, quantityText, unit } =
      normalizedGroceryItem(parseManualIngredient(text));
    const item = { name, normalizedName, quantity, quantityText, unit };
    const key = ingredientMatchKey(item);
    const existing = existingByKey.get(key);
    if (existing !== undefined) {
      const merged = mergedQuantity(existing, item);
      await ctx.db.patch(existing._id, { ...merged, updatedAt: now });
      existingByKey.set(key, { ...existing, ...merged });
      continue;
    }
    if (existingByKey.size >= MAX_LIST_ITEMS) throw new ConvexError("The grocery list is full");
    const itemId = await ctx.db.insert("groceryListItems", {
      listId,
      ...item,
      isChecked: false,
      sortOrder: nextSortOrder++,
      createdAt: now,
      updatedAt: now,
    });
    const inserted = await ctx.db.get(itemId);
    if (inserted !== null) existingByKey.set(key, inserted);
  }
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
      if (!sourcedItemIds.has(item._id) || hasQuantity(item)) {
        return normalizedGroceryItem(item);
      }
      const parsed = parseManualIngredient(item.name);
      if (parsed.quantity === undefined) {
        return normalizedGroceryItem(item);
      }
      return normalizedGroceryItem({
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

    await addRecipeIngredients(ctx, list, recipeId, multiplier);
    return listId;
  },
});

export const forMealPlan = query({
  args: { startDate: v.string() },
  returns: v.union(v.null(), v.id("groceryLists")),
  handler: async (ctx, { startDate }) => {
    const userId = await requireUser(ctx);
    return (await mealPlanList(ctx, userId, startDate))?._id ?? null;
  },
});

export const createFromMealPlan = mutation({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    name: v.string(),
    replaceExisting: v.optional(v.boolean()),
  },
  returns: v.id("groceryLists"),
  handler: async (ctx, { startDate, endDate, name, replaceExisting }) => {
    const userId = await requireUser(ctx);
    const listName = validListName(name);
    validateDateRange(startDate, endDate, 7);

    const existing = await mealPlanList(ctx, userId, startDate);
    if (existing !== null && !replaceExisting) return existing._id;

    const entries = await mealPlanEntriesInRange(ctx, userId, startDate, endDate);
    const multipliers = new Map<Id<"recipes">, number>();
    const manualItems: string[] = [];
    for (const entry of entries) {
      if (entry.recipeId === undefined) manualItems.push(...(entry.groceryItems ?? []));
      if (entry.recipeId === undefined || entry.isLeftovers) continue;
      const recipe = await ctx.db.get(entry.recipeId);
      if (
        recipe === null ||
        recipe.deletedAt !== undefined ||
        !(await canAccessRecipe(ctx, userId, recipe))
      ) {
        continue;
      }
      const batches =
        entry.servings !== undefined && recipe.servings !== undefined && recipe.servings > 0
          ? entry.servings / recipe.servings
          : 1;
      const total = (multipliers.get(recipe._id) ?? 0) + batches;
      if (total < 0.01 || total > 100) {
        throw new ConvexError(`The planned servings for ${recipe.title} are too far from the recipe to scale`);
      }
      multipliers.set(recipe._id, total);
    }
    if (multipliers.size === 0 && manualItems.length === 0) {
      throw new ConvexError("Nothing to buy is planned for this week");
    }

    const now = Date.now();
    if (existing !== null) {
      const items = await ctx.db
        .query("groceryListItems")
        .withIndex("by_list", (q) => q.eq("listId", existing._id))
        .take(MAX_LIST_ITEMS);
      await deleteListWithItems(ctx, existing, items, now);
    }
    const listId = await ctx.db.insert("groceryLists", {
      userId,
      needsInitialSave: true,
      name: listName,
      mealPlanStartDate: startDate,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    for (const [recipeId, multiplier] of multipliers) {
      const list = await ctx.db.get(listId);
      if (list !== null) await addRecipeIngredients(ctx, list, recipeId, multiplier);
    }
    await addManualItems(ctx, listId, manualItems);
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

      Object.assign(existing, mergedQuantity(existing, item));
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
