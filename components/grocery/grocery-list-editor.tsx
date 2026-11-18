"use client";

import { useMutation } from "convex/react";
import { Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { groceryCategoryOrder } from "@/convex/lib/groceryCategory";
import type { GroceryItem } from "@/lib/data/types";
import { UnsavedChangesBar, UnsavedNotice, useIsPhone } from "./unsaved-changes-bar";

export function GroceryListEditor({
  initialItems,
  initialName = "Untitled grocery list",
  listId,
  needsInitialSave = listId === undefined,
  canSave = true,
  initialSaveState = "idle",
  onSaved,
}: {
  initialItems: GroceryItem[];
  initialName?: string;
  listId?: string;
  needsInitialSave?: boolean;
  canSave?: boolean;
  initialSaveState?: "idle" | "saved";
  onSaved?: () => void;
}) {
  const saveList = useMutation(api.groceryLists.save);
  const updateSavedItem = useMutation(api.groceryLists.updateItem);
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [serverItems, setServerItems] = useState(initialItems);
  const [dirty, setDirty] = useState(false);
  const [checkError, setCheckError] = useState(false);
  const [listName, setListName] = useState(initialName);
  const [name, setName] = useState("");
  const [removed, setRemoved] = useState<GroceryItem | null>(null);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >(initialSaveState);
  const [requestId] = useState(() => crypto.randomUUID());
  const isPhone = useIsPhone();
  const persistedItemIds = useMemo(
    () => new Set(listId === undefined ? [] : serverItems.map((item) => item.id)),
    [listId, serverItems],
  );

  // The saved list can change while this editor is open (a recipe added from
  // another tab, an item checked off on a phone). Fold those changes into the
  // local draft instead of letting the next save overwrite them.
  if (listId !== undefined && serverItems !== initialItems) {
    const previousById = new Map(serverItems.map((item) => [item.id, item]));
    const nextById = new Map(initialItems.map((item) => [item.id, item]));
    setServerItems(initialItems);
    setItems((current) => [
      ...current
        .filter((item) => !previousById.has(item.id) || nextById.has(item.id))
        .map((item) => {
          const previous = previousById.get(item.id);
          const next = nextById.get(item.id);
          return previous && next && previous.checked !== next.checked
            ? { ...item, checked: next.checked }
            : item;
        }),
      ...initialItems.filter((item) => !previousById.has(item.id)),
    ]);
  }

  const groups = useMemo(
    () =>
      Object.entries(
        items.reduce<Record<string, GroceryItem[]>>((grouped, item) => {
          (grouped[item.category] ??= []).push(item);
          return grouped;
        }, {}),
      ).sort(
        ([first], [second]) =>
          groceryCategoryOrder(first) - groceryCategoryOrder(second),
      ),
    [items],
  );

  useEffect(() => {
    if (!dirty) return;
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  function markChanged() {
    setDirty(true);
    if (saveState !== "idle") setSaveState("idle");
  }

  async function toggleChecked(item: GroceryItem, checked: boolean) {
    if (!persistedItemIds.has(item.id)) {
      updateItem(item.id, { checked });
      return;
    }
    // Check-offs happen in the store aisle, so they are saved immediately
    // rather than waiting for the next explicit list save.
    setCheckError(false);
    setItems((current) =>
      current.map((candidate) =>
        candidate.id === item.id ? { ...candidate, checked } : candidate,
      ),
    );
    try {
      await updateSavedItem({
        itemId: item.id as Id<"groceryListItems">,
        isChecked: checked,
      });
    } catch {
      setCheckError(true);
      setItems((current) =>
        current.map((candidate) =>
          candidate.id === item.id
            ? { ...candidate, checked: !checked }
            : candidate,
        ),
      );
    }
  }

  function updateItem(id: string, patch: Partial<GroceryItem>) {
    markChanged();
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function removeItem(item: GroceryItem) {
    markChanged();
    setItems((current) =>
      current.filter((candidate) => candidate.id !== item.id),
    );
    setRemoved(item);
  }

  function addItem(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    markChanged();
    setItems((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name: name.trim(),
        quantity: "1",
        unit: "",
        category: "Other",
        checked: false,
      },
    ]);
    setName("");
  }

  async function persistList() {
    setSaveState("saving");
    try {
      const savedListId = await saveList({
        listId: listId as Id<"groceryLists"> | undefined,
        requestId,
        name: listName,
        removedItemIds: [...persistedItemIds].filter(
          (id) => !items.some((item) => item.id === id),
        ) as Id<"groceryListItems">[],
        items: items.map((item, index) => ({
          itemId: persistedItemIds.has(item.id)
            ? (item.id as Id<"groceryListItems">)
            : undefined,
          name: item.name,
          quantityText: item.quantity || null,
          unit: item.unit || null,
          category: item.category || null,
          notes: null,
          isChecked: item.checked,
          sortOrder: index + 1,
        })),
      });
      setDirty(false);
      setSaveState("saved");
      if (listId === undefined) router.replace(`/app/grocery-lists/${savedListId}`);
      else onSaved?.();
    } catch {
      setSaveState("error");
    }
  }

  const saveDisabled =
    saveState === "saving" ||
    listName.trim().length === 0 ||
    (!dirty && !needsInitialSave);
  const saveLabel =
    saveState === "saving" ? "Saving…" : needsInitialSave ? "Save list" : "Update list";
  const showBar = isPhone && canSave && dirty && saveState !== "saved";

  return (
    <div className={`grid gap-6 xl:grid-cols-[1fr_320px]${showBar ? " has-unsaved-bar" : ""}`}>
      <div className="stack">
        <Card>
          <CardContent className="grocery-head stack">
            <label>
              <span className="grocery-name-label mb-2 block text-sm font-extrabold">List name</span>
              <Input
                value={listName}
                onChange={(event) => {
                  markChanged();
                  setListName(event.target.value);
                }}
                maxLength={200}
              />
            </label>
            <form className="grocery-add flex flex-col gap-3 sm:flex-row" onSubmit={addItem}>
              <label className="flex-1">
                <span className="sr-only">Ingredient name</span>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Add an ingredient"
                />
              </label>
              <Button type="submit">
                <Plus size={17} />
                Add item
              </Button>
            </form>
          </CardContent>
        </Card>
        {groups.map(([category, categoryItems]) => (
          <section key={category} aria-labelledby={`group-${category.replace(/\W+/g, "-")}`}>
            <h2
              id={`group-${category.replace(/\W+/g, "-")}`}
              className="mb-2 text-sm font-extrabold uppercase tracking-[.08em] text-muted-foreground"
            >
              {category}
            </h2>
            <Card>
              <CardContent className="grocery-items divide-y divide-border">
                {categoryItems.map((item) => (
                  <div className="grocery-row" key={item.id}>
                    <Checkbox
                      checked={item.checked}
                      onCheckedChange={(checked) =>
                        void toggleChecked(item, checked === true)
                      }
                      aria-label={`Mark ${item.name} complete`}
                    />
                    <Input
                      className={`ingredient-name ${item.checked ? "is-checked" : ""}`}
                      value={item.name}
                      onChange={(event) =>
                        updateItem(item.id, { name: event.target.value })
                      }
                      aria-label="Ingredient"
                    />
                    <Input
                      className="quantity-input"
                      inputMode="decimal"
                      value={item.quantity}
                      onChange={(event) =>
                        updateItem(item.id, { quantity: event.target.value })
                      }
                      aria-label={`Quantity for ${item.name}`}
                    />
                    <Input
                      className="unit-input"
                      value={item.unit}
                      onChange={(event) =>
                        updateItem(item.id, { unit: event.target.value })
                      }
                      aria-label={`Unit for ${item.name}`}
                      placeholder="unit"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${item.name}`}
                      onClick={() => removeItem(item)}
                    >
                      <Trash2 size={17} />
                    </Button>
                    {item.source && (
                      <p className="item-source">From {item.source}</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        ))}
      </div>
      <aside className="stack self-start xl:sticky xl:top-20">
        <Card>
          <CardContent>
            <p className="eyebrow">List summary</p>
            <p className="font-display text-4xl font-semibold">
              {items.filter((item) => !item.checked).length}
            </p>
            <p className="text-sm text-muted-foreground">items left to pick up</p>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-surface-subtle">
              <div
                className="h-full bg-primary"
                style={{
                  width: `${items.length ? (items.filter((item) => item.checked).length / items.length) * 100 : 0}%`,
                }}
              />
            </div>
            {canSave && (
              <Button className="mt-5 w-full" onClick={persistList} disabled={saveDisabled}>
                <Save size={17} />
                {saveLabel}
              </Button>
            )}
            {saveState === "saved" && (
              <p className="mt-3 text-sm font-bold text-primary" role="status">
                List saved.
              </p>
            )}
            {dirty && saveState === "idle" && (
              <UnsavedNotice className="mt-3" role="status" />
            )}
            {checkError && (
              <p className="mt-3 text-sm font-bold text-red-700" role="alert">
                Couldn&apos;t save that check mark. Try again.
              </p>
            )}
            {saveState === "error" && (
              <p className="mt-3 text-sm font-bold text-red-700" role="alert">
                Couldn&apos;t save this list. Try again.
              </p>
            )}
          </CardContent>
        </Card>
        {removed && (
          <div
            className="rounded-xl border border-border bg-white p-4 text-sm shadow-sm"
            role="status"
          >
            <p>
              <strong>{removed.name}</strong> removed.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => {
                markChanged();
                setItems((current) => [...current, removed]);
                setRemoved(null);
              }}
            >
              <RotateCcw size={15} />
              Undo
            </Button>
          </div>
        )}
      </aside>
      {showBar && (
        <UnsavedChangesBar>
          <Button onClick={persistList} disabled={saveDisabled}>
            <Save size={17} />
            {saveLabel}
          </Button>
        </UnsavedChangesBar>
      )}
    </div>
  );
}
