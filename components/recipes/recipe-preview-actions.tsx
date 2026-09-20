"use client";

import { useMutation } from "convex/react";
import { BookPlus, ExternalLink } from "lucide-react";
import { useState } from "react";
import { AddRecipeToListButton } from "@/components/grocery/add-recipe-to-list-button";
import { CurrentRecipeButton } from "@/components/recipes/current-recipe-button";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export function RecipePreviewActions({
  recipeId,
  isSaved,
  sourceUrl,
}: {
  recipeId: Id<"recipes">;
  isSaved: boolean;
  sourceUrl: string;
}) {
  const addToBook = useMutation(api.recipeCards.addToBook);
  const [isSaving, setIsSaving] = useState(false);
  const [savedLocally, setSavedLocally] = useState(false);
  const [error, setError] = useState("");
  const saved = isSaved || savedLocally;

  async function save() {
    setIsSaving(true);
    setError("");
    try {
      await addToBook({ recipeId });
      setSavedLocally(true);
      setIsSaving(false);
    } catch {
      setError("We couldn’t add this recipe to your Recipe Book. Try again.");
      setIsSaving(false);
    }
  }

  return (
    <div>
      <div className="recipe-preview-actions grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Button className="h-full min-h-12 w-full" onClick={() => void save()} disabled={isSaving || saved}>
          <BookPlus size={17} />
          {saved ? "In Recipe Book" : isSaving ? "Adding…" : "Add to Recipe Book"}
        </Button>
        <CurrentRecipeButton className="h-full w-full" recipeId={recipeId} size="default" variant="secondary" />
        <AddRecipeToListButton className="h-full min-h-12 w-full" recipeId={recipeId} />
        <Button asChild className="h-full min-h-12 w-full" variant="secondary">
          <a href={sourceUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={17} />
            View original
          </a>
        </Button>
      </div>
      {error && (
        <p className="mt-3 text-sm font-bold text-red-700" role="alert">
          {error}
        </p>
      )}
      {savedLocally && <p className="mt-3 text-sm font-bold text-primary" role="status">Added to your Recipe Book.</p>}
    </div>
  );
}
