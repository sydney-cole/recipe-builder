"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatDay, mealPlanErrorMessage, parseGroceryItems, QUICK_PICKS, slotLabel, type MealSlot } from "@/lib/meal-plan";

export type MealTarget = { date: string; slot: MealSlot };

export function AddMealDialog({ target, onClose }: { target: MealTarget | null; onClose: () => void }) {
  const recipes = useQuery(api.recipes.listBook, target === null ? "skip" : {});
  const add = useMutation(api.mealPlans.add);
  const [title, setTitle] = useState("");
  const [toBuy, setToBuy] = useState("");
  const [search, setSearch] = useState("");
  const [isLeftovers, setIsLeftovers] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = search.trim().toLowerCase();
  const matches = (recipes ?? []).filter((recipe) => recipe.title.toLowerCase().includes(query));

  function close() {
    setTitle("");
    setToBuy("");
    setSearch("");
    setIsLeftovers(false);
    setError(null);
    onClose();
  }

  async function addMeal(meal: { title: string; groceryItems?: string[] } | { recipeId: Id<"recipes">; isLeftovers: boolean }) {
    if (target === null) return;
    setIsAdding(true);
    setError(null);
    try {
      await add({ ...target, ...meal });
      setIsAdding(false);
      close();
    } catch (failure) {
      setError(mealPlanErrorMessage(failure, "Couldn't add this meal. Try again."));
      setIsAdding(false);
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => { if (!open && !isAdding) close(); }}>
      <DialogContent>
        <DialogTitle>Add {target === null ? "a meal" : slotLabel(target.slot).toLowerCase()}</DialogTitle>
        <DialogDescription>
          {target !== null && `${formatDay(target.date, { weekday: "long", month: "short", day: "numeric" })}. `}
          Pick a recipe, or just note what you&apos;re eating.
        </DialogDescription>

        <div className="mt-5 flex flex-wrap gap-2">
          {QUICK_PICKS.map((pick) => (
            <Button key={pick} variant="secondary" size="sm" disabled={isAdding} onClick={() => void addMeal({ title: pick })}>{pick}</Button>
          ))}
        </div>
        <form
          className="mt-3 grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (title.trim().length > 0) void addMeal({ title, groceryItems: parseGroceryItems(toBuy) });
          }}
        >
          <label>
            <span className="sr-only">Something else</span>
            <Input placeholder="Something else, like toast with jelly" maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <div className="flex gap-2">
            <label className="flex-1">
              <span className="sr-only">Need to buy</span>
              <Input placeholder="Need to buy? bread, jelly" value={toBuy} onChange={(event) => setToBuy(event.target.value)} />
            </label>
            <Button type="submit" variant="secondary" disabled={isAdding || title.trim().length === 0}>Add</Button>
          </div>
          <p className="text-xs text-muted-foreground">Separate items with commas. They&apos;re added when you create the week&apos;s grocery list.</p>
        </form>

        <div className="mt-6 border-t border-border pt-5">
          <h3 className="font-extrabold">From your Recipe Book</h3>
          <label className="mt-3 flex cursor-pointer items-center gap-3 text-sm font-bold">
            <Checkbox checked={isLeftovers} onCheckedChange={(checked) => setIsLeftovers(checked === true)} />
            These are leftovers
          </label>
          <p className="mt-1 text-xs text-muted-foreground">Leftovers stay linked to the recipe but aren&apos;t added to grocery lists.</p>
          {recipes === undefined ? (
            <p className="mt-3 text-sm text-muted-foreground" role="status">Loading your recipes…</p>
          ) : recipes.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Your Recipe Book is empty. <Link className="font-bold text-primary underline" href="/app/recipe-book">Add a recipe</Link> to plan it here.
            </p>
          ) : (
            <>
              <label className="mt-3 block">
                <span className="sr-only">Search your Recipe Book</span>
                <Input placeholder="Search your Recipe Book" value={search} onChange={(event) => setSearch(event.target.value)} />
              </label>
              {matches.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No recipes match that search.</p>
              ) : (
                <ul className="mt-3 grid max-h-56 gap-2 overflow-auto">
                  {matches.map((recipe) => (
                    <li key={recipe._id}>
                      <button
                        type="button"
                        className="w-full rounded-lg bg-surface-subtle p-3 text-left text-sm font-bold hover:bg-primary-soft disabled:opacity-60"
                        disabled={isAdding}
                        onClick={() => void addMeal({ recipeId: recipe._id, isLeftovers })}
                      >
                        {recipe.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        {error !== null && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
