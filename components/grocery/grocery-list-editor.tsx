"use client";

import { useMutation } from "convex/react";
import { Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { groceryItems as defaultItems } from "@/lib/data/mock-data";
import type { GroceryItem } from "@/lib/data/types";

export function GroceryListEditor({
  initialItems = defaultItems,
  initialName = "Untitled grocery list",
  listId,
  canSave = true,
}: {
  initialItems?: GroceryItem[];
  initialName?: string;
  listId?: string;
  canSave?: boolean;
}) {
  const saveList = useMutation(api.groceryLists.save);
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [listName, setListName] = useState(initialName);
  const [name, setName] = useState("");
  const [removed, setRemoved] = useState<GroceryItem | null>(null);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [requestId] = useState(() => crypto.randomUUID());
  const persistedItemIds = useRef(
    new Set(listId === undefined ? [] : initialItems.map((item) => item.id)),
  );
  const groups = useMemo(
    () =>
      Object.entries(
        items.reduce<Record<string, GroceryItem[]>>((grouped, item) => {
          (grouped[item.category] ??= []).push(item);
          return grouped;
        }, {}),
      ),
    [items],
  );

  function markChanged() {
    if (saveState !== "idle") setSaveState("idle");
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
      await saveList({
        listId: listId as Id<"groceryLists"> | undefined,
        requestId,
        name: listName,
        items: items.map((item, index) => ({
          itemId: persistedItemIds.current.has(item.id)
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
      setSaveState("saved");
      router.replace("/app/grocery-lists");
    } catch {
      setSaveState("error");
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="stack">
        <Card>
          <CardContent className="stack">
            <label>
              <span className="mb-2 block text-sm font-extrabold">List name</span>
              <Input
                value={listName}
                onChange={(event) => {
                  markChanged();
                  setListName(event.target.value);
                }}
                maxLength={200}
              />
            </label>
            <form className="flex flex-col gap-3 sm:flex-row" onSubmit={addItem}>
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
          <section key={category} aria-labelledby={`group-${category}`}>
            <h2
              id={`group-${category}`}
              className="mb-2 text-sm font-extrabold uppercase tracking-[.08em] text-muted-foreground"
            >
              {category}
            </h2>
            <Card>
              <CardContent className="divide-y divide-border p-0">
                {categoryItems.map((item) => (
                  <div className="grocery-row" key={item.id}>
                    <Checkbox
                      checked={item.checked}
                      onCheckedChange={(checked) =>
                        updateItem(item.id, { checked: checked === true })
                      }
                      aria-label={`Mark ${item.name} complete`}
                    />
                    <Input
                      className={`ingredient-name ${item.checked ? "line-through opacity-55" : ""}`}
                      value={item.name}
                      onChange={(event) =>
                        updateItem(item.id, { name: event.target.value })
                      }
                      aria-label="Ingredient"
                    />
                    <Input
                      className="quantity-input"
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
              <Button
                className="mt-5 w-full"
                onClick={persistList}
                disabled={saveState === "saving" || listName.trim().length === 0}
              >
                <Save size={17} />
                {saveState === "saving"
                  ? "Saving…"
                  : listId === undefined
                    ? "Save list"
                    : "Update list"}
              </Button>
            )}
            {saveState === "saved" && (
              <p className="mt-3 text-sm font-bold text-primary" role="status">
                List saved.
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
    </div>
  );
}
