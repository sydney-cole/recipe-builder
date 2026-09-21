"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, ShoppingBasket } from "lucide-react";
import { GroceryListActions } from "@/components/grocery/grocery-list-actions";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";

export function GroceryListCard({ list }: { list: Doc<"groceryLists"> }) {
  const summary = useQuery(api.groceryLists.summary, { listId: list._id });
  const progress = useQuery(api.groceryLists.itemProgress, { listId: list._id });
  const remaining = progress ? progress.total - progress.checked : undefined;

  return (
    <Card className="recipe-card relative h-64 min-w-0">
      <div className="absolute right-3 top-3 z-10">
        <GroceryListActions listId={list._id} listName={list.name} />
      </div>
      <Link
        className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        href={`/app/grocery-lists/${list._id}`}
        aria-label={`Open ${list.name}`}
      >
        <CardContent className="flex h-full min-w-0 flex-col p-6 pr-14">
          <span className="grid size-12 place-items-center rounded-xl bg-primary-soft text-primary">
            <ShoppingBasket />
          </span>
          {summary?.isComplete && (
            <p className="mt-4 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[.08em] text-primary">
              <CheckCircle2 size={15} />
              List Completed
            </p>
          )}
          <h2
            className={`${summary?.isComplete ? "mt-2" : "mt-5"} truncate text-xl font-extrabold`}
            title={list.name}
          >
            {list.name}
          </h2>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {list.sourceRecipeTitle
              ? `From ${list.sourceRecipeTitle}`
              : "Manual grocery list"}
          </p>
          <div className="mt-auto">
            {progress && progress.total > 0 && (
              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-subtle">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${(progress.checked / progress.total) * 100}%` }}
                />
              </div>
            )}
            <div className="flex items-center justify-between border-t border-border pt-4 text-sm">
              <span className="text-muted-foreground">
                <CalendarDays className="inline" size={16} /> {remaining === undefined
                  ? "Loading…"
                  : `${remaining} of ${progress!.total} left`} · {new Date(list.updatedAt).toLocaleDateString()}
              </span>
              <ArrowRight size={18} />
            </div>
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}
