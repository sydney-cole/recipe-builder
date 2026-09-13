import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddRecipeToListButton } from "./add-recipe-to-list-button";

const mocks = vi.hoisted(() => ({
  mutation: vi.fn(),
  push: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: () => [
    { _id: "list-existing", name: "Weekend groceries", status: "active" },
  ],
  useMutation: () => mocks.mutation,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

describe("AddRecipeToListButton", () => {
  beforeEach(() => {
    mocks.mutation.mockReset();
    mocks.push.mockReset();
  });
  it("offers a new list and existing lists in a dialog", async () => {
    const user = userEvent.setup();
    mocks.mutation.mockResolvedValueOnce("list-123");
    render(<AddRecipeToListButton recipeId="recipe-123" />);

    await user.click(screen.getByRole("button", { name: "Add to grocery list" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("New grocery list");
    expect(screen.getByRole("dialog")).toHaveTextContent("Weekend groceries");
    await user.click(screen.getByRole("button", { name: /New grocery list/ }));

    expect(mocks.mutation).toHaveBeenCalledWith({
      recipeId: "recipe-123",
      forceNew: true,
    });
    expect(mocks.push).toHaveBeenCalledWith("/app/grocery-lists/list-123");
  });

  it("adds the recipe to a selected existing list", async () => {
    const user = userEvent.setup();
    mocks.mutation.mockResolvedValueOnce("list-existing");
    render(<AddRecipeToListButton recipeId="recipe-123" />);
    await user.click(screen.getByRole("button", { name: "Add to grocery list" }));
    await user.click(screen.getByRole("radio", { name: "Weekend groceries" }));
    await user.click(screen.getByRole("button", { name: "Add to selected list" }));
    expect(mocks.mutation).toHaveBeenCalledWith({ recipeId: "recipe-123", listId: "list-existing" });
    expect(mocks.push).toHaveBeenCalledWith("/app/grocery-lists/list-existing");
  });
});
