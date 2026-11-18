"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowRight, CalendarDays } from "lucide-react";
import Link from "next/link";
import { CurrentRecipePanel } from "@/components/recipes/current-recipe-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { MEAL_LABELS } from "@/convex/lib/plannerRules";
import { formatDay } from "@/convex/lib/plannerSlots";
import { SLOT_TYPES } from "./types";
import { useToday } from "./use-today";

type TodayMeal = FunctionReturnType<typeof api.planner.today>["meals"][number];
type TodaySlot = NonNullable<TodayMeal["slot"]>;

const TYPE_LABELS = Object.fromEntries(SLOT_TYPES.map(({ type, label }) => [type, label])) as Record<TodaySlot["type"], string>;

/**
 * Home's view of today's plan: each meal the user plans, in order. When
 * nothing is planned today it falls back to the hand-set current recipe.
 * "Today" is the browser's local date, never the server's.
 */
export function TodayPlan() {
  const today = useToday();
  const plan = useQuery(api.planner.today, { date: today });
  const weekHref = `/app/planner?week=${today}`;

  if (plan === undefined) {
    return (
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading today’s plan…</span>
        <Skeleton className="mt-8 h-40" />
      </div>
    );
  }

  const planned = plan.meals.some((entry) => entry.slot !== null);
  if (!planned) {
    return (
      <>
        <Card className="mt-8 border-dashed">
          <CardContent className="today-plan-empty">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><CalendarDays size={22} aria-hidden="true" /></span>
            <p className="flex-1 font-extrabold">Nothing is planned for today.</p>
            <Button asChild variant="secondary" size="sm"><Link href={weekHref}>Plan today</Link></Button>
          </CardContent>
        </Card>
        <CurrentRecipePanel />
      </>
    );
  }

  const day = formatDay(today);
  return (
    <section className="mt-8" aria-labelledby="today-plan-title">
      <div className="section-row">
        <div>
          <p className="eyebrow">{day.long}, {day.monthDay}</p>
          <h2 id="today-plan-title" className="section-heading">Today’s meals</h2>
        </div>
        <Button asChild variant="ghost">
          <Link href={weekHref}>Open this week’s plan<ArrowRight size={16} aria-hidden="true" /></Link>
        </Button>
      </div>
      <ul className="today-meals" aria-label="Today’s meals">
        {plan.meals.map(({ meal, slot }) => (
          <li key={meal} className="today-meal">
            <span className="today-meal-label">{MEAL_LABELS[meal]}</span>
            {slot === null ? (
              <span className="today-meal-body planner-quiet">Nothing planned</span>
            ) : (
              <>
                <span className="badge today-meal-type">
                  <span className={`planner-dot planner-dot-${slot.type}`} aria-hidden="true" />
                  {TYPE_LABELS[slot.type]}
                </span>
                <span className="today-meal-body"><SlotSummary slot={slot} /></span>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecipeName({ name, recipeId }: { name: string; recipeId?: string }) {
  if (recipeId === undefined) return <strong>{name}</strong>;
  return <Link className="today-meal-link" href={`/app/recipe-book/${recipeId}`}>{name}</Link>;
}

function SlotSummary({ slot }: { slot: TodaySlot }) {
  if (slot.type === "skip") return <>Skipped</>;
  if (slot.type === "left") {
    if (slot.source !== undefined) {
      return <><RecipeName name={slot.name} recipeId={slot.source.recipeId} />, from {formatDay(slot.source.date).dow} {slot.source.meal}</>;
    }
    return slot.name ? <strong>{slot.name}</strong> : <span className="planner-quiet">Leftovers</span>;
  }
  if (slot.type === "out") return slot.name ? <strong>{slot.name}</strong> : <span className="planner-quiet">Somewhere to eat out</span>;
  if (slot.recipeRemoved) return <span className="planner-warn">Recipe removed from your Recipe Book</span>;
  if (!slot.name) return <span className="planner-quiet">Nothing named yet</span>;
  if (slot.recipeId !== undefined) return <RecipeName name={slot.name} recipeId={slot.recipeId} />;
  return <><strong>{slot.name}</strong> <span className="planner-quiet">(no recipe attached)</span></>;
}
