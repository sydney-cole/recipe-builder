import { describe, expect, it } from "vitest";
import { parseManualIngredient } from "./manualIngredient";

describe("parseManualIngredient", () => {
  it.each([
    ["1 cup Butter cold, cut into cubes", { quantity: 1, unit: "cup", name: "butter cold", preparation: "cut into cubes" }],
    ["2 cups Sugar", { quantity: 2, unit: "cup", name: "sugar" }],
    ["2 Eggs", { quantity: 2, unit: undefined, name: "eggs" }],
    ["1 1/2 Tablespoon Fresh Lemon Juice", { quantity: 1.5, unit: "tbsp", name: "fresh lemon juice" }],
    ["½ teaspoon salt", { quantity: 0.5, unit: "tsp", name: "salt" }],
  ])("parses %s", (line, expected) => {
    expect(parseManualIngredient(line)).toMatchObject(expected);
  });
});
