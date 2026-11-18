"use client";

import { useMutation, useQuery } from "convex/react";
import { BookOpen, Heart, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { RecipeCard } from "@/components/recipes/recipe-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { recipeArt, recipeTotalMinutes } from "@/lib/data/recipe-view";
import type { Recipe } from "@/lib/data/types";
import { filterAndSortRecipes, type RecipeSort } from "@/lib/recipes";
import { ManualRecipeDialog } from "@/components/recipes/manual-recipe-dialog";

const RECIPE_BOOK_LIMIT = 500;

export default function RecipeBookPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const convexRecipes = useQuery(api.recipes.listBook);
  const setCurrent = useMutation(api.recipeCards.setCurrent);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<RecipeSort>("recent");
  const [manualOpen, setManualOpen] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [tag, setTag] = useState("");
  const [selectingRecipeId, setSelectingRecipeId] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState(false);
  const selectingCurrent = searchParams.get("select") === "current";

  async function selectCurrentRecipe(recipeId: string) {
    setSelectingRecipeId(recipeId);
    setSelectionError(false);
    try {
      await setCurrent({ recipeId: recipeId as Id<"recipes"> });
      router.push("/app");
    } catch {
      setSelectionError(true);
      setSelectingRecipeId(null);
    }
  }

  const availableTags = useMemo(
    () =>
      [...new Set((convexRecipes ?? []).flatMap((recipe) => [...recipe.categories, ...recipe.cuisines]))]
        .sort((first, second) => first.localeCompare(second)),
    [convexRecipes],
  );
  const activeTag = availableTags.includes(tag) ? tag : "";

  const recipes = useMemo(() => {
    if (convexRecipes === undefined) return undefined;

    const mapped: Recipe[] = convexRecipes
      .filter((recipe) => !favoritesOnly || recipe.isFavorite)
      .filter((recipe) => activeTag === "" || recipe.categories.includes(activeTag) || recipe.cuisines.includes(activeTag))
      .map((recipe) => ({
      id: recipe._id,
      title: recipe.title,
      description: recipe.description ?? "A recipe saved to your PerfectPlate collection.",
      totalMinutes: recipeTotalMinutes(recipe),
      servings: recipe.servings,
      source: recipe.sourceSite ?? "Imported recipe",
      tags: recipe.categories.slice(0, 3),
      art: recipeArt(recipe.title),
      imageUrl: recipe.imageUrl,
      isFavorite: recipe.isFavorite,
      canEdit: recipe.canEdit,
    }));
    return filterAndSortRecipes(mapped, search, sort);
  }, [convexRecipes, search, sort, favoritesOnly, activeTag]);

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Your collection"
        title={selectingCurrent ? "Change current recipe" : "Recipe Book"}
        description={selectingCurrent ? "Choose a recipe from your book. It will become your current recipe and you’ll return home." : "Every recipe you choose to save lives here."}
        actions={selectingCurrent
          ? <Button asChild variant="secondary"><Link href="/app">Cancel</Link></Button>
          : <div className="cluster"><Button onClick={() => setManualOpen(true)}><Plus size={17} />Add manually</Button><Button asChild variant="secondary"><Link href="/app/discover">Import recipe</Link></Button></div>}
      />
      {selectionError && <p className="mb-5 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">Couldn&apos;t change the current recipe. Please try again.</p>}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search Recipe Book</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            size={17}
            aria-hidden
          />
          <Input
            className="search-input-with-icon"
            placeholder="Search your Recipe Book"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <Button variant={favoritesOnly ? "default" : "secondary"} aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly((current) => !current)}>
          <Heart size={17} fill={favoritesOnly ? "currentColor" : "none"} />Favorites
        </Button>
        {availableTags.length > 0 && (
          <label className="text-sm text-muted-foreground">
            <span className="sr-only">Filter by tag</span>
            <select className="h-full min-h-10 rounded-md border border-border bg-white p-2 font-bold text-foreground" value={activeTag} onChange={(event) => setTag(event.target.value)}>
              <option value="">All tags</option>
              {availableTags.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        )}
      </div>
      {convexRecipes !== undefined && convexRecipes.length >= RECIPE_BOOK_LIMIT && (
        <p className="mb-4 rounded-lg bg-surface-subtle p-3 text-sm" role="status">
          Showing your {RECIPE_BOOK_LIMIT} most recently saved recipes. Older recipes are still saved but aren’t listed here.
        </p>
      )}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-bold" role="status">
          {recipes === undefined ? "Loading recipes…" : `${recipes.length} ${recipes.length === 1 ? "recipe" : "recipes"}`}
        </p>
        <label className="text-sm text-muted-foreground">
          Sort:{" "}
          <select className="rounded-md border border-border bg-white p-2 font-bold text-foreground" value={sort} onChange={(event) => setSort(event.target.value as RecipeSort)}>
            <option value="recent">Recently added</option>
            <option value="quickest">Quickest</option>
            <option value="az">A–Z</option>
          </select>
        </label>
      </div>
      {recipes === undefined ? (
        <div className="recipe-book-grid grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => <Skeleton className="h-96" key={item} />)}
        </div>
      ) : recipes.length === 0 ? (
        <EmptyState icon={BookOpen} title="No recipes found" description={search || favoritesOnly || activeTag ? "Try a different search or filter." : "Import a recipe to start your collection."} />
      ) : (
        <div className="recipe-book-grid grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{recipes.map((recipe) => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            canCreateGroceryList={!selectingCurrent}
            onSelect={selectingCurrent ? (recipeId) => void selectCurrentRecipe(recipeId) : undefined}
            isSelecting={selectingRecipeId === recipe.id}
            selectionDisabled={selectingRecipeId !== null}
            removable={!selectingCurrent}
          />
        ))}</div>
      )}
      <ManualRecipeDialog open={manualOpen} onOpenChange={setManualOpen} onCreated={(recipeId) => router.push(`/app/recipe-book/${recipeId}`)} />
    </div>
  );
}
