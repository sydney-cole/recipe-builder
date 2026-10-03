import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CurrentRecipePanel } from "./current-recipe-panel";

const mocks = vi.hoisted(() => ({
  current: {
    _id: "recipe-1",
    title: "Lemon chicken",
    sourceSite: "Example Kitchen",
    totalTimeMinutes: 35,
  } as Record<string, unknown> | null,
  setCurrent: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: () => mocks.current,
  useMutation: () => mocks.setCurrent,
}));

describe("CurrentRecipePanel", () => {
  beforeEach(() => {
    mocks.current = {
      _id: "recipe-1",
      title: "Lemon chicken",
      sourceSite: "Example Kitchen",
      totalTimeMinutes: 35,
    };
    mocks.setCurrent.mockReset().mockResolvedValue(null);
  });

  it("offers view, change, and clear actions", async () => {
    const user = userEvent.setup();
    render(<CurrentRecipePanel />);

    expect(screen.getByRole("link", { name: "View recipe" })).toHaveAttribute(
      "href",
      "/app/recipe-book/recipe-1",
    );
    expect(screen.getByRole("link", { name: "Change recipe" })).toHaveAttribute(
      "href",
      "/app/recipe-book?select=current",
    );

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(mocks.setCurrent).toHaveBeenCalledWith({ recipeId: null });
  });

  it("opens selection mode when there is no current recipe", () => {
    mocks.current = null;
    render(<CurrentRecipePanel />);

    expect(screen.getByRole("link", { name: "Choose a recipe" })).toHaveAttribute(
      "href",
      "/app/recipe-book?select=current",
    );
  });
});
