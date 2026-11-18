import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import { dayIndex, planWeekCopy, type CopySlot } from "./plannerCopy";

const chili = "recipe-chili" as Id<"recipes">;
const tacoBell = "meal-taco-bell" as Id<"plannerMeals">;

// Source week Mon Nov 9 – Sun Nov 15; target week Mon Nov 16 – Sun Nov 22.
const fromStart = "2026-11-09";
const toStart = "2026-11-16";

const source: CopySlot[] = [
  { date: "2026-11-09", meal: "dinner", value: { type: "cook", recipeId: chili } },
  { date: "2026-11-10", meal: "lunch", value: { type: "left", from: { date: "2026-11-09", meal: "dinner" } } },
  { date: "2026-11-10", meal: "dinner", value: { type: "out", mealId: tacoBell } },
  { date: "2026-11-11", meal: "lunch", value: { type: "skip" } },
  { date: "2026-11-11", meal: "dinner", value: { type: "cook", name: "Soup" } },
];

describe("dayIndex", () => {
  it("is the day's position in the week, or null outside it", () => {
    expect(dayIndex("2026-11-09", fromStart)).toBe(0);
    expect(dayIndex("2026-11-15", fromStart)).toBe(6);
    expect(dayIndex("2026-11-16", fromStart)).toBeNull();
    expect(dayIndex("2026-11-08", fromStart)).toBeNull();
  });
});

describe("planWeekCopy", () => {
  it("copies every slot type by day position and meal into an empty week, remapping leftovers", () => {
    expect(planWeekCopy({ fromStart, toStart, source, target: [], mode: "fill" })).toEqual([
      { ref: { date: "2026-11-16", meal: "dinner" }, value: { type: "cook", recipeId: chili } },
      { ref: { date: "2026-11-17", meal: "lunch" }, value: { type: "left", from: { date: "2026-11-16", meal: "dinner" } } },
      { ref: { date: "2026-11-17", meal: "dinner" }, value: { type: "out", mealId: tacoBell } },
      { ref: { date: "2026-11-18", meal: "lunch" }, value: { type: "skip" } },
      { ref: { date: "2026-11-18", meal: "dinner" }, value: { type: "cook", name: "Soup" } },
    ]);
  });

  it("drops a leftovers link whose source lies outside the copied week, keeping other leftovers as they are", () => {
    const writes = planWeekCopy({
      fromStart,
      toStart,
      source: [
        { date: "2026-11-09", meal: "lunch", value: { type: "left", from: { date: "2026-11-08", meal: "dinner" } } },
        { date: "2026-11-09", meal: "dinner", value: { type: "left", from: "other", mealId: tacoBell } },
      ],
      target: [],
      mode: "replace",
    });
    expect(writes.map((write) => write.value)).toEqual([
      { type: "left", from: "other" },
      { type: "left", from: "other", mealId: tacoBell },
    ]);
  });

  it("replaces everything: planned target slots with no source slot are cleared", () => {
    const writes = planWeekCopy({
      fromStart,
      toStart,
      source: source.slice(0, 1),
      target: [
        { date: "2026-11-16", meal: "dinner" },
        { date: "2026-11-20", meal: "lunch" },
      ],
      mode: "replace",
    });
    expect(writes).toEqual([
      { ref: { date: "2026-11-16", meal: "dinner" }, value: { type: "cook", recipeId: chili } },
      { ref: { date: "2026-11-20", meal: "lunch" }, value: null },
    ]);
  });

  it("fills empty slots only, keeping a leftovers link only when its source was copied", () => {
    const writes = planWeekCopy({
      fromStart,
      toStart,
      source,
      // Monday dinner is already planned, so Tuesday's leftovers lose their source.
      target: [{ date: "2026-11-16", meal: "dinner" }],
      mode: "fill",
    });
    expect(writes.map((write) => write.ref.date + " " + write.ref.meal)).not.toContain("2026-11-16 dinner");
    expect(writes[0]).toEqual({ ref: { date: "2026-11-17", meal: "lunch" }, value: { type: "left", from: "other" } });
    expect(writes).toHaveLength(4);
  });

  it("maps day 1 to day 1 when the weeks start on different weekdays", () => {
    // A Sunday week copied into a Monday week.
    const writes = planWeekCopy({
      fromStart: "2026-11-08",
      toStart,
      source: [
        { date: "2026-11-08", meal: "lunch", value: { type: "skip" } },
        { date: "2026-11-14", meal: "dinner", value: { type: "cook", name: "Pizza" } },
        // Outside the Sunday week: never copied.
        { date: "2026-11-15", meal: "dinner", value: { type: "skip" } },
      ],
      target: [],
      mode: "replace",
    });
    expect(writes).toEqual([
      { ref: { date: "2026-11-16", meal: "lunch" }, value: { type: "skip" } },
      { ref: { date: "2026-11-22", meal: "dinner" }, value: { type: "cook", name: "Pizza" } },
    ]);
  });

  it("copies an empty week as nothing, or as clearing the target when replacing", () => {
    expect(planWeekCopy({ fromStart, toStart, source: [], target: [{ date: "2026-11-16", meal: "lunch" }], mode: "fill" })).toEqual([]);
    expect(planWeekCopy({ fromStart, toStart, source: [], target: [{ date: "2026-11-16", meal: "lunch" }], mode: "replace" })).toEqual([
      { ref: { date: "2026-11-16", meal: "lunch" }, value: null },
    ]);
  });
});
