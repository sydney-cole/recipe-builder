"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatWeekRange } from "@/convex/lib/plannerSlots";
import { usePlannerUndo } from "./planner-undo";

type WeekChoice = FunctionReturnType<typeof api.plannerCopy.recentWeeks>[number];
type Mode = "fill" | "replace";

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** "9 meals planned: 5 cook, 2 leftovers, 1 eat out, 1 skip". */
export function weekChoiceSummary(week: WeekChoice) {
  if (week.planned === 0) return "Nothing planned";
  const parts = [
    week.cook && `${week.cook} cook`,
    week.left && `${week.left} leftovers`,
    week.out && `${week.out} eat out`,
    week.skip && `${week.skip} skip`,
  ].filter(Boolean);
  return `${plural(week.planned, "meal")} planned: ${parts.join(", ")}`;
}

/**
 * Copy from…: fills the shown week from an earlier one. When the week
 * already has planned slots, asks whether to fill only the empty ones or
 * replace everything. The copy undoes as one step.
 */
export function CopyWeekButton({
  plannerId,
  start,
  planned,
  disabled,
}: {
  /** Undefined until the planner has loaded. */
  plannerId: Id<"planners"> | undefined;
  start: string;
  /** Slots already planned in the shown week. */
  planned: number;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" disabled={disabled || plannerId === undefined} onClick={() => setOpen(true)}>
        <Copy size={16} aria-hidden="true" />
        Copy from…
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Copy from an earlier week</DialogTitle>
          <DialogDescription>
            Fill {formatWeekRange(start)} with an earlier week’s meals, day for day. The grocery list isn’t changed.
          </DialogDescription>
          {/* Mounted only while open, so each opening starts at the list of weeks. */}
          {open && plannerId !== undefined && (
            <CopyWeekChoices
              plannerId={plannerId}
              start={start}
              planned={planned}
              onDone={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CopyWeekChoices({
  plannerId,
  start,
  planned,
  onDone,
}: {
  plannerId: Id<"planners">;
  start: string;
  planned: number;
  onDone: () => void;
}) {
  const { expectChange } = usePlannerUndo();
  const weeks = useQuery(api.plannerCopy.recentWeeks, { plannerId, start });
  const copyWeek = useMutation(api.plannerCopy.copyWeek);
  const [chosen, setChosen] = useState<WeekChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy(week: WeekChoice, mode: Mode) {
    setBusy(true);
    setFailed(false);
    expectChange();
    try {
      await copyWeek({ plannerId, fromStart: week.start, toStart: start, mode });
      onDone();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  function choose(week: WeekChoice) {
    if (planned === 0) void copy(week, "fill");
    else setChosen(week);
  }

  const error = failed && (
    <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">Couldn’t copy that week. Try again.</p>
  );

  if (chosen !== null) {
    return (
      <div className="mt-5 grid gap-3">
        <p className="text-sm leading-6">
          {formatWeekRange(start)} already has {plural(planned, "meal")} planned. Copy {formatWeekRange(chosen.start)} into it how?
        </p>
        <div className="planner-copy-actions">
          <Button disabled={busy} onClick={() => void copy(chosen, "fill")}>Fill empty slots only</Button>
          <Button variant="destructive" disabled={busy} onClick={() => void copy(chosen, "replace")}>Replace everything</Button>
          <Button variant="ghost" disabled={busy} onClick={() => setChosen(null)}>Back</Button>
        </div>
        {error}
      </div>
    );
  }

  if (weeks === undefined) return <p className="mt-5 text-sm text-muted-foreground" role="status">Loading recent weeks…</p>;
  return (
    <div className="mt-5 grid gap-3">
      <ul className="planner-copy-weeks" aria-label="Weeks to copy from">
        {weeks.map((week, index) => (
          <li key={week.start}>
            <button
              type="button"
              className="planner-copy-week"
              disabled={busy || week.planned === 0}
              onClick={() => choose(week)}
            >
              <span className="planner-option-label">
                {index === 0 ? `Last week (${formatWeekRange(week.start)})` : formatWeekRange(week.start)}
              </span>
              <span className="planner-option-detail">{weekChoiceSummary(week)}</span>
            </button>
          </li>
        ))}
      </ul>
      {weeks.length === 1 && weeks[0].planned === 0 && (
        <p className="text-sm text-muted-foreground">No meals were planned in the last few weeks.</p>
      )}
      {error}
    </div>
  );
}
