"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, BookCheck, BookPlus, Check, Clock3, ExternalLink, Pencil, Plus, Save, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { EmptyState } from "@/components/feedback/empty-state";
import { AddRecipeToListButton } from "@/components/grocery/add-recipe-to-list-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { recipeArt, recipeTotalMinutes } from "@/lib/data/recipe-view";
import { FoodArt } from "./food-art";
import { RecipeIngredients } from "./recipe-ingredients";
import { CurrentRecipeButton } from "./current-recipe-button";

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function IngredientEditor({ ingredient, onError }: { ingredient: Doc<"recipeIngredients">; onError: (message: string) => void }) {
  const updateIngredient = useMutation(api.recipeCards.updateIngredient);
  const removeIngredient = useMutation(api.recipeCards.removeIngredient);
  const [name, setName] = useState(ingredient.name);
  const [quantity, setQuantity] = useState(ingredient.quantityText ?? (ingredient.quantity === undefined ? "" : String(ingredient.quantity)));
  const [unit, setUnit] = useState(ingredient.unit ?? "");
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    if (!name.trim()) return onError("Ingredient names cannot be empty.");
    const parsedQuantity = optionalNumber(quantity);
    setIsSaving(true);
    onError("");
    try {
      await updateIngredient({
        recipeIngredientId: ingredient._id,
        name: name.trim(),
        originalText: [quantity.trim(), unit.trim(), name.trim()].filter(Boolean).join(" "),
        quantity: parsedQuantity,
        quantityText: parsedQuantity === null && quantity.trim() ? quantity.trim() : null,
        unit: unit.trim() || null,
      });
    } catch {
      onError(`We couldn’t save ${ingredient.name}.`);
    } finally {
      setIsSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${ingredient.name} from this recipe?`)) return;
    onError("");
    try {
      await removeIngredient({ recipeIngredientId: ingredient._id });
    } catch {
      onError(`We couldn’t remove ${ingredient.name}.`);
    }
  }

  return (
    <div className="grid gap-3 border-b border-border py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_auto_auto] sm:items-center">
      <Input value={name} maxLength={300} onChange={(event) => setName(event.target.value)} aria-label="Ingredient name" />
      <Input value={quantity} maxLength={100} onChange={(event) => setQuantity(event.target.value)} aria-label={`Quantity for ${ingredient.name}`} placeholder="quantity" />
      <Input value={unit} maxLength={100} onChange={(event) => setUnit(event.target.value)} aria-label={`Unit for ${ingredient.name}`} placeholder="unit" />
      <Button size="icon" variant="secondary" disabled={isSaving} onClick={() => void save()} aria-label={`Save ${ingredient.name}`}><Save size={16} /></Button>
      <Button size="icon" variant="ghost" onClick={() => void remove()} aria-label={`Remove ${ingredient.name}`}><Trash2 size={16} /></Button>
    </div>
  );
}

export function RecipeDetail({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const data = useQuery(api.recipes.get, { recipeId });
  const updateCard = useMutation(api.recipeCards.updateCard);
  const addIngredient = useMutation(api.recipeCards.addIngredient);
  const setNotes = useMutation(api.recipeCards.setNotes);
  const acknowledgeReview = useMutation(api.recipeCards.acknowledgeReview);
  const removeCard = useMutation(api.recipeCards.removeCard);
  const addToBook = useMutation(api.recipeCards.addToBook);
  const [editing, setEditing] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const servingsRef = useRef<HTMLInputElement>(null);
  const prepTimeRef = useRef<HTMLInputElement>(null);
  const cookTimeRef = useRef<HTMLInputElement>(null);
  const instructionsRef = useRef<HTMLTextAreaElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const [newIngredient, setNewIngredient] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  if (data === undefined) return <div className="page-container" role="status" aria-live="polite"><span className="sr-only">Loading recipe…</span><Skeleton className="h-10 w-48" /><Skeleton className="mt-6 h-96" /></div>;
  if (data === null) return <div className="page-container"><EmptyState icon={Pencil} title="Recipe not found" description="It may have been removed or belong to another account." action={<Button asChild><Link href="/app/recipe-book">Back to Recipe Book</Link></Button>} /></div>;

  const { recipe, ingredients, importReview } = data;
  const recipeDocId = recipe._id as Id<"recipes">;
  const totalMinutes = recipeTotalMinutes(recipe);
  const tags = recipe.categories.length > 0 ? recipe.categories : recipe.cuisines;

  async function saveRecipe() {
    const title = titleRef.current?.value.trim() ?? "";
    const description = descriptionRef.current?.value.trim() ?? "";
    const servings = servingsRef.current?.value ?? "";
    const prepTime = prepTimeRef.current?.value ?? "";
    const cookTime = cookTimeRef.current?.value ?? "";
    const instructions = instructionsRef.current?.value ?? "";
    const instructionRows = instructions.split("\n").map((text) => text.trim()).filter(Boolean);
    if (!title || instructionRows.length === 0) return setError("A recipe needs a title and at least one instruction.");
    setIsSaving(true);
    setError("");
    try {
      await updateCard({
        recipeId: recipeDocId,
        title,
        description: description || null,
        servings: optionalNumber(servings),
        prepTimeMinutes: optionalNumber(prepTime),
        cookTimeMinutes: optionalNumber(cookTime),
        totalTimeMinutes: null,
        instructions: instructionRows.map((text, index) => ({ position: index + 1, text })),
      });
      setEditing(false);
      setMessage("Recipe changes saved.");
    } catch {
      setError("We couldn’t save your recipe changes.");
    } finally {
      setIsSaving(false);
    }
  }

  async function addRecipeIngredient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newIngredient.trim()) return;
    setError("");
    try {
      await addIngredient({ recipeId: recipeDocId, name: newIngredient.trim() });
      setNewIngredient("");
      setMessage("Ingredient added to the recipe. Existing grocery lists were not changed.");
    } catch {
      setError("We couldn’t add that ingredient.");
    }
  }

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

  async function remove() {
    if (!window.confirm(`Remove ${recipe.title} from your Recipe Book? Its grocery list will remain.`)) return;
    setError("");
    try {
      await removeCard({ recipeId: recipeDocId });
      router.replace("/app/recipe-book");
    } catch {
      setError("We couldn’t remove this recipe.");
    }
  }

  return (
    <div className="page-container">
      <Button asChild variant="ghost" className="mb-5"><Link href="/app/recipe-book"><ArrowLeft size={17} />Back to Recipe Book</Link></Button>
      {importReview?.status === "needs_review" && (
        <Card className="mb-6 border-amber-300 bg-amber-50"><CardContent><p className="font-extrabold text-amber-950">This AI-generated recipe needs your review</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">{importReview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul><Button className="mt-4" size="sm" onClick={() => void finishReview()}><Check size={16} />Mark review complete</Button></CardContent></Card>
      )}
      {(error || message) && <p className={`mb-4 rounded-lg p-3 text-sm font-semibold ${error ? "bg-red-50 text-red-700" : "bg-primary-soft text-primary"}`} role={error ? "alert" : "status"}>{error || message}</p>}

      <div className="recipe-detail-hero">
        <FoodArt variant={recipeArt(recipe.title)} label={tags[0] ?? "Recipe"} imageUrl={recipe.imageUrl} />
        <div className="p-6 sm:p-8">
          <div className="cluster">{tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</div>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">{recipe.title}</h1>
          {recipe.description && <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">{recipe.description}</p>}
          <div className="mt-6 cluster text-sm font-bold text-muted-foreground">
            {totalMinutes !== undefined && <span><Clock3 className="inline" size={17} /> {totalMinutes} min</span>}
            {recipe.servings !== undefined && <span><Users className="inline" size={17} /> {recipe.servings} servings</span>}
            {data.saved !== null && <Badge className="bg-primary-soft text-primary"><BookCheck size={14} />In Recipe Book</Badge>}
          </div>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            {data.saved === null && <Button onClick={() => void saveToBook()}><BookPlus size={17} />Add to Recipe Book</Button>}
            <CurrentRecipeButton recipeId={recipe._id} size="default" variant={data.saved === null ? "secondary" : "default"} />
            <AddRecipeToListButton recipeId={recipe._id} variant="secondary" />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-1 border-t border-border pt-3">
            <Button variant="ghost" size="sm" onClick={() => setEditing((current) => !current)}><Pencil size={16} />{editing ? "Close editor" : "Edit recipe"}</Button>
            {recipe.sourceUrl && <Button asChild variant="ghost" size="sm"><a href={recipe.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} />View original</a></Button>}
            <Button variant="ghost" size="sm" className="text-red-700 hover:bg-red-50" onClick={() => void remove()}><Trash2 size={16} />Remove recipe</Button>
          </div>
        </div>
      </div>

      {editing && (
        <Card className="mt-8"><CardContent className="stack"><h2 className="section-heading">Edit recipe</h2><label className="grid gap-2 text-sm font-bold">Title<Input ref={titleRef} defaultValue={recipe.title} maxLength={300} /></label><label className="grid gap-2 text-sm font-bold">Description<textarea ref={descriptionRef} className="input min-h-24 resize-y" maxLength={2000} defaultValue={recipe.description ?? ""} /></label><div className="grid gap-4 sm:grid-cols-3"><label className="grid gap-2 text-sm font-bold">Servings<Input ref={servingsRef} inputMode="decimal" defaultValue={recipe.servings} /></label><label className="grid gap-2 text-sm font-bold">Prep minutes<Input ref={prepTimeRef} inputMode="numeric" defaultValue={recipe.prepTimeMinutes} /></label><label className="grid gap-2 text-sm font-bold">Cook minutes<Input ref={cookTimeRef} inputMode="numeric" defaultValue={recipe.cookTimeMinutes} /></label></div><label className="grid gap-2 text-sm font-bold">Instructions, one step per line<textarea ref={instructionsRef} className="input min-h-48 resize-y" defaultValue={recipe.instructions.map((instruction) => instruction.text).join("\n")} /></label><Button disabled={isSaving} onClick={() => void saveRecipe()}><Save size={17} />{isSaving ? "Saving…" : "Save recipe"}</Button></CardContent></Card>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[.85fr_1.15fr]">
        <RecipeIngredients ingredients={ingredients} initialServings={recipe.servings} />
        <section><h2 className="section-heading">Instructions</h2><p className="section-copy mb-4">A clean, distraction-free cooking view.</p><ol className="stack">{recipe.instructions.map((instruction) => <li className="flex gap-4 rounded-xl border border-border bg-white p-5" key={instruction.position}><span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-extrabold text-white">{instruction.position}</span><p className="pt-1 text-sm leading-6">{instruction.text}</p></li>)}</ol></section>
      </div>

      {editing && <Card className="mt-8"><CardContent><h2 className="section-heading">Edit ingredients</h2><p className="section-copy">Recipe changes do not silently rewrite an existing grocery list.</p><form className="mt-4 flex gap-3" onSubmit={addRecipeIngredient}><Input value={newIngredient} maxLength={300} onChange={(event) => setNewIngredient(event.target.value)} placeholder="Add a recipe ingredient" /><Button type="submit" disabled={!newIngredient.trim()}><Plus size={16} />Add</Button></form><div className="mt-4">{ingredients.map((ingredient) => <IngredientEditor ingredient={ingredient} key={ingredient._id} onError={setError} />)}</div></CardContent></Card>}

      <Card className="mt-8"><CardContent><h2 className="section-heading">Personal notes</h2><p className="section-copy">Only you can see these notes.</p><textarea ref={notesRef} className="input mt-4 min-h-32 w-full resize-y" maxLength={10000} defaultValue={data.saved?.notes ?? ""} placeholder="What would you change next time?" /><Button className="mt-3" variant="secondary" onClick={() => void saveNotes()}><Save size={16} />Save notes</Button></CardContent></Card>
    </div>
  );
}
