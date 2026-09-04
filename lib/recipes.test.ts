import { describe, expect, it } from "vitest";
import { filterAndSortRecipes } from "./recipes";
import type { Recipe } from "./data/types";

const fixtures: Recipe[] = [
  {
    id: "1",
    title: "Zesty Orzo",
    description: "Bright and fresh",
    totalMinutes: 30,
    servings: 4,
    source: "Kitchen One",
    tags: ["Vegetarian"],
    art: "garden",
  },
  {
    id: "2",
    title: "Apple Oats",
    description: "Warm breakfast",
    totalMinutes: 10,
    servings: 2,
    source: "Morning Table",
    tags: ["Make ahead"],
    art: "berry",
  },
];

describe("filterAndSortRecipes", () => {
  it("searches all user-visible text case-insensitively", () => {
    expect(filterAndSortRecipes(fixtures, " VEGETARIAN ", "recent")).toEqual([
      fixtures[0],
    ]);
    expect(filterAndSortRecipes(fixtures, "morning table", "recent")).toEqual([
      fixtures[1],
    ]);
  });

  it("sorts without mutating the source array", () => {
    expect(filterAndSortRecipes(fixtures, "", "quickest").map((item) => item.id)).toEqual([
      "2",
      "1",
    ]);
    expect(filterAndSortRecipes(fixtures, "", "az").map((item) => item.id)).toEqual([
      "2",
      "1",
    ]);
    expect(fixtures.map((item) => item.id)).toEqual(["1", "2"]);
  });
});
