"use client";

import { useQuery } from "convex/react";
import { ArrowRight, BookOpen, Inbox, ListChecks } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { RecipeCard } from "@/components/recipes/recipe-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { recipeArt } from "@/lib/data/recipe-view";

const quickActions = [
  { href: "/app/imports", icon: Inbox, label: "Import a recipe", detail: "Paste a recipe link" },
  { href: "/app/recipe-book", icon: BookOpen, label: "Open Recipe Book", detail: "Browse saved recipes" },
  { href: "/app/grocery-lists", icon: ListChecks, label: "Open grocery lists", detail: "Plan and shop" },
];

export default function DashboardPage() {
  const summary = useQuery(api.recipes.summary);
  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Your kitchen"
        title="What are we cooking?"
        description="Import a recipe, review it, and turn its ingredients into a shopping plan."
        actions={<Button asChild><Link href="/app/imports"><Inbox size={17} />Import recipe</Link></Button>}
      />
      <section className="grid gap-4 md:grid-cols-3" aria-label="Quick actions">
        {quickActions.map(({ href, icon: Icon, label, detail }) => <Link className="quick-action" href={href} key={href}><span className="grid size-10 place-items-center rounded-lg bg-primary-soft text-primary"><Icon size={20} /></span><span><strong>{label}</strong><small>{detail}</small></span><ArrowRight className="ml-auto text-muted-foreground" size={18} /></Link>)}
      </section>

      {summary === undefined ? (
        <div className="mt-10 grid gap-4 md:grid-cols-3" aria-label="Loading dashboard"><Skeleton className="h-48" /><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
      ) : summary.recipeCount === 0 && summary.importCount === 0 ? (
        <div className="mt-10"><EmptyState icon={Inbox} title="Start with a recipe link" description="Paste a recipe URL and PerfectPlate will create a draft for you to review." action={<Button asChild><Link href="/app/imports">Import your first recipe</Link></Button>} /></div>
      ) : (
        <>
          <section className="mt-10">
            <div className="section-row"><div><h2 className="section-heading">Recently saved</h2><p className="section-copy">Recipes from your persisted Recipe Book.</p></div><Button asChild variant="ghost"><Link href="/app/recipe-book">View Recipe Book<ArrowRight size={16} /></Link></Button></div>
            {summary.recentRecipes.length === 0 ? <EmptyState icon={BookOpen} title="No saved recipes yet" description="Your imports are in progress or waiting for review." action={<Button asChild><Link href="/app/imports">Check imports</Link></Button>} /> : <div className="grid-auto">{summary.recentRecipes.map(({ recipe }) => <RecipeCard key={recipe._id} recipe={{ id: recipe._id, title: recipe.title, description: recipe.description ?? "Saved recipe", totalMinutes: recipe.totalTimeMinutes ?? 0, servings: recipe.servings ?? 0, source: recipe.sourceSite ?? "Imported recipe", tags: recipe.categories.slice(0, 3), art: recipeArt(recipe.title) }} />)}</div>}
          </section>
          <section className="mt-10 grid gap-4 lg:grid-cols-2">
            <Card><CardContent className="flex items-center gap-4 p-6"><span className="grid size-12 place-items-center rounded-xl bg-accent-soft text-accent"><Inbox /></span><div><p className="font-extrabold">{summary.needsAttention} {summary.needsAttention === 1 ? "import needs" : "imports need"} attention</p><p className="text-sm text-muted-foreground">{summary.processingCount} currently processing.</p></div><Button asChild variant="secondary" size="sm" className="ml-auto"><Link href="/app/imports">View</Link></Button></CardContent></Card>
            <Card><CardContent className="flex items-center gap-4 p-6"><span className="grid size-12 place-items-center rounded-xl bg-aqua-soft text-primary"><BookOpen /></span><div><p className="font-extrabold">{summary.recipeCount} {summary.recipeCount === 1 ? "recipe" : "recipes"} in your book</p><p className="text-sm text-muted-foreground">Based on saved recipe records.</p></div></CardContent></Card>
          </section>
        </>
      )}
    </div>
  );
}
