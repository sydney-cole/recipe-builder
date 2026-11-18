// Copy from…: fill a planner week from an earlier one. The rules live in
// `lib/plannerCopy.ts`; this module reads and writes the rows.
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { planWeekCopy, type CopySlot, type CopyValue } from "./lib/plannerCopy";
import { cleanName } from "./lib/plannerRules";
import { addDays, isDateKey } from "./lib/plannerSlots";
import { describeChange } from "./lib/slotHistory";
import { cookRecipe, requirePlanner, writeSlot } from "./planner";

/** Weeks back that Copy from… looks through for planned weeks. */
export const RECENT_WEEKS_BACK = 8;
/** Weeks Copy from… offers, last week included. */
const RECENT_WEEKS_SHOWN = 5;
/** Rows read for one week: seven days of every meal, with room to spare. */
const WEEK_ROW_LIMIT = 7 * 8;

async function weekRows(ctx: QueryCtx | MutationCtx, plannerId: Id<"planners">, start: string) {
  return await ctx.db
    .query("planSlots")
    .withIndex("by_planner_and_date", (q) =>
      q.eq("plannerId", plannerId).gte("date", start).lte("date", addDays(start, 6)),
    )
    .take(WEEK_ROW_LIMIT);
}

/**
 * What a slot copies as. A Cook slot keeps its recipe only while the recipe
 * is usable; a removed recipe, or an import still waiting to be saved,
 * copies as its plain name.
 */
async function copyValue(ctx: MutationCtx, row: Doc<"planSlots">): Promise<CopyValue> {
  if (row.type === "skip") return { type: "skip" };
  if (row.type === "out") return { type: "out", ...(row.mealId ? { mealId: row.mealId } : {}) };
  if (row.type === "left") return { type: "left", from: row.from, ...(row.mealId ? { mealId: row.mealId } : {}) };
  const { imported, recipeId, recipe, usable } = await cookRecipe(ctx, row);
  if (usable && recipeId !== undefined) return { type: "cook", recipeId };
  const pendingImport = imported !== null && imported.recipeId === undefined;
  const name = cleanName(
    pendingImport ? (row.importName ?? row.name ?? "")
    : recipe !== null ? recipe.title
    : (row.name ?? ""),
  );
  return name ? { type: "cook", name } : { type: "cook" };
}

export const copyModeValidator = v.union(v.literal("fill"), v.literal("replace"));

/**
 * Fills the week starting `toStart` from the earlier week starting
 * `fromStart`, in one change. Never touches the week's grocery list.
 */
export const copyWeek = mutation({
  args: {
    plannerId: v.id("planners"),
    fromStart: v.string(),
    toStart: v.string(),
    mode: copyModeValidator,
  },
  returns: v.object({ written: v.number() }),
  handler: async (ctx, { plannerId, fromStart, toStart, mode }) => {
    const { userId } = await requirePlanner(ctx, plannerId);
    if (!isDateKey(fromStart) || !isDateKey(toStart)) throw new Error("Invalid date");
    if (fromStart > addDays(toStart, -7)) throw new Error("Choose an earlier week to copy from");
    const sourceRows = await weekRows(ctx, plannerId, fromStart);
    const targetRows = await weekRows(ctx, plannerId, toStart);
    const source: CopySlot[] = await Promise.all(
      sourceRows.map(async (row) => ({ date: row.date, meal: row.meal, value: await copyValue(ctx, row) })),
    );
    const writes = planWeekCopy({
      fromStart,
      toStart,
      source,
      target: targetRows.map((row) => ({ date: row.date, meal: row.meal })),
      mode,
    });
    for (const write of writes) await writeSlot(ctx, plannerId, userId, write.ref, write.value);
    // Undo puts back every slot the copy touched, as one step.
    if (writes.length > 0) await describeChange(ctx, { kind: "copy", fromStart, toStart });
    return { written: writes.length };
  },
});

export const weekChoiceValidator = v.object({
  start: v.string(),
  planned: v.number(),
  cook: v.number(),
  left: v.number(),
  out: v.number(),
  skip: v.number(),
});

/**
 * The weeks Copy from… offers for the week starting `start`: last week first
 * (even when empty), then the most recent earlier weeks with anything
 * planned, from the last RECENT_WEEKS_BACK weeks.
 */
export const recentWeeks = query({
  args: { plannerId: v.id("planners"), start: v.string() },
  returns: v.array(weekChoiceValidator),
  handler: async (ctx, { plannerId, start }) => {
    await requirePlanner(ctx, plannerId);
    if (!isDateKey(start)) throw new Error("Invalid date");
    const earliest = addDays(start, -7 * RECENT_WEEKS_BACK);
    const rows = await ctx.db
      .query("planSlots")
      .withIndex("by_planner_and_date", (q) =>
        q.eq("plannerId", plannerId).gte("date", earliest).lt("date", start),
      )
      .order("desc")
      .take(RECENT_WEEKS_BACK * WEEK_ROW_LIMIT);
    const weeks = Array.from({ length: RECENT_WEEKS_BACK }, (_, index) => ({
      start: addDays(start, -7 * (index + 1)),
      planned: 0,
      cook: 0,
      left: 0,
      out: 0,
      skip: 0,
    }));
    for (const row of rows) {
      const week = weeks.find((candidate) => row.date >= candidate.start && row.date <= addDays(candidate.start, 6));
      if (week === undefined) continue;
      week.planned += 1;
      week[row.type] += 1;
    }
    const [lastWeek, ...earlier] = weeks;
    return [lastWeek, ...earlier.filter((week) => week.planned > 0)].slice(0, RECENT_WEEKS_SHOWN);
  },
});
