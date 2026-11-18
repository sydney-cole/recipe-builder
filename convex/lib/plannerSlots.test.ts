import { describe, expect, it } from "vitest";
import {
  addDays,
  formatDay,
  formatWeekRange,
  isDateKey,
  leftoverChoices,
  leftoverLabel,
  localDateKey,
  nextSlot,
  resolveLeftover,
  slotOrder,
  weekDates,
  weekStartOf,
  weekSummary,
  type SlotLike,
} from "./plannerSlots";
import type { Meal } from "./plannerRules";

const cook = (date: string, meal: Meal, name = "Chili"): SlotLike => ({ date, meal, type: "cook", name });

describe("date keys", () => {
  it("adds days across months, years and daylight-saving changes", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2026-11-04", -7)).toBe("2026-10-28");
  });

  it("accepts only real YYYY-MM-DD dates", () => {
    expect(isDateKey("2026-11-18")).toBe(true);
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("2026-1-5")).toBe(false);
    expect(isDateKey("nope")).toBe(false);
  });

  it("reads the local calendar date", () => {
    expect(localDateKey(new Date(2026, 10, 18, 23, 59))).toBe("2026-11-18");
  });

  it("finds the week start for Saturday, Sunday and Monday weeks", () => {
    expect(weekStartOf("2026-11-18", 1)).toBe("2026-11-16");
    expect(weekStartOf("2026-11-18", 0)).toBe("2026-11-15");
    expect(weekStartOf("2026-11-18", 6)).toBe("2026-11-14");
    expect(weekStartOf("2026-11-16", 1)).toBe("2026-11-16");
    expect(weekDates("2026-11-16")).toEqual([
      "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22",
    ]);
  });

  it("formats week ranges and days as the prototype does", () => {
    expect(formatWeekRange("2026-11-16")).toBe("Nov 16 – 22");
    expect(formatWeekRange("2026-11-30")).toBe("Nov 30 – Dec 6");
    expect(formatDay("2026-11-16")).toEqual({ dow: "Mon", long: "Monday", monthDay: "Nov 16" });
  });
});

describe("slot order", () => {
  it("puts lunch before dinner", () => {
    expect(slotOrder({ date: "2026-11-16", meal: "lunch" }) < slotOrder({ date: "2026-11-16", meal: "dinner" })).toBe(true);
  });

  it("moves lunch to dinner, dinner to the next lunch, and stops at the week's last dinner when breakfast is off", () => {
    const meals = ["lunch", "dinner"] as const;
    expect(nextSlot({ date: "2026-11-16", meal: "lunch" }, "2026-11-16", meals)).toEqual({ date: "2026-11-16", meal: "dinner" });
    expect(nextSlot({ date: "2026-11-16", meal: "dinner" }, "2026-11-16", meals)).toEqual({ date: "2026-11-17", meal: "lunch" });
    expect(nextSlot({ date: "2026-11-22", meal: "dinner" }, "2026-11-16", meals)).toBeNull();
  });
});

describe("breakfast", () => {
  it("sorts breakfast before lunch and dinner on the same day, and after the day before's dinner", () => {
    const refs = [
      { date: "2026-11-17", meal: "dinner" },
      { date: "2026-11-18", meal: "dinner" },
      { date: "2026-11-18", meal: "breakfast" },
      { date: "2026-11-18", meal: "lunch" },
    ] as const;
    expect([...refs].sort((a, b) => slotOrder(a).localeCompare(slotOrder(b))).map((ref) => `${ref.date} ${ref.meal}`)).toEqual([
      "2026-11-17 dinner",
      "2026-11-18 breakfast",
      "2026-11-18 lunch",
      "2026-11-18 dinner",
    ]);
  });

  it("keeps lunch and dinner order keys as before, so saved grocery fingerprints still match", () => {
    expect(slotOrder({ date: "2026-11-18", meal: "lunch" })).toBe("2026-11-180");
    expect(slotOrder({ date: "2026-11-18", meal: "dinner" })).toBe("2026-11-181");
  });

  it("moves breakfast to lunch to dinner to the next day's breakfast", () => {
    expect(nextSlot({ date: "2026-11-16", meal: "breakfast" }, "2026-11-16")).toEqual({ date: "2026-11-16", meal: "lunch" });
    expect(nextSlot({ date: "2026-11-16", meal: "lunch" }, "2026-11-16")).toEqual({ date: "2026-11-16", meal: "dinner" });
    expect(nextSlot({ date: "2026-11-16", meal: "dinner" }, "2026-11-16")).toEqual({ date: "2026-11-17", meal: "breakfast" });
    expect(nextSlot({ date: "2026-11-22", meal: "dinner" }, "2026-11-16")).toBeNull();
  });

  it("skips meals that are not planned", () => {
    expect(nextSlot({ date: "2026-11-16", meal: "lunch" }, "2026-11-16", ["lunch"])).toEqual({ date: "2026-11-17", meal: "lunch" });
    expect(nextSlot({ date: "2026-11-16", meal: "breakfast" }, "2026-11-16", ["breakfast", "dinner"])).toEqual({ date: "2026-11-16", meal: "dinner" });
    expect(nextSlot({ date: "2026-11-16", meal: "dinner" }, "2026-11-16", ["lunch", "dinner"])).toEqual({ date: "2026-11-17", meal: "lunch" });
    expect(nextSlot({ date: "2026-11-22", meal: "breakfast" }, "2026-11-16", ["breakfast"])).toBeNull();
  });

  it("offers only earlier meals as leftovers: breakfast can't eat the same day's lunch", () => {
    const slots: SlotLike[] = [
      cook("2026-11-17", "dinner", "Stew"),
      cook("2026-11-18", "breakfast", "Pancakes"),
      cook("2026-11-18", "lunch", "Soup"),
    ];
    expect(leftoverChoices(slots, { date: "2026-11-18", meal: "dinner" })).toEqual([
      { date: "2026-11-18", meal: "lunch" },
      { date: "2026-11-18", meal: "breakfast" },
      { date: "2026-11-17", meal: "dinner" },
    ]);
    expect(leftoverChoices(slots, { date: "2026-11-18", meal: "breakfast" })).toEqual([{ date: "2026-11-17", meal: "dinner" }]);
    const later: SlotLike = { date: "2026-11-18", meal: "breakfast", type: "left", name: "", from: { date: "2026-11-18", meal: "lunch" } };
    expect(resolveLeftover([...slots, later], later)).toBeNull();
  });

  it("counts a week's slots only for the meals given", () => {
    const slots: SlotLike[] = [cook("2026-11-16", "breakfast"), cook("2026-11-16", "lunch")];
    expect(weekSummary(slots, "2026-11-16").planned).toBe(2);
    expect(weekSummary(slots, "2026-11-16", ["lunch", "dinner"]).planned).toBe(1);
  });
});

describe("leftoverChoices", () => {
  it("offers earlier named cook or eat-out slots from the same day and six days before, newest first", () => {
    const slots: SlotLike[] = [
      cook("2026-11-18", "lunch", "Soup"),
      cook("2026-11-18", "dinner", "Later"),
      cook("2026-11-17", "lunch", "Tacos"),
      { date: "2026-11-17", meal: "dinner", type: "out", name: "Thai" },
      cook("2026-11-12", "dinner", "Six back"),
      cook("2026-11-11", "dinner", "Seven back"),
      { date: "2026-11-15", meal: "lunch", type: "skip", name: "" },
      { date: "2026-11-15", meal: "dinner", type: "left", name: "", from: "other" },
      cook("2026-11-14", "lunch", ""),
    ];
    expect(leftoverChoices(slots, { date: "2026-11-18", meal: "dinner" })).toEqual([
      { date: "2026-11-18", meal: "lunch" },
      { date: "2026-11-17", meal: "dinner" },
      { date: "2026-11-17", meal: "lunch" },
      { date: "2026-11-12", meal: "dinner" },
    ]);
    expect(leftoverChoices(slots, { date: "2026-11-18", meal: "lunch" })).not.toContainEqual({ date: "2026-11-18", meal: "dinner" });
  });

  it("crosses the week boundary", () => {
    const slots = [cook("2026-11-15", "dinner")];
    expect(leftoverChoices(slots, { date: "2026-11-16", meal: "lunch" })).toEqual([{ date: "2026-11-15", meal: "dinner" }]);
  });

  it("labels a source with its name, weekday and meal", () => {
    expect(leftoverLabel(cook("2026-11-17", "dinner", "Chili"))).toBe("Chili (Tue dinner)");
  });
});

describe("resolveLeftover", () => {
  const source = { date: "2026-11-17", meal: "dinner" } as const;

  it("follows a valid stored source with no distance limit", () => {
    const old = cook("2026-11-08", "dinner", "Old stew");
    const slot: SlotLike = { date: "2026-11-18", meal: "lunch", type: "left", name: "", from: { date: "2026-11-08", meal: "dinner" } };
    expect(resolveLeftover([old, slot], slot)).toEqual({ kind: "source", source: old });
  });

  it("falls back to the slot's own name, or nothing, when the source is no longer valid", () => {
    const skipped: SlotLike = { ...source, type: "skip", name: "" };
    const named: SlotLike = { date: "2026-11-18", meal: "lunch", type: "left", name: "Pizza", from: source };
    const unnamed: SlotLike = { ...named, name: "" };
    expect(resolveLeftover([skipped, named], named)).toEqual({ kind: "other", name: "Pizza" });
    expect(resolveLeftover([skipped, unnamed], unnamed)).toBeNull();
    expect(resolveLeftover([unnamed], unnamed)).toBeNull();
  });

  it("rejects a source that is not earlier", () => {
    const later = cook("2026-11-19", "lunch");
    const slot: SlotLike = { date: "2026-11-18", meal: "dinner", type: "left", name: "", from: { date: "2026-11-19", meal: "lunch" } };
    expect(resolveLeftover([later, slot], slot)).toBeNull();
  });

  it("treats from other with a name as other leftovers", () => {
    const slot: SlotLike = { date: "2026-11-18", meal: "dinner", type: "left", name: "Pizza", from: "other" };
    expect(resolveLeftover([slot], slot)).toEqual({ kind: "other", name: "Pizza" });
  });
});

describe("weekSummary", () => {
  it("counts planned slots by type within the seven days only", () => {
    const slots: SlotLike[] = [
      cook("2026-11-16", "lunch"),
      cook("2026-11-17", "dinner"),
      { date: "2026-11-18", meal: "lunch", type: "skip", name: "" },
      { date: "2026-11-19", meal: "lunch", type: "out", name: "" },
      { date: "2026-11-20", meal: "lunch", type: "left", name: "", from: "other" },
      cook("2026-11-15", "dinner"),
      cook("2026-11-23", "lunch"),
    ];
    expect(weekSummary(slots, "2026-11-16")).toEqual({ planned: 5, cook: 2, left: 1, out: 1, skip: 1 });
  });
});
