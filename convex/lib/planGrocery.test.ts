import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import {
  amountEdited,
  derivePlanItems,
  planCooks,
  planFingerprint,
  planListName,
  portionMultiplier,
  type PlanSlot,
} from "./planGrocery";

const start = "2026-11-16";

function cook(date: string, meal: "lunch" | "dinner", title: string, servings?: number, extra: Partial<PlanSlot["cook"]> = {}): PlanSlot {
  return {
    date,
    meal,
    type: "cook",
    name: title,
    cook: { recipeId: `recipe-${title}`, title, servings, usable: true, pendingImport: false, ...extra },
  };
}

function leftovers(date: string, meal: "lunch" | "dinner", from: { date: string; meal: "lunch" | "dinner" } | "other"): PlanSlot {
  return { date, meal, type: "left", name: "", from };
}

let ingredientNumber = 0;
function ingredient(recipeId: string, name: string, quantity?: number, unit?: string, extra: Partial<Doc<"recipeIngredients">> = {}) {
  ingredientNumber += 1;
  return {
    _id: `ingredient-${ingredientNumber}` as Id<"recipeIngredients">,
    _creationTime: 0,
    recipeId: recipeId as Id<"recipes">,
    position: ingredientNumber,
    originalText: `${quantity ?? ""} ${unit ?? ""} ${name}`.trim(),
    name,
    normalizedName: name.toLowerCase(),
    quantity,
    quantityText: quantity === undefined ? undefined : String(quantity),
    unit,
    isOptional: false,
    ...extra,
  } satisfies Doc<"recipeIngredients">;
}

describe("portionMultiplier", () => {
  it("scales a recipe to the people cooked for", () => {
    expect(portionMultiplier(4, 2, 0)).toBe(2);
    expect(portionMultiplier(2, 4, 0)).toBe(0.5);
    expect(portionMultiplier(3, 3, 0)).toBe(1);
  });

  it("adds one portion round per leftovers meal", () => {
    expect(portionMultiplier(2, 4, 1)).toBe(1);
    expect(portionMultiplier(4, 4, 2)).toBe(3);
  });

  it("uses a recipe without servings as written for each portion round", () => {
    expect(portionMultiplier(4, undefined, 0)).toBe(1);
    expect(portionMultiplier(4, 0, 1)).toBe(2);
    expect(portionMultiplier(4, Number.NaN, 0)).toBe(1);
  });
});

describe("planCooks", () => {
  it("includes only the week's Cook slots with a usable recipe", () => {
    const slots: PlanSlot[] = [
      cook("2026-11-15", "dinner", "Last week"),
      cook("2026-11-16", "dinner", "Chili", 4),
      { date: "2026-11-17", meal: "lunch", type: "out", name: "Chipotle" },
      { date: "2026-11-17", meal: "dinner", type: "skip", name: "" },
      cook("2026-11-23", "dinner", "Next week"),
    ];
    const { cooks, notIncluded } = planCooks(slots, start, 2);
    expect(cooks).toEqual([
      { date: "2026-11-16", meal: "dinner", recipeId: "recipe-Chili", title: "Chili", leftovers: 0, multiplier: 0.5 },
    ]);
    expect(notIncluded).toEqual([]);
  });

  it("counts leftovers that point back at a cooked slot, including from the next week", () => {
    const sunday = { date: "2026-11-22", meal: "dinner" } as const;
    const slots: PlanSlot[] = [
      cook("2026-11-16", "dinner", "Chili", 4),
      leftovers("2026-11-17", "lunch", { date: "2026-11-16", meal: "dinner" }),
      leftovers("2026-11-18", "lunch", "other"),
      cook(sunday.date, sunday.meal, "Stew", 2),
      leftovers("2026-11-23", "lunch", sunday),
      leftovers("2026-11-24", "lunch", sunday),
    ];
    const { cooks } = planCooks(slots, start, 2);
    expect(cooks.map(({ title, leftovers: count, multiplier }) => ({ title, count, multiplier }))).toEqual([
      { title: "Chili", count: 1, multiplier: 1 },
      { title: "Stew", count: 2, multiplier: 3 },
    ]);
  });

  it("does not count leftovers in this week of a meal cooked last week", () => {
    const slots: PlanSlot[] = [
      cook("2026-11-15", "dinner", "Roast", 4),
      leftovers("2026-11-16", "lunch", { date: "2026-11-15", meal: "dinner" }),
    ];
    expect(planCooks(slots, start, 2).cooks).toEqual([]);
  });

  it("reports Cook slots without a usable recipe as not included", () => {
    const slots: PlanSlot[] = [
      { date: "2026-11-16", meal: "lunch", type: "cook", name: "" },
      { date: "2026-11-16", meal: "dinner", type: "cook", name: "Tacos" },
      cook("2026-11-17", "dinner", "", undefined, { usable: false, title: "Old stew" }),
      { date: "2026-11-18", meal: "dinner", type: "cook", name: "Peperonata", cook: { title: "Peperonata", usable: false, pendingImport: true } },
    ];
    expect(planCooks(slots, start, 2)).toEqual({
      cooks: [],
      notIncluded: [
        { date: "2026-11-16", meal: "lunch", name: "", reason: "no-recipe" },
        { date: "2026-11-16", meal: "dinner", name: "Tacos", reason: "no-recipe" },
        { date: "2026-11-17", meal: "dinner", name: "Old stew", reason: "recipe-unavailable" },
        { date: "2026-11-18", meal: "dinner", name: "Peperonata", reason: "import-pending" },
      ],
    });
  });
});

describe("derivePlanItems", () => {
  it("scales each recipe and merges the same ingredient across recipes", () => {
    const chili = { date: "2026-11-16", meal: "dinner" as const, recipeId: "chili", title: "Chili", leftovers: 0, multiplier: 2 };
    const soup = { date: "2026-11-17", meal: "dinner" as const, recipeId: "soup", title: "Soup", leftovers: 0, multiplier: 1 };
    const { items, notIncluded } = derivePlanItems([
      { ...chili, ingredients: [ingredient("chili", "Onion", 1), ingredient("chili", "Tomatoes", 1, "cup")] },
      { ...soup, ingredients: [ingredient("soup", "onion", 2), ingredient("soup", "tomatoes", 4, "tbsp"), ingredient("soup", "parsley", undefined, undefined, { isOptional: true })] },
    ]);
    expect(notIncluded).toEqual([]);
    expect(items.map(({ name, quantity, unit, meals }) => ({ name, quantity, unit, meals }))).toEqual([
      { name: "onion", quantity: 4, unit: undefined, meals: ["Chili", "Soup"] },
      { name: "tomatoes", quantity: 2.25, unit: "cup", meals: ["Chili", "Soup"] },
    ]);
    expect(items[0].sources).toHaveLength(2);
    expect(items[0].sources[0]).toMatchObject({ recipeId: "chili", servingsMultiplier: 2, quantityAdded: 2 });
  });

  it("reports a recipe with no required ingredients as not included", () => {
    const { items, notIncluded } = derivePlanItems([
      { date: "2026-11-16", meal: "dinner", recipeId: "bare", title: "Bare", leftovers: 0, multiplier: 1, ingredients: [] },
      { date: "2026-11-17", meal: "dinner", recipeId: "garnish", title: "Garnish", leftovers: 0, multiplier: 1, ingredients: [ingredient("garnish", "mint", 1, undefined, { isOptional: true })] },
    ]);
    expect(items).toEqual([]);
    expect(notIncluded).toEqual([
      { date: "2026-11-16", meal: "dinner", name: "Bare", reason: "no-ingredients" },
      { date: "2026-11-17", meal: "dinner", name: "Garnish", reason: "no-ingredients" },
    ]);
  });
});

describe("amountEdited", () => {
  it("is false when the item still shows what the plan wrote, through an editor save", () => {
    expect(amountEdited({ name: "onion", quantity: 4, quantityText: "4" }, { planQuantityText: "4" })).toBe(false);
    expect(amountEdited({ name: "tomatoes", quantityText: "2.25", unit: "cups" }, { planQuantityText: "2.25", planUnit: "cup" })).toBe(false);
    expect(amountEdited({ name: "salt", quantityText: "1 + a pinch" }, { planQuantityText: "1 + a pinch" })).toBe(false);
  });

  it("is true when the quantity or unit was changed by hand", () => {
    expect(amountEdited({ name: "onion", quantityText: "5" }, { planQuantityText: "4" })).toBe(true);
    expect(amountEdited({ name: "onion", quantityText: "4", unit: "lb" }, { planQuantityText: "4" })).toBe(true);
    expect(amountEdited({ name: "onion" }, { planQuantityText: "4" })).toBe(true);
  });
});

describe("planFingerprint and planListName", () => {
  it("changes when the plan's contributions change", () => {
    const cooks = [{ date: "2026-11-16", meal: "dinner" as const, recipeId: "chili", title: "Chili", leftovers: 0, multiplier: 1 }];
    const base = planFingerprint(cooks, [], { chili: 10 });
    expect(planFingerprint(cooks, [], { chili: 10 })).toBe(base);
    expect(planFingerprint([{ ...cooks[0], multiplier: 2 }], [], { chili: 10 })).not.toBe(base);
    expect(planFingerprint(cooks, [], { chili: 11 })).not.toBe(base);
    expect(planFingerprint(cooks, [{ date: "2026-11-17", meal: "lunch", name: "Tacos", reason: "no-recipe" }], { chili: 10 })).not.toBe(base);
  });

  it("names a list for its week", () => {
    expect(planListName("2026-11-16")).toBe("Week of Nov 16");
  });
});

describe("amountEdited with a quantity changed only as text", () => {
  it("compares the amount the list shows", () => {
    expect(amountEdited({ name: "carrot", quantity: 1, quantityText: "6" }, { planQuantityText: "1" })).toBe(true);
  });
});
