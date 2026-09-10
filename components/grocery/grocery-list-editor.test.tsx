import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GroceryListEditor } from "./grocery-list-editor";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: () => mocks.save,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

describe("GroceryListEditor", () => {
  beforeEach(() => {
    mocks.save.mockReset();
    mocks.replace.mockReset();
  });

  it("starts blank when creating a manual grocery list", async () => {
    const user = userEvent.setup();
    render(<GroceryListEditor initialItems={[]} />);

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Baby spinach")).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Add an ingredient"), "Milk");
    await user.click(screen.getByRole("button", { name: "Add item" }));

    expect(screen.getByDisplayValue("Milk")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("saves a new list and returns to all grocery lists", async () => {
    const user = userEvent.setup();
    mocks.save.mockResolvedValueOnce("list-123");
    render(<GroceryListEditor initialItems={[]} initialName="Weekend trip" />);

    await user.type(screen.getByPlaceholderText("Add an ingredient"), "Milk");
    await user.click(screen.getByRole("button", { name: "Add item" }));
    await user.click(screen.getByRole("button", { name: "Save list" }));

    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Weekend trip",
        items: [expect.objectContaining({ name: "Milk", itemId: undefined })],
      }),
    );
    expect(mocks.replace).toHaveBeenCalledWith("/app/grocery-lists");
  });

  it("updates an existing list with its persisted item IDs", async () => {
    const user = userEvent.setup();
    mocks.save.mockResolvedValueOnce("list-123");
    render(
      <GroceryListEditor
        listId="list-123"
        initialName="Recipe ingredients"
        initialItems={[
          {
            id: "item-123",
            name: "Milk",
            quantity: "2",
            unit: "cups",
            category: "Dairy",
            checked: false,
          },
        ]}
      />,
    );

    await user.clear(screen.getByLabelText("Quantity for Milk"));
    await user.type(screen.getByLabelText("Quantity for Milk"), "3");
    await user.click(screen.getByRole("button", { name: "Update list" }));

    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        listId: "list-123",
        items: [
          expect.objectContaining({
            itemId: "item-123",
            name: "Milk",
            quantityText: "3",
          }),
        ],
      }),
    );
    expect(mocks.replace).toHaveBeenCalledWith("/app/grocery-lists");
  });

  it("adds, edits, checks, removes, and restores an item", async () => {
    const user = userEvent.setup();
    render(<GroceryListEditor />);

    expect(screen.getByText("5")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Add an ingredient"), "  Avocados  ");
    await user.click(screen.getByRole("button", { name: "Add item" }));

    const avocado = screen.getByDisplayValue("Avocados");
    expect(avocado).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Mark Avocados complete" }));
    expect(screen.getByText("5")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove Avocados" }));
    const status = screen.getByRole("status");
    expect(within(status).getByText(/Avocados/)).toBeInTheDocument();
    await user.click(within(status).getByRole("button", { name: "Undo" }));
    expect(screen.getByDisplayValue("Avocados")).toBeInTheDocument();
  });
});
