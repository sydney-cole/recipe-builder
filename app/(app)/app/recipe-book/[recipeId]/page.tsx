import type { Metadata } from "next";
import { mealPlanBackLink } from "@/lib/meal-plan";
import { RecipeDetail } from "@/components/recipes/recipe-detail";

export const metadata: Metadata = { title: "Recipe details" };

export default async function RecipeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ recipeId: string }>;
  searchParams: Promise<{ mealPlanWeek?: string | string[] }>;
}) {
  const { recipeId } = await params;
  const { mealPlanWeek } = await searchParams;
  return <RecipeDetail recipeId={recipeId} back={mealPlanBackLink(mealPlanWeek)} />;
}
