// Pure rules for typing into a planner slot, carried over from the Weekly
// Meal Planner prototype (as-built spec §2.3 and §3.3–3.4). This module
// imports nothing from Convex so the app's components can use it too.

/**
 * The meals of a day, in the order they are eaten. Everything that orders or
 * lists meals (the day card, Enter, leftovers, Home) reads this list.
 */
export const MEALS = ["breakfast", "lunch", "dinner"] as const;
export type Meal = (typeof MEALS)[number];
export const MEAL_LABELS: Record<Meal, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };

/** Chosen meals in day order without repeats; a planner must plan at least one meal. */
export function normalizeMeals(meals: readonly Meal[]): Meal[] {
  const ordered = MEALS.filter((meal) => meals.includes(meal));
  if (ordered.length === 0) throw new Error("Plan at least one meal");
  return ordered;
}

/** The meals a planner shows: its "Meals to plan" setting, or every meal before one was chosen. */
export function plannedMeals(meals: readonly Meal[] | undefined): Meal[] {
  const ordered = MEALS.filter((meal) => meals?.includes(meal));
  return ordered.length === 0 ? [...MEALS] : ordered;
}

export type SlotType = "cook" | "left" | "out" | "skip";

export const NAME_MAX = 80;
const DESCRIPTION_MAX = 600;

/** Collapse whitespace, trim, cut to 80 characters (prototype `clean`). */
export function cleanName(text: string): string {
  return String(text ?? "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
}

/**
 * The prototype's meal id (`mid`, §3.4), used here to match typed names to
 * saved recipes and planner meals regardless of case, spacing and punctuation.
 */
export function mealKey(name: string): string {
  const normalized = cleanName(name).toLowerCase();
  let key = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  if (!key) {
    let hash = 7;
    for (const character of normalized) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    key = "m-" + hash.toString(36);
  }
  return key;
}

export function isRecipeLink(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(String(text ?? "").trim());
}

/** A temporary slot name from a recipe URL's last path segment (§2.3 rule 1). */
export function nameFromRecipeLink(url: string): string {
  let host = "recipe";
  try {
    const parsed = new URL(url.trim());
    host = parsed.hostname.replace(/^www\./, "");
    const segment = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
    const name = cleanName(
      decodeURIComponent(segment)
        .replace(/\.[a-z]+$/i, "")
        .replace(/^\d+[-_]/, "")
        .replace(/[-_]+/g, " "),
    );
    if (name) return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    // Fall through to the host-based name.
  }
  return `Recipe from ${host}`;
}

export type SlotTextIntent =
  | { kind: "none" }
  | { kind: "link"; url: string }
  | { kind: "set"; type: SlotType; name: string };

const OUT_PREFIX = /^(eat(ing)? out|dine out|out)\b[\s:,\-]*(at |for )?/i;

/**
 * What committing `text` into a slot means (§2.3 "Committing a slot's text").
 * Type detection happens only in an unplanned slot (`currentType` null).
 */
export function parseSlotText(text: string, currentType: SlotType | null): SlotTextIntent {
  const raw = String(text ?? "").trim();
  if (isRecipeLink(raw)) return { kind: "link", url: raw };
  const name = cleanName(raw);
  if (currentType !== null) return { kind: "set", type: currentType, name };
  if (!name) return { kind: "none" };
  if (/^skip(ping|ped)?$/i.test(name)) return { kind: "set", type: "skip", name: "" };
  if (/^left[ -]?overs?$/i.test(name)) return { kind: "set", type: "left", name: "" };
  if (OUT_PREFIX.test(name)) {
    const full = raw.replace(/\s+/g, " ").slice(0, DESCRIPTION_MAX);
    return { kind: "set", type: "out", name: cleanName(full.replace(OUT_PREFIX, "")) };
  }
  return { kind: "set", type: "cook", name };
}
