// Pure rules for copying one planner week into another (Copy from…). Slots
// map by their day's position within the week and by meal, so a week that
// started on another weekday still lands day 1 on day 1. `meal` is copied
// as is; nothing here assumes which meals a day has.
import type { Id } from "../_generated/dataModel";
import { addDays, slotOrder, type SlotRef } from "./plannerSlots";

export type CopyMode = "fill" | "replace";

/** What a copied slot holds; ids are the source planner's own. */
export type CopyValue =
  | { type: "cook"; recipeId?: Id<"recipes">; name?: string }
  | { type: "out"; mealId?: Id<"plannerMeals"> }
  | { type: "left"; from: SlotRef | "other"; mealId?: Id<"plannerMeals"> }
  | { type: "skip" };

export type CopySlot = SlotRef & { value: CopyValue };
/** A slot to write in the target week; `value` null clears it. */
export type CopyWrite = { ref: SlotRef; value: CopyValue | null };

const key = (ref: SlotRef) => `${ref.date}|${ref.meal}`;

/** The day's position (0–6) in the week starting `start`, or null outside it. */
export function dayIndex(date: string, start: string): number | null {
  for (let index = 0; index < 7; index += 1) {
    if (addDays(start, index) === date) return index;
  }
  return null;
}

/**
 * The writes that fill the week starting `toStart` from the week starting
 * `fromStart`. `target` lists the slots already planned in the target week.
 * "replace" makes the target week match the source exactly; "fill" writes
 * only target slots that are empty. A Leftovers link follows its source only
 * when that source slot was copied too; otherwise the copy has no source.
 */
export function planWeekCopy({
  fromStart,
  toStart,
  source,
  target,
  mode,
}: {
  fromStart: string;
  toStart: string;
  source: CopySlot[];
  target: SlotRef[];
  mode: CopyMode;
}): CopyWrite[] {
  const planned = new Set(target.filter((ref) => dayIndex(ref.date, toStart) !== null).map(key));
  const moved = (ref: SlotRef): SlotRef | null => {
    const index = dayIndex(ref.date, fromStart);
    return index === null ? null : { date: addDays(toStart, index), meal: ref.meal };
  };

  // Source slot key → its place in the target week, for every slot copied.
  const copied = new Map<string, SlotRef>();
  for (const slot of source) {
    const to = moved(slot);
    if (to === null) continue;
    if (mode === "fill" && planned.has(key(to))) continue;
    copied.set(key(slot), to);
  }

  const writes: CopyWrite[] = [];
  const written = new Set<string>();
  for (const slot of source) {
    const to = copied.get(key(slot));
    if (to === undefined) continue;
    written.add(key(to));
    writes.push({ ref: to, value: remapLeftovers(slot.value, copied) });
  }
  if (mode === "replace") {
    for (const ref of target) {
      if (planned.has(key(ref)) && !written.has(key(ref))) writes.push({ ref, value: null });
    }
  }
  return writes.sort((first, second) => slotOrder(first.ref).localeCompare(slotOrder(second.ref)));
}

function remapLeftovers(value: CopyValue, copied: Map<string, SlotRef>): CopyValue {
  if (value.type !== "left" || value.from === "other") return value;
  const to = copied.get(key(value.from));
  // A source outside the copied slots: Leftovers with no source.
  return to === undefined ? { type: "left", from: "other" } : { type: "left", from: to };
}
