"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, CookingPot } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export function CurrentRecipeButton({
  recipeId,
  size = "sm",
  variant,
  className,
}: {
  recipeId: string;
  size?: "sm" | "default";
  variant?: "default" | "secondary" | "ghost";
  className?: string;
}) {
  const currentId = useQuery(api.recipes.currentId);
  const setCurrent = useMutation(api.recipeCards.setCurrent);
  const [isSetting, setIsSetting] = useState(false);
  const [error, setError] = useState(false);
  const isCurrent = currentId === recipeId;

  async function select() {
    setIsSetting(true);
    setError(false);
    try {
      await setCurrent({ recipeId: recipeId as Id<"recipes"> });
    } catch {
      setError(true);
    } finally {
      setIsSetting(false);
    }
  }

  return (
    <div className={className}>
      <Button className="h-full w-full" size={size} variant={isCurrent ? "secondary" : (variant ?? "default")} disabled={isCurrent || isSetting || currentId === undefined} onClick={() => void select()}>
        {isCurrent ? <Check size={16} /> : <CookingPot size={16} />}
        {isCurrent ? "Current recipe" : isSetting ? "Setting…" : "Set as current"}
      </Button>
      {error && <p className="mt-2 text-xs font-bold text-red-700" role="alert">Couldn&apos;t set the current recipe.</p>}
    </div>
  );
}
