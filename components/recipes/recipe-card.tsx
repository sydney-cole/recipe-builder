"use client";

import Link from "next/link";
import { useState } from "react";
import { BookCheck, BookPlus, Clock3, ShoppingBasket, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FoodArt } from "./food-art";
import type { Recipe } from "@/lib/data/types";

export function RecipeCard({
  recipe,
  suggested = false,
  preview = false,
  detailsHref = `/app/recipe-book/${recipe.id}`,
}: {
  recipe: Recipe;
  suggested?: boolean;
  preview?: boolean;
  detailsHref?: string | null;
}) {
  const [saved, setSaved] = useState(!suggested);
  return (
    <Card className="recipe-card">
      {detailsHref ? (
        <Link href={detailsHref} aria-label={`View ${recipe.title}`}><FoodArt variant={recipe.art} label={recipe.tags[0]} /></Link>
      ) : (
        <FoodArt variant={recipe.art} label={recipe.tags[0]} />
      )}
      <CardContent className="stack">
        <div>
          {detailsHref ? <Link href={detailsHref}><h3>{recipe.title}</h3></Link> : <h3>{recipe.title}</h3>}
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{recipe.description}</p>
        </div>
        <div className="recipe-meta"><span><Clock3 size={14} className="inline" /> {recipe.totalMinutes} min</span><span><Users size={14} className="inline" /> {recipe.servings}</span></div>
        {recipe.matchReason && <p className="rounded-lg bg-primary-soft p-3 text-sm leading-5 text-primary"><strong>Why it fits:</strong> {recipe.matchReason}</p>}
        {recipe.missingIngredients && <p className="text-xs text-muted-foreground">Missing: {recipe.missingIngredients.join(", ")}</p>}
        <div className="cluster">{recipe.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</div>
        {preview ? (
          <Button variant="secondary" size="sm" disabled>Preview only</Button>
        ) : <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button variant={saved ? "secondary" : "default"} size="sm" onClick={() => setSaved(true)} disabled={saved}>
            {saved ? <BookCheck size={16} /> : <BookPlus size={16} />}{saved ? "In Recipe Book" : "Add to Recipe Book"}
          </Button>
          <Button asChild variant="secondary" size="sm"><Link href="/app/grocery-lists"><ShoppingBasket size={16} />Add to list</Link></Button>
        </div>}
        <p className="text-xs text-muted-foreground">Source: {recipe.source}</p>
      </CardContent>
    </Card>
  );
}
