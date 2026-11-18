"use client";

import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { GroceryListEditor } from "@/components/grocery/grocery-list-editor";
import { Skeleton } from "@/components/ui/skeleton";
import { amountEdited } from "@/convex/lib/planGrocery";
import type { GroceryItem } from "@/lib/data/types";

export function SavedGroceryList({ listId }: { listId: string }) {
  const data = useQuery(api.groceryLists.get, {
    listId: listId as Id<"groceryLists">,
  });

  const [savedVersion, setSavedVersion] = useState(0);
  const items: GroceryItem[] | undefined = useMemo(
    () =>
      data?.items.map((item) => ({
        id: item._id,
        name: item.name,
        quantity: item.quantityText ?? item.quantity?.toString() ?? "",
        unit: item.unit ?? "",
        category: item.category ?? "Other",
        source: data.itemSources?.find((source) => source.itemId === item._id)?.recipeTitles.join(", ") || undefined,
        planAmount:
          item.planKey !== undefined && amountEdited(item, item)
            ? [item.planQuantityText, item.planUnit].filter(Boolean).join(" ") || undefined
            : undefined,
        checked: item.isChecked,
      })),
    [data],
  );

  if (data === undefined) {
    return <div role="status" aria-live="polite"><span className="sr-only">Loading grocery list…</span><Skeleton className="h-96" /></div>;
  }
  if (data === null || items === undefined) {
    return (
      <p className="rounded-xl border border-border bg-white p-6">
        This grocery list could not be found.
      </p>
    );
  }

  return (
    // Remounting after a save replaces the local draft, including items that
    // only had temporary client IDs, with the list as the server stored it.
    <GroceryListEditor
      key={savedVersion}
      initialSaveState={savedVersion > 0 ? "saved" : "idle"}
      onSaved={() => setSavedVersion((version) => version + 1)}
      initialItems={items}
      initialName={data.list.name}
      listId={data.list._id}
      needsInitialSave={data.list.needsInitialSave === true}
      sourceLabel={data.list.plannerId === undefined ? "From" : "For"}
    />
  );
}
