"use client";

import { useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { GroceryListEditor } from "@/components/grocery/grocery-list-editor";
import { Skeleton } from "@/components/ui/skeleton";
import type { GroceryItem } from "@/lib/data/types";

export function SavedGroceryList({ listId }: { listId: string }) {
  const data = useQuery(api.groceryLists.get, {
    listId: listId as Id<"groceryLists">,
  });

  if (data === undefined) {
    return <Skeleton className="h-96" aria-label="Loading grocery list" />;
  }
  if (data === null) {
    return (
      <p className="rounded-xl border border-border bg-white p-6">
        This grocery list could not be found.
      </p>
    );
  }

  const items: GroceryItem[] = data.items.map((item) => ({
    id: item._id,
    name: item.name,
    quantity: item.quantityText ?? item.quantity?.toString() ?? "",
    unit: item.unit ?? "",
    category: item.category ?? "Other",
    source: data.list.sourceRecipeTitle,
    checked: item.isChecked,
  }));

  return (
    <GroceryListEditor
      initialItems={items}
      initialName={data.list.name}
      listId={data.list._id}
    />
  );
}
