"use client";

import { useMutation } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { BookCheck, BookPlus, Clock3, Heart, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AddRecipeToListButton } from "@/components/grocery/add-recipe-to-list-button";
import { FoodArt } from "./food-art";
import type { Recipe } from "@/lib/data/types";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { CurrentRecipeButton } from "./current-recipe-button";
import { RemoveRecipeButton } from "./remove-recipe-button";

export function RecipeCard({
  recipe,
  suggested = false,
  detailsHref = `/app/recipe-book/${recipe.id}`,
  canCreateGroceryList = false,
  onSelect,
  isSelecting = false,
  selectionDisabled = false,
  removable = false,
}: {
  recipe: Recipe;
  suggested?: boolean;
  detailsHref?: string | null;
  canCreateGroceryList?: boolean;
  onSelect?: (recipeId: string) => void;
  isSelecting?: boolean;
  selectionDisabled?: boolean;
  /** Offer removal from the card (the Recipe Book list), behind the usual confirmation. */
  removable?: boolean;
}) {
  const [savedLocally, setSavedLocally] = useState(false);
  const saved = !suggested || savedLocally;
  const [saveError, setSaveError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const addToBook = useMutation(api.recipeCards.addToBook);
  const setFavorite = useMutation(api.recipeCards.setFavorite);
  const [favoriteError, setFavoriteError] = useState(false);

  async function toggleFavorite() {
    setFavoriteError(false);
    try {
      await setFavorite({ recipeId: recipe.id as Id<"recipes">, isFavorite: !recipe.isFavorite });
    } catch {
      setFavoriteError(true);
    }
  }

  async function save() {
    setIsSaving(true);
    setSaveError(false);
    try {
      await addToBook({ recipeId: recipe.id as Id<"recipes"> });
      setSavedLocally(true);
    } catch {
      setSaveError(true);
    } finally {
      setIsSaving(false);
    }
  }

  if (onSelect) {
    return (
      <Card className="recipe-card transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md">
        <button
          type="button"
          className="recipe-selection-button flex h-full w-full cursor-pointer flex-col text-left disabled:cursor-wait disabled:opacity-60"
          aria-label={`Choose recipe: ${recipe.title}`}
          disabled={selectionDisabled}
          onClick={() => onSelect(recipe.id)}
        >
          <FoodArt variant={recipe.art} label={recipe.tags[0]} imageUrl={recipe.imageUrl} />
          <CardContent className="stack flex-1">
            <div>
              <h3>{recipe.title}</h3>
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{recipe.description}</p>
            </div>
            <div className="recipe-meta">
              {recipe.totalMinutes !== undefined && <span><Clock3 size={14} className="inline" /> {recipe.totalMinutes} min</span>}
              {recipe.servings !== undefined && <span><Users size={14} className="inline" /> {recipe.servings}</span>}
            </div>
            <span className="mt-auto inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-extrabold text-white">
              {isSelecting ? "Selecting…" : "Choose recipe"}
            </span>
          </CardContent>
        </button>
      </Card>
    );
  }

  return (
    <Card className="recipe-card">
      {detailsHref ? (
        <Link href={detailsHref} aria-label={`View ${recipe.title}`}><FoodArt variant={recipe.art} label={recipe.tags[0]} imageUrl={recipe.imageUrl} /></Link>
      ) : (
        <FoodArt variant={recipe.art} label={recipe.tags[0]} imageUrl={recipe.imageUrl} />
      )}
      <CardContent className="stack">
        <div>
          <div className="flex items-start justify-between gap-2">
            {detailsHref ? <Link href={detailsHref}><h3>{recipe.title}</h3></Link> : <h3>{recipe.title}</h3>}
            {recipe.isFavorite !== undefined && (
              <button
                type="button"
                className={`grid size-9 shrink-0 place-items-center rounded-lg hover:bg-surface-subtle ${recipe.isFavorite ? "text-primary" : "text-muted-foreground"}`}
                aria-pressed={recipe.isFavorite}
                aria-label={recipe.isFavorite ? `Remove ${recipe.title} from favorites` : `Add ${recipe.title} to favorites`}
                onClick={() => void toggleFavorite()}
              >
                <Heart size={18} fill={recipe.isFavorite ? "currentColor" : "none"} />
              </button>
            )}
          </div>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{recipe.description}</p>
        </div>
        <div className="recipe-meta">
          {recipe.totalMinutes !== undefined && <span><Clock3 size={14} className="inline" /> {recipe.totalMinutes} min</span>}
          {recipe.servings !== undefined && <span><Users size={14} className="inline" /> {recipe.servings}</span>}
          {saved ? (
            <Badge className="bg-primary-soft text-primary"><BookCheck size={13} />In Recipe Book</Badge>
          ) : (
            <Button className="recipe-card-book-action" size="sm" onClick={() => void save()} disabled={isSaving}><BookPlus size={13} />{isSaving ? "Adding…" : "Add to Recipe Book"}</Button>
          )}
        </div>
        {recipe.matchReason && <p className="rounded-lg bg-primary-soft p-3 text-sm leading-5 text-primary"><strong>Why it fits:</strong> {recipe.matchReason}</p>}
        {recipe.missingIngredients && <p className="text-xs text-muted-foreground">Missing: {recipe.missingIngredients.join(", ")}</p>}
        <div className="cluster">{recipe.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</div>
        <div className="recipe-card-actions grid grid-cols-1 gap-2 sm:grid-cols-2">
          <CurrentRecipeButton className="w-full" recipeId={recipe.id} variant="secondary" />
          {(canCreateGroceryList || (suggested && saved)) && <AddRecipeToListButton className="recipe-card-grocery-action w-full" recipeId={recipe.id} size="sm" />}
        </div>
        {favoriteError && <p className="text-xs font-bold text-red-700" role="alert">Couldn&apos;t update your favorites. Try again.</p>}
        {saveError && <p className="text-xs font-bold text-red-700" role="alert">Couldn&apos;t add this recipe to your book. Try again.</p>}
        <p className="text-xs text-muted-foreground">Source: {recipe.source}</p>
        {removable && (
          <div className="recipe-card-remove border-t border-border pt-3">
            <RemoveRecipeButton className="w-full" recipeId={recipe.id as Id<"recipes">} title={recipe.title} owned={recipe.canEdit === true} label="Remove" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
