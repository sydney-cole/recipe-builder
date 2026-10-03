import type { Recipe } from "./types";

const artVariants: Recipe["art"][] = ["garden", "citrus", "tomato", "berry"];

export function recipeArt(title: string): Recipe["art"] {
  const hash = [...title].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return artVariants[hash % artVariants.length];
}

export function recipeTotalMinutes(recipe: {
  totalTimeMinutes?: number;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
}) {
  if (recipe.totalTimeMinutes !== undefined) return recipe.totalTimeMinutes;
  if (
    recipe.prepTimeMinutes === undefined &&
    recipe.cookTimeMinutes === undefined
  ) {
    return undefined;
  }
  return (recipe.prepTimeMinutes ?? 0) + (recipe.cookTimeMinutes ?? 0);
}
