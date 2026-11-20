import { describe, expect, it } from "vitest";
import { addDays, formatWeekRange, mealPlanBackLink, startOfWeek, toDateKey, weekDays } from "./meal-plan";

describe("meal plan dates", () => {
  it("formats a local date without shifting the day", () => {
    expect(toDateKey(new Date(2026, 10, 20, 23, 59))).toBe("2026-11-20");
    expect(toDateKey(new Date(2026, 0, 5, 0, 0))).toBe("2026-01-05");
  });

  it("starts the week on Sunday", () => {
    expect(startOfWeek("2026-11-20")).toBe("2026-11-15");
    expect(startOfWeek("2026-11-15")).toBe("2026-11-15");
    expect(startOfWeek("2026-11-21")).toBe("2026-11-15");
  });

  it("rolls over months and years", () => {
    expect(addDays("2026-11-29", 3)).toBe("2026-12-02");
    expect(addDays("2027-01-02", -7)).toBe("2026-12-26");
    expect(startOfWeek("2027-01-01")).toBe("2026-12-27");
  });

  it("lists seven consecutive days across a daylight saving change", () => {
    expect(weekDays("2026-11-01")).toEqual([
      "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07",
    ]);
    expect(weekDays("2026-03-08")).toHaveLength(7);
    expect(weekDays("2026-03-08").at(-1)).toBe("2026-03-14");
  });

  it("describes the week", () => {
    expect(formatWeekRange("2026-11-29")).toBe("Nov 29 – Dec 5");
  });

  it("builds the way back to the week a recipe was opened from", () => {
    expect(mealPlanBackLink("2026-11-18")).toEqual({ href: "/app/meal-plan?week=2026-11-15", label: "Back to Meal Plan" });
    expect(mealPlanBackLink(undefined)).toBeUndefined();
    expect(mealPlanBackLink("//evil.example")).toBeUndefined();
    expect(mealPlanBackLink(["2026-11-18", "2026-11-19"])).toBeUndefined();
  });
});
