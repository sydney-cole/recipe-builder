import { describe, expect, it } from "vitest";
import { parseManualIngredient } from "./manualIngredient";

describe("parseManualIngredient", () => {
  it.each([
    ["1 cup Butter cold, cut into cubes", { quantity: 1, unit: "cup", name: "butter cold", preparation: "cut into cubes" }],
    ["2 cups Sugar", { quantity: 2, unit: "cup", name: "sugar" }],
    ["2 Eggs", { quantity: 2, unit: undefined, name: "eggs" }],
    ["1 1/2 Tablespoon Fresh Lemon Juice", { quantity: 1.5, unit: "tbsp", name: "fresh lemon juice" }],
    ["½ teaspoon salt", { quantity: 0.5, unit: "tsp", name: "salt" }],
    ["Garlic powder - 2 tblsp", { quantity: 2, unit: "tbsp", name: "garlic powder" }],
    ["Black pepper – 2 tsp.", { quantity: 2, unit: "tsp", name: "black pepper" }],
    ["Chicken: 1 1/2 kg, cut into pieces", { quantity: 1.5, unit: "kg", name: "chicken", preparation: "cut into pieces" }],
    ["Eggs - 2", { quantity: 2, unit: undefined, name: "eggs" }],
    ["Onion - 1 large", { quantity: 1, unit: undefined, name: "onion", preparation: "large" }],
    ["Salt - to taste", { name: "salt - to taste" }],
    ["All-purpose flour", { name: "all-purpose flour" }],
  ])("parses %s", (line, expected) => {
    expect(parseManualIngredient(line)).toMatchObject(expected);
  });
});
