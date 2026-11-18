"use client";

import { useMutation, useQuery } from "convex/react";
import { Link2, LoaderCircle, TriangleAlert } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { recipeImportFailureMessage } from "@/lib/recipe-import-errors";

/**
 * "Import from link" on a recipe the user owns: runs the usual import, shows
 * what it found, and on confirmation fills this same recipe with it, so
 * planner slots that point at it keep pointing at it.
 */
export function ImportIntoRecipeDialog({
  recipeId,
  title,
  ingredientCount,
  instructionCount,
  open,
  onOpenChange,
  onFilled,
}: {
  recipeId: Id<"recipes">;
  title: string;
  ingredientCount: number;
  instructionCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFilled: (message: string) => void;
}) {
  const importIntoRecipe = useMutation(api.recipeCards.importIntoRecipe);
  const fillFromImport = useMutation(api.recipeCards.fillFromImport);
  const [url, setUrl] = useState("");
  const [importId, setImportId] = useState<Id<"recipeImports"> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [useImportedTitle, setUseImportedTitle] = useState(false);

  const result = useQuery(api.email.importResult, importId === null ? "skip" : { importId });
  const ready = result?.recipeId !== undefined && (result.status === "completed" || result.status === "needs_review");
  const preview = useQuery(api.recipes.get, ready && result.recipeId ? { recipeId: result.recipeId } : "skip");
  const hasContent = ingredientCount > 0 || instructionCount > 0;

  function reset() {
    setImportId(null);
    setError("");
    setUseImportedTitle(false);
  }

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    reset();
    setBusy(true);
    try {
      const queued = await importIntoRecipe({ recipeId, sourceUrl: url.trim() });
      setImportId(queued);
    } catch {
      setError("We couldn’t import that link. Check that it starts with https:// and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function fill() {
    if (importId === null) return;
    setError("");
    setBusy(true);
    try {
      await fillFromImport({ recipeId, importId, useImportedTitle, replaceExisting: hasContent });
      setUrl("");
      reset();
      onOpenChange(false);
      onFilled("Recipe filled in from the link.");
    } catch {
      setError("We couldn’t fill this recipe from that link. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const importedTitle = preview?.recipe.title;
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="w-[min(94vw,600px)]">
        <DialogTitle>Import {title} from a link</DialogTitle>
        <DialogDescription>
          Paste the recipe’s web address. You’ll see what we found before anything on {title} changes.
        </DialogDescription>

        {importId === null ? (
          <form className="mt-5 grid gap-3" onSubmit={(event) => void start(event)}>
            <label className="grid gap-1 text-sm font-bold">
              Recipe link
              <Input type="url" inputMode="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/recipe" />
            </label>
            <Button type="submit" disabled={busy}><Link2 size={17} aria-hidden="true" />{busy ? "Starting import…" : "Import"}</Button>
          </form>
        ) : result?.status === "failed" ? (
          <div className="mt-5 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900" role="alert">
            <p className="font-extrabold">The recipe couldn’t be imported</p>
            <p className="mt-1">{recipeImportFailureMessage(result.errorMessage)}</p>
            <Button className="mt-3" variant="secondary" onClick={reset}>Try another link</Button>
          </div>
        ) : !ready || preview === undefined ? (
          <p className="mt-5 flex items-center gap-2 rounded-lg bg-primary-soft p-4 text-sm font-semibold text-primary" role="status">
            <LoaderCircle className="animate-spin" size={17} aria-hidden="true" />
            Reading the recipe…
          </p>
        ) : preview === null ? (
          <p className="mt-5 text-sm font-bold text-red-700" role="alert">The imported recipe is no longer available.</p>
        ) : (
          <div className="mt-5 grid gap-4">
            <section className="rounded-lg border border-border bg-surface-subtle p-4" aria-label="Imported recipe">
              <h3 className="font-extrabold">{importedTitle}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {preview.ingredients.length} {preview.ingredients.length === 1 ? "ingredient" : "ingredients"} · {preview.recipe.instructions.length} {preview.recipe.instructions.length === 1 ? "step" : "steps"}
                {preview.recipe.sourceSite ? ` · ${preview.recipe.sourceSite}` : ""}
              </p>
              <ul className="mt-2 list-disc pl-5 text-sm">
                {preview.ingredients.slice(0, 5).map((ingredient) => <li key={ingredient._id}>{ingredient.originalText}</li>)}
                {preview.ingredients.length > 5 && <li>and {preview.ingredients.length - 5} more</li>}
              </ul>
              {(preview.importReview?.warnings ?? []).length > 0 && (
                <ul className="mt-3 list-disc pl-5 text-sm text-amber-900">
                  {preview.importReview?.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              )}
            </section>
            {importedTitle !== undefined && importedTitle !== title && (
              <label className="flex min-h-11 items-center gap-3 text-sm font-bold">
                <input type="checkbox" className="size-5" checked={useImportedTitle} onChange={(event) => setUseImportedTitle(event.target.checked)} />
                Rename to “{importedTitle}”
              </label>
            )}
            {hasContent && (
              <p className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="note">
                <TriangleAlert className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
                <span>
                  {title} already has {ingredientCount} {ingredientCount === 1 ? "ingredient" : "ingredients"} and {instructionCount} {instructionCount === 1 ? "step" : "steps"}. Filling it replaces them with the imported ones.
                </span>
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="secondary" disabled={busy} onClick={reset}>Use another link</Button>
              <Button variant={hasContent ? "destructive" : "default"} disabled={busy} onClick={() => void fill()}>
                {busy ? "Filling…" : hasContent ? "Replace recipe contents" : "Fill recipe"}
              </Button>
            </div>
          </div>
        )}
        {error && <p className="mt-3 text-sm font-bold text-red-700" role="alert">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
