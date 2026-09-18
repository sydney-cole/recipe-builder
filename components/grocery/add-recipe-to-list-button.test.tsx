import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddRecipeToListButton } from "./add-recipe-to-list-button";

const mocks = vi.hoisted(() => ({
  mutation: vi.fn(),
  push: vi.fn(),
  lists: [
    { _id: "list-existing", name: "Weekend groceries", status: "active" },
  ] as Array<{ _id: string; name: string; status: string; sourceRecipeId?: string; sourceRecipeIds?: string[] }>,
}));

vi.mock("convex/react", () => ({
  useQuery: () => mocks.lists,
  useMutation: () => mocks.mutation,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

describe("AddRecipeToListButton", () => {
  beforeEach(() => {
    mocks.mutation.mockReset();
    mocks.push.mockReset();
    mocks.lists = [
      { _id: "list-existing", name: "Weekend groceries", status: "active" },
    ];
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
      forceNew: false,
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

  it("asks before creating another list for the same recipe", async () => {
    const user = userEvent.setup();
    mocks.lists = [
      {
        _id: "list-from-recipe",
        name: "Lemon chicken",
        status: "active",
        sourceRecipeId: "recipe-123",
      },
    ];
    mocks.mutation.mockResolvedValueOnce("list-duplicate");
    render(<AddRecipeToListButton recipeId="recipe-123" />);

    await user.click(screen.getByRole("button", { name: "Add to grocery list" }));
    await user.click(screen.getByRole("button", { name: /New grocery list/ }));

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "You have already added this list to groceries. Want to add it again?",
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("Existing list: Lemon chicken");
    expect(mocks.mutation).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Yes" }));
    expect(mocks.mutation).toHaveBeenCalledWith({
      recipeId: "recipe-123",
      forceNew: true,
    });
    expect(mocks.push).toHaveBeenCalledWith("/app/grocery-lists/list-duplicate");
  });

  it("also warns when the recipe was added to an existing list", async () => {
    const user = userEvent.setup();
    mocks.lists = [
      {
        _id: "list-manual",
        name: "Weekly groceries",
        status: "active",
        sourceRecipeIds: ["recipe-123"],
      },
    ];
    render(<AddRecipeToListButton recipeId="recipe-123" />);

    await user.click(screen.getByRole("button", { name: "Add to grocery list" }));
    await user.click(screen.getByRole("button", { name: /New grocery list/ }));

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "You have already added this list to groceries. Want to add it again?",
    );
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("does not create another list when the user chooses no", async () => {
    const user = userEvent.setup();
    mocks.lists = [
      {
        _id: "list-from-recipe",
        name: "Lemon chicken",
        status: "active",
        sourceRecipeId: "recipe-123",
      },
    ];
    render(<AddRecipeToListButton recipeId="recipe-123" />);

    await user.click(screen.getByRole("button", { name: "Add to grocery list" }));
    await user.click(screen.getByRole("button", { name: /New grocery list/ }));
    await user.click(screen.getByRole("button", { name: "No" }));

    expect(mocks.mutation).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
