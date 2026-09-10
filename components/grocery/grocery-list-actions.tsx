"use client";

import { useMutation, useQuery } from "convex/react";
import { ListPlus, MoreHorizontal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export function GroceryListActions({ listId }: { listId: string }) {
  const lists = useQuery(api.groceryLists.listMine);
  const combineLists = useMutation(api.groceryLists.combineLists);
  const removeList = useMutation(api.groceryLists.removeList);
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [combineOpen, setCombineOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [otherListId, setOtherListId] = useState("");
  const [combinedName, setCombinedName] = useState("");
  const [working, setWorking] = useState<"combine" | "delete" | null>(null);
  const [error, setError] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  const otherLists = useMemo(
    () => lists?.filter((list) => list._id !== listId) ?? [],
    [listId, lists],
  );
  const selectedOtherListId = otherListId;
  const currentList = lists?.find((list) => list._id === listId);

  function suggestedName(otherId: string) {
    const otherList = otherLists.find((list) => list._id === otherId);
    return `${currentList?.name ?? "Grocery list"} + ${otherList?.name ?? "Grocery list"}`.slice(
      0,
      200,
    );
  }

  async function combine() {
    if (!selectedOtherListId || !combinedName.trim()) return;
    setError("");
    setWorking("combine");
    try {
      const combinedListId = await combineLists({
        listId: listId as Id<"groceryLists">,
        otherListId: selectedOtherListId as Id<"groceryLists">,
        requestId,
        name: combinedName,
      });
      setCombineOpen(false);
      router.push(`/app/grocery-lists/${combinedListId}`);
    } catch {
      setError("Couldn’t combine these lists. Please try again.");
      setWorking(null);
    }
  }

  async function remove() {
    setError("");
    setWorking("delete");
    try {
      await removeList({ listId: listId as Id<"groceryLists"> });
      setDeleteOpen(false);
      router.replace("/app/grocery-lists");
    } catch {
      setError("Couldn’t delete this list. Please try again.");
      setWorking(null);
    }
  }

  return (
    <>
      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          aria-label="More list options"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MoreHorizontal />
        </Button>
        {menuOpen && (
          <div
            className="absolute right-0 top-11 z-20 min-w-48 rounded-xl border border-border bg-white p-2 shadow-lg"
            role="menu"
          >
            <button
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold hover:bg-surface-subtle"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setError("");
                setOtherListId("");
                setCombinedName("");
                setCombineOpen(true);
              }}
            >
              <ListPlus size={17} />
              Combine lists
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold text-red-700 hover:bg-red-50"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setError("");
                setDeleteOpen(true);
              }}
            >
              <Trash2 size={17} />
              Delete list
            </button>
          </div>
        )}
      </div>

      <Dialog open={combineOpen} onOpenChange={setCombineOpen}>
        <DialogContent>
          <DialogTitle>Combine grocery lists</DialogTitle>
          <DialogDescription>
            Choose another list and name the result. PerfectPlate will merge
            both lists and remove the originals.
          </DialogDescription>
          {otherLists.length === 0 ? (
            <p className="mt-5 rounded-lg bg-surface-subtle p-4 text-sm">
              Create another grocery list before combining lists.
            </p>
          ) : (
            <label className="mt-5 block">
              <span className="mb-2 block text-sm font-extrabold">
                Combine with
              </span>
              <select
                className="h-11 w-full rounded-lg border border-border bg-white px-3"
                value={selectedOtherListId}
                onChange={(event) => {
                  setOtherListId(event.target.value);
                  setCombinedName(suggestedName(event.target.value));
                }}
              >
                <option value="" disabled hidden>
                  Choose a list
                </option>
                {otherLists.map((list) => (
                  <option key={list._id} value={list._id}>
                    {list.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {otherLists.length > 0 && (
            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-extrabold">
                New list name
              </span>
              <Input
                className="h-11 w-full rounded-lg border border-border bg-white px-3"
                value={combinedName}
                onChange={(event) => setCombinedName(event.target.value)}
                maxLength={200}
              />
            </label>
          )}
          {error && (
            <p className="mt-3 text-sm font-bold text-red-700" role="alert">
              {error}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setCombineOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={combine}
              disabled={
                !selectedOtherListId ||
                !combinedName.trim() ||
                working === "combine"
              }
            >
              <ListPlus size={17} />
              {working === "combine" ? "Combining…" : "Create combined list"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogTitle>Delete this grocery list?</DialogTitle>
          <DialogDescription>
            This removes the list and its items from your Grocery lists tab. It
            does not delete any recipes.
          </DialogDescription>
          {error && (
            <p className="mt-3 text-sm font-bold text-red-700" role="alert">
              {error}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-red-700 hover:bg-red-800"
              onClick={remove}
              disabled={working === "delete"}
            >
              <Trash2 size={17} />
              {working === "delete" ? "Deleting…" : "Delete list"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
