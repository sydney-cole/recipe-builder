// Pure date and slot rules for the planner (as-built spec §2.2, §2.3 and
// §3.5). Dates are `YYYY-MM-DD` keys in the user's local calendar; all
// arithmetic here is on those keys (in UTC), so it never depends on the
// server's time zone.
import { MEALS, type Meal, type SlotType } from "./plannerRules";

export type WeekStart = 0 | 1 | 6;
export type SlotRef = { date: string; meal: Meal };
/** A planned slot as the rules see it; `name` is "" for an unnamed slot. */
export type SlotLike = SlotRef & { type: SlotType; name: string; from?: SlotRef | "other" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LONG_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const pad = (value: number) => String(value).padStart(2, "0");

function toUtc(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function fromUtc(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return fromUtc(toUtc(value)) === value;
}

/** The browser's local calendar date for `now`. */
export function localDateKey(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(date: string, days: number): string {
  const value = toUtc(date);
  value.setUTCDate(value.getUTCDate() + days);
  return fromUtc(value);
}

/** The start of the week containing `date` (§3.5). */
export function weekStartOf(date: string, weekStart: WeekStart): string {
  const weekday = toUtc(date).getUTCDay();
  return addDays(date, -((weekday - weekStart + 7) % 7));
}

export function weekDates(start: string): string[] {
  return [0, 1, 2, 3, 4, 5, 6].map((offset) => addDays(start, offset));
}

/** "Nov 17 – 23", or "Nov 30 – Dec 6" across months (§2.2). */
export function formatWeekRange(start: string): string {
  const first = toUtc(start);
  const last = toUtc(addDays(start, 6));
  const sameMonth = first.getUTCMonth() === last.getUTCMonth();
  return `${MONTHS[first.getUTCMonth()]} ${first.getUTCDate()} – ${sameMonth ? "" : `${MONTHS[last.getUTCMonth()]} `}${last.getUTCDate()}`;
}

export function formatDay(date: string): { dow: string; long: string; monthDay: string } {
  const value = toUtc(date);
  return {
    dow: DAYS[value.getUTCDay()],
    long: LONG_DAYS[value.getUTCDay()],
    monthDay: `${MONTHS[value.getUTCMonth()]} ${value.getUTCDate()}`,
  };
}

/**
 * A key that sorts slots by date, then in `MEALS` order. Lunch and dinner
 * keep the keys they had before breakfast existed ("0" and "1") because
 * saved grocery-list fingerprints contain them; breakfast's "/" sorts first.
 */
const MEAL_ORDER_KEYS: Record<Meal, string> = { breakfast: "/", lunch: "0", dinner: "1" };

export function slotOrder(ref: SlotRef): string {
  return ref.date + MEAL_ORDER_KEYS[ref.meal];
}

const sameRef = (a: SlotRef, b: SlotRef) => a.date === b.date && a.meal === b.meal;

/**
 * Where Enter goes: the day's next planned meal, else the next day's first;
 * null after the week's last planned meal. `meals` are the planned meals.
 */
export function nextSlot(ref: SlotRef, weekStart: string, meals: readonly Meal[] = MEALS): SlotRef | null {
  const planned = MEALS.filter((meal) => meals.includes(meal));
  const later = planned.find((meal) => MEALS.indexOf(meal) > MEALS.indexOf(ref.meal));
  if (later !== undefined) return { date: ref.date, meal: later };
  const next = addDays(ref.date, 1);
  return planned.length > 0 && next <= addDays(weekStart, 6) ? { date: next, meal: planned[0] } : null;
}

const isSource = (slot: SlotLike | undefined): slot is SlotLike =>
  slot !== undefined && (slot.type === "cook" || slot.type === "out") && slot.name !== "";

/**
 * Earlier named Cook or Eat out slots that `ref` can be leftovers of: the
 * same day and the six days before, newest first (dinner, lunch, then breakfast).
 */
export function leftoverChoices(slots: SlotLike[], ref: SlotRef): SlotRef[] {
  const choices: SlotRef[] = [];
  for (let back = 0; back <= 6; back += 1) {
    const date = addDays(ref.date, -back);
    for (const meal of [...MEALS].reverse()) {
      const candidate = slots.find((slot) => slot.date === date && slot.meal === meal);
      if (isSource(candidate) && slotOrder(candidate) < slotOrder(ref)) choices.push({ date, meal });
    }
  }
  return choices;
}

export function leftoverLabel(source: SlotLike): string {
  return `${source.name} (${formatDay(source.date).dow} ${source.meal})`;
}

/** What a Leftovers slot is eating (§3.5 source resolution). */
export function resolveLeftover(
  slots: SlotLike[],
  slot: SlotLike,
): { kind: "source"; source: SlotLike } | { kind: "other"; name: string } | null {
  const from = slot.from;
  if (from !== undefined && from !== "other") {
    const source = slots.find((candidate) => sameRef(candidate, from));
    if (isSource(source) && slotOrder(source) < slotOrder(slot)) return { kind: "source", source };
  }
  return slot.name ? { kind: "other", name: slot.name } : null;
}

/** Planned slots in the week by type, counting only `meals` (the planned meals). */
export function weekSummary(slots: SlotLike[], start: string, meals: readonly Meal[] = MEALS) {
  const dates = new Set(weekDates(start));
  const summary = { planned: 0, cook: 0, left: 0, out: 0, skip: 0 };
  for (const slot of slots) {
    if (!dates.has(slot.date) || !meals.includes(slot.meal)) continue;
    summary.planned += 1;
    summary[slot.type] += 1;
  }
  return summary;
}
