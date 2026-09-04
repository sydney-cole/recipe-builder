import type { Recipe } from "./types";

const artVariants: Recipe["art"][] = ["garden", "citrus", "tomato", "berry"];

export function recipeArt(title: string): Recipe["art"] {
  const hash = [...title].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return artVariants[hash % artVariants.length];
}
