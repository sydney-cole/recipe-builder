"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Plus, ShoppingBasket } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";

const newListHref = "/app/grocery-lists/new";

function GroceryListCard({ list }: { list: Doc<"groceryLists"> }) {
  const progress = useQuery(api.groceryLists.itemProgress, { listId: list._id });
  const remaining = progress ? progress.total - progress.checked : undefined;

  return (
    <Link className="h-full min-w-0" href={`/app/grocery-lists/${list._id}`}>
      <Card className="recipe-card h-64">
        <CardContent className="flex h-full min-w-0 flex-col p-6">
          <span className="grid size-12 place-items-center rounded-xl bg-primary-soft text-primary"><ShoppingBasket /></span>
          <h2 className="mt-5 truncate text-xl font-extrabold" title={list.name}>{list.name}</h2>
          <p className="mt-1 truncate text-sm text-muted-foreground">{list.sourceRecipeTitle ? `From ${list.sourceRecipeTitle}` : "Manual grocery list"}</p>
          <div className="mt-auto">
            {progress && progress.total > 0 && <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-subtle"><div className="h-full bg-primary" style={{ width: `${(progress.checked / progress.total) * 100}%` }} /></div>}
            <div className="flex items-center justify-between border-t border-border pt-4 text-sm">
              <span className="text-muted-foreground"><CalendarDays className="inline" size={16} /> {remaining === undefined ? "Loading…" : `${remaining} of ${progress!.total} left`} · {new Date(list.updatedAt).toLocaleDateString()}</span>
              <ArrowRight size={18} />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function GroceryListsPage() {
  const lists = useQuery(api.groceryLists.listMine);

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Plan and shop"
        title="Grocery lists"
        description="Keep recipe ingredients and one-off items together, with quantities you can change."
        actions={
          <Button asChild>
            <Link href={newListHref}>
              <Plus size={17} />
              New list
            </Link>
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {lists === undefined ? (
          <Skeleton className="h-56" aria-label="Loading grocery lists" />
        ) : (
          lists.map((list) => <GroceryListCard key={list._id} list={list} />)
        )}
        <Link
          className="h-full min-w-0"
          href={newListHref}
          aria-label="Start another grocery list"
        >
          <Card className="recipe-card h-64 border-dashed">
            <CardContent className="grid h-full place-items-center text-center">
              <div>
                <Plus className="mx-auto text-muted-foreground" />
                <p className="mt-3 font-extrabold">Start another list</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  For a party, a trip, or next week.
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
