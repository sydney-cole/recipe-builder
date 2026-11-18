// A grocery list per planner week. The list is an ordinary grocery list that
// remembers its planner and week; "Update from plan" re-derives its plan items
// on request. The quantity rules are in `lib/planGrocery.ts`.
//
// What an update keeps:
// - Items added by hand (no `planKey`) are never touched.
// - Ticks stay: an update never changes `isChecked`, name, category or order.
// - A hand-edited amount wins. Each plan item remembers the amount the plan
//   last wrote (`planQuantityText`, `planUnit`). If the item now shows a
//   different amount, the user changed it: the update keeps their amount and
//   only refreshes the remembered plan amount, which the list shows beside it.
// - A plan item whose meal left the plan is deleted, unless its amount was
//   edited by hand or another recipe was added into it; then it stays as an
//   ordinary hand-added item, so no typed input is lost.
// - A plan item the user deleted comes back on the next update while its
//   meal is still planned.
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { catalogCategory } from "./groceryLists";
import { displayedQuantity } from "./lib/groceryMerge";
import {
  amountEdited,
  derivePlanItems,
  PLAN_RANGE_DAYS,
  planCooks,
  planFingerprint,
  planListName,
  type NotIncluded,
  type PlanItemSource,
  type PlanSlot,
} from "./lib/planGrocery";
import { cleanName, plannedMeals } from "./lib/plannerRules";
import { addDays, isDateKey, slotOrder } from "./lib/plannerSlots";
import { notIncludedValidator } from "./lib/plannerValidators";
import { loadSlots, normalizePeople, requirePlanner } from "./planner";

const MAX_LIST_ITEMS = 500;
const INGREDIENTS_PER_RECIPE = 200;
const SOURCES_PER_ITEM = 100;

function assertDate(date: string) {
  if (!isDateKey(date)) throw new Error("Invalid date");
}

/** The week's Cook slots, resolved to recipes, and the plan's fingerprint. */
async function loadPlan(ctx: QueryCtx | MutationCtx, planner: Doc<"planners">, start: string) {
  const meals = plannedMeals(planner.meals);
  const loaded = await loadSlots(ctx, planner._id, start, addDays(start, PLAN_RANGE_DAYS - 1), meals);
  const recipeUpdatedAt: Record<string, number> = {};
  const slots: PlanSlot<Id<"recipes">>[] = loaded.map(({ cook, slot }) => {
    if (cook === null) return slot;
    if (cook.recipe !== null) recipeUpdatedAt[cook.recipe._id] = cook.recipe.updatedAt;
    return {
      ...slot,
      cook: {
        recipeId: cook.recipeId,
        title: cook.recipe === null ? "" : cleanName(cook.recipe.title),
        servings: cook.recipe?.servings,
        usable: cook.usable,
        pendingImport: cook.imported !== null && cook.imported.recipeId === undefined,
      },
    };
  });
  const { cooks, notIncluded } = planCooks(slots, start, normalizePeople(planner.people));
  return { cooks, notIncluded, fingerprint: planFingerprint(cooks, notIncluded, recipeUpdatedAt) };
}

async function weekList(ctx: QueryCtx | MutationCtx, plannerId: Id<"planners">, start: string) {
  return await ctx.db
    .query("groceryLists")
    .withIndex("by_planner_and_week_start", (q) => q.eq("plannerId", plannerId).eq("planWeekStart", start))
    .first();
}

function byPlanOrder(first: NotIncluded, second: NotIncluded) {
  return slotOrder(first).localeCompare(slotOrder(second));
}

/** The week's list, if it has one, and whether the plan changed since its last update. */
export const forWeek = query({
  args: { plannerId: v.id("planners"), start: v.string() },
  returns: v.object({
    list: v.union(
      v.null(),
      v.object({
        listId: v.id("groceryLists"),
        name: v.string(),
        syncedAt: v.optional(v.number()),
        changed: v.boolean(),
        notIncluded: v.array(notIncludedValidator),
      }),
    ),
  }),
  handler: async (ctx, { plannerId, start }) => {
    const { userId, planner } = await requirePlanner(ctx, plannerId);
    assertDate(start);
    const list = await weekList(ctx, plannerId, start);
    if (list === null || list.userId !== userId) return { list: null };
    const { fingerprint } = await loadPlan(ctx, planner, start);
    return {
      list: {
        listId: list._id,
        name: list.name,
        ...(list.planSyncedAt === undefined ? {} : { syncedAt: list.planSyncedAt }),
        changed: list.planFingerprint !== fingerprint,
        notIncluded: list.planNotIncluded ?? [],
      },
    };
  },
});

async function replacePlanSources(
  ctx: MutationCtx,
  itemId: Id<"groceryListItems">,
  sources: PlanItemSource<Id<"recipes">>[],
  now: number,
) {
  const existing = await ctx.db
    .query("groceryListItemSources")
    .withIndex("by_grocery_list_item", (q) => q.eq("groceryListItemId", itemId))
    .take(SOURCES_PER_ITEM);
  for (const source of existing) if (source.fromPlan) await ctx.db.delete(source._id);
  const kept = existing.filter((source) => !source.fromPlan).length;
  for (const source of sources.slice(0, Math.max(0, SOURCES_PER_ITEM - kept))) {
    await ctx.db.insert("groceryListItemSources", { groceryListItemId: itemId, ...source, fromPlan: true, createdAt: now });
  }
  return kept;
}

/**
 * Creates the week's grocery list from the plan, or updates it (see the
 * rules at the top of this file). Returns the list and the Cook slots it
 * could not include, which are also kept on the list for the planner page.
 */
export const syncWeek = mutation({
  args: { plannerId: v.id("planners"), start: v.string() },
  returns: v.object({
    listId: v.id("groceryLists"),
    created: v.boolean(),
    notIncluded: v.array(notIncludedValidator),
  }),
  handler: async (ctx, { plannerId, start }) => {
    const { userId, planner } = await requirePlanner(ctx, plannerId);
    assertDate(start);
    const plan = await loadPlan(ctx, planner, start);

    const ingredientsByRecipe = new Map<Id<"recipes">, Doc<"recipeIngredients">[]>();
    for (const cook of plan.cooks) {
      if (ingredientsByRecipe.has(cook.recipeId)) continue;
      ingredientsByRecipe.set(
        cook.recipeId,
        await ctx.db
          .query("recipeIngredients")
          .withIndex("by_recipe_and_position", (q) => q.eq("recipeId", cook.recipeId))
          .take(INGREDIENTS_PER_RECIPE),
      );
    }
    const derived = derivePlanItems(
      plan.cooks.map((cook) => ({ ...cook, ingredients: ingredientsByRecipe.get(cook.recipeId) ?? [] })),
    );
    const notIncluded = [...plan.notIncluded, ...derived.notIncluded].sort(byPlanOrder);

    const now = Date.now();
    let list = await weekList(ctx, plannerId, start);
    if (list !== null && list.userId !== userId) throw new Error("Forbidden");
    const created = list === null;
    if (list === null) {
      const listId = await ctx.db.insert("groceryLists", {
        userId,
        name: planListName(start),
        status: "active",
        plannerId,
        planWeekStart: start,
        createdAt: now,
        updatedAt: now,
      });
      list = (await ctx.db.get(listId))!;
    }
    const listId = list._id;

    const existingItems = await ctx.db
      .query("groceryListItems")
      .withIndex("by_list", (q) => q.eq("listId", listId))
      .take(MAX_LIST_ITEMS + 1);
    const planItems = new Map<string, Doc<"groceryListItems">>();
    for (const item of existingItems) if (item.planKey !== undefined) planItems.set(item.planKey, item);
    const derivedKeys = new Set(derived.items.map((item) => item.key));
    const removedCount = [...planItems.keys()].filter((key) => !derivedKeys.has(key)).length;
    const addedCount = derived.items.filter((item) => !planItems.has(item.key)).length;
    if (existingItems.length - removedCount + addedCount > MAX_LIST_ITEMS) {
      throw new Error("The grocery list is full");
    }
    let nextSortOrder = existingItems.reduce((maximum, item) => Math.max(maximum, item.sortOrder), 0) + 1;

    for (const item of derived.items) {
      const planAmount = { planQuantityText: displayedQuantity(item), planUnit: item.unit };
      const existing = planItems.get(item.key);
      if (existing === undefined) {
        const itemId = await ctx.db.insert("groceryListItems", {
          listId,
          ingredientId: item.ingredientId,
          name: item.name,
          normalizedName: item.normalizedName,
          quantity: item.quantity,
          quantityText: item.quantityText,
          unit: item.unit,
          category: await catalogCategory(ctx, item.ingredientId),
          notes: item.notes,
          isChecked: false,
          sortOrder: nextSortOrder++,
          planKey: item.key,
          ...planAmount,
          createdAt: now,
          updatedAt: now,
        });
        await replacePlanSources(ctx, itemId, item.sources, now);
        continue;
      }
      const edited = amountEdited(existing, existing);
      await ctx.db.patch(existing._id, {
        ...(edited
          ? {}
          : { quantity: item.quantity, quantityText: item.quantityText, unit: item.unit, notes: item.notes }),
        ...planAmount,
        updatedAt: now,
      });
      await replacePlanSources(ctx, existing._id, item.sources, now);
    }

    for (const [key, existing] of planItems) {
      if (derivedKeys.has(key)) continue;
      const otherSources = await replacePlanSources(ctx, existing._id, [], now);
      if (amountEdited(existing, existing) || otherSources > 0) {
        await ctx.db.patch(existing._id, {
          planKey: undefined,
          planQuantityText: undefined,
          planUnit: undefined,
          updatedAt: now,
        });
      } else {
        await ctx.db.delete(existing._id);
      }
    }

    await ctx.db.patch(listId, {
      needsInitialSave: undefined,
      planSyncedAt: now,
      planFingerprint: plan.fingerprint,
      planNotIncluded: notIncluded,
      updatedAt: now,
    });
    return { listId, created, notIncluded };
  },
});
