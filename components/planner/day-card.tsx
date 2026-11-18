import type { Id } from "@/convex/_generated/dataModel";
import { MEALS, type Meal } from "@/convex/lib/plannerRules";
import { formatDay } from "@/convex/lib/plannerSlots";
import { cn } from "@/lib/utils";
import { SlotCell } from "./slot-cell";
import type { SlotView } from "./types";

export const dayCardId = (date: string) => `planner-day-${date}`;

export function DayCard({
  plannerId,
  date,
  today,
  weekStart,
  slots,
  requestFocus,
  meals = MEALS,
}: {
  plannerId: Id<"planners">;
  date: string;
  today: boolean;
  weekStart: string;
  slots: SlotView[];
  requestFocus: (id: string) => void;
  /** The meals to plan, in day order. */
  meals?: readonly Meal[];
}) {
  const day = formatDay(date);
  return (
    <li id={dayCardId(date)} className={cn("planner-day", today && "today")} aria-current={today ? "date" : undefined}>
      <h3 className="planner-day-label">
        <span>{day.dow}</span> <span className="planner-day-date">{day.monthDay}</span>
        {today && <> <span className="planner-today-chip">Today</span></>}
      </h3>
      <div className="planner-day-slots">
        {meals.map((meal) => (
          <SlotCell
            key={meal}
            plannerId={plannerId}
            date={date}
            meal={meal}
            weekStart={weekStart}
            slots={slots}
            requestFocus={requestFocus}
            meals={meals}
          />
        ))}
      </div>
    </li>
  );
}
