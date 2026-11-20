"use client";

import { useMutation } from "convex/react";
import { Minus, Plus, ShoppingBasket } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import {
  addDays,
  formatDay,
  formatWeekRange,
  MEAL_SLOTS,
  plannedServings,
  slotLabel,
  type MealPlanEntry,
} from "@/lib/meal-plan";

const MAX_SERVINGS = 100;
const stepButton = "grid size-9 place-items-center rounded-lg border border-border hover:bg-surface-subtle disabled:opacity-50";

function slotOrder(entry: MealPlanEntry) {
  return MEAL_SLOTS.findIndex((slot) => slot.id === entry.slot);
}

function when(entry: MealPlanEntry) {
  return `${formatDay(entry.date, { weekday: "short" })} ${slotLabel(entry.slot).toLowerCase()}`;
}

export function GroceryReviewDialog({ open, onOpenChange, weekStart, entries }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekStart: string;
  entries: MealPlanEntry[];
}) {
  const setServings = useMutation(api.mealPlans.setServings);
  const createFromMealPlan = useMutation(api.groceryLists.createFromMealPlan);
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linked = entries
    .filter((entry) => entry.recipe !== null)
    .sort((first, second) => first.date.localeCompare(second.date) || slotOrder(first) - slotOrder(second));
  const cooking = linked.filter((entry) => !entry.isLeftovers);
  const leftovers = linked.filter((entry) => entry.isLeftovers);
  const extras = entries.filter((entry) => entry.recipe === null && entry.groceryItems.length > 0);

  async function changeServings(entry: MealPlanEntry, servings: number) {
    setError(null);
    try {
      await setServings({ entryId: entry._id, servings });
    } catch {
      setError("Couldn't change the servings. Try again.");
    }
  }

  async function create() {
    setIsCreating(true);
    setError(null);
    try {
      const listId = await createFromMealPlan({
        startDate: weekStart,
        endDate: addDays(weekStart, 6),
        name: `Meal plan: ${formatWeekRange(weekStart)}`,
      });
      setIsCreating(false);
      onOpenChange(false);
      router.push(`/app/grocery-lists/${listId}`);
    } catch {
      setError("Couldn't create the grocery list. Try again.");
      setIsCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!isCreating) { setError(null); onOpenChange(nextOpen); } }}>
      <DialogContent>
        <DialogTitle>Grocery list for {formatWeekRange(weekStart)}</DialogTitle>
        <DialogDescription>Check how many servings you&apos;ll make of each recipe. Ingredient amounts are scaled to match.</DialogDescription>
        <ul className="mt-5 grid gap-2" aria-label="Recipes to cook">
          {cooking.map((entry) => {
            const servings = plannedServings(entry);
            const title = entry.recipe?.title ?? entry.title;
            return (
              <li key={entry._id} className="flex items-center gap-3 rounded-lg bg-surface-subtle p-3">
                <div className="min-w-0 flex-1">
                  <strong className="block break-words text-sm">{title}</strong>
                  <small className="text-muted-foreground">{when(entry)}</small>
                </div>
                {servings === undefined ? (
                  <span className="text-sm font-bold text-muted-foreground">1 batch</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <button type="button" className={stepButton} aria-label={`Fewer servings of ${title}, ${when(entry)}`} disabled={isCreating || servings <= 1} onClick={() => void changeServings(entry, servings - 1)}><Minus size={15} /></button>
                    <span className="min-w-20 text-center text-sm font-bold">{servings} {servings === 1 ? "serving" : "servings"}</span>
                    <button type="button" className={stepButton} aria-label={`More servings of ${title}, ${when(entry)}`} disabled={isCreating || servings >= MAX_SERVINGS} onClick={() => void changeServings(entry, servings + 1)}><Plus size={15} /></button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {extras.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-extrabold">Also buying</h3>
            <ul className="mt-2 grid gap-1 text-sm text-muted-foreground">
              {extras.map((entry) => <li key={entry._id}>{entry.groceryItems.join(", ")} ({entry.title}, {when(entry)})</li>)}
            </ul>
          </div>
        )}
        {leftovers.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-extrabold">Not added: leftovers</h3>
            <ul className="mt-2 grid gap-1 text-sm text-muted-foreground">
              {leftovers.map((entry) => <li key={entry._id}>{entry.recipe?.title ?? entry.title} ({when(entry)})</li>)}
            </ul>
          </div>
        )}
        {error !== null && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" disabled={isCreating} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={isCreating || (cooking.length === 0 && extras.length === 0)} onClick={() => void create()}><ShoppingBasket size={16} />{isCreating ? "Creating…" : "Create grocery list"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
