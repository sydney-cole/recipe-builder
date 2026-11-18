"use client";

import { useMutation } from "convex/react";
import { BookMinus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

/**
 * Removes a recipe after a confirmation: the owner's own recipe is removed
 * (soft-deleted); someone else's recipe only leaves this user's Recipe Book.
 * The button uses the destructive style so it reads as removal on a phone,
 * where there is no hover state to tell it apart.
 */
export function RemoveRecipeButton({
  recipeId,
  title,
  owned,
  onRemoved,
  className,
  label,
}: {
  recipeId: Id<"recipes">;
  title: string;
  /** Whether the user owns the recipe (and so may remove it outright). */
  owned: boolean;
  onRemoved?: () => void;
  className?: string;
  /** The visible label; the accessible name always says which recipe. */
  label?: string;
}) {
  const removeCard = useMutation(api.recipeCards.removeCard);
  const removeFromBook = useMutation(api.recipeCards.removeFromBook);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  const Icon = owned ? Trash2 : BookMinus;
  const visible = label ?? (owned ? "Remove recipe" : "Remove from Recipe Book");

  async function remove() {
    setError("");
    setRemoving(true);
    try {
      if (owned) await removeCard({ recipeId });
      else await removeFromBook({ recipeId });
      setConfirming(false);
      onRemoved?.();
    } catch {
      setError("We couldn’t remove this recipe. Try again.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <>
      <Button
        variant="destructive"
        className={cn("remove-recipe-button", className)}
        aria-label={label === undefined ? undefined : `${visible}: ${title}`}
        onClick={() => { setError(""); setConfirming(true); }}
      >
        <Icon size={16} aria-hidden="true" />
        {visible}
      </Button>
      <Dialog open={confirming} onOpenChange={(open) => { if (!removing) setConfirming(open); }}>
        <DialogContent>
          <DialogTitle>{owned ? "Remove this recipe?" : "Remove from your Recipe Book?"}</DialogTitle>
          <DialogDescription>
            {owned
              ? `${title} and your notes on it will be removed. Planned meals using it will show it was removed. Grocery lists made from it will remain.`
              : `${title} and your notes on it will leave your Recipe Book. Grocery lists made from it will remain.`}
          </DialogDescription>
          {error && <p className="mt-4 text-sm font-bold text-red-700" role="alert">{error}</p>}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Button variant="secondary" disabled={removing} onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="destructive" disabled={removing} onClick={() => void remove()}>{removing ? "Removing…" : "Remove"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
