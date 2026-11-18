// One level of undo for the planner. Every slot write goes through
// `writeSlot` (convex/planner.ts), which calls `rememberSlot` first, so any
// mutation that changes slots records their prior state without its own
// code. The first write in a mutation replaces the planner's undo row; later
// writes in the same mutation add to it, so a whole week copy undoes as one
// step. `convex/plannerHistory.ts` reads and restores the row.
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { addDays, type SlotRef } from "./plannerSlots";
import { mealValidator, planSlotValidator } from "./plannerValidators";

/** What the change was, for the Undo message. */
export const undoChangeValidator = v.union(
  v.object({ kind: v.literal("slot"), date: v.string(), meal: mealValidator }),
  v.object({ kind: v.literal("copy"), fromStart: v.string(), toStart: v.string() }),
);

/** A slot as it was before the change; `prior` null means it was unplanned. */
export const slotSnapshotValidator = v.object({
  date: v.string(),
  meal: mealValidator,
  prior: v.union(v.null(), planSlotValidator),
});

export const plannerUndoFields = {
  plannerId: v.id("planners"),
  userId: v.id("users"),
  change: undoChangeValidator,
  slots: v.array(slotSnapshotValidator),
  /** A recipe the change created; undoing keeps it in the Recipe Book. */
  createdRecipe: v.optional(v.object({ recipeId: v.id("recipes"), name: v.string() })),
  createdAt: v.number(),
};

export type UndoChange = Infer<typeof undoChangeValidator>;
export type SlotSnapshot = Infer<typeof slotSnapshotValidator>;

/** Leftovers point at most six days back, so dependents lie within a week after. */
const DEPENDENT_DAYS = 7;
const DEPENDENT_SCAN_LIMIT = (DEPENDENT_DAYS + 1) * 8;

type Recording = { undoId: Id<"plannerUndo">; seen: Set<string> };
/** The undo row each running mutation is writing, by its ctx. */
const recordings = new WeakMap<object, Recording>();

const refKey = (ref: SlotRef) => `${ref.date}|${ref.meal}`;

function snapshot(row: Doc<"planSlots"> | null, ref: SlotRef): SlotSnapshot {
  if (row === null) return { date: ref.date, meal: ref.meal, prior: null };
  const { _id, _creationTime, ...prior } = row;
  void _id;
  void _creationTime;
  return { date: ref.date, meal: ref.meal, prior };
}

async function startRecording(ctx: MutationCtx, plannerId: Id<"planners">, userId: Id<"users">, change: UndoChange) {
  const existing = recordings.get(ctx);
  if (existing !== undefined) return existing;
  const old = await ctx.db
    .query("plannerUndo")
    .withIndex("by_planner", (q) => q.eq("plannerId", plannerId))
    .take(10);
  await Promise.all(old.map((row) => ctx.db.delete(row._id)));
  const undoId = await ctx.db.insert("plannerUndo", { plannerId, userId, change, slots: [], createdAt: Date.now() });
  const recording = { undoId, seen: new Set<string>() };
  recordings.set(ctx, recording);
  return recording;
}

/**
 * Records `existing` (the row at `ref`, or null) before it is written, and
 * the Leftovers slots that eat `ref`, in case the change alters them too.
 */
export async function rememberSlot(
  ctx: MutationCtx,
  plannerId: Id<"planners">,
  userId: Id<"users">,
  ref: SlotRef,
  existing: Doc<"planSlots"> | null,
) {
  const recording = await startRecording(ctx, plannerId, userId, { kind: "slot", date: ref.date, meal: ref.meal });
  const added: SlotSnapshot[] = [];
  const add = (row: Doc<"planSlots"> | null, at: SlotRef) => {
    if (recording.seen.has(refKey(at))) return;
    recording.seen.add(refKey(at));
    added.push(snapshot(row, at));
  };
  add(existing, ref);
  const later = await ctx.db
    .query("planSlots")
    .withIndex("by_planner_and_date", (q) =>
      q.eq("plannerId", plannerId).gte("date", ref.date).lte("date", addDays(ref.date, DEPENDENT_DAYS)),
    )
    .take(DEPENDENT_SCAN_LIMIT);
  for (const row of later) {
    if (row.type === "left" && row.from !== "other" && row.from.date === ref.date && row.from.meal === ref.meal) {
      add(row, row);
    }
  }
  if (added.length === 0) return;
  const undo = (await ctx.db.get(recording.undoId))!;
  await ctx.db.patch(recording.undoId, { slots: [...undo.slots, ...added] });
}

/** Says what the running mutation's change was, replacing the default (its first slot). */
export async function describeChange(ctx: MutationCtx, change: UndoChange) {
  const recording = recordings.get(ctx);
  if (recording !== undefined) await ctx.db.patch(recording.undoId, { change });
}

/** Notes a recipe the running mutation created, which undoing keeps. */
export async function noteCreatedRecipe(ctx: MutationCtx, recipeId: Id<"recipes">, name: string) {
  const recording = recordings.get(ctx);
  if (recording !== undefined) await ctx.db.patch(recording.undoId, { createdRecipe: { recipeId, name } });
}
