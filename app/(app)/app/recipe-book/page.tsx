"use client";

import { useQuery } from "convex/react";
import { BookOpen, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { RecipeCard } from "@/components/recipes/recipe-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { recipeArt, recipeTotalMinutes } from "@/lib/data/recipe-view";
import type { Recipe } from "@/lib/data/types";
import { filterAndSortRecipes, type RecipeSort } from "@/lib/recipes";
import { ManualRecipeDialog } from "@/components/recipes/manual-recipe-dialog";

export default function RecipeBookPage() {
  const router = useRouter();
  const convexRecipes = useQuery(api.recipes.listBook);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<RecipeSort>("recent");
  const [manualOpen, setManualOpen] = useState(false);

  const recipes = useMemo(() => {
    if (convexRecipes === undefined) return undefined;

    const mapped: Recipe[] = convexRecipes.map((recipe) => ({
      id: recipe._id,
      title: recipe.title,
      description: recipe.description ?? "A recipe saved to your PerfectPlate collection.",
      totalMinutes: recipeTotalMinutes(recipe),
      servings: recipe.servings,
      source: recipe.sourceSite ?? "Imported recipe",
      tags: recipe.categories.slice(0, 3),
      art: recipeArt(recipe.title),
      imageUrl: recipe.imageUrl,
    }));
    return filterAndSortRecipes(mapped, search, sort);
  }, [convexRecipes, search, sort]);

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Your collection"
        title="Recipe Book"
        description="Every recipe you choose to save lives here."
        actions={<div className="cluster"><Button onClick={() => setManualOpen(true)}><Plus size={17} />Add manually</Button><Button asChild variant="secondary"><Link href="/app/discover">Import recipe</Link></Button></div>}
      />
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
      </div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-bold">
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
        <div className="grid-auto" aria-label="Loading recipes">
          {[0, 1, 2].map((item) => <Skeleton className="h-96" key={item} />)}
        </div>
      ) : recipes.length === 0 ? (
        <EmptyState icon={BookOpen} title="No recipes found" description={search ? "Try a different search." : "Import a recipe to start your collection."} />
      ) : (
        <div className="grid-auto">{recipes.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} canCreateGroceryList />)}</div>
      )}
      <ManualRecipeDialog open={manualOpen} onOpenChange={setManualOpen} onCreated={(recipeId) => router.push(`/app/recipe-book/${recipeId}`)} />
    </div>
  );
}
