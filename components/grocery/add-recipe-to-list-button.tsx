"use client";

import { useMutation, useQuery } from "convex/react";
import { ListPlus, Plus, ShoppingBasket } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export function AddRecipeToListButton({ recipeId, size = "default", variant = "default", className }: {
  recipeId: string;
  size?: "default" | "sm";
  variant?: "default" | "secondary";
  className?: string;
}) {
  const lists = useQuery(api.groceryLists.listMine);
  const createFromRecipe = useMutation(api.groceryLists.createFromRecipe);
  const addRecipeToList = useMutation(api.groceryLists.addRecipeToList);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmingDuplicate, setConfirmingDuplicate] = useState(false);
  const [selectedListId, setSelectedListId] = useState<Id<"groceryLists"> | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState(false);
  const activeLists = Array.isArray(lists)
    ? lists.filter((list) => list.status === "active")
    : [];
  const recipeLists = Array.isArray(lists)
    ? lists.filter((list) =>
        list.sourceRecipeId === recipeId || list.sourceRecipeIds?.includes(recipeId as Id<"recipes">),
      )
    : [];

  function closeDialog() {
    setConfirmingDuplicate(false);
    setOpen(false);
  }

  async function createNewList(forceNew: boolean) {
    setError(false);
    setIsAdding(true);
    try {
      const listId = await createFromRecipe({ recipeId: recipeId as Id<"recipes">, forceNew });
      setIsAdding(false);
      setConfirmingDuplicate(false);
      setOpen(false);
      router.push(`/app/grocery-lists/${listId}`);
    } catch {
      setError(true);
      setIsAdding(false);
    }
  }

  async function addToExisting() {
    if (selectedListId === null) return;
    setError(false);
    setIsAdding(true);
    try {
      const listId = await addRecipeToList({ recipeId: recipeId as Id<"recipes">, listId: selectedListId });
      setIsAdding(false);
      setOpen(false);
      router.push(`/app/grocery-lists/${listId}`);
    } catch {
      setError(true);
      setIsAdding(false);
    }
  }

  return (
    <>
      <Button className={className} size={size} variant={variant} onClick={() => { setError(false); setConfirmingDuplicate(false); setOpen(true); }}><ShoppingBasket size={16} />Add to grocery list</Button>
      <Dialog open={open} onOpenChange={(nextOpen) => { if (!isAdding) { setOpen(nextOpen); if (!nextOpen) setConfirmingDuplicate(false); } }}>
        <DialogContent>
          {confirmingDuplicate ? (
            <>
              <DialogTitle>Recipe already in a grocery list</DialogTitle>
              <DialogDescription>You have already added this list to groceries. Want to add it again?</DialogDescription>
              <div className="mt-5 rounded-xl bg-primary-soft p-4 text-sm text-primary">
                {recipeLists.length === 1
                  ? `Existing list: ${recipeLists[0].name}`
                  : `This recipe is already used by ${recipeLists.length} grocery lists.`}
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button variant="secondary" onClick={closeDialog} disabled={isAdding}>No</Button>
                <Button onClick={() => void createNewList(true)} disabled={isAdding}><Plus size={16} />{isAdding ? "Creating…" : "Yes"}</Button>
              </div>
            </>
          ) : (
            <>
              <DialogTitle>Add to grocery list</DialogTitle>
              <DialogDescription>Create a new list from this recipe or add its ingredients to one you already use.</DialogDescription>
              <div className="mt-6 grid gap-3">
                <button
                  type="button"
                  className="flex items-center gap-4 rounded-xl border border-border p-4 text-left transition hover:border-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => recipeLists.length > 0 ? setConfirmingDuplicate(true) : void createNewList(false)}
                  disabled={isAdding || lists === undefined}
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary text-white"><Plus size={20} /></span>
                  <span><strong className="block">New grocery list</strong><small className="mt-1 block text-muted-foreground">Create a fresh list with this recipe’s ingredients.</small></span>
                </button>
                <div className="rounded-xl border border-border p-4">
                  <div className="flex items-center gap-3"><ListPlus className="text-primary" size={20} /><strong>Existing grocery list</strong></div>
                  {lists === undefined ? <p className="mt-3 text-sm text-muted-foreground" role="status">Loading your lists…</p> : activeLists.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">You don’t have an active list yet.</p> : (
                    <div className="mt-3 grid max-h-48 gap-2 overflow-auto">
                      {activeLists.map((list) => <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-surface-subtle p-3 text-sm font-bold" key={list._id}><input type="radio" name="grocery-list" value={list._id} checked={selectedListId === list._id} onChange={() => setSelectedListId(list._id)} />{list.name}</label>)}
                    </div>
                  )}
                  <Button className="mt-3 w-full" variant="secondary" disabled={selectedListId === null || isAdding} onClick={() => void addToExisting()}>{isAdding && selectedListId !== null ? "Adding…" : "Add to selected list"}</Button>
                </div>
              </div>
            </>
          )}
          {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">Couldn&apos;t add the recipe ingredients. Try again.</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}
