import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddRecipeDialog } from "./add-recipe-dialog";

const state = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("convex/react", () => ({
  useQuery: () => [{ _id: "list-1", name: "Dinner", status: "active" }],
  useMutation: () => state.mutate,
}));

const ingredients = [
  { _id: "ingredient-1", name: "Onion", originalText: "1 onion" },
  { _id: "ingredient-2", name: "Salt", originalText: "Salt to taste" },
] as never;

describe("AddRecipeDialog", () => {
  beforeEach(() => state.mutate.mockReset().mockResolvedValue(undefined));

  it("defaults all ingredients, validates empty selection, scales, and prevents duplicate submits", async () => {
    const user = userEvent.setup();
    render(<AddRecipeDialog recipeId={"recipe-1" as never} title="Soup" ingredients={ingredients} initialServings={2} />);
    await user.click(screen.getByRole("button", { name: "Add to grocery list" }));
    const checks = screen.getAllByRole("checkbox");
    expect(checks).toHaveLength(2);
    expect(checks[0]).toBeChecked();
    await user.click(checks[0]);
    await user.click(checks[1]);
    await user.selectOptions(screen.getByLabelText("Existing list"), "list-1");
    await user.click(screen.getByRole("button", { name: "Add selected ingredients" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/at least one/i);
    await user.click(checks[0]);
    await user.click(screen.getByRole("button", { name: "Increase grocery servings" }));
    await user.click(screen.getByRole("button", { name: "Add selected ingredients" }));
    expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ listId: "list-1", recipeId: "recipe-1", ingredientIds: ["ingredient-1"], servings: 3, requestKey: expect.any(String) }));
    expect(await screen.findByRole("status")).toHaveTextContent("Added to Dinner");
    expect(screen.getByRole("link", { name: "Open grocery list" })).toHaveAttribute("href", "/app/grocery-lists/list-1");
  });
});
