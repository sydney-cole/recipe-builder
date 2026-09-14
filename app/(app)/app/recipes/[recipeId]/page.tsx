import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { ArrowLeft, Clock3, ExternalLink, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FoodArt } from "@/components/recipes/food-art";
import { RecipePreviewActions } from "@/components/recipes/recipe-preview-actions";
import { RecipeIngredients } from "@/components/recipes/recipe-ingredients";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { recipeArt } from "@/lib/data/recipe-view";

export default async function RecipePreviewPage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
  const token = await convexAuthNextjsToken();
  const data = await fetchQuery(api.recipes.get, { recipeId }, { token });
  if (data === null) notFound();

  const { recipe, ingredients, saved } = data;
  const totalMinutes =
    recipe.totalTimeMinutes ??
    (recipe.prepTimeMinutes ?? 0) + (recipe.cookTimeMinutes ?? 0);
  const servings = recipe.servings ?? 0;
  const tags = recipe.categories.length > 0 ? recipe.categories : recipe.cuisines;

  return (
    <div className="page-container">
      <Button asChild variant="ghost" className="mb-5">
        <Link href="/app">
          <ArrowLeft size={17} />
          Return home
        </Link>
      </Button>
      <div className="recipe-detail-hero">
        <FoodArt
          variant={recipeArt(recipe.title)}
          label={tags[0] ?? "Recipe"}
          imageUrl={recipe.imageUrl}
        />
        <div className="p-6 sm:p-8">
          <div className="cluster">
            {tags.map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">
            {recipe.title}
          </h1>
          {recipe.description && (
            <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
              {recipe.description}
            </p>
          )}
          <div className="mt-6 cluster text-sm font-bold text-muted-foreground">
            <span>
              <Clock3 className="inline" size={17} /> {totalMinutes} min
            </span>
            <span>
              <Users className="inline" size={17} /> {servings || "—"} servings
            </span>
          </div>
          <div className="mt-7 stack">
            <RecipePreviewActions recipeId={recipe._id} isSaved={saved !== null} />
            <Button asChild variant="secondary" className="w-fit">
              <a href={recipe.sourceUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={17} />
                View original
              </a>
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[.85fr_1.15fr]">
        <RecipeIngredients ingredients={ingredients} initialServings={servings || 1} />
        <section>
          <h2 className="section-heading">Instructions</h2>
          <p className="section-copy mb-4">Review the recipe before deciding where to keep it.</p>
          <ol className="stack">
            {recipe.instructions.map((instruction) => (
              <li
                className="flex gap-4 rounded-xl border border-border bg-white p-5"
                key={instruction.position}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-extrabold text-white">
                  {instruction.position}
                </span>
                <p className="pt-1 text-sm leading-6">{instruction.text}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
