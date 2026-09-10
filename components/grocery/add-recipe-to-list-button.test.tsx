import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AddRecipeToListButton } from "./add-recipe-to-list-button";

const mocks = vi.hoisted(() => ({
  createFromRecipe: vi.fn(),
  push: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: () => mocks.createFromRecipe,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

describe("AddRecipeToListButton", () => {
  it("creates the recipe-backed list before opening it", async () => {
    const user = userEvent.setup();
    mocks.createFromRecipe.mockResolvedValueOnce("list-123");
    render(<AddRecipeToListButton recipeId="recipe-123" />);

    await user.click(screen.getByRole("button", { name: "Create list" }));

    expect(mocks.createFromRecipe).toHaveBeenCalledWith({
      recipeId: "recipe-123",
    });
    expect(mocks.push).toHaveBeenCalledWith("/app/grocery-lists/list-123");
  });
});
