"use client";

import { useQuery } from "convex/react";
import { ChevronLeft, ChevronRight, ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { AddMealDialog, type MealTarget } from "@/components/meal-plan/add-meal-dialog";
import { GroceryReviewDialog } from "@/components/meal-plan/grocery-review-dialog";
import { WeekGrid } from "@/components/meal-plan/week-grid";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { addDays, formatWeekRange, startOfWeek, toDateKey, weekDays, weekFromParam } from "@/lib/meal-plan";

const subscribeToNothing = () => () => {};

export default function MealPlanPage() {
  // The server doesn't know the viewer's time zone, so "today" is only read
  // in the browser; the server render shows the loading state instead.
  const today = useSyncExternalStore(subscribeToNothing, () => toDateKey(new Date()), () => null);
  const searchParams = useSearchParams();
  const [selectedWeek, setSelectedWeek] = useState(() => weekFromParam(searchParams.get("week")));
  const [addingTo, setAddingTo] = useState<MealTarget | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const thisWeek = today === null ? null : startOfWeek(today);
  const weekStart = selectedWeek ?? thisWeek;
  const showWeek = (week: string | null) => {
    setSelectedWeek(week);
    // Keeps the week across a refresh without a navigation round trip.
    window.history.replaceState(null, "", week === null ? window.location.pathname : `?week=${week}`);
  };
  const moveWeeks = (weeks: number) => {
    if (weekStart !== null) showWeek(addDays(weekStart, weeks * 7));
  };
  const entries = useQuery(
    api.mealPlans.listRange,
    weekStart === null ? "skip" : { startDate: weekStart, endDate: addDays(weekStart, 6) },
  );
  const groceryListId = useQuery(
    api.groceryLists.forMealPlan,
    weekStart === null ? "skip" : { startDate: weekStart },
  ) ?? null;
  const hasGroceries = (entries ?? []).some((entry) =>
    entry.recipe === null ? entry.groceryItems.length > 0 : !entry.isLeftovers,
  );

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Your week"
        title="Meal Plan"
        description="Plan breakfast, lunch, and dinner, then turn the week into a grocery list."
        actions={
          groceryListId === null ? (
            <Button disabled={!hasGroceries} onClick={() => setReviewOpen(true)}>
              <ShoppingBasket size={17} />Create grocery list
            </Button>
          ) : (
            <div className="cluster">
              <Button asChild><Link href={`/app/grocery-lists/${groceryListId}`}><ShoppingBasket size={17} />Open grocery list</Link></Button>
              <Button variant="secondary" disabled={!hasGroceries} onClick={() => setReviewOpen(true)}>Rebuild from plan</Button>
            </div>
          )
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="icon" aria-label="Previous week" onClick={() => moveWeeks(-1)}><ChevronLeft size={18} /></Button>
        <Button variant="secondary" size="icon" aria-label="Next week" onClick={() => moveWeeks(1)}><ChevronRight size={18} /></Button>
        <Button variant="secondary" disabled={weekStart === thisWeek} onClick={() => showWeek(null)}>This week</Button>
        <p className="ml-1 font-extrabold" role="status">{weekStart === null ? "Loading week…" : formatWeekRange(weekStart)}</p>
      </div>
      {today === null || weekStart === null || entries === undefined ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
          {[0, 1, 2, 3, 4, 5, 6].map((item) => <Skeleton className="h-64" key={item} />)}
        </div>
      ) : (
        <>
          <WeekGrid days={weekDays(weekStart)} today={today} entries={entries} onAdd={(date, slot) => setAddingTo({ date, slot })} />
          <GroceryReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} weekStart={weekStart} entries={entries} existingListId={groceryListId} />
        </>
      )}
      <AddMealDialog target={addingTo} onClose={() => setAddingTo(null)} />
    </div>
  );
}
