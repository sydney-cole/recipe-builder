import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/!(*.test).ts");

describe("import journey migration", () => {
  it("backfills once, clears legacy mappings, preserves ownership, and safely reschedules queued work", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const now = Date.now();
      const userId = await ctx.db.insert("users", { email: "owner@example.com" });
      const completedId = await ctx.db.insert("recipeImports", { requestedBy: userId, sourceUrl: "https://example.com/done", normalizedUrl: "https://example.com/done", status: "completed", attemptCount: 1, createdAt: now, updatedAt: now });
      const recipeId = await ctx.db.insert("recipes", { importId: completedId, sourceUrl: "https://example.com/done", normalizedSourceUrl: "https://example.com/done", title: "Done", cuisines: [], categories: [], keywords: [], instructions: [], createdAt: now, updatedAt: now });
      await ctx.db.patch(completedId, { recipeId });
      const queuedId = await ctx.db.insert("recipeImports", { requestedBy: userId, sourceUrl: "https://example.com/queued", normalizedUrl: "https://example.com/queued", status: "queued", attemptCount: 0, createdAt: now, updatedAt: now });
      await ctx.db.insert("userInboxes", { userId, inboxId: "legacy", email: "old@example.com", createdAt: now, updatedAt: now });
      return { userId, completedId, recipeId, queuedId };
    });
    expect(await t.mutation(internal.migrations.reconcileImportJourney)).toEqual({ relationshipsAdded: 1, mappingsRemoved: 1, queuedScheduled: 1 });
    expect(await t.mutation(internal.migrations.reconcileImportJourney)).toEqual({ relationshipsAdded: 0, mappingsRemoved: 0, queuedScheduled: 1 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const state = await t.run(async (ctx) => ({
      saves: await ctx.db.query("savedRecipes").collect(),
      mappings: await ctx.db.query("userInboxes").collect(),
      imports: await ctx.db.query("recipeImports").collect(),
      recipes: await ctx.db.query("recipes").collect(),
    }));
    expect(state.saves).toMatchObject([{ userId: seeded.userId, recipeId: seeded.recipeId }]);
    expect(state.mappings).toEqual([]);
    expect(state.recipes).toHaveLength(1);
    expect(state.imports.find((item) => item._id === seeded.completedId)?.requestedBy).toBe(seeded.userId);
    expect(state.imports.find((item) => item._id === seeded.queuedId)?.attemptCount).toBe(1);
    vi.useRealTimers();
  });
});
