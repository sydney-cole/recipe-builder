// What a slot's picker offers for the text typed so far. Pure, so the rules
// are tested without rendering.
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cleanName, isRecipeLink, parseSlotText, type SlotType } from "@/convex/lib/plannerRules";
import { matchRank, rankByName } from "@/lib/name-match";

export type PickerData = FunctionReturnType<typeof api.planner.pickerOptions>;
export type PickerRecipe = PickerData["recipes"][number];

export type PickerOption =
  | { kind: "recipe"; key: string; label: string; detail: string; recipeId: Id<"recipes"> }
  | { kind: "meal"; key: string; label: string; detail?: undefined }
  | { kind: "create"; key: string; label: string; name: string; detail?: undefined };

/** Rows shown while typing; the list scrolls, but a long one helps nobody. */
const TYPED_LIMIT = 20;
/** Rows shown when the list is opened to browse ("Choose recipe", "Change recipe"). */
const BROWSE_LIMIT = 60;

function recipeDetail(recipe: PickerRecipe) {
  if (recipe.ingredientCount === undefined) return recipe.source;
  const count = recipe.ingredientCount;
  const more = recipe.moreIngredients ? "+" : "";
  return `${recipe.source} · ${count}${more} ${count === 1 && !more ? "ingredient" : "ingredients"}`;
}

function byTitleThenSource(first: PickerRecipe, second: PickerRecipe) {
  return first.title.localeCompare(second.title) || first.source.localeCompare(second.source);
}

function recipeOption(recipe: PickerRecipe): PickerOption {
  return { kind: "recipe", key: `recipe:${recipe.recipeId}`, label: recipe.title, detail: recipeDetail(recipe), recipeId: recipe.recipeId };
}

function recipeOptions(recipes: readonly PickerRecipe[], text: string, browse: boolean): PickerOption[] {
  const sorted = [...recipes].sort(byTitleThenSource);
  if (!browse) return rankByName(sorted, text, (recipe) => recipe.title, TYPED_LIMIT).map(recipeOption);
  const matches = rankByName(sorted, text, (recipe) => recipe.title, BROWSE_LIMIT);
  const rest = sorted.filter((recipe) => matchRank(text, recipe.title) === null);
  return [...matches, ...rest].slice(0, BROWSE_LIMIT).map(recipeOption);
}

export function mealOptions(meals: readonly string[], text: string): PickerOption[] {
  return rankByName(meals, text, (meal) => meal, TYPED_LIMIT).map((meal) => ({ kind: "meal", key: `meal:${meal}`, label: meal }));
}

/**
 * The main input's rows: in a Cook slot (or one that typing would make
 * Cook), matching recipes and an explicit Create row; in an Eat out slot,
 * the planner's eat-out names. `browse` lists every recipe, matches first.
 */
export function mainOptions(data: PickerData, text: string, type: SlotType | null, browse: boolean): PickerOption[] {
  if (isRecipeLink(text)) return [];
  if (type === "out") return mealOptions(data.meals, text);
  if (type !== null && type !== "cook") return [];
  const intent = parseSlotText(text, type);
  if (intent.kind === "set" && intent.type !== "cook") return [];
  const name = cleanName(text);
  if (!name && !browse) return [];
  const options = recipeOptions(data.recipes, text, browse);
  if (name) options.push({ kind: "create", key: "create", label: `Create recipe “${name}”`, name });
  return options;
}
