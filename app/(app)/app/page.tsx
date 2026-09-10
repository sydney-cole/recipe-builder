"use client";

import { useQuery } from "convex/react";
import {
  ArrowRight,
  BookOpen,
  Inbox,
  ListChecks,
  Search,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell/page-header";
import { RecipeCard } from "@/components/recipes/recipe-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { recipeArt } from "@/lib/data/recipe-view";
import type { Recipe } from "@/lib/data/types";

const quickActions = [
  {
    href: "/app/discover",
    icon: Search,
    label: "Find a recipe",
    detail: "Search by ingredients or mood",
  },
  {
    href: "/app/imports",
    icon: Inbox,
    label: "Import by email",
    detail: "Forward a recipe link",
  },
  {
    href: "/app/grocery-lists",
    icon: ListChecks,
    label: "Open grocery lists",
    detail: "Plan your next shopping trip",
  },
];

export default function DashboardPage() {
  const convexRecipes = useQuery(api.recipes.list);
  const recipes: Recipe[] | undefined = convexRecipes?.slice(0, 3).map(
    (recipe) => ({
      id: recipe._id,
      title: recipe.title,
      description:
        recipe.description ?? "A recipe saved to your PerfectPlate collection.",
      totalMinutes:
        recipe.totalTimeMinutes ??
        (recipe.prepTimeMinutes ?? 0) + (recipe.cookTimeMinutes ?? 0),
      servings: recipe.servings ?? 0,
      source: recipe.sourceSite ?? "Imported recipe",
      tags: recipe.categories.slice(0, 3),
      art: recipeArt(recipe.title),
    }),
  );

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Good afternoon"
        title="What are we cooking?"
        description="Your kitchen command center for saved recipes and grocery planning."
        actions={
          <Button asChild>
            <Link href="/app/discover">
              <Sparkles size={17} />
              Discover dinner
            </Link>
          </Button>
        }
      />
      <section
        className="grid gap-4 md:grid-cols-3"
        aria-label="Quick actions"
      >
        {quickActions.map(({ href, icon: Icon, label, detail }) => (
          <Link className="quick-action" href={href} key={href}>
            <span className="grid size-10 place-items-center rounded-lg bg-primary-soft text-primary">
              <Icon size={20} />
            </span>
            <span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
            <ArrowRight className="ml-auto text-muted-foreground" size={18} />
          </Link>
        ))}
      </section>

      <section className="mt-10">
        <div className="section-row">
          <div>
            <h2 className="section-heading">Recently saved</h2>
            <p className="section-copy">
              Your newest recipes, ready to become grocery lists.
            </p>
          </div>
          <Button asChild variant="ghost">
            <Link href="/app/recipe-book">
              View Recipe Book
              <ArrowRight size={16} />
            </Link>
          </Button>
        </div>
        {recipes === undefined ? (
          <div className="grid-auto" aria-label="Loading recent recipes">
            {[0, 1, 2].map((item) => (
              <Skeleton className="h-96" key={item} />
            ))}
          </div>
        ) : recipes.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <BookOpen className="mx-auto text-muted-foreground" />
              <p className="mt-3 font-extrabold">No saved recipes yet</p>
              <Button asChild className="mt-4" size="sm">
                <Link href="/app/imports">Import a recipe</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid-auto">
            {recipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                canCreateGroceryList
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
