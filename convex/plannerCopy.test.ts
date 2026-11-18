import { describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { insertUserRecipe } from "./lib/userRecipes";
import { startSlotImport } from "./planner";
import { initAuthTest, signedInUser, type AuthTest } from "./testing.helpers";

async function plannerFor(t: AuthTest, email: string) {
  const user = await signedInUser(t, email);
  const plannerId = await user.as.mutation(api.planner.ensure, {});
  return { ...user, plannerId };
}

type Bare<T> = T extends unknown ? Omit<T, "_id" | "_creationTime" | "updatedAt" | "updatedBy" | "plannerId"> : never;

/** Every slot of the planner from `from` to `to`, without system fields. */
async function rowsOf(t: AuthTest, plannerId: Id<"planners">, from: string, to: string) {
  const rows = await t.run((ctx) =>
    ctx.db
      .query("planSlots")
      .withIndex("by_planner_and_date", (q) => q.eq("plannerId", plannerId).gte("date", from).lte("date", to))
      .collect(),
  );
  return rows
    .map((row) => {
      const rest: Partial<typeof row> = { ...row };
      for (const field of ["_id", "_creationTime", "updatedAt", "updatedBy", "plannerId"] as const) delete rest[field];
      return rest as Bare<typeof row>;
    })
    .sort((a, b) => (a.date + a.meal).localeCompare(b.date + b.meal));
}

// Last week Mon Nov 9 – Sun Nov 15; this week Mon Nov 16 – Sun Nov 22.
const lastWeek = "2026-11-09";
const thisWeek = "2026-11-16";

describe("copyWeek", () => {
  it("copies every slot type day for day, remapping leftovers inside the week and dropping those from outside it", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    const chili = await t.run((ctx) => insertUserRecipe(ctx, userId, { title: "Chili", ingredients: ["beans"], instructions: [] }));
    // The week before last: a dinner that last Monday's lunch eats.
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-08", meal: "dinner", text: "Stew" });
    await as.mutation(api.planner.setType, { plannerId, date: "2026-11-09", meal: "lunch", type: "left" });
    await as.mutation(api.planner.attachRecipe, { plannerId, date: "2026-11-09", meal: "dinner", recipeId: chili });
    await as.mutation(api.planner.setType, { plannerId, date: "2026-11-10", meal: "lunch", type: "left" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-10", meal: "dinner", text: "out Taco Bell" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-11", meal: "lunch", text: "skip" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-11", meal: "dinner", text: "Soup" });
    await as.mutation(api.planner.setType, { plannerId, date: "2026-11-12", meal: "lunch", type: "left" });
    await as.mutation(api.planner.setLeftoverOf, { plannerId, date: "2026-11-12", meal: "lunch", from: "other" });
    await as.mutation(api.planner.commitOther, { plannerId, date: "2026-11-12", meal: "lunch", text: "Party food" });
    const source = await rowsOf(t, plannerId, lastWeek, "2026-11-15");
    expect(source.find((row) => row.date === lastWeek && row.meal === "lunch")).toMatchObject({ type: "left", from: { date: "2026-11-08", meal: "dinner" } });

    expect(await as.mutation(api.plannerCopy.copyWeek, { plannerId, fromStart: lastWeek, toStart: thisWeek, mode: "fill" })).toEqual({ written: 7 });

    const taco = source.find((row) => row.type === "out")!;
    const party = source.find((row) => row.type === "left" && row.from === "other")!;
    expect(await rowsOf(t, plannerId, thisWeek, "2026-11-22")).toEqual([
      { date: "2026-11-16", meal: "dinner", type: "cook", recipeId: chili },
      { date: "2026-11-16", meal: "lunch", type: "left", from: "other" },
      { date: "2026-11-17", meal: "dinner", type: "out", mealId: "mealId" in taco ? taco.mealId : undefined },
      { date: "2026-11-17", meal: "lunch", type: "left", from: { date: "2026-11-16", meal: "dinner" } },
      { date: "2026-11-18", meal: "dinner", type: "cook", name: "Soup" },
      { date: "2026-11-18", meal: "lunch", type: "skip" },
      { date: "2026-11-19", meal: "lunch", type: "left", from: "other", mealId: "mealId" in party ? party.mealId : undefined },
    ]);
    const week = await as.query(api.planner.week, { plannerId, start: thisWeek });
    expect(week.slots.filter((slot) => slot.date >= thisWeek).map((slot) => slot.name)).toEqual(["", "Chili", "", "Taco Bell", "", "Soup", "Party food"]);
    // The source week is untouched and no grocery list was made.
    expect(await rowsOf(t, plannerId, lastWeek, "2026-11-15")).toEqual(source);
    expect(await t.run((ctx) => ctx.db.query("groceryLists").collect())).toEqual([]);
  });

  it("asks nothing of an empty target, and replaces or fills a planned one", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-09", meal: "dinner", text: "Chili" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-10", meal: "dinner", text: "Soup" });
    await as.mutation(api.planner.setType, { plannerId, date: "2026-11-11", meal: "lunch", type: "left" });
    await as.mutation(api.planner.setLeftoverOf, { plannerId, date: "2026-11-11", meal: "lunch", from: { date: "2026-11-09", meal: "dinner" } });
    // This week: Monday dinner and Friday lunch are already planned.
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-16", meal: "dinner", text: "Pizza" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-20", meal: "lunch", text: "skip" });

    await as.mutation(api.plannerCopy.copyWeek, { plannerId, fromStart: lastWeek, toStart: thisWeek, mode: "fill" });
    expect(await rowsOf(t, plannerId, thisWeek, "2026-11-22")).toEqual([
      { date: "2026-11-16", meal: "dinner", type: "cook", name: "Pizza" },
      { date: "2026-11-17", meal: "dinner", type: "cook", name: "Soup" },
      // Its source (Monday dinner) was not copied, so the link is dropped.
      { date: "2026-11-18", meal: "lunch", type: "left", from: "other" },
      { date: "2026-11-20", meal: "lunch", type: "skip" },
    ]);

    await as.mutation(api.plannerCopy.copyWeek, { plannerId, fromStart: lastWeek, toStart: thisWeek, mode: "replace" });
    expect(await rowsOf(t, plannerId, thisWeek, "2026-11-22")).toEqual([
      { date: "2026-11-16", meal: "dinner", type: "cook", name: "Chili" },
      { date: "2026-11-17", meal: "dinner", type: "cook", name: "Soup" },
      { date: "2026-11-18", meal: "lunch", type: "left", from: { date: "2026-11-16", meal: "dinner" } },
    ]);
  });

  it("copies a removed recipe and a pending import as plain names", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    const gone = await t.run((ctx) => insertUserRecipe(ctx, userId, { title: "Gone  Chili", ingredients: [], instructions: [] }));
    await as.mutation(api.planner.attachRecipe, { plannerId, date: "2026-11-09", meal: "dinner", recipeId: gone });
    await as.mutation(api.recipeCards.removeCard, { recipeId: gone });
    await t.run((ctx) =>
      startSlotImport(ctx, userId, { plannerId, date: "2026-11-10", meal: "dinner", url: "https://example.com/best-chili" }, vi.fn().mockResolvedValue("workflow-1")),
    );

    await as.mutation(api.plannerCopy.copyWeek, { plannerId, fromStart: lastWeek, toStart: thisWeek, mode: "fill" });
    expect(await rowsOf(t, plannerId, thisWeek, "2026-11-22")).toEqual([
      { date: "2026-11-16", meal: "dinner", type: "cook", name: "Gone Chili" },
      { date: "2026-11-17", meal: "dinner", type: "cook", name: "Best chili" },
    ]);
  });

  it("maps day 1 to day 1 when the week start changed between the weeks", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");
    // Planned while weeks started on Sunday: Sun Nov 8 – Sat Nov 14.
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-08", meal: "lunch", text: "Pancakes" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-14", meal: "dinner", text: "Pizza" });

    await as.mutation(api.plannerCopy.copyWeek, { plannerId, fromStart: "2026-11-08", toStart: thisWeek, mode: "fill" });
    expect(await rowsOf(t, plannerId, thisWeek, "2026-11-22")).toEqual([
      { date: "2026-11-16", meal: "lunch", type: "cook", name: "Pancakes" },
      { date: "2026-11-22", meal: "dinner", type: "cook", name: "Pizza" },
    ]);
  });

  it("copies an empty week as nothing, or clears this week when replacing", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-16", meal: "lunch", text: "Soup" });

    expect(await as.mutation(api.plannerCopy.copyWeek, { plannerId, fromStart: lastWeek, toStart: thisWeek, mode: "fill" })).toEqual({ written: 0 });
    expect(await rowsOf(t, plannerId, thisWeek, "2026-11-22")).toHaveLength(1);
    expect(await as.mutation(api.plannerCopy.copyWeek, { plannerId, fromStart: lastWeek, toStart: thisWeek, mode: "replace" })).toEqual({ written: 1 });
    expect(await rowsOf(t, plannerId, thisWeek, "2026-11-22")).toEqual([]);
  });

  it("is only for the planner's owner, from an earlier week", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");
    const grace = await plannerFor(t, "grace@example.com");
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-09", meal: "lunch", text: "Soup" });

    await expect(
      grace.as.mutation(api.plannerCopy.copyWeek, { plannerId, fromStart: lastWeek, toStart: thisWeek, mode: "replace" }),
    ).rejects.toThrow(/Planner was not found/);
    await expect(grace.as.query(api.plannerCopy.recentWeeks, { plannerId, start: thisWeek })).rejects.toThrow(/Planner was not found/);
    // Grace's own planner copies only her own (empty) week.
    await grace.as.mutation(api.plannerCopy.copyWeek, { plannerId: grace.plannerId, fromStart: lastWeek, toStart: thisWeek, mode: "replace" });
    expect(await rowsOf(t, grace.plannerId, thisWeek, "2026-11-22")).toEqual([]);

    await expect(as.mutation(api.plannerCopy.copyWeek, { plannerId, fromStart: thisWeek, toStart: thisWeek, mode: "fill" })).rejects.toThrow(/earlier week/);
    await expect(as.mutation(api.plannerCopy.copyWeek, { plannerId, fromStart: "2026-11-31", toStart: thisWeek, mode: "fill" })).rejects.toThrow(/Invalid date/);
    expect(await rowsOf(t, plannerId, thisWeek, "2026-11-22")).toEqual([]);
  });
});

describe("recentWeeks", () => {
  it("offers last week first, then recent weeks with anything planned, with counts", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");
    expect(await as.query(api.plannerCopy.recentWeeks, { plannerId, start: thisWeek })).toEqual([
      { start: lastWeek, planned: 0, cook: 0, left: 0, out: 0, skip: 0 },
    ]);

    await as.mutation(api.planner.commitText, { plannerId, date: "2026-10-26", meal: "lunch", text: "Soup" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-10-27", meal: "dinner", text: "skip" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-05", meal: "dinner", text: "out Bao" });
    // Too long ago to offer, and this week itself.
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-09-14", meal: "dinner", text: "Stew" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-16", meal: "dinner", text: "Stew" });

    expect(await as.query(api.plannerCopy.recentWeeks, { plannerId, start: thisWeek })).toEqual([
      { start: lastWeek, planned: 0, cook: 0, left: 0, out: 0, skip: 0 },
      { start: "2026-11-02", planned: 1, cook: 0, left: 0, out: 1, skip: 0 },
      { start: "2026-10-26", planned: 2, cook: 1, left: 0, out: 0, skip: 1 },
    ]);
  });
});
