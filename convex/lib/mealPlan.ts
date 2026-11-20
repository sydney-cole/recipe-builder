import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const MAX_RANGE_ENTRIES = 300;

function dayNumber(dateKey: string) {
  const time = DATE_KEY.test(dateKey) ? Date.parse(`${dateKey}T00:00:00Z`) : NaN;
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== dateKey) {
    throw new Error("Dates must be real calendar days formatted as YYYY-MM-DD");
  }
  return time / DAY_MS;
}

export function validDateKey(dateKey: string) {
  dayNumber(dateKey);
  return dateKey;
}

export function validateDateRange(startDate: string, endDate: string, maximumDays: number) {
  const days = dayNumber(endDate) - dayNumber(startDate) + 1;
  if (days < 1) throw new Error("The end date must not be before the start date");
  if (days > maximumDays) {
    throw new Error(`A date range can cover at most ${maximumDays} days`);
  }
}

export async function mealPlanEntriesInRange(
  ctx: QueryCtx,
  userId: Id<"users">,
  startDate: string,
  endDate: string,
) {
  return await ctx.db
    .query("mealPlanEntries")
    .withIndex("by_user_and_date", (q) =>
      q.eq("userId", userId).gte("date", startDate).lte("date", endDate),
    )
    .take(MAX_RANGE_ENTRIES);
}
