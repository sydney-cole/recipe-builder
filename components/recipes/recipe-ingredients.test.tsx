import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  formatQuantity,
  RecipeIngredients,
  scaledIngredientText,
} from "./recipe-ingredients";

const ingredients = [
  {
    _id: "ingredient-1",
    originalText: "1 1/2 cups chickpeas, drained",
    name: "chickpeas",
    quantity: 1.5,
    unit: "cups",
    preparation: "drained",
    isOptional: false,
  },
  {
    _id: "ingredient-2",
    originalText: "Salt, to taste",
    name: "salt",
    isOptional: true,
  },
];

describe("ingredient scaling", () => {
  it("formats readable quantities and preserves original text at 1x", () => {
    expect(formatQuantity(1.234)).toBe("1.23");
    expect(scaledIngredientText(ingredients[0], 1)).toBe(
      "1 1/2 cups chickpeas, drained",
    );
    expect(scaledIngredientText(ingredients[0], 2)).toBe(
      "3 cups chickpeas drained",
    );
    expect(scaledIngredientText(ingredients[1], 2)).toBe("Salt, to taste");
  });

  it("updates servings and scalable ingredient amounts", async () => {
    const user = userEvent.setup();
    render(<RecipeIngredients ingredients={ingredients} initialServings={4} />);

    expect(screen.getByText("For 4 servings")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Increase servings" }));
    expect(screen.getByText("For 5 servings")).toBeInTheDocument();
    expect(screen.getByText("1.88 cups chickpeas drained")).toBeInTheDocument();
  });
});
