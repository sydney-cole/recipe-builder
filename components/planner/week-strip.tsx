import { MEALS, type Meal } from "@/convex/lib/plannerRules";
import { weekSummary } from "@/convex/lib/plannerSlots";
import { SLOT_TYPES, type SlotView } from "./types";

/** "{n} of 21 planned" (seven days of each planned meal) and a count per type for the shown week (§2.3). */
export function WeekStrip({ slots, start, meals = MEALS }: { slots: SlotView[]; start: string; meals?: readonly Meal[] }) {
  const summary = weekSummary(slots, start, meals);
  return (
    <ul className="planner-strip" aria-label="Week summary">
      <li className="badge planner-strip-total">{summary.planned} of {7 * meals.length} planned</li>
      {SLOT_TYPES.map(({ type, label }) => (
        <li className="badge" key={type}>
          <span className={`planner-dot planner-dot-${type}`} aria-hidden="true" />
          {label} {summary[type]}
        </li>
      ))}
    </ul>
  );
}
