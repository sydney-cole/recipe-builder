"use client";

import { useMutation, useQuery } from "convex/react";
import { Minus, Plus, ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type Ingredient = { _id: Id<"recipeIngredients">; originalText: string; name: string };

export function AddRecipeDialog({ recipeId, title, ingredients, initialServings }: { recipeId: Id<"recipes">; title: string; ingredients: Ingredient[]; initialServings: number }) {
  const lists = useQuery(api.grocery.list);
  const createList = useMutation(api.grocery.create);
  const addRecipe = useMutation(api.grocery.addRecipe);
  const [selected, setSelected] = useState(() => new Set(ingredients.map((item) => item._id)));
  const [servings, setServings] = useState(Math.max(1, initialServings));
  const [listId, setListId] = useState<Id<"groceryLists"> | "">("");
  const [newList, setNewList] = useState("");
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [destination, setDestination] = useState<{ id: Id<"groceryLists">; name: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (selected.size === 0) return setError("Select at least one ingredient.");
    if (!listId && !newList.trim()) return setError("Choose a list or create a new one.");
    setSaving(true);
    setError("");
    try {
      const targetId = listId || await createList({ name: newList });
      const targetName = lists?.find((list) => list._id === targetId)?.name ?? newList.trim();
      await addRecipe({ listId: targetId, recipeId, ingredientIds: [...selected], servings, requestKey });
      setDestination({ id: targetId, name: targetName });
      setRequestKey(crypto.randomUUID());
    } catch {
      setError("Ingredients could not be added. Your choices are retained; try again.");
    } finally { setSaving(false); }
  }

  return <Dialog onOpenChange={(open) => { if (!open) setDestination(null); }}><DialogTrigger asChild><Button><ShoppingBasket size={17} />Add to grocery list</Button></DialogTrigger><DialogContent>
    <DialogTitle>Add {title} ingredients</DialogTitle><DialogDescription>Choose what you need, scale the recipe, and select a destination.</DialogDescription>
    {destination ? <div className="mt-6 rounded-xl bg-primary-soft p-5" role="status"><p className="font-extrabold">Added to {destination.name}</p><Button asChild className="mt-3"><Link href={`/app/grocery-lists/${destination.id}`}>Open grocery list</Link></Button></div> : <form className="mt-6 grid gap-5" onSubmit={submit}>
      <fieldset><legend className="font-extrabold">Ingredients</legend><div className="mt-3 grid gap-2">{ingredients.map((item) => <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border p-3 text-sm" key={item._id}><Checkbox checked={selected.has(item._id)} onCheckedChange={(checked) => { const next = new Set(selected); if (checked === true) next.add(item._id); else next.delete(item._id); setSelected(next); setError(""); }} />{item.originalText}</label>)}</div></fieldset>
      <div><p className="font-extrabold">Servings</p><div className="mt-2 flex items-center gap-3"><Button size="icon" variant="secondary" aria-label="Decrease grocery servings" disabled={servings <= 1} onClick={() => setServings((value) => Math.max(1, value - 1))}><Minus size={16} /></Button><output className="min-w-10 text-center font-extrabold" aria-live="polite">{servings}</output><Button size="icon" variant="secondary" aria-label="Increase grocery servings" onClick={() => setServings((value) => value + 1)}><Plus size={16} /></Button></div></div>
      <label className="grid gap-2 text-sm font-bold">Existing list<select className="input" value={listId} onChange={(event) => { setListId(event.target.value as Id<"groceryLists"> | ""); setError(""); }}><option value="">Choose a list</option>{lists?.map((list) => <option key={list._id} value={list._id}>{list.name}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-bold">Or create a new list<Input value={newList} onChange={(event) => { setNewList(event.target.value); if (event.target.value) setListId(""); setError(""); }} placeholder="New list name" /></label>
      {error && <p className="text-sm font-bold text-red-700" role="alert">{error}</p>}<Button type="submit" disabled={saving || lists === undefined}>{saving ? "Adding…" : "Add selected ingredients"}</Button>
    </form>}
  </DialogContent></Dialog>;
}
