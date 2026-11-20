import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireUser } from "./lib/auth";
import {
  mealPlanEntriesInRange,
  validDateKey,
  validateDateRange,
} from "./lib/mealPlan";
import { canAccessRecipe } from "./lib/recipeAccess";

const mealSlot = v.union(
  v.literal("breakfast"),
  v.literal("lunch"),
  v.literal("dinner"),
);
const mealPlanEntryValidator = v.object({
  _id: v.id("mealPlanEntries"),
  date: v.string(),
  slot: mealSlot,
  title: v.string(),
  isLeftovers: v.boolean(),
  servings: v.optional(v.number()),
  groceryItems: v.array(v.string()),
  recipe: v.union(
    v.null(),
    v.object({
      id: v.id("recipes"),
      title: v.string(),
      servings: v.optional(v.number()),
      isSaved: v.boolean(),
    }),
  ),
});

const MAX_RANGE_DAYS = 31;
const MAX_SLOT_ENTRIES = 10;
const MAX_TITLE_LENGTH = 80;
const MAX_SERVINGS = 100;
const MAX_GROCERY_ITEMS = 20;
const MAX_GROCERY_ITEM_LENGTH = 100;

function validGroceryItems(items: string[]) {
  const names = items.map((item) => item.trim().replace(/\s+/g, " ")).filter((item) => item.length > 0);
  if (names.length > MAX_GROCERY_ITEMS) {
    throw new Error(`A meal can list at most ${MAX_GROCERY_ITEMS} items to buy`);
  }
  if (names.some((name) => name.length > MAX_GROCERY_ITEM_LENGTH)) {
    throw new Error(`Items to buy must be at most ${MAX_GROCERY_ITEM_LENGTH} characters`);
  }
  return names.length === 0 ? undefined : names;
}

async function requireOwnedEntry(
  ctx: MutationCtx,
  userId: Id<"users">,
  entryId: Id<"mealPlanEntries">,
) {
  const entry = await ctx.db.get(entryId);
  if (entry === null) throw new Error("Meal plan entry was not found");
  if (entry.userId !== userId) throw new Error("Forbidden");
  return entry;
}

async function requireOwnedRecipeEntry(
  ctx: MutationCtx,
  userId: Id<"users">,
  entryId: Id<"mealPlanEntries">,
) {
  const entry = await requireOwnedEntry(ctx, userId, entryId);
  if (entry.recipeId === undefined) {
    throw new Error("Only meals linked to a recipe can be changed this way");
  }
  return entry;
}

export const listRange = query({
  args: { startDate: v.string(), endDate: v.string() },
  returns: v.array(mealPlanEntryValidator),
  handler: async (ctx, { startDate, endDate }) => {
    const userId = await requireUser(ctx);
    validateDateRange(startDate, endDate, MAX_RANGE_DAYS);
    const entries = await mealPlanEntriesInRange(ctx, userId, startDate, endDate);
    return await Promise.all(
      entries.map(async (entry) => {
        const recipe =
          entry.recipeId === undefined ? null : await ctx.db.get(entry.recipeId);
        const visible =
          recipe !== null &&
          recipe.deletedAt === undefined &&
          (await canAccessRecipe(ctx, userId, recipe));
        const saved = visible
          ? await ctx.db
              .query("savedRecipes")
              .withIndex("by_user_and_recipe", (q) =>
                q.eq("userId", userId).eq("recipeId", recipe._id),
              )
              .first()
          : null;
        return {
          _id: entry._id,
          date: entry.date,
          slot: entry.slot,
          title: entry.title,
          isLeftovers: entry.isLeftovers,
          servings: entry.servings,
          groceryItems: entry.groceryItems ?? [],
          recipe: visible
            ? {
                id: recipe._id,
                title: recipe.title,
                servings: recipe.servings,
                isSaved: saved !== null,
              }
            : null,
        };
      }),
    );
  },
});

export const add = mutation({
  args: {
    date: v.string(),
    slot: mealSlot,
    recipeId: v.optional(v.id("recipes")),
    title: v.optional(v.string()),
    isLeftovers: v.optional(v.boolean()),
    groceryItems: v.optional(v.array(v.string())),
  },
  returns: v.id("mealPlanEntries"),
  handler: async (ctx, { date, slot, recipeId, title, isLeftovers, groceryItems }) => {
    const userId = await requireUser(ctx);
    validDateKey(date);

    let entryTitle = (title ?? "").trim();
    if (recipeId !== undefined) {
      const recipe = await ctx.db.get(recipeId);
      if (recipe === null || recipe.deletedAt !== undefined) {
        throw new Error("Recipe was not found");
      }
      if (!(await canAccessRecipe(ctx, userId, recipe))) throw new Error("Forbidden");
      entryTitle = recipe.title;
    } else if (entryTitle.length === 0 || entryTitle.length > MAX_TITLE_LENGTH) {
      throw new Error(`Meal name must be between 1 and ${MAX_TITLE_LENGTH} characters`);
    }

    const sameDay = await ctx.db
      .query("mealPlanEntries")
      .withIndex("by_user_and_date", (q) => q.eq("userId", userId).eq("date", date))
      .take(MAX_SLOT_ENTRIES * 3);
    if (sameDay.filter((entry) => entry.slot === slot).length >= MAX_SLOT_ENTRIES) {
      throw new Error(`A meal can hold at most ${MAX_SLOT_ENTRIES} entries`);
    }

    const now = Date.now();
    return await ctx.db.insert("mealPlanEntries", {
      userId,
      date,
      slot,
      recipeId,
      title: entryTitle,
      isLeftovers: recipeId !== undefined && isLeftovers === true,
      groceryItems: recipeId === undefined ? validGroceryItems(groceryItems ?? []) : undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setLeftovers = mutation({
  args: { entryId: v.id("mealPlanEntries"), isLeftovers: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { entryId, isLeftovers }) => {
    const userId = await requireUser(ctx);
    await requireOwnedRecipeEntry(ctx, userId, entryId);
    await ctx.db.patch(entryId, { isLeftovers, updatedAt: Date.now() });
    return null;
  },
});

export const setServings = mutation({
  args: { entryId: v.id("mealPlanEntries"), servings: v.number() },
  returns: v.null(),
  handler: async (ctx, { entryId, servings }) => {
    const userId = await requireUser(ctx);
    await requireOwnedRecipeEntry(ctx, userId, entryId);
    if (!Number.isInteger(servings) || servings < 1 || servings > MAX_SERVINGS) {
      throw new Error(`Servings must be a whole number from 1 to ${MAX_SERVINGS}`);
    }
    await ctx.db.patch(entryId, { servings, updatedAt: Date.now() });
    return null;
  },
});

export const setGroceryItems = mutation({
  args: { entryId: v.id("mealPlanEntries"), groceryItems: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { entryId, groceryItems }) => {
    const userId = await requireUser(ctx);
    const entry = await requireOwnedEntry(ctx, userId, entryId);
    if (entry.recipeId !== undefined) {
      throw new Error("Meals linked to a recipe get their groceries from the recipe");
    }
    await ctx.db.patch(entryId, {
      groceryItems: validGroceryItems(groceryItems),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const remove = mutation({
  args: { entryId: v.id("mealPlanEntries") },
  returns: v.null(),
  handler: async (ctx, { entryId }) => {
    const userId = await requireUser(ctx);
    await requireOwnedEntry(ctx, userId, entryId);
    await ctx.db.delete(entryId);
    return null;
  },
});
