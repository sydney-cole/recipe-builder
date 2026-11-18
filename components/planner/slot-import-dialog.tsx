"use client";

import { useMutation } from "convex/react";
import { Link2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Meal } from "@/convex/lib/plannerRules";
import { announceRecipeImport } from "@/lib/recipe-import-events";
import { usePlannerUndo } from "./planner-undo";

/**
 * "Import from link" for a slot holding a typed name: the app's usual import
 * (a preview the user reviews and saves), attached to the slot once saved.
 */
export function SlotImportDialog({
  plannerId,
  date,
  meal,
  name,
  open,
  onOpenChange,
  onStarted,
}: {
  plannerId: Id<"planners">;
  date: string;
  meal: Meal;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStarted: (importId: Id<"recipeImports">) => void;
}) {
  const importLink = useMutation(api.planner.importLink);
  const { expectChange } = usePlannerUndo();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    expectChange();
    try {
      const importId = await importLink({ plannerId, date, meal, url: url.trim() });
      announceRecipeImport(importId);
      setUrl("");
      onOpenChange(false);
      onStarted(importId);
    } catch {
      setError("We couldn’t import that link. Check that it starts with https:// and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent>
        <DialogTitle>Import a recipe for {name}</DialogTitle>
        <DialogDescription>
          Paste the recipe’s web address. You’ll review the imported recipe, and once you save it to your Recipe Book this meal uses it.
        </DialogDescription>
        <form className="mt-5 grid gap-3" onSubmit={(event) => void submit(event)}>
          <label className="grid gap-1 text-sm font-bold">
            Recipe link
            <Input type="url" inputMode="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/recipe" />
          </label>
          <Button type="submit" disabled={busy}><Link2 size={17} aria-hidden="true" />{busy ? "Starting import…" : "Import recipe"}</Button>
        </form>
        {error && <p className="mt-3 text-sm font-bold text-red-700" role="alert">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
