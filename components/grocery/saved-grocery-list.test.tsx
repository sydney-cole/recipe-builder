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
    needsInitialSave,
    sourceLabel,
  }: {
    initialItems: Array<{ name: string; quantity: string; category: string; source?: string; planAmount?: string }>;
    initialName: string;
    listId: string;
    needsInitialSave?: boolean;
    sourceLabel?: string;
  }) => (
    <div>
      <span>{listId}</span>
      <span>{initialName}</span>
      <span>{initialItems[0]?.name}</span>
      <span>{initialItems[0]?.quantity}</span>
      <span>{initialItems[0]?.category}</span>
      <span>{initialItems[0]?.source}</span>
      <span>{needsInitialSave ? "First save" : "Existing list"}</span>
      <span>Label {sourceLabel}</span>
      {initialItems.map((item) => item.planAmount && <span key={item.name}>Plan {item.name} {item.planAmount}</span>)}
    </div>
  ),
}));

describe("SavedGroceryList", () => {
  beforeEach(() => {
    mocks.queryResult = undefined;
  });

  it("shows loading and not-found states", () => {
    const { rerender } = render(<SavedGroceryList listId="list-1" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading grocery list…");

    mocks.queryResult = null;
    rerender(<SavedGroceryList listId="list-1" />);
    expect(screen.getByText(/could not be found/)).toBeInTheDocument();
  });

  it("maps persisted list items into editable display values", () => {
    mocks.queryResult = {
      list: { _id: "list-1", name: "Saturday market", sourceRecipeTitle: "Wrong recipe", needsInitialSave: true },
      items: [
        {
          _id: "item-1",
          name: "Apples",
          quantity: 3,
          isChecked: false,
        },
      ],
      itemSources: [{ itemId: "item-1", recipeTitles: ["Apple pie"] }],
    };
    render(<SavedGroceryList listId="list-1" />);

    expect(screen.getByText("Saturday market")).toBeInTheDocument();
    expect(screen.getByText("Apples")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Other")).toBeInTheDocument();
    expect(screen.getByText("Apple pie")).toBeInTheDocument();
    expect(screen.getByText("First save")).toBeInTheDocument();
    expect(screen.queryByText("Wrong recipe")).not.toBeInTheDocument();
  });
  it("labels a planner week's items with their meals and shows edited plan amounts", () => {
    mocks.queryResult = {
      list: { _id: "list-1", name: "Week of Nov 16", plannerId: "planner-1" },
      items: [
        { _id: "item-1", name: "beans", quantityText: "3", unit: "cans", isChecked: false, planKey: "beans", planQuantityText: "4", planUnit: "cup" },
        { _id: "item-2", name: "onion", quantityText: "2", isChecked: false, planKey: "onion", planQuantityText: "2" },
      ],
      itemSources: [],
    };
    render(<SavedGroceryList listId="list-1" />);
    expect(screen.getByText("Label For")).toBeInTheDocument();
    expect(screen.getByText("Plan beans 4 cup")).toBeInTheDocument();
    expect(screen.queryByText(/Plan onion/)).not.toBeInTheDocument();
  });
});
