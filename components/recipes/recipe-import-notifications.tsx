"use client";

import { useMutation, useQuery } from "convex/react";
import { BookCheck, BookPlus, CheckCircle2, LoaderCircle, PencilLine, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { RECIPE_IMPORT_STARTED_EVENT } from "@/lib/recipe-import-events";
import { CurrentRecipeButton } from "./current-recipe-button";
import { ManualRecipeDialog } from "./manual-recipe-dialog";

type ImportStartedEvent = CustomEvent<{ importId: string }>;

function failureMessage(errorMessage: string | undefined) {
  if (errorMessage?.includes("did not find a complete recipe")) {
    return "That source didn’t contain one complete individual recipe. Choose another recommendation and try again.";
  }
  if (errorMessage?.includes("firecrawl_request_failed")) {
    return "That recipe site blocked importing. Choose another source and try again.";
  }
  return "We couldn’t create a recipe from that source. Try another recommendation.";
}

function RecipePreviewModal({ recipeId, onClose }: { recipeId: Id<"recipes">; onClose: () => void }) {
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
              <Button variant="secondary" onClick={onClose}>Close</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function RecipeImportNotifications() {
  const imports = useQuery(api.email.recentImports);
  const [trackedIds, setTrackedIds] = useState<string[]>([]);
  const [previewRecipeId, setPreviewRecipeId] = useState<Id<"recipes"> | null>(null);
  const [manualImportId, setManualImportId] = useState<string | null>(null);
  const seenIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    function track(event: Event) {
      const { importId } = (event as ImportStartedEvent).detail;
      setTrackedIds((current) => current.includes(importId) ? current : [...current, importId]);
    }
    window.addEventListener(RECIPE_IMPORT_STARTED_EVENT, track);
    return () => window.removeEventListener(RECIPE_IMPORT_STARTED_EVENT, track);
  }, []);

  useEffect(() => {
    if (imports === undefined) return;
    if (seenIds.current === null) {
      seenIds.current = new Set(imports.map((item) => item._id));
      const activeIds = imports
        .filter((item) => !["completed", "needs_review", "failed"].includes(item.status))
        .map((item) => item._id);
      if (activeIds.length > 0) {
        const timeout = window.setTimeout(() => {
          setTrackedIds((current) => [...new Set([...current, ...activeIds])]);
        }, 0);
        return () => window.clearTimeout(timeout);
      }
      return;
    }

    const newIds = imports
      .filter((item) => !seenIds.current!.has(item._id))
      .map((item) => item._id);
    for (const item of imports) seenIds.current.add(item._id);
    if (newIds.length > 0) {
      const timeout = window.setTimeout(() => {
        setTrackedIds((current) => [...new Set([...current, ...newIds])]);
      }, 0);
      return () => window.clearTimeout(timeout);
    }
  }, [imports]);

  const trackedImports = trackedIds.map((id) => imports?.find((item) => item._id === id)).filter(Boolean);

  return (
    <>
      <div className="fixed bottom-24 right-4 z-40 grid w-[min(92vw,24rem)] gap-3 md:bottom-6" aria-live="polite" aria-label="Recipe import notifications">
        {trackedImports.map((recipeImport) => {
          if (!recipeImport) return null;
          const complete = (recipeImport.status === "completed" || recipeImport.status === "needs_review") && recipeImport.recipeId;
          const failed = recipeImport.status === "failed";
          return (
            <div className="rounded-xl border border-border bg-white p-4 shadow-2xl" key={recipeImport._id} role={failed ? "alert" : "status"}>
              <div className="flex items-start gap-3">
                {complete ? <CheckCircle2 className="mt-0.5 shrink-0 text-primary" size={20} /> : failed ? <TriangleAlert className="mt-0.5 shrink-0 text-red-600" size={20} /> : <LoaderCircle className="mt-0.5 shrink-0 animate-spin text-primary" size={20} />}
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold">{complete ? "Your recipe is ready" : failed ? "Recipe creation failed" : "Creating your recipe card"}</p>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">{complete ? "Preview it now, then add it to your Recipe Book if you want to keep it there." : failed ? failureMessage(recipeImport.errorMessage) : "We’re processing the source. You can keep using PerfectPlate while it finishes."}</p>
                  {complete && <Button className="mt-3" size="sm" onClick={() => setPreviewRecipeId(recipeImport.recipeId!)}>View recipe</Button>}
                  {failed && <Button className="mt-3" size="sm" onClick={() => setManualImportId(recipeImport._id)}><PencilLine size={16} />Add manually</Button>}
                </div>
                <button className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-surface-subtle" onClick={() => setTrackedIds((current) => current.filter((id) => id !== recipeImport._id))} aria-label="Dismiss recipe notification"><X size={16} /></button>
              </div>
            </div>
          );
        })}
      </div>
      {previewRecipeId && <RecipePreviewModal recipeId={previewRecipeId} onClose={() => setPreviewRecipeId(null)} />}
      <ManualRecipeDialog
        key={manualImportId ?? "closed-manual-recipe"}
        open={manualImportId !== null}
        onOpenChange={(open) => { if (!open) setManualImportId(null); }}
        initialSourceUrl={imports?.find((item) => item._id === manualImportId)?.sourceUrl ?? ""}
        onCreated={(recipeId) => {
          if (manualImportId) setTrackedIds((current) => current.filter((id) => id !== manualImportId));
          setManualImportId(null);
          setPreviewRecipeId(recipeId);
        }}
      />
    </>
  );
}
