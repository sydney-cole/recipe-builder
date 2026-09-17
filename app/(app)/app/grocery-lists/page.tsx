"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Plus, ShoppingBasket } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";

const newListHref = "/app/grocery-lists/new";

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
          lists.map((list) => (
            <Link
              className="h-full min-w-0"
              href={`/app/grocery-lists/${list._id}`}
              key={list._id}
            >
              <Card className="recipe-card h-64">
                <CardContent className="flex h-full min-w-0 flex-col p-6">
                  <span className="grid size-12 place-items-center rounded-xl bg-primary-soft text-primary">
                    <ShoppingBasket />
                  </span>
                  <h2
                    className="mt-5 truncate text-xl font-extrabold"
                    title={list.name}
                  >
                    {list.name}
                  </h2>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {list.sourceRecipeTitle
                      ? `From ${list.sourceRecipeTitle}`
                      : "Manual grocery list"}
                  </p>
                  <div className="mt-auto flex items-center justify-between border-t border-border pt-4 text-sm">
                    <span className="text-muted-foreground">
                      <CalendarDays className="inline" size={16} /> Saved list
                    </span>
                    <ArrowRight size={18} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
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
