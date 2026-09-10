"use client";

import { useMutation } from "convex/react";
import { ShoppingBasket } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";

export function AddRecipeToListButton({
  recipeId,
  size = "default",
}: {
  recipeId: string;
  size?: "default" | "sm";
}) {
  const createFromRecipe = useMutation(api.groceryLists.createFromRecipe);
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState(false);

  async function addToList() {
    setError(false);
    setIsAdding(true);
    try {
      const listId = await createFromRecipe({
        recipeId: recipeId as Id<"recipes">,
      });
      router.push(`/app/grocery-lists/${listId}`);
    } catch {
      setError(true);
      setIsAdding(false);
    }
  }

  return (
    <div>
      <Button size={size} onClick={addToList} disabled={isAdding}>
        <ShoppingBasket size={16} />
        {isAdding ? "Creating list…" : "Create list"}
      </Button>
      {error && (
        <p className="mt-2 text-xs font-bold text-red-700" role="alert">
          Couldn&apos;t create the grocery list. Try again.
        </p>
      )}
    </div>
  );
}
