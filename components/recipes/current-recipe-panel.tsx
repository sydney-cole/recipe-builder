"use client";

import { useMutation, useQuery } from "convex/react";
import { BookOpen, CookingPot, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { recipeTotalMinutes } from "@/lib/data/recipe-view";

export function CurrentRecipePanel() {
  const recipe = useQuery(api.recipes.current);
  const setCurrent = useMutation(api.recipeCards.setCurrent);
  const [isClearing, setIsClearing] = useState(false);
  const [clearError, setClearError] = useState(false);

  async function clear() {
    setIsClearing(true);
    setClearError(false);
    try {
      await setCurrent({ recipeId: null });
    } catch {
      setClearError(true);
    } finally {
      setIsClearing(false);
    }
  }

  if (recipe === undefined) return <Skeleton className="mt-8 h-40" />;

  return (
    <section className="mt-8" aria-labelledby="current-recipe-title">
      <div className="section-row">
        <div>
          <p className="eyebrow">On your counter</p>
          <h2 id="current-recipe-title" className="section-heading">Current recipe</h2>
        </div>
      </div>
      {recipe === null ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><CookingPot size={22} /></span>
            <div className="flex-1"><p className="font-extrabold">Nothing selected yet</p><p className="mt-1 text-sm text-muted-foreground">Set any recipe card as current to keep it handy here.</p></div>
            <Button asChild variant="secondary" size="sm"><Link href="/app/recipe-book?select=current">Choose a recipe</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="relative overflow-hidden border-primary/30 bg-primary-soft/40">
          <CardContent className="p-0">
            <Button
              className="absolute right-4 top-4"
              variant="ghost"
              size="sm"
              disabled={isClearing}
              onClick={() => void clear()}
            >
              <X size={16} />{isClearing ? "Clearing…" : "Clear"}
            </Button>
            <div className="flex flex-col gap-5 p-6 pr-28 sm:flex-row sm:items-center sm:pr-36">
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary text-white shadow-sm"><CookingPot size={26} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-primary">Ready when you are</p>
                <h3 className="mt-1 truncate font-display text-3xl font-semibold">{recipe.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{recipeTotalMinutes(recipe) !== undefined ? `${recipeTotalMinutes(recipe)} min · ` : ""}{recipe.sourceSite ?? "Imported recipe"}</p>
              </div>
            </div>
            <div className="flex justify-center border-t border-primary/15 bg-white/55 p-4">
              <div className="grid w-full max-w-3xl gap-2 sm:grid-cols-2">
                <Button asChild size="sm"><Link href={`/app/recipe-book/${recipe._id}`}><BookOpen size={16} />View recipe</Link></Button>
                <Button asChild variant="secondary" size="sm"><Link href="/app/recipe-book?select=current"><RefreshCw size={16} />Change recipe</Link></Button>
              </div>
            </div>
            {clearError && <p className="px-4 pb-4 text-xs font-bold text-red-700" role="alert">Couldn&apos;t clear the current recipe.</p>}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
