import type { Recipe } from "./data/types";

export type RecipeSort = "recent" | "quickest" | "az";

export function filterAndSortRecipes(
  recipes: readonly Recipe[],
  search: string,
  sort: RecipeSort,
) {
  const term = search.trim().toLocaleLowerCase();
  const filtered = term
    ? recipes.filter((recipe) =>
        [recipe.title, recipe.description, recipe.source, ...recipe.tags]
          .join(" ")
          .toLocaleLowerCase()
          .includes(term),
      )
    : recipes;

  if (sort === "recent") return [...filtered];
  return [...filtered].sort((a, b) =>
    sort === "quickest"
      ? (a.totalMinutes > 0 ? a.totalMinutes : Number.POSITIVE_INFINITY) -
        (b.totalMinutes > 0 ? b.totalMinutes : Number.POSITIVE_INFINITY)
      : a.title.localeCompare(b.title),
  );
}
