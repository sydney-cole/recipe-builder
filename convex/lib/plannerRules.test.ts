import { describe, expect, it } from "vitest";
import {
  cleanName,
  isRecipeLink,
  MEAL_LABELS,
  mealKey,
  MEALS,
  nameFromRecipeLink,
  normalizeMeals,
  parseSlotText,
  plannedMeals,
} from "./plannerRules";

describe("cleanName", () => {
  it("collapses whitespace, trims and cuts to 80 characters", () => {
    expect(cleanName("  Pad   Thai \n ")).toBe("Pad Thai");
    expect(cleanName("x".repeat(100))).toHaveLength(80);
  });
});

describe("mealKey", () => {
  it("matches the prototype's mid()", () => {
    expect(mealKey("Chicken  Tikka!")).toBe("chicken-tikka");
    expect(mealKey("  Pad Thai (spicy) ")).toBe("pad-thai-spicy");
    expect(mealKey("")).toBe("m-7");
    expect(mealKey("寿司")).toBe("m-g940");
    expect(mealKey("abcdefghij".repeat(7)).length).toBe(60);
  });
});

describe("recipe links", () => {
  it("detects whole-text http(s) links", () => {
    expect(isRecipeLink(" https://www.example.com/recipes/12345-best-chili.html ")).toBe(true);
    expect(isRecipeLink("http://a b")).toBe(false);
    expect(isRecipeLink("see https://example.com")).toBe(false);
  });

  it("names a link from its slug, else its host", () => {
    expect(nameFromRecipeLink("https://www.example.com/recipes/12345-best-chili.html")).toBe("Best chili");
    expect(nameFromRecipeLink("https://www.example.com/")).toBe("Recipe from example.com");
  });
});

describe("parseSlotText in an unplanned slot", () => {
  const set = (type: string, name: string) => ({ kind: "set", type, name });

  it("detects skip only as the whole text", () => {
    for (const text of ["skip", "Skipping", "SKIPPED"]) expect(parseSlotText(text, null)).toEqual(set("skip", ""));
    expect(parseSlotText("skip lunch", null)).toEqual(set("cook", "skip lunch"));
  });

  it("detects leftovers only as the whole text", () => {
    for (const text of ["leftover", "leftovers", "Left overs", "left-over"]) {
      expect(parseSlotText(text, null)).toEqual(set("left", ""));
    }
    expect(parseSlotText("leftovers of the chili", null)).toEqual(set("cook", "leftovers of the chili"));
  });

  it("detects the out prefix family and strips it", () => {
    expect(parseSlotText("out at Chipotle", null)).toEqual(set("out", "Chipotle"));
    expect(parseSlotText("eating out: Thai", null)).toEqual(set("out", "Thai"));
    expect(parseSlotText("dine out for tacos", null)).toEqual(set("out", "tacos"));
    expect(parseSlotText("eat out - Sushi Bar", null)).toEqual(set("out", "Sushi Bar"));
    expect(parseSlotText("Out", null)).toEqual(set("out", ""));
    expect(parseSlotText("outback steak", null)).toEqual(set("cook", "outback steak"));
  });

  it("ignores empty text and cleans names", () => {
    expect(parseSlotText("", null)).toEqual({ kind: "none" });
    expect(parseSlotText("   ", null)).toEqual({ kind: "none" });
    expect(parseSlotText("  Big   salad ", null)).toEqual(set("cook", "Big salad"));
    const long = parseSlotText("y".repeat(120), null);
    expect(long.kind === "set" && long.name.length).toBe(80);
  });

  it("returns links before any type rule", () => {
    expect(parseSlotText("https://example.com/chili", null)).toEqual({ kind: "link", url: "https://example.com/chili" });
    expect(parseSlotText("https://example.com/chili", "out")).toEqual({ kind: "link", url: "https://example.com/chili" });
  });
});

describe("parseSlotText in a typed slot", () => {
  it("keeps the slot's type and does no prefix detection", () => {
    expect(parseSlotText("skip", "cook")).toEqual({ kind: "set", type: "cook", name: "skip" });
    expect(parseSlotText("out at X", "out")).toEqual({ kind: "set", type: "out", name: "out at X" });
    expect(parseSlotText("", "cook")).toEqual({ kind: "set", type: "cook", name: "" });
  });
});

describe("meals", () => {
  it("orders breakfast, lunch, dinner and labels them", () => {
    expect(MEALS).toEqual(["breakfast", "lunch", "dinner"]);
    expect(MEALS.map((meal) => MEAL_LABELS[meal])).toEqual(["Breakfast", "Lunch", "Dinner"]);
  });

  it("puts chosen meals in day order without repeats, and refuses none", () => {
    expect(normalizeMeals(["dinner", "breakfast", "dinner"])).toEqual(["breakfast", "dinner"]);
    expect(normalizeMeals(["lunch"])).toEqual(["lunch"]);
    expect(() => normalizeMeals([])).toThrow(/at least one meal/);
  });

  it("plans every meal when nothing was chosen yet", () => {
    expect(plannedMeals(undefined)).toEqual(["breakfast", "lunch", "dinner"]);
    expect(plannedMeals(["dinner", "lunch"])).toEqual(["lunch", "dinner"]);
    expect(plannedMeals([])).toEqual(["breakfast", "lunch", "dinner"]);
  });
});
