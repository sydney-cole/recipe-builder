// Pure rules for turning a planner week into grocery items. The Convex side
// (`convex/plannerGrocery.ts`) loads slots, recipes and ingredients and
// writes the list; everything decided about quantities lives here.
import type { Doc, Id } from "../_generated/dataModel";
import {
  canonicalIngredientName,
  combinedNotes,
  displayedQuantity,
  groceryIngredient,
  ingredientMatchKey,
  mergedAmount,
  normalizedIngredientUnit,
  normalizeIngredientName,
  scaledIngredient,
  strictNumericQuantity,
} from "./groceryMerge";
import { addDays, formatDay, resolveLeftover, slotOrder, type SlotLike, type SlotRef } from "./plannerSlots";

/** What the Convex side knows about a Cook slot's recipe. */
export type CookInfo<R extends string = string> = {
  recipeId?: R;
  title: string;
  servings?: number;
  /** The recipe exists, is not removed and its owner can open it. */
  usable: boolean;
  /** A pasted link whose import has not been saved as a recipe yet. */
  pendingImport: boolean;
};

export type PlanSlot<R extends string = string> = SlotLike & { cook?: CookInfo<R> };

export type NotIncludedReason = "no-recipe" | "recipe-unavailable" | "import-pending" | "no-ingredients";
export type NotIncluded = SlotRef & { name: string; reason: NotIncludedReason };

export type PlannedCook<R extends string = string> = SlotRef & {
  recipeId: R;
  title: string;
  /** Leftovers slots, in this week or the next, eating this cooked meal. */
  leftovers: number;
  multiplier: number;
};

/** How many days of slots a week's list reads: the week, plus six days of leftovers after it. */
export const PLAN_RANGE_DAYS = 13;

/**
 * How much of a recipe to buy for one Cook slot: the recipe scaled from its
 * own servings to the planner's `people`, once for the meal itself and once
 * more for each Leftovers slot that eats it.
 *
 * A recipe with no servings recorded (missing, zero or not a number) is used
 * exactly as written for each of those portion rounds: we cannot tell how
 * many it feeds, so we neither guess a serving count nor scale by people.
 */
export function portionMultiplier(people: number, servings: number | undefined, leftovers: number) {
  const rounds = 1 + leftovers;
  if (servings === undefined || !Number.isFinite(servings) || servings <= 0) return rounds;
  return (people / servings) * rounds;
}

/**
 * The week's Cook slots that contribute to its list, and those that cannot.
 * `slots` covers the week starting `start` and the six days after it, so
 * leftovers in the next week still count toward a meal cooked this week.
 * Eat out, Skip and Leftovers slots add nothing themselves.
 */
export function planCooks<R extends string>(slots: PlanSlot<R>[], start: string, people: number) {
  const end = addDays(start, 6);
  const leftoverCounts = new Map<string, number>();
  for (const slot of slots) {
    if (slot.type !== "left") continue;
    const resolved = resolveLeftover(slots, slot);
    if (resolved?.kind !== "source" || resolved.source.type !== "cook") continue;
    const key = slotOrder(resolved.source);
    leftoverCounts.set(key, (leftoverCounts.get(key) ?? 0) + 1);
  }

  const cooks: PlannedCook<R>[] = [];
  const notIncluded: NotIncluded[] = [];
  for (const slot of slots) {
    if (slot.type !== "cook" || slot.date < start || slot.date > end) continue;
    const ref = { date: slot.date, meal: slot.meal };
    const cook = slot.cook;
    if (cook?.usable && cook.recipeId !== undefined) {
      const leftovers = leftoverCounts.get(slotOrder(slot)) ?? 0;
      cooks.push({
        ...ref,
        recipeId: cook.recipeId,
        title: cook.title,
        leftovers,
        multiplier: portionMultiplier(people, cook.servings, leftovers),
      });
      continue;
    }
    const reason: NotIncludedReason =
      cook?.pendingImport ? "import-pending"
      : cook?.recipeId !== undefined ? "recipe-unavailable"
      : "no-recipe";
    notIncluded.push({ ...ref, name: slot.name || cook?.title || "", reason });
  }
  return { cooks, notIncluded };
}

export type PlanItemSource<R extends string = string> = {
  recipeId: R;
  recipeIngredientId: Id<"recipeIngredients">;
  servingsMultiplier: number;
  quantityAdded?: number;
  quantityTextAdded?: string;
};

export type PlanItem<R extends string = string> = {
  /** `ingredientMatchKey` of the merged grocery; identifies it across updates. */
  key: string;
  ingredientId?: Id<"ingredients">;
  name: string;
  normalizedName: string;
  quantity?: number;
  quantityText?: string;
  unit?: string;
  notes?: string;
  sources: PlanItemSource<R>[];
  /** Titles of the meals this grocery is for, once each. */
  meals: string[];
};

/**
 * The week's groceries: each cooked recipe's required ingredients scaled by
 * its multiplier, then merged across recipes with the grocery list's own
 * matching and unit conversion. A recipe with no required ingredients adds
 * nothing and is reported instead.
 */
export function derivePlanItems<R extends string>(
  cooks: Array<PlannedCook<R> & { ingredients: Doc<"recipeIngredients">[] }>,
) {
  const items = new Map<string, PlanItem<R>>();
  const notIncluded: NotIncluded[] = [];
  for (const cook of cooks) {
    const required = cook.ingredients.filter((ingredient) => !ingredient.isOptional);
    if (required.length === 0) {
      notIncluded.push({ date: cook.date, meal: cook.meal, name: cook.title, reason: "no-ingredients" });
      continue;
    }
    for (const ingredient of required.map(groceryIngredient)) {
      const scaled = scaledIngredient(ingredient, cook.multiplier);
      const source: PlanItemSource<R> = {
        recipeId: cook.recipeId,
        recipeIngredientId: ingredient._id,
        servingsMultiplier: cook.multiplier,
        quantityAdded: scaled.quantity,
        quantityTextAdded: scaled.quantityText,
      };
      const key = ingredientMatchKey(scaled);
      const existing = items.get(key);
      if (existing === undefined) {
        items.set(key, {
          key,
          ingredientId: scaled.ingredientId,
          name: normalizeIngredientName(scaled.name),
          normalizedName: scaled.normalizedName,
          quantity: scaled.quantity,
          quantityText: scaled.quantityText,
          unit: normalizedIngredientUnit(scaled.name, scaled.unit),
          notes: scaled.notes,
          sources: [source],
          meals: [cook.title],
        });
        continue;
      }
      const canonicalName = canonicalIngredientName(scaled.name);
      const amount = mergedAmount(canonicalName, existing, scaled);
      existing.name = canonicalName;
      existing.normalizedName = canonicalName;
      existing.quantity = amount.quantity;
      existing.quantityText = amount.quantityText;
      existing.unit = amount.unit;
      existing.notes = combinedNotes(existing.notes, scaled.notes);
      if (existing.ingredientId !== scaled.ingredientId) existing.ingredientId = undefined;
      existing.sources.push(source);
      if (!existing.meals.includes(cook.title)) existing.meals.push(cook.title);
    }
  }
  return { items: [...items.values()], notIncluded };
}

type Amount = { name: string; quantity?: number; quantityText?: string; unit?: string };

/**
 * Whether a plan-derived item's amount was changed by hand since the plan
 * last wrote it. The list editor saves every row's quantity as text, so this
 * compares what is shown (numbers as numbers, units by their normal names)
 * rather than the stored fields.
 */
export function amountEdited(item: Amount, plan: { planQuantityText?: string; planUnit?: string }) {
  if (normalizedIngredientUnit(item.name, item.unit) !== normalizedIngredientUnit(item.name, plan.planUnit)) {
    return true;
  }
  const shownText = displayedQuantity(item);
  const current = strictNumericQuantity({ quantityText: shownText });
  const planned = strictNumericQuantity({ quantityText: plan.planQuantityText });
  if (current !== undefined && planned !== undefined) return Math.abs(current - planned) > 1e-9;
  const shown = (value?: string) => (value ?? "").trim().toLowerCase();
  return shown(shownText) !== shown(plan.planQuantityText);
}

/**
 * A cheap summary of what the plan would put on the list: which recipes are
 * cooked where, how much of each, each recipe's last change, and what is left
 * out. Comparing it with the one saved at the last update tells the planner
 * the plan has changed since. Edits to a recipe's ingredient lines do not
 * touch the recipe row, so they are not seen here.
 */
export function planFingerprint(
  cooks: PlannedCook[],
  notIncluded: NotIncluded[],
  recipeUpdatedAt: Record<string, number | undefined>,
) {
  return JSON.stringify([
    cooks.map((cook) => [slotOrder(cook), cook.recipeId, Number(cook.multiplier.toFixed(6)), recipeUpdatedAt[cook.recipeId] ?? 0]),
    notIncluded.map((item) => [slotOrder(item), item.reason, item.name]),
  ]);
}

/** "Week of Nov 16". */
export function planListName(start: string) {
  return `Week of ${formatDay(start).monthDay}`;
}
