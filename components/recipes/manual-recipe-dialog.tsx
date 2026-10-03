"use client";

import { useMutation } from "convex/react";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function ManualRecipeDialog({
  open,
  onOpenChange,
  initialSourceUrl = "",
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSourceUrl?: string;
  onCreated: (recipeId: Id<"recipes">) => void;
}) {
  const createManual = useMutation(api.recipeCards.createManual);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ingredients = String(form.get("ingredients") ?? "").split("\n").map((item) => item.trim()).filter(Boolean);
    const instructions = String(form.get("instructions") ?? "").split("\n").map((item) => item.trim()).filter(Boolean);
    if (ingredients.length === 0 || instructions.length === 0) {
      setError("Add at least one ingredient and one instruction.");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const recipeId = await createManual({
        title: String(form.get("title") ?? "").trim(),
        description: String(form.get("description") ?? "").trim() || null,
        sourceUrl: String(form.get("sourceUrl") ?? "").trim() || null,
        servings: optionalNumber(String(form.get("servings") ?? "")),
        prepTimeMinutes: optionalNumber(String(form.get("prepTimeMinutes") ?? "")),
        cookTimeMinutes: optionalNumber(String(form.get("cookTimeMinutes") ?? "")),
        ingredients,
        instructions,
      });
      onOpenChange(false);
      onCreated(recipeId);
    } catch {
      setError("We couldn’t save this recipe. Check the fields and try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,760px)]">
        <DialogTitle>Add a recipe manually</DialogTitle>
        <DialogDescription>Enter the recipe details below. Ingredients and instructions should each go on their own line.</DialogDescription>
        <form className="mt-6 grid gap-4" onSubmit={submit}>
          <label className="grid gap-2 text-sm font-bold">Recipe title<Input name="title" required maxLength={300} autoFocus /></label>
          <label className="grid gap-2 text-sm font-bold">Description<textarea className="input min-h-20 resize-y" name="description" maxLength={2000} /></label>
          <label className="grid gap-2 text-sm font-bold">Source URL <span className="font-normal text-muted-foreground">(optional)</span><Input name="sourceUrl" type="url" defaultValue={initialSourceUrl} /></label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="grid gap-2 text-sm font-bold">Servings<Input name="servings" type="number" min="0" step="any" /></label>
            <label className="grid gap-2 text-sm font-bold">Prep minutes<Input name="prepTimeMinutes" type="number" min="0" /></label>
            <label className="grid gap-2 text-sm font-bold">Cook minutes<Input name="cookTimeMinutes" type="number" min="0" /></label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold">Ingredients<textarea className="input min-h-52 resize-y" name="ingredients" required placeholder={"2 cups flour\n1 tsp salt\n2 eggs"} /></label>
            <label className="grid gap-2 text-sm font-bold">Instructions<textarea className="input min-h-52 resize-y" name="instructions" required placeholder={"Mix the dry ingredients.\nAdd the eggs and combine.\nBake until golden."} /></label>
          </div>
          {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
          <div className="cluster"><Button type="submit" disabled={isSaving}><Plus size={17} />{isSaving ? "Adding recipe…" : "Add to Recipe Book"}</Button><Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
