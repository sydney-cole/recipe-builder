"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MEAL_LABELS, MEALS, type Meal } from "@/convex/lib/plannerRules";
import type { WeekStart } from "@/convex/lib/plannerSlots";

const WEEK_STARTS: { value: WeekStart; label: string }[] = [
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
];

/** People cooked for: rounded and clamped to 1–12; blank or invalid becomes 1 (§2.7). */
function normalizePeople(value: string) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(12, Math.max(1, Math.round(parsed)));
}

type PreferencesProps = {
  plannerId: Id<"planners">;
  weekStart: WeekStart;
  people: number;
  meals: readonly Meal[];
  onWeekStartChange: (weekStart: WeekStart) => void;
};

export function PlannerPreferencesDialog({
  open,
  onOpenChange,
  ...props
}: PreferencesProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Planner settings</DialogTitle>
        <DialogDescription>Choose the day your week starts, the meals you plan and how many people you cook for.</DialogDescription>
        {/* Mounted only while open, so each opening starts from the saved values. */}
        <PreferencesFields {...props} />
      </DialogContent>
    </Dialog>
  );
}

function PreferencesFields({ plannerId, weekStart, people, meals, onWeekStartChange }: PreferencesProps) {
  const updatePreferences = useMutation(api.planner.updatePreferences);
  const [peopleDraft, setPeopleDraft] = useState(String(people));
  // Shows the choice while it saves; the week moves only once it has saved.
  const [weekStartDraft, setWeekStartDraft] = useState(weekStart);
  const [mealsDraft, setMealsDraft] = useState<readonly Meal[]>(meals);
  const [error, setError] = useState(false);

  /** Saves one setting; resolves to whether it saved. */
  async function save(patch: { weekStart?: WeekStart; people?: number; meals?: Meal[] }) {
    setError(false);
    try {
      await updatePreferences({ plannerId, ...patch });
      return true;
    } catch {
      setError(true);
      return false;
    }
  }

  async function changeWeekStart(next: WeekStart) {
    setWeekStartDraft(next);
    if (await save({ weekStart: next })) onWeekStartChange(next);
    else setWeekStartDraft(weekStart);
  }

  async function toggleMeal(meal: Meal, on: boolean) {
    const previous = mealsDraft;
    const next = MEALS.filter((candidate) => (candidate === meal ? on : previous.includes(candidate)));
    if (next.length === 0) return;
    setMealsDraft(next);
    if (!(await save({ meals: next }))) setMealsDraft(previous);
  }

  function commitPeople() {
    const next = normalizePeople(peopleDraft);
    setPeopleDraft(String(next));
    if (next !== people) void save({ people: next });
  }

  return (
    <div className="mt-5 grid gap-4">
      <label className="grid gap-1.5 text-sm font-bold">
        Week starts on
        <select
          className="input"
          value={weekStartDraft}
          onChange={(event) => void changeWeekStart(Number(event.target.value) as WeekStart)}
        >
          {WEEK_STARTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <fieldset className="planner-meals-field">
        <legend>Meals to plan</legend>
        <div className="planner-meals-options">
          {MEALS.map((meal) => {
            const checked = mealsDraft.includes(meal);
            // The last meal left on can't be turned off: a planner plans at least one meal.
            const last = checked && mealsDraft.length === 1;
            return (
              <label key={meal} className="planner-meal-option">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={last}
                  aria-describedby={last ? "planner-meals-hint" : undefined}
                  onChange={(event) => void toggleMeal(meal, event.target.checked)}
                />
                {MEAL_LABELS[meal]}
              </label>
            );
          })}
        </div>
        <p id="planner-meals-hint" className="planner-meals-hint">
          {mealsDraft.length === 1 ? "Plan at least one meal. " : ""}Meals you turn off are hidden; anything planned for them comes back if you turn them on again.
        </p>
      </fieldset>
      <label className="grid gap-1.5 text-sm font-bold">
        People you cook for, yourself included
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={12}
          step={1}
          value={peopleDraft}
          onChange={(event) => setPeopleDraft(event.target.value)}
          onBlur={commitPeople}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitPeople();
            }
          }}
        />
      </label>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">Couldn’t save that setting. Try again.</p>}
    </div>
  );
}
