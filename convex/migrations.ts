import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

export const reconcileImportJourney = internalMutation({
  args: {},
  handler: async (ctx) => {
    const completed = await ctx.db
      .query("recipeImports")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .collect();
    let relationshipsAdded = 0;
    for (const recipeImport of completed) {
      if (!recipeImport.requestedBy || !recipeImport.recipeId) continue;
      const existing = await ctx.db
        .query("savedRecipes")
        .withIndex("by_user_and_recipe", (q) =>
          q.eq("userId", recipeImport.requestedBy!).eq("recipeId", recipeImport.recipeId!),
        )
        .first();
      if (existing === null) {
        const now = Date.now();
        await ctx.db.insert("savedRecipes", {
          userId: recipeImport.requestedBy,
          recipeId: recipeImport.recipeId,
          isFavorite: false,
          createdAt: recipeImport.finishedAt ?? now,
          updatedAt: now,
        });
        relationshipsAdded += 1;
      }
    }

    const obsoleteMappings = await ctx.db.query("userInboxes").collect();
    for (const mapping of obsoleteMappings) await ctx.db.delete(mapping._id);

    const queued = await ctx.db
      .query("recipeImports")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .collect();
    for (const recipeImport of queued) {
      await ctx.scheduler.runAfter(0, internal.importProcessor.processImport, {
        importId: recipeImport._id,
      });
    }
    return {
      relationshipsAdded,
      mappingsRemoved: obsoleteMappings.length,
      queuedScheduled: queued.length,
    };
  },
});
