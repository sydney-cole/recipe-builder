// Undo for the planner: the last slot change and putting it back. The prior
// state is recorded on the server as slots are written (lib/slotHistory.ts).
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { undoChangeValidator, type SlotSnapshot } from "./lib/slotHistory";
import { requirePlanner } from "./planner";
import { canAccessRecipe } from "./lib/recipeAccess";

async function undoRow(ctx: QueryCtx | MutationCtx, plannerId: Id<"planners">) {
  return await ctx.db
    .query("plannerUndo")
    .withIndex("by_planner", (q) => q.eq("plannerId", plannerId))
    .order("desc")
    .first();
}

/** The change Undo would put back, or null. */
export const lastChange = query({
  args: { plannerId: v.id("planners") },
  returns: v.union(
    v.null(),
    v.object({
      changeId: v.id("plannerUndo"),
      change: undoChangeValidator,
      createdRecipeName: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, { plannerId }) => {
    await requirePlanner(ctx, plannerId);
    const undo = await undoRow(ctx, plannerId);
    if (undo === null) return null;
    return {
      changeId: undo._id,
      change: undo.change,
      ...(undo.createdRecipe ? { createdRecipeName: undo.createdRecipe.name } : {}),
    };
  },
});

/**
 * Checks that a recorded slot belongs to the caller's planner and that what
 * it references is theirs: a recipe they can open, their own import, and a
 * meal of this planner.
 */
async function assertRestorable(
  ctx: MutationCtx,
  plannerId: Id<"planners">,
  userId: Id<"users">,
  snapshot: SlotSnapshot,
) {
  const prior = snapshot.prior;
  if (prior === null) return;
  const fail = () => {
    throw new Error("This change can’t be undone");
  };
  if (prior.plannerId !== plannerId || prior.date !== snapshot.date || prior.meal !== snapshot.meal) fail();
  if (prior.updatedBy !== userId) fail();
  if (prior.type === "cook" && prior.recipeId !== undefined) {
    const recipe = await ctx.db.get(prior.recipeId);
    if (recipe === null || !(await canAccessRecipe(ctx, userId, recipe))) fail();
  }
  if (prior.type === "cook" && prior.importId !== undefined) {
    const recipeImport = await ctx.db.get(prior.importId);
    if (recipeImport === null || recipeImport.requestedBy !== userId) fail();
  }
  if ((prior.type === "out" || prior.type === "left") && prior.mealId !== undefined) {
    const meal = await ctx.db.get(prior.mealId);
    if (meal === null || meal.plannerId !== plannerId) fail();
  }
}

/**
 * Puts every slot the change touched back as it was, in one step. A recipe
 * the change created stays in the Recipe Book; its name is returned so the
 * message can say so.
 */
export const restore = mutation({
  args: { plannerId: v.id("planners"), changeId: v.id("plannerUndo") },
  returns: v.object({ keptRecipeName: v.union(v.null(), v.string()) }),
  handler: async (ctx, { plannerId, changeId }) => {
    const { userId } = await requirePlanner(ctx, plannerId);
    const undo = await ctx.db.get(changeId);
    if (undo === null || undo.plannerId !== plannerId) throw new Error("There’s nothing to undo");
    for (const snapshot of undo.slots) await assertRestorable(ctx, plannerId, userId, snapshot);
    for (const { date, meal, prior } of undo.slots) {
      const row = await ctx.db
        .query("planSlots")
        .withIndex("by_planner_and_date", (q) => q.eq("plannerId", plannerId).eq("date", date).eq("meal", meal))
        .unique();
      if (prior === null) {
        if (row !== null) await ctx.db.delete(row._id);
      } else if (row === null) {
        await ctx.db.insert("planSlots", prior);
      } else {
        await ctx.db.replace(row._id, prior);
      }
    }
    await ctx.db.delete(undo._id);
    return { keptRecipeName: undo.createdRecipe?.name ?? null };
  },
});
