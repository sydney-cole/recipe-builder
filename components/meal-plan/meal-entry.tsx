"use client";

import { useMutation } from "convex/react";
import { Minus, Plus, ShoppingBasket, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { api } from "@/convex/_generated/api";
import { parseGroceryItems, plannedServings, recipeHrefFromMealPlan, type MealPlanEntry } from "@/lib/meal-plan";
import { cn } from "@/lib/utils";

const MAX_SERVINGS = 100;
const stepButton = "grid size-7 place-items-center rounded-md border border-border text-muted-foreground hover:bg-surface-subtle disabled:opacity-50";
const actionButton = "grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-surface-subtle disabled:opacity-60";

function TakeoutBox({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4.5 10h15l-1.5 11H6z" />
      <path d="M4.5 10 7 5h10l2.5 5" />
      <path d="M9 5a3 3 0 0 1 6 0" />
      <path d="M10 14.5h4" />
    </svg>
  );
}

export function MealEntry({ entry }: { entry: MealPlanEntry }) {
  const remove = useMutation(api.mealPlans.remove);
  const setLeftovers = useMutation(api.mealPlans.setLeftovers);
  const setServings = useMutation(api.mealPlans.setServings);
  const setGroceryItems = useMutation(api.mealPlans.setGroceryItems);
  const [toBuy, setToBuy] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(false);
  const { recipe } = entry;
  const title = recipe?.title ?? entry.title;
  const servings = plannedServings(entry);

  async function run(change: () => Promise<unknown>) {
    setIsSaving(true);
    setError(false);
    try {
      await change();
    } catch {
      setError(true);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <li className="rounded-lg border border-border bg-white p-2 text-sm">
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1 py-1">
          {recipe ? (
            <Link
              className="break-words font-bold text-primary underline-offset-2 hover:underline"
              href={recipeHrefFromMealPlan({ ...entry, recipe })}
            >
              {title}
            </Link>
          ) : (
            <span className="break-words font-bold">{title}</span>
          )}
          {recipe && entry.isLeftovers && <Badge className="mt-1 flex w-fit">Leftovers</Badge>}
          {recipe && !entry.isLeftovers && servings !== undefined && (
            <div className="mt-2 flex items-center gap-2">
              <button type="button" className={stepButton} aria-label={`Fewer servings of ${title}`} disabled={isSaving || servings <= 1} onClick={() => void run(() => setServings({ entryId: entry._id, servings: servings - 1 }))}><Minus size={13} /></button>
              <span className="text-xs text-muted-foreground">{servings} {servings === 1 ? "serving" : "servings"}</span>
              <button type="button" className={stepButton} aria-label={`More servings of ${title}`} disabled={isSaving || servings >= MAX_SERVINGS} onClick={() => void run(() => setServings({ entryId: entry._id, servings: servings + 1 }))}><Plus size={13} /></button>
            </div>
          )}
          {!recipe && toBuy === null && entry.groceryItems.length > 0 && (
            <p className="mt-1 break-words text-xs text-muted-foreground">To buy: {entry.groceryItems.join(", ")}</p>
          )}
        </div>
        {!recipe && (
          <button
            type="button"
            className={cn(actionButton, entry.groceryItems.length > 0 && "text-primary")}
            aria-expanded={toBuy !== null}
            aria-label={`Items to buy for ${title}`}
            title="Items to buy"
            onClick={() => setToBuy(toBuy === null ? entry.groceryItems.join(", ") : null)}
          >
            <ShoppingBasket size={16} />
          </button>
        )}
        {recipe && (
          <button
            type="button"
            className={cn(actionButton, entry.isLeftovers && "bg-primary-soft text-primary")}
            aria-pressed={entry.isLeftovers}
            aria-label={`Leftovers: ${title}`}
            title={entry.isLeftovers ? "Leftovers: not added to grocery lists" : "Mark as leftovers"}
            disabled={isSaving}
            onClick={() => void run(() => setLeftovers({ entryId: entry._id, isLeftovers: !entry.isLeftovers }))}
          >
            <TakeoutBox size={16} />
          </button>
        )}
        <button
          type="button"
          className={actionButton}
          aria-label={`Remove ${title}`}
          disabled={isSaving}
          onClick={() => void run(() => remove({ entryId: entry._id }))}
        >
          <X size={16} />
        </button>
      </div>
      {toBuy !== null && (
        <form
          className="mt-2 grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await setGroceryItems({ entryId: entry._id, groceryItems: parseGroceryItems(toBuy) });
              setToBuy(null);
            });
          }}
        >
          <label>
            <span className="sr-only">Need to buy for {title}</span>
            <input className="input text-sm" placeholder="bread, jelly" value={toBuy} onChange={(event) => setToBuy(event.target.value)} />
          </label>
          <button type="submit" className="button button-secondary button-sm" disabled={isSaving}>Save items</button>
        </form>
      )}
      {error && <p className="mt-1 text-xs font-semibold text-red-700" role="alert">Couldn&apos;t update this meal. Try again.</p>}
    </li>
  );
}
