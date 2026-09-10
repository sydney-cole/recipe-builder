"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import { RecipeReviewForm } from "@/components/imports/recipe-review-form";
import type { Id } from "@/convex/_generated/dataModel";

export default function ImportReviewPage() {
  const params = useParams<{ importId: string }>();
  return <div className="page-container"><PageHeader eyebrow="Recipe import" title="Review recipe draft" description="Check the generated recipe against its source before saving." /><RecipeReviewForm importId={params.importId as Id<"recipeImports">} /></div>;
}
