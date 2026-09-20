import type { Metadata } from "next";
import { RecipeDetail } from "@/components/recipes/recipe-detail";

export const metadata: Metadata = { title: "Recipe details" };

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
  return <RecipeDetail recipeId={recipeId} />;
}
