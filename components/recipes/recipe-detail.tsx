"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, BookCheck, BookPlus, Check, Clock3, ExternalLink, Heart, Link2, Pencil, Save, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { EmptyState } from "@/components/feedback/empty-state";
import { AddRecipeToListButton } from "@/components/grocery/add-recipe-to-list-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { recipeArt, recipeTotalMinutes } from "@/lib/data/recipe-view";
import { FoodArt } from "./food-art";
import { ImportIntoRecipeDialog } from "./import-into-recipe-dialog";
import { RecipeEditor } from "./recipe-editor";
import { RecipeIngredients } from "./recipe-ingredients";
import { CurrentRecipeButton } from "./current-recipe-button";
import { RemoveRecipeButton } from "./remove-recipe-button";

export function RecipeDetail({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const data = useQuery(api.recipes.get, { recipeId });
  const setNotes = useMutation(api.recipeCards.setNotes);
  const acknowledgeReview = useMutation(api.recipeCards.acknowledgeReview);
  const addToBook = useMutation(api.recipeCards.addToBook);
  const setFavorite = useMutation(api.recipeCards.setFavorite);
  const [servings, setServings] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [returnFocusToEdit, setReturnFocusToEdit] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  if (data === undefined) return <div className="page-container" role="status" aria-live="polite"><span className="sr-only">Loading recipe…</span><Skeleton className="h-10 w-48" /><Skeleton className="mt-6 h-96" /></div>;
  if (data === null) return <div className="page-container"><EmptyState icon={Pencil} title="Recipe not found" description="It may have been removed or belong to another account." action={<Button asChild><Link href="/app/recipe-book">Back to Recipe Book</Link></Button>} /></div>;

  const { recipe, ingredients, importReview, canEdit, saved } = data;
  const recipeDocId = recipe._id as Id<"recipes">;
  const totalMinutes = recipeTotalMinutes(recipe);
  const tags = recipe.categories.length > 0 ? recipe.categories : recipe.cuisines;
  const isEmpty = ingredients.length === 0 && recipe.instructions.length === 0;

  async function saveNotes() {
    const notes = notesRef.current?.value.trim() ?? "";
    setError("");
    try {
      await setNotes({ recipeId: recipeDocId, notes: notes || null });
      setMessage("Notes saved.");
    } catch {
      setError("We couldn’t save your notes.");
    }
  }

  async function finishReview() {
    setError("");
    try {
      await acknowledgeReview({ recipeId: recipeDocId });
      setMessage("Review completed. Add the recipe to your book when you’re ready.");
    } catch {
      setError("We couldn’t complete the review.");
    }
  }

  async function saveToBook() {
    setError("");
    try {
      await addToBook({ recipeId: recipeDocId });
      setMessage("Recipe added to your Recipe Book.");
    } catch {
      setError("We couldn’t add this recipe to your book.");
    }
  }

  async function toggleFavorite() {
    if (saved === null) return;
    setError("");
    try {
      await setFavorite({ recipeId: recipeDocId, isFavorite: !saved.isFavorite });
      setMessage(saved.isFavorite ? "Removed from favorites." : "Added to favorites.");
    } catch {
      setError("We couldn’t update your favorites.");
    }
  }

  return (
    <div className="page-container">
      <Button asChild variant="ghost" className="mb-5"><Link href="/app/recipe-book"><ArrowLeft size={17} />Back to Recipe Book</Link></Button>
      {importReview?.status === "needs_review" && (
        <Card className="mb-6 border-amber-300 bg-amber-50"><CardContent><p className="font-extrabold text-amber-950">This generated recipe card needs your review</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">{importReview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul><Button className="mt-4" size="sm" onClick={() => void finishReview()}><Check size={16} />Mark review complete</Button></CardContent></Card>
      )}
      {(error || message) && <p className={`mb-4 rounded-lg p-3 text-sm font-semibold ${error ? "bg-red-50 text-red-700" : "bg-primary-soft text-primary"}`} role={error ? "alert" : "status"}>{error || message}</p>}

      {canEdit && isEmpty && !editing && (
        <Card className="mb-6 border-primary bg-primary-soft">
          <CardContent>
            <p className="font-extrabold">{recipe.title} has no ingredients or steps yet</p>
            <p className="mt-1 text-sm">Import it from a web link, or add them yourself.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={() => setImporting(true)}><Link2 size={17} aria-hidden="true" />Import from link</Button>
              <Button variant="secondary" onClick={() => { setMessage(""); setEditing(true); }}><Pencil size={17} aria-hidden="true" />Add them myself</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {editing ? (
        <RecipeEditor
          recipe={recipe}
          ingredients={ingredients}
          onClose={() => { setReturnFocusToEdit(true); setEditing(false); }}
          onError={(text) => { setError(text); if (text) setMessage(""); }}
          onMessage={(text) => { setError(""); setMessage(text); }}
        />
      ) : (
        <>
          <div className="recipe-detail-hero">
            <FoodArt variant={recipeArt(recipe.title)} label={tags[0] ?? "Recipe"} imageUrl={recipe.imageUrl} />
            <div className="p-6 sm:p-8">
              <div className="cluster">{tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</div>
              <h1 className="mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">{recipe.title}</h1>
              {recipe.description && <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">{recipe.description}</p>}
              <div className="mt-6 cluster text-sm font-bold text-muted-foreground">
                {totalMinutes !== undefined && <span><Clock3 className="inline" size={17} /> {totalMinutes} min</span>}
                {recipe.servings !== undefined && <span><Users className="inline" size={17} /> {recipe.servings} servings</span>}
                {saved !== null && <Badge className="bg-primary-soft text-primary"><BookCheck size={14} />In Recipe Book</Badge>}
              </div>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                {saved === null && <Button onClick={() => void saveToBook()}><BookPlus size={17} />Add to Recipe Book</Button>}
                <CurrentRecipeButton recipeId={recipe._id} size="default" variant={saved === null ? "secondary" : "default"} />
                <AddRecipeToListButton recipeId={recipe._id} variant="secondary" servings={servings ?? recipe.servings} baseServings={recipe.servings} />
              </div>
              <div className="recipe-detail-actions mt-4 flex flex-wrap items-center gap-1 border-t border-border pt-3">
                {saved !== null && <Button variant="ghost" size="sm" aria-pressed={saved.isFavorite} onClick={() => void toggleFavorite()}><Heart size={16} fill={saved.isFavorite ? "currentColor" : "none"} />{saved.isFavorite ? "Favorited" : "Favorite"}</Button>}
                {canEdit && <Button variant="ghost" size="sm" autoFocus={returnFocusToEdit} onClick={() => { setMessage(""); setEditing(true); }}><Pencil size={16} />Edit recipe</Button>}
                {canEdit && !isEmpty && <Button variant="ghost" size="sm" onClick={() => setImporting(true)}><Link2 size={16} />Import from link</Button>}
                {recipe.sourceUrl && <Button asChild variant="ghost" size="sm"><a href={recipe.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} />View original</a></Button>}
              </div>
              {(canEdit || saved !== null) && (
                <div className="recipe-detail-danger mt-3 border-t border-border pt-3">
                  <RemoveRecipeButton recipeId={recipeDocId} title={recipe.title} owned={canEdit} onRemoved={() => router.replace("/app/recipe-book")} />
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[.85fr_1.15fr]">
            <RecipeIngredients ingredients={ingredients} initialServings={recipe.servings} servings={servings ?? undefined} onServingsChange={setServings} />
            <section><h2 className="section-heading">Instructions</h2><p className="section-copy mb-4">A clean, distraction-free cooking view.</p><ol className="stack">{recipe.instructions.map((instruction) => <li className="flex gap-4 rounded-xl border border-border bg-white p-5" key={instruction.position}><span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-extrabold text-white">{instruction.position}</span><p className="pt-1 text-sm leading-6">{instruction.text}</p></li>)}</ol></section>
          </div>
        </>
      )}

      {canEdit && (
        <ImportIntoRecipeDialog
          recipeId={recipeDocId}
          title={recipe.title}
          ingredientCount={ingredients.length}
          instructionCount={recipe.instructions.length}
          open={importing}
          onOpenChange={setImporting}
          onFilled={(text) => { setError(""); setMessage(text); }}
        />
      )}

      {saved !== null
        ? <Card className="mt-8"><CardContent><h2 className="section-heading">Personal notes</h2><p className="section-copy">Only you can see these notes.</p><textarea ref={notesRef} aria-label="Personal notes" className="input mt-4 min-h-32 w-full resize-y" maxLength={10000} defaultValue={saved.notes ?? ""} placeholder="What would you change next time?" /><Button className="mt-3" variant="secondary" onClick={() => void saveNotes()}><Save size={16} />Save notes</Button></CardContent></Card>
        : <Card className="mt-8"><CardContent><h2 className="section-heading">Personal notes</h2><p className="section-copy">Add this recipe to your Recipe Book to keep notes on it.</p></CardContent></Card>}

    </div>
  );
}
