import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CurrentRecipeButton } from "./current-recipe-button";

const mocks = vi.hoisted(() => ({ currentId: null as string | null, setCurrent: vi.fn() }));

vi.mock("convex/react", () => ({
  useQuery: () => mocks.currentId,
  useMutation: () => mocks.setCurrent,
}));

describe("CurrentRecipeButton", () => {
  beforeEach(() => {
    mocks.currentId = null;
    mocks.setCurrent.mockReset().mockResolvedValue(null);
  });

  it("sets the visible recipe as current", async () => {
    const user = userEvent.setup();
    render(<CurrentRecipeButton recipeId="recipe-1" />);
    await user.click(screen.getByRole("button", { name: "Set as current" }));
    expect(mocks.setCurrent).toHaveBeenCalledWith({ recipeId: "recipe-1" });
  });

  it("identifies the recipe that is already current", () => {
    mocks.currentId = "recipe-1";
    render(<CurrentRecipeButton recipeId="recipe-1" />);
    expect(screen.getByRole("button", { name: "Current recipe" })).toBeDisabled();
  });
});

