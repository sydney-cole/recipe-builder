import { describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { insertUserRecipe } from "./lib/userRecipes";
import { startSlotImport, writeSlot } from "./planner";
import { initAuthTest, signedInUser, type AuthTest } from "./testing.helpers";

async function plannerFor(t: AuthTest, email: string) {
  const user = await signedInUser(t, email);
  const plannerId = await user.as.mutation(api.planner.ensure, {});
  return { ...user, plannerId };
}

/** Every slot row of the planner in the two weeks from Nov 9, exactly as stored. */
async function allSlots(t: AuthTest, plannerId: Id<"planners">) {
  const rows = await t.run((ctx) =>
    ctx.db
      .query("planSlots")
      .withIndex("by_planner_and_date", (q) => q.eq("plannerId", plannerId).gte("date", "2026-11-09").lte("date", "2026-11-22"))
      .collect(),
  );
  return rows
    .map((row) => {
      const rest: Partial<Doc<"planSlots">> = { ...row };
      delete rest._id;
      delete rest._creationTime;
      return rest;
    })
    .sort((a, b) => `${a.date}${a.meal}`.localeCompare(`${b.date}${b.meal}`));
}

async function undoLast(as: Awaited<ReturnType<typeof plannerFor>>["as"], plannerId: Id<"planners">) {
  const last = await as.query(api.plannerHistory.lastChange, { plannerId });
  if (last === null) throw new Error("Nothing to undo");
  return await as.mutation(api.plannerHistory.restore, { plannerId, changeId: last.changeId });
}

const mon = { date: "2026-11-16", meal: "dinner" } as const;
const tueLunch = { date: "2026-11-17", meal: "lunch" } as const;

describe("undo", () => {
  it("puts each kind of slot back exactly as it was after any change", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    const chili = await t.run((ctx) => insertUserRecipe(ctx, userId, { title: "Chili", ingredients: [], instructions: [] }));
    const soup = await t.run((ctx) => insertUserRecipe(ctx, userId, { title: "Soup", ingredients: [], instructions: [] }));

    // Build one of every slot shape, then change each in a different way and undo it.
    const setups: { ref: { date: string; meal: "lunch" | "dinner" }; setup: () => Promise<unknown>; change: () => Promise<unknown> }[] = [];
    const at = (date: string, meal: "lunch" | "dinner") => ({ plannerId, date, meal });
    setups.push({ ref: at("2026-11-09", "lunch"), setup: () => as.mutation(api.planner.attachRecipe, { ...at("2026-11-09", "lunch"), recipeId: chili }), change: () => as.mutation(api.planner.attachRecipe, { ...at("2026-11-09", "lunch"), recipeId: soup }) });
    setups.push({ ref: at("2026-11-09", "dinner"), setup: () => as.mutation(api.planner.commitText, { ...at("2026-11-09", "dinner"), text: "Pizza night" }), change: () => as.mutation(api.planner.setType, { ...at("2026-11-09", "dinner"), type: "out" }) });
    setups.push({ ref: at("2026-11-10", "lunch"), setup: () => t.run((ctx) => startSlotImport(ctx, userId, { ...at("2026-11-10", "lunch"), url: "https://example.com/best-chili" }, vi.fn().mockResolvedValue("workflow-1"))), change: () => as.mutation(api.planner.setType, { ...at("2026-11-10", "lunch"), type: "skip" }) });
    setups.push({ ref: at("2026-11-10", "dinner"), setup: () => as.mutation(api.planner.commitText, { ...at("2026-11-10", "dinner"), text: "out Taco Bell" }), change: () => as.mutation(api.planner.commitText, { ...at("2026-11-10", "dinner"), text: "Chipotle" }) });
    setups.push({ ref: at("2026-11-11", "lunch"), setup: () => as.mutation(api.planner.setType, { ...at("2026-11-11", "lunch"), type: "left" }), change: () => as.mutation(api.planner.setLeftoverOf, { ...at("2026-11-11", "lunch"), from: "other" }) });
    setups.push({ ref: at("2026-11-11", "dinner"), setup: async () => { await as.mutation(api.planner.setType, { ...at("2026-11-11", "dinner"), type: "left" }); await as.mutation(api.planner.setLeftoverOf, { ...at("2026-11-11", "dinner"), from: "other" }); await as.mutation(api.planner.commitOther, { ...at("2026-11-11", "dinner"), text: "Party food" }); }, change: () => as.mutation(api.planner.commitOther, { ...at("2026-11-11", "dinner"), text: "Cake" }) });
    setups.push({ ref: at("2026-11-12", "lunch"), setup: () => as.mutation(api.planner.setType, { ...at("2026-11-12", "lunch"), type: "skip" }), change: () => as.mutation(api.planner.setType, { ...at("2026-11-12", "lunch"), type: "skip" }) });
    setups.push({ ref: at("2026-11-12", "dinner"), setup: async () => {}, change: () => as.mutation(api.planner.commitText, { ...at("2026-11-12", "dinner"), text: "Stew" }) });

    for (const { setup } of setups) await setup();
    const before = await allSlots(t, plannerId);
    expect(new Set(before.map((row) => row.type))).toEqual(new Set(["cook", "out", "left", "skip"]));
    for (const { ref, change } of setups) {
      await change();
      const after = await allSlots(t, plannerId);
      expect(after, `${ref.date} ${ref.meal} changed`).not.toEqual(before);
      expect(await as.query(api.plannerHistory.lastChange, { plannerId })).toMatchObject({ change: { kind: "slot", date: ref.date, meal: ref.meal } });
      expect(await undoLast(as, plannerId)).toEqual({ keptRecipeName: null });
      expect(await allSlots(t, plannerId)).toEqual(before);
    }
    expect(await as.query(api.plannerHistory.lastChange, { plannerId })).toBeNull();
  });

  it("keeps a recipe the change created and says so", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.commitText, { plannerId, ...mon, text: "Bao" });
    const before = await allSlots(t, plannerId);
    const { recipeId } = await as.mutation(api.planner.createRecipeForSlot, { plannerId, ...mon, name: "Pork bao" });

    expect(await as.query(api.plannerHistory.lastChange, { plannerId })).toMatchObject({ createdRecipeName: "Pork bao" });
    expect(await undoLast(as, plannerId)).toEqual({ keptRecipeName: "Pork bao" });
    expect(await allSlots(t, plannerId)).toEqual(before);
    expect(await as.query(api.recipes.listBook, {})).toEqual([expect.objectContaining({ _id: recipeId, title: "Pork bao" })]);
  });

  it("keeps one level: the next change replaces it and a change that writes nothing does not", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.commitText, { plannerId, ...mon, text: "Chili" });
    const first = await as.query(api.plannerHistory.lastChange, { plannerId });
    await as.mutation(api.planner.commitText, { plannerId, ...mon, text: "Soup" });
    const second = await as.query(api.plannerHistory.lastChange, { plannerId });
    expect(second?.changeId).not.toBe(first?.changeId);
    await expect(as.mutation(api.plannerHistory.restore, { plannerId, changeId: first!.changeId })).rejects.toThrow(/nothing to undo/);

    // The same text again writes nothing, so Undo still offers the last real change.
    await as.mutation(api.planner.commitText, { plannerId, ...mon, text: "Soup" });
    expect((await as.query(api.plannerHistory.lastChange, { plannerId }))?.changeId).toBe(second?.changeId);
    expect(await t.run((ctx) => ctx.db.query("plannerUndo").collect())).toHaveLength(1);
  });

  it("puts back a recipe that has since been removed from the Recipe Book", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    const gone = await t.run((ctx) => insertUserRecipe(ctx, userId, { title: "Gone", ingredients: [], instructions: [] }));
    await as.mutation(api.planner.attachRecipe, { plannerId, ...mon, recipeId: gone });
    await as.mutation(api.recipeCards.removeCard, { recipeId: gone });
    const before = await allSlots(t, plannerId);
    await as.mutation(api.planner.commitText, { plannerId, ...mon, text: "Stew" });
    await undoLast(as, plannerId);
    expect(await allSlots(t, plannerId)).toEqual(before);
    expect(before[0]).toMatchObject({ type: "cook", recipeId: gone });
  });

  it("restores leftovers slots the change altered as a side effect", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.commitText, { plannerId, ...mon, text: "Chili" });
    await as.mutation(api.planner.setType, { plannerId, ...tueLunch, type: "left" });
    const before = await allSlots(t, plannerId);
    expect(before.find((row) => row.date === tueLunch.date)).toMatchObject({ type: "left", from: mon });

    // A change to Monday dinner that also unlinks the leftovers eating it.
    await t.run(async (ctx) => {
      await writeSlot(ctx, plannerId, userId, mon, { type: "skip" });
      const leftovers = await ctx.db
        .query("planSlots")
        .withIndex("by_planner_and_date", (q) => q.eq("plannerId", plannerId).eq("date", tueLunch.date).eq("meal", tueLunch.meal))
        .unique();
      await ctx.db.patch(leftovers!._id, { from: "other" });
    });
    expect(await allSlots(t, plannerId)).not.toEqual(before);

    await undoLast(as, plannerId);
    expect(await allSlots(t, plannerId)).toEqual(before);
  });

  it("undoes a week copy in one step", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-09", meal: "dinner", text: "Chili" });
    await as.mutation(api.planner.setType, { plannerId, date: "2026-11-10", meal: "lunch", type: "left" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-11", meal: "lunch", text: "skip" });
    await as.mutation(api.planner.commitText, { plannerId, ...mon, text: "Pizza" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-21", meal: "lunch", text: "out Bao" });
    const before = await allSlots(t, plannerId);

    await as.mutation(api.plannerCopy.copyWeek, { plannerId, fromStart: "2026-11-09", toStart: "2026-11-16", mode: "replace" });
    expect(await allSlots(t, plannerId)).not.toEqual(before);
    expect(await as.query(api.plannerHistory.lastChange, { plannerId })).toMatchObject({
      change: { kind: "copy", fromStart: "2026-11-09", toStart: "2026-11-16" },
    });

    await undoLast(as, plannerId);
    expect(await allSlots(t, plannerId)).toEqual(before);
  });

  it("is only for the planner's owner and refuses anything that isn't theirs", async () => {
    const t = initAuthTest();
    const ada = await plannerFor(t, "ada@example.com");
    const grace = await plannerFor(t, "grace@example.com");
    await ada.as.mutation(api.planner.commitText, { plannerId: ada.plannerId, ...mon, text: "Chili" });
    const last = (await ada.as.query(api.plannerHistory.lastChange, { plannerId: ada.plannerId }))!;

    await expect(grace.as.query(api.plannerHistory.lastChange, { plannerId: ada.plannerId })).rejects.toThrow(/Planner was not found/);
    await expect(grace.as.mutation(api.plannerHistory.restore, { plannerId: ada.plannerId, changeId: last.changeId })).rejects.toThrow(/Planner was not found/);
    await expect(grace.as.mutation(api.plannerHistory.restore, { plannerId: grace.plannerId, changeId: last.changeId })).rejects.toThrow(/nothing to undo/);

    // Recorded slots naming someone else's recipe, meal or planner are refused, and nothing changes.
    const secret = await t.run((ctx) => insertUserRecipe(ctx, grace.userId, { title: "Secret", ingredients: [], instructions: [] }));
    await grace.as.mutation(api.planner.commitText, { plannerId: grace.plannerId, ...mon, text: "out Grace's diner" });
    const graceMeal = (await t.run((ctx) => ctx.db.query("plannerMeals").withIndex("by_planner_and_key", (q) => q.eq("plannerId", grace.plannerId)).first()))!;
    const base = { plannerId: ada.plannerId, ...mon, updatedBy: ada.userId, updatedAt: 1 };
    const tampered = [
      { ...base, type: "cook" as const, recipeId: secret },
      { ...base, type: "out" as const, mealId: graceMeal._id },
      { ...base, plannerId: grace.plannerId, type: "skip" as const },
      { ...base, updatedBy: grace.userId, type: "skip" as const },
      { ...base, date: "2026-11-17", type: "skip" as const },
    ];
    const before = await allSlots(t, ada.plannerId);
    for (const prior of tampered) {
      const changeId = await t.run(async (ctx) => {
        const undo = (await ctx.db.query("plannerUndo").withIndex("by_planner", (q) => q.eq("plannerId", ada.plannerId)).first())!;
        await ctx.db.patch(undo._id, { slots: [{ date: "2026-11-09", meal: "lunch", prior: null }, { ...mon, prior }] });
        return undo._id;
      });
      await expect(ada.as.mutation(api.plannerHistory.restore, { plannerId: ada.plannerId, changeId })).rejects.toThrow(/can’t be undone/);
    }
    expect(await allSlots(t, ada.plannerId)).toEqual(before);
  });
});
