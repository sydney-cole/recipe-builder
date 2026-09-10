import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GroceryListEditor } from "./grocery-list-editor";

const state = vi.hoisted(() => ({ query: undefined as unknown, mutate: vi.fn() }));
vi.mock("convex/react", () => ({ useQuery: () => state.query, useMutation: () => state.mutate }));

const item = { _id: "item-1", listId: "list-1", name: "Onion", normalizedName: "onion", quantity: 2, unit: "cup", isChecked: false, sortOrder: 0, createdAt: 1, updatedAt: 1, sources: [{ _id: "source-1", groceryListItemId: "item-1", recipeId: "recipe-1", recipeIngredientId: "ingredient-1", servingsMultiplier: 1, quantityAdded: 2, createdAt: 1, recipeTitle: "Soup", recipeHref: "/app/recipe-book/recipe-1" }] };

describe("GroceryListEditor", () => {
  beforeEach(() => { state.mutate.mockReset().mockResolvedValue(undefined); state.query = { groceryList: { _id: "list-1", name: "This week", status: "active" }, items: [item] }; });

  it("shows persisted items, provenance, accessible controls, and remaining count", async () => {
    const user = userEvent.setup();
    render(<GroceryListEditor listId={"list-1" as never} />);
    expect(screen.getByRole("heading", { name: "This week" })).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Soup" })).toHaveAttribute("href", "/app/recipe-book/recipe-1");
    await user.click(screen.getByRole("checkbox", { name: "Mark Onion complete" }));
    await user.type(screen.getByPlaceholderText("Add an ingredient"), "Apples");
    await user.click(screen.getByRole("button", { name: "Add item" }));
    expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ listId: "list-1", name: "Apples" }));
  });

  it("shows loading, empty, and inaccessible states without mock data", () => {
    state.query = undefined;
    const { rerender } = render(<GroceryListEditor listId={"list-1" as never} />);
    expect(screen.getByLabelText("Loading grocery list")).toBeInTheDocument();
    state.query = { groceryList: { _id: "list-1", name: "Empty", status: "active" }, items: [] };
    rerender(<GroceryListEditor listId={"list-1" as never} />);
    expect(screen.getByText(/This list is empty/i)).toBeInTheDocument();
    state.query = null;
    rerender(<GroceryListEditor listId={"list-1" as never} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/unavailable or belongs/i);
  });
});
