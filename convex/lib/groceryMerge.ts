// The grocery list's ingredient matching, scaling and merging rules, shared
// by every way items reach a list (a recipe, a combined list, a week's plan).
// Pure functions only: nothing here reads the database.
import type { Doc } from "../_generated/dataModel";
import { normalizeIngredientName } from "./ingredientName";
import { parseManualIngredient } from "./manualIngredient";

export { normalizeIngredientName };

export function canonicalIngredientName(value: string) {
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

export function normalizedIngredientUnit(ingredientName: string, value?: string) {
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

export function convertQuantity(
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

export function formattedQuantity(value: number) {
  return Number(value.toFixed(4)).toString();
}

/** Items with the same key are the same grocery: one ingredient, one unit family. */
export function ingredientMatchKey(item: {
  name: string;
  normalizedName?: string;
  unit?: string;
}) {
  const ingredient = canonicalIngredientName(item.normalizedName || item.name);
  return `${ingredient}\u0000${unitFamily(ingredient, item.unit)}`;
}

export function validQuantity(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000) {
    throw new Error("Quantity must be between 0 and 1000000");
  }
  return value;
}

export function strictNumericQuantity(item: {
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

export function scaledIngredient<
  T extends { quantity?: number; quantityText?: string },
>(ingredient: T, multiplier: number): T {
  if (multiplier === 1) return ingredient;
  const amount = strictNumericQuantity(ingredient);
  if (amount === undefined) return ingredient;
  const quantity = validQuantity(amount * multiplier);
  return { ...ingredient, quantity, quantityText: formattedQuantity(quantity) };
}

export function displayedQuantity(item: { quantity?: number; quantityText?: string }) {
  return item.quantityText?.trim() || item.quantity?.toString();
}

export function combinedNotes(first?: string, second?: string) {
  const notes = [first?.trim(), second?.trim()].filter(
    (note): note is string => Boolean(note),
  );
  return [...new Set(notes)].join(" • ").slice(0, 500) || undefined;
}

type Amount = { quantity?: number; quantityText?: string; unit?: string };

/**
 * The amount of one grocery after adding `incoming` to `current`: a sum in
 * `current`'s unit when both are numbers in one unit family, otherwise both
 * amounts as text ("2 + a pinch").
 */
export function mergedAmount(name: string, current: Amount, incoming: Amount) {
  const canonicalName = canonicalIngredientName(name);
  const unit = normalizedIngredientUnit(canonicalName, current.unit);
  const currentAmount = strictNumericQuantity(current);
  const incomingAmount = strictNumericQuantity(incoming);
  const convertedIncoming = incomingAmount === undefined
    ? undefined
    : convertQuantity(incomingAmount, canonicalName, incoming.unit, unit);
  if (currentAmount !== undefined && convertedIncoming !== undefined) {
    const total = validQuantity(currentAmount + convertedIncoming);
    return { quantity: total, quantityText: formattedQuantity(total), unit };
  }
  const quantities = [displayedQuantity(current), displayedQuantity(incoming)].filter(
    (quantity): quantity is string => Boolean(quantity),
  );
  return {
    quantity: undefined,
    quantityText: quantities.join(" + ").slice(0, 100) || undefined,
    unit,
  };
}

/** A recipe line as a grocery: normalised name and unit, amount parsed from the text if needed. */
export function groceryIngredient(item: Doc<"recipeIngredients">) {
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

export function groceryItemForDisplay<
  T extends { name: string; normalizedName: string; quantity?: number; quantityText?: string; unit?: string },
>(item: T): T {
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
