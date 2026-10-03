"use client";

import { useMutation, useQuery } from "convex/react";
import { BookCheck, BookPlus, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { AddRecipeToListButton } from "@/components/grocery/add-recipe-to-list-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CurrentRecipeButton } from "./current-recipe-button";

export function RecipePreviewModal({ recipeId, onClose }: { recipeId: Id<"recipes">; onClose: () => void }) {
  const data = useQuery(api.recipes.get, { recipeId });
  const addToBook = useMutation(api.recipeCards.addToBook);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setIsSaving(true);
    setError("");
    try {
      await addToBook({ recipeId });
    } catch {
      setError("We couldn’t add this recipe to your book. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-[min(94vw,880px)]">
        {data === undefined ? (
          <>
            <DialogTitle className="sr-only">Loading recipe</DialogTitle>
            <DialogDescription className="sr-only">The completed recipe card is loading.</DialogDescription>
            <div className="flex min-h-48 items-center justify-center gap-3 text-sm font-bold text-muted-foreground" role="status">
              <LoaderCircle className="animate-spin" size={20} /> Loading recipe…
            </div>
          </>
        ) : data === null ? (
          <><DialogTitle>Recipe unavailable</DialogTitle><DialogDescription>This recipe could not be loaded.</DialogDescription></>
        ) : (
          <>
            <DialogTitle>{data.recipe.title}</DialogTitle>
            <DialogDescription>{data.recipe.description ?? `Recipe from ${data.recipe.sourceSite ?? "the web"}.`}</DialogDescription>
            <div className="mt-4 flex flex-wrap gap-2">
              {[...data.recipe.categories, ...data.recipe.cuisines].slice(0, 4).map((tag) => <Badge key={tag}>{tag}</Badge>)}
            </div>
            <div className="mt-6 grid gap-7 md:grid-cols-[.85fr_1.15fr]">
              <section aria-labelledby="created-recipe-ingredients">
                <h3 id="created-recipe-ingredients" className="section-heading">Ingredients</h3>
                <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface-subtle px-4">
                  {data.ingredients.map((ingredient) => <li className="py-3 text-sm" key={ingredient._id}>{ingredient.originalText}</li>)}
                </ul>
              </section>
              <section aria-labelledby="created-recipe-instructions">
                <h3 id="created-recipe-instructions" className="section-heading">Instructions</h3>
                <ol className="mt-3 stack">
                  {data.recipe.instructions.map((instruction) => (
                    <li className="flex gap-3 rounded-xl border border-border p-4" key={instruction.position}>
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-extrabold text-white">{instruction.position}</span>
                      <p className="pt-0.5 text-sm leading-6">{instruction.text}</p>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
            {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
            <div className="mt-6 cluster">
              <CurrentRecipeButton recipeId={recipeId} size="default" />
              <Button onClick={() => void save()} disabled={isSaving || data.saved !== null}>
                {data.saved !== null ? <BookCheck size={16} /> : <BookPlus size={16} />}
                {data.saved !== null ? "In Recipe Book" : isSaving ? "Adding…" : "Add to Recipe Book"}
              </Button>
              <AddRecipeToListButton recipeId={recipeId} />
              <Button variant="secondary" onClick={onClose}>Close</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
