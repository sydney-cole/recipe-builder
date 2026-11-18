import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { mainOptions, mealOptions, type PickerData } from "./picker-options";

const id = (value: string) => value as Id<"recipes">;

const data: PickerData = {
  recipes: [
    { recipeId: id("r1"), title: "Shrimp Peperonata", source: "seriouseats.com", ingredientCount: 12 },
    { recipeId: id("r2"), title: "Shrimp Peperonata", source: "Manual", ingredientCount: 0 },
    { recipeId: id("r3"), title: "Shrimp", source: "Manual" },
    { recipeId: id("r4"), title: "Pasta", source: "Manual", ingredientCount: 30, moreIngredients: true },
  ],
  meals: ["Chipotle", "Pizza place"],
};

const labels = (options: ReturnType<typeof mainOptions>) => options.map((option) => [option.label, option.detail ?? ""]);

describe("mainOptions", () => {
  it("filters recipes by word starts and tells same-named recipes apart, then offers to create one", () => {
    expect(labels(mainOptions(data, "p", "cook", false))).toEqual([
      ["Pasta", "Manual · 30+ ingredients"],
      ["Shrimp Peperonata", "Manual · 0 ingredients"],
      ["Shrimp Peperonata", "seriouseats.com · 12 ingredients"],
      ["Create recipe “p”", ""],
    ]);
  });

  it("offers recipes and Create in an unplanned slot only for text that would make it Cook", () => {
    expect(mainOptions(data, "shrimp", null, false).map((option) => option.kind)).toEqual(["recipe", "recipe", "recipe", "create"]);
    expect(mainOptions(data, "skip", null, false)).toEqual([]);
    expect(mainOptions(data, "leftovers", null, false)).toEqual([]);
    expect(mainOptions(data, "out at Chi", null, false)).toEqual([]);
    expect(mainOptions(data, "https://example.com/pasta", null, false)).toEqual([]);
  });

  it("offers nothing for empty text unless browsing, which lists every recipe, matches first", () => {
    expect(mainOptions(data, "", "cook", false)).toEqual([]);
    expect(labels(mainOptions(data, "", "cook", true)).map(([label]) => label)).toEqual(["Pasta", "Shrimp", "Shrimp Peperonata", "Shrimp Peperonata"]);
    expect(labels(mainOptions(data, "Shrimp", "cook", true)).map(([label]) => label)).toEqual([
      "Shrimp", "Shrimp Peperonata", "Shrimp Peperonata", "Pasta", "Create recipe “Shrimp”",
    ]);
  });

  it("offers the planner's eat-out names in an Eat out slot, and no Create row", () => {
    expect(mainOptions(data, "chi", "out", false)).toEqual([{ kind: "meal", key: "meal:Chipotle", label: "Chipotle" }]);
  });
});

describe("mealOptions", () => {
  it("filters meal names", () => {
    expect(mealOptions(data.meals, "pi").map((option) => option.label)).toEqual(["Pizza place"]);
    expect(mealOptions(data.meals, "")).toEqual([]);
  });
});
