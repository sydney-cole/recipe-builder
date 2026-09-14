"use client";

import { useMutation } from "convex/react";
import { BookPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AddRecipeToListButton } from "@/components/grocery/add-recipe-to-list-button";
import { CurrentRecipeButton } from "@/components/recipes/current-recipe-button";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export function RecipePreviewActions({
  recipeId,
  isSaved,
}: {
  recipeId: Id<"recipes">;
  isSaved: boolean;
}) {
  const addToBook = useMutation(api.recipeCards.addToBook);
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setIsSaving(true);
    setError("");
    try {
      await addToBook({ recipeId });
      router.push("/app/recipe-book");
    } catch {
      setError("We couldn’t add this recipe to your Recipe Book. Try again.");
      setIsSaving(false);
    }
  }

  return (
    <div>
      <div className="cluster">
        <Button onClick={() => void save()} disabled={isSaving || isSaved}>
          <BookPlus size={17} />
          {isSaved ? "In Recipe Book" : isSaving ? "Adding…" : "Add to Recipe Book"}
        </Button>
        <CurrentRecipeButton recipeId={recipeId} size="default" variant="secondary" />
        <AddRecipeToListButton recipeId={recipeId} />
      </div>
      {error && (
        <p className="mt-3 text-sm font-bold text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
