"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowDown, ArrowLeft, ArrowUp, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";

type EditableDraft = {
  title: string;
  description: string;
  yieldText: string;
  servings: string;
  prepTimeMinutes: string;
  cookTimeMinutes: string;
  totalTimeMinutes: string;
  ingredients: Array<{
    originalText: string;
    name: string;
    quantity: string;
    quantityText: string;
    unit: string;
    section: string;
    preparation: string;
    notes: string;
    isOptional: boolean;
  }>;
  instructions: Array<{ text: string; section: string }>;
};

function editableDraft(draft: Doc<"recipeImportDrafts">): EditableDraft {
  return {
    title: draft.title,
    description: draft.description ?? "",
    yieldText: draft.yieldText ?? "",
    servings: draft.servings?.toString() ?? "",
    prepTimeMinutes: draft.prepTimeMinutes?.toString() ?? "",
    cookTimeMinutes: draft.cookTimeMinutes?.toString() ?? "",
    totalTimeMinutes: draft.totalTimeMinutes?.toString() ?? "",
    ingredients: draft.ingredients.map((item) => ({
      originalText: item.originalText,
      name: item.name,
      quantity: item.quantity?.toString() ?? "",
      quantityText: item.quantityText ?? "",
      unit: item.unit ?? "",
      section: item.section ?? "",
      preparation: item.preparation ?? "",
      notes: item.notes ?? "",
      isOptional: item.isOptional,
    })),
    instructions: draft.instructions.map((item) => ({
      text: item.text,
      section: item.section ?? "",
    })),
  };
}

function optionalNumber(value: string) {
  return value.trim() === "" ? undefined : Number(value);
}

function move<T>(items: T[], index: number, direction: -1 | 1) {
  const destination = index + direction;
  if (destination < 0 || destination >= items.length) return items;
  const next = [...items];
  [next[index], next[destination]] = [next[destination], next[index]];
  return next;
}

export function RecipeReviewForm({ importId }: { importId: Id<"recipeImports"> }) {
  const result = useQuery(api.imports.review, { importId });
  const saveReview = useMutation(api.imports.saveReview);
  const retryImport = useMutation(api.imports.retry);
  const router = useRouter();
  const [draft, setDraft] = useState<EditableDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // The persisted draft arrives reactively after the first loading render and
    // must be copied once so subsequent user edits remain local until save.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (result?.draft && draft === null) setDraft(editableDraft(result.draft));
  }, [result, draft]);

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function update(next: EditableDraft) {
    setDraft(next);
    setDirty(true);
    setError("");
  }

  function leaveReview() {
    if (dirty && !window.confirm("Discard your unsaved recipe changes?")) return;
    router.push("/app/imports");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    if (!draft.title.trim()) {
      setError("Add a recipe title before saving.");
      document.getElementById("recipe-title")?.focus();
      return;
    }
    if (!draft.ingredients.some((item) => item.name.trim() && item.originalText.trim())) {
      setError("Add at least one complete ingredient before saving.");
      document.getElementById("ingredient-0-name")?.focus();
      return;
    }
    if (!draft.instructions.some((item) => item.text.trim())) {
      setError("Add at least one instruction before saving.");
      document.getElementById("instruction-0")?.focus();
      return;
    }
    setSaving(true);
    setError("");
    try {
      const recipeId = await saveReview({
        importId,
        draft: {
          ...draft,
          servings: optionalNumber(draft.servings),
          prepTimeMinutes: optionalNumber(draft.prepTimeMinutes),
          cookTimeMinutes: optionalNumber(draft.cookTimeMinutes),
          totalTimeMinutes: optionalNumber(draft.totalTimeMinutes),
          ingredients: draft.ingredients.map((item) => ({
            ...item,
            quantity: optionalNumber(item.quantity),
          })),
        },
      });
      setDirty(false);
      router.push(`/app/recipe-book/${recipeId}`);
    } catch {
      setError("The recipe could not be saved. Your edits are still here; please try again.");
      setSaving(false);
    }
  }

  if (result === undefined) return <div className="grid gap-4" aria-label="Loading recipe review"><Skeleton className="h-24" /><Skeleton className="h-96" /></div>;
  if (result === null) return <Alert role="alert"><AlertTitle>Recipe import not found</AlertTitle><AlertDescription>This import is unavailable or belongs to another account.</AlertDescription></Alert>;
  if (result.recipeImport.status === "completed") return <Alert><AlertTitle>Recipe already saved</AlertTitle><AlertDescription><Button asChild className="mt-3"><a href={`/app/recipe-book/${result.recipeImport.recipeId}`}>View saved recipe</a></Button></AlertDescription></Alert>;
  if (result.recipeImport.status === "failed") return <Alert role="alert"><AlertTitle>Import needs attention</AlertTitle><AlertDescription>{result.recipeImport.errorMessage ?? "The recipe could not be processed."}{result.recipeImport.errorRetryable && <Button className="mt-3" variant="secondary" onClick={() => retryImport({ importId })}><RefreshCw size={16} />Retry import</Button>}</AlertDescription></Alert>;
  if (result.recipeImport.status !== "parsed" || draft === null) return <Alert><AlertTitle>Recipe is still processing</AlertTitle><AlertDescription>Come back when source retrieval and draft generation are complete.</AlertDescription></Alert>;

  return (
    <form className="stack" onSubmit={submit}>
      <div className="flex flex-wrap items-center justify-between gap-3"><Button type="button" variant="ghost" onClick={leaveReview}><ArrowLeft size={17} />Back to imports</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save to Recipe Book"}</Button></div>
      <Alert><AlertTitle>AI-generated draft — review required</AlertTitle><AlertDescription>Compare every field with <a className="font-bold underline" href={result.recipeImport.sourceUrl} target="_blank" rel="noreferrer">the original recipe source</a>. Correct or remove anything unsupported before saving.</AlertDescription></Alert>
      {error && <Alert role="alert" className="border-red-200 bg-red-50"><AlertTitle>Check this recipe</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      <Card><CardContent className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-bold sm:col-span-2">Title<Input id="recipe-title" value={draft.title} onChange={(event) => update({ ...draft, title: event.target.value })} /></label>
        <label className="grid gap-2 text-sm font-bold sm:col-span-2">Description<textarea className="input min-h-24 py-3" value={draft.description} onChange={(event) => update({ ...draft, description: event.target.value })} /></label>
        <label className="grid gap-2 text-sm font-bold">Yield<Input value={draft.yieldText} onChange={(event) => update({ ...draft, yieldText: event.target.value })} /></label>
        <label className="grid gap-2 text-sm font-bold">Servings<Input type="number" min="0" value={draft.servings} onChange={(event) => update({ ...draft, servings: event.target.value })} /></label>
        <label className="grid gap-2 text-sm font-bold">Prep minutes<Input type="number" min="0" value={draft.prepTimeMinutes} onChange={(event) => update({ ...draft, prepTimeMinutes: event.target.value })} /></label>
        <label className="grid gap-2 text-sm font-bold">Cook minutes<Input type="number" min="0" value={draft.cookTimeMinutes} onChange={(event) => update({ ...draft, cookTimeMinutes: event.target.value })} /></label>
      </CardContent></Card>

      <section aria-labelledby="ingredients-title"><div className="section-row"><h2 id="ingredients-title" className="section-heading">Ingredients</h2><Button type="button" variant="secondary" size="sm" onClick={() => update({ ...draft, ingredients: [...draft.ingredients, { originalText: "", name: "", quantity: "", quantityText: "", unit: "", section: "", preparation: "", notes: "", isOptional: false }] })}><Plus size={16} />Add ingredient</Button></div><Card><CardContent className="grid gap-4">{draft.ingredients.map((item, index) => <div className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-[1fr_1fr_100px_auto]" key={index}>
        <label className="grid gap-1 text-xs font-bold">Source text<Input value={item.originalText} onChange={(event) => update({ ...draft, ingredients: draft.ingredients.map((value, candidate) => candidate === index ? { ...value, originalText: event.target.value } : value) })} /></label>
        <label className="grid gap-1 text-xs font-bold">Ingredient name<Input id={`ingredient-${index}-name`} value={item.name} onChange={(event) => update({ ...draft, ingredients: draft.ingredients.map((value, candidate) => candidate === index ? { ...value, name: event.target.value } : value) })} /></label>
        <label className="grid gap-1 text-xs font-bold">Quantity<Input value={item.quantity} onChange={(event) => update({ ...draft, ingredients: draft.ingredients.map((value, candidate) => candidate === index ? { ...value, quantity: event.target.value } : value) })} /></label>
        <div className="flex items-end"><Button type="button" variant="ghost" size="icon" aria-label={`Move ingredient ${index + 1} up`} disabled={index === 0} onClick={() => update({ ...draft, ingredients: move(draft.ingredients, index, -1) })}><ArrowUp size={16} /></Button><Button type="button" variant="ghost" size="icon" aria-label={`Move ingredient ${index + 1} down`} disabled={index === draft.ingredients.length - 1} onClick={() => update({ ...draft, ingredients: move(draft.ingredients, index, 1) })}><ArrowDown size={16} /></Button><Button type="button" variant="ghost" size="icon" aria-label={`Remove ingredient ${index + 1}`} onClick={() => update({ ...draft, ingredients: draft.ingredients.filter((_, candidate) => candidate !== index) })}><Trash2 size={16} /></Button></div>
      </div>)}</CardContent></Card></section>

      <section aria-labelledby="instructions-title"><div className="section-row"><h2 id="instructions-title" className="section-heading">Instructions</h2><Button type="button" variant="secondary" size="sm" onClick={() => update({ ...draft, instructions: [...draft.instructions, { text: "", section: "" }] })}><Plus size={16} />Add instruction</Button></div><Card><CardContent className="grid gap-4">{draft.instructions.map((item, index) => <div className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-[auto_1fr_auto]" key={index}><span className="pt-3 text-sm font-extrabold">{index + 1}</span><label className="grid gap-1 text-xs font-bold">Instruction<textarea id={`instruction-${index}`} className="input min-h-20 py-3" value={item.text} onChange={(event) => update({ ...draft, instructions: draft.instructions.map((value, candidate) => candidate === index ? { ...value, text: event.target.value } : value) })} /></label><div className="flex items-end"><Button type="button" variant="ghost" size="icon" aria-label={`Move instruction ${index + 1} up`} disabled={index === 0} onClick={() => update({ ...draft, instructions: move(draft.instructions, index, -1) })}><ArrowUp size={16} /></Button><Button type="button" variant="ghost" size="icon" aria-label={`Move instruction ${index + 1} down`} disabled={index === draft.instructions.length - 1} onClick={() => update({ ...draft, instructions: move(draft.instructions, index, 1) })}><ArrowDown size={16} /></Button><Button type="button" variant="ghost" size="icon" aria-label={`Remove instruction ${index + 1}`} onClick={() => update({ ...draft, instructions: draft.instructions.filter((_, candidate) => candidate !== index) })}><Trash2 size={16} /></Button></div></div>)}</CardContent></Card></section>
      <Button type="submit" disabled={saving} size="lg">{saving ? "Saving…" : "Save to Recipe Book"}</Button>
    </form>
  );
}
