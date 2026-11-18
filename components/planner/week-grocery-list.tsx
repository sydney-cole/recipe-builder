"use client";

import { useMutation, useQuery } from "convex/react";
import { RefreshCw, ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { NotIncludedReason } from "@/convex/lib/planGrocery";
import { formatDay } from "@/convex/lib/plannerSlots";

const REASONS: Record<NotIncludedReason, string> = {
  "no-recipe": "no recipe is linked",
  "recipe-unavailable": "the recipe was removed",
  "import-pending": "the recipe link hasn’t been saved yet",
  "no-ingredients": "the recipe has no ingredients",
};

function syncedLabel(syncedAt: number) {
  return new Date(syncedAt).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The planner week's grocery list: create it, open it, or update it from the plan. */
export function WeekGroceryList({ plannerId, start }: { plannerId: Id<"planners">; start: string }) {
  const status = useQuery(api.plannerGrocery.forWeek, { plannerId, start });
  const syncWeek = useMutation(api.plannerGrocery.syncWeek);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function sync() {
    setBusy(true);
    setFailed(false);
    try {
      await syncWeek({ plannerId, start });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (status === undefined) return null;
  const list = status.list;

  return (
    <section className="planner-grocery" aria-labelledby="planner-grocery-heading">
      <div className="planner-grocery-head">
        <h3 id="planner-grocery-heading" className="planner-grocery-title">
          <ShoppingBasket size={18} aria-hidden="true" />
          Grocery list
        </h3>
        <div className="planner-grocery-actions">
          {list === null ? (
            <Button onClick={() => void sync()} disabled={busy}>
              {busy ? "Creating…" : "Create grocery list"}
            </Button>
          ) : (
            <>
              <Button asChild variant="secondary">
                <Link href={`/app/grocery-lists/${list.listId}`} aria-label={`Open ${list.name}`}>
                  Open list
                </Link>
              </Button>
              <Button onClick={() => void sync()} disabled={busy}>
                <RefreshCw size={16} aria-hidden="true" />
                {busy ? "Updating…" : "Update from plan"}
              </Button>
            </>
          )}
        </div>
      </div>
      {list === null ? (
        <p className="planner-grocery-note">Make a shopping list from this week’s cooked meals.</p>
      ) : (
        <p className="planner-grocery-note" role="status">
          {list.syncedAt !== undefined && <>Last updated from the plan {syncedLabel(list.syncedAt)}. </>}
          {list.changed && <strong className="planner-warn">The plan has changed since.</strong>}
        </p>
      )}
      {list !== null && list.notIncluded.length > 0 && (
        <div className="planner-grocery-missing">
          <p className="planner-grocery-note">Not included:</p>
          <ul>
            {list.notIncluded.map((item) => (
              <li key={`${item.date}-${item.meal}`}>
                {item.name || "Unnamed meal"} ({formatDay(item.date).dow} {item.meal}): {REASONS[item.reason]}
              </li>
            ))}
          </ul>
        </div>
      )}
      {failed && (
        <p className="planner-error" role="alert">
          Couldn’t update the grocery list. Try again.
        </p>
      )}
    </section>
  );
}
