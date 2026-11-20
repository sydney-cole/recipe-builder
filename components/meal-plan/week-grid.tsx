import { Plus } from "lucide-react";
import { MealEntry } from "@/components/meal-plan/meal-entry";
import { formatDay, MEAL_SLOTS, type MealPlanEntry, type MealSlot } from "@/lib/meal-plan";
import { cn } from "@/lib/utils";

export function WeekGrid({ days, today, entries, onAdd }: {
  days: string[];
  today: string;
  entries: MealPlanEntry[];
  onAdd: (date: string, slot: MealSlot) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
      {days.map((date) => {
        const dayName = formatDay(date, { weekday: "long", month: "short", day: "numeric" });
        return (
          <section
            key={date}
            aria-label={dayName}
            aria-current={date === today ? "date" : undefined}
            className={cn("rounded-xl border border-border bg-white p-3", date === today && "border-primary bg-primary-soft")}
          >
            <h2 className="flex items-baseline justify-between gap-2 font-extrabold">
              <span>{formatDay(date, { weekday: "short" })}</span>
              <span className="text-sm font-bold text-muted-foreground">{formatDay(date, { month: "short", day: "numeric" })}</span>
            </h2>
            {MEAL_SLOTS.map((slot) => {
              const slotEntries = entries.filter((entry) => entry.date === date && entry.slot === slot.id);
              return (
                <div key={slot.id} className="mt-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{slot.label}</h3>
                    <button
                      type="button"
                      className="grid size-8 place-items-center rounded-lg text-primary hover:bg-surface-subtle"
                      aria-label={`Add ${slot.label.toLowerCase()} for ${dayName}`}
                      onClick={() => onAdd(date, slot.id)}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  {slotEntries.length > 0 && (
                    <ul className="mt-1 grid gap-2">
                      {slotEntries.map((entry) => <MealEntry key={entry._id} entry={entry} />)}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
