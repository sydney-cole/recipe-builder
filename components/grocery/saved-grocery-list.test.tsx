import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SavedGroceryList } from "./saved-grocery-list";

const mocks = vi.hoisted(() => ({ queryResult: undefined as unknown }));

vi.mock("convex/react", () => ({
  useQuery: () => mocks.queryResult,
}));

vi.mock("@/components/grocery/grocery-list-editor", () => ({
  GroceryListEditor: ({
    initialItems,
    initialName,
    listId,
  }: {
    initialItems: Array<{ name: string; quantity: string; category: string }>;
    initialName: string;
    listId: string;
  }) => (
    <div>
      <span>{listId}</span>
      <span>{initialName}</span>
      <span>{initialItems[0]?.name}</span>
      <span>{initialItems[0]?.quantity}</span>
      <span>{initialItems[0]?.category}</span>
    </div>
  ),
}));

describe("SavedGroceryList", () => {
  beforeEach(() => {
    mocks.queryResult = undefined;
  });

  it("shows loading and not-found states", () => {
    const { rerender } = render(<SavedGroceryList listId="list-1" />);
    expect(screen.getByLabelText("Loading grocery list")).toBeInTheDocument();

    mocks.queryResult = null;
    rerender(<SavedGroceryList listId="list-1" />);
    expect(screen.getByText(/could not be found/)).toBeInTheDocument();
  });

  it("maps persisted list items into editable display values", () => {
    mocks.queryResult = {
      list: { _id: "list-1", name: "Saturday market" },
      items: [
        {
          _id: "item-1",
          name: "Apples",
          quantity: 3,
          isChecked: false,
        },
      ],
    };
    render(<SavedGroceryList listId="list-1" />);

    expect(screen.getByText("Saturday market")).toBeInTheDocument();
    expect(screen.getByText("Apples")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Other")).toBeInTheDocument();
  });
});
