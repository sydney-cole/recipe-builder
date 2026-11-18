import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  it("saves a new list and opens the saved list", async () => {
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
    expect(mocks.replace).toHaveBeenCalledWith("/app/grocery-lists/list-123");
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
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("saves a check-off immediately and sends only explicit removals", async () => {
    const user = userEvent.setup();
    mocks.save.mockResolvedValue("list-123");
    const onSaved = vi.fn();
    const item = (id: string, name: string) => ({ id, name, quantity: "1", unit: "", category: "Dairy & Eggs", checked: false });
    const { rerender } = render(
      <GroceryListEditor listId="list-123" onSaved={onSaved} initialItems={[item("item-1", "Milk"), item("item-2", "Eggs")]} />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Mark Milk complete" }));
    expect(mocks.save).toHaveBeenCalledWith({ itemId: "item-1", isChecked: true });
    expect(screen.queryByText("You have unsaved changes.")).not.toBeInTheDocument();

    rerender(
      <GroceryListEditor
        listId="list-123"
        onSaved={onSaved}
        initialItems={[{ ...item("item-1", "Milk"), checked: true }, item("item-2", "Eggs"), item("item-3", "Butter")]}
      />,
    );
    expect(screen.getByDisplayValue("Butter")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove Eggs" }));
    expect(screen.getByText("You have unsaved changes.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Update list" }));

    expect(mocks.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        removedItemIds: ["item-2"],
        items: [
          expect.objectContaining({ itemId: "item-1", isChecked: true }),
          expect.objectContaining({ itemId: "item-3", name: "Butter" }),
        ],
      }),
    );
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("labels a recipe-created draft as a first save", async () => {
    const user = userEvent.setup();
    mocks.save.mockResolvedValueOnce("list-123");
    render(
      <GroceryListEditor
        listId="list-123"
        needsInitialSave
        initialName="Lemon spaghetti"
        initialItems={[]}
      />,
    );

    expect(screen.queryByRole("button", { name: "Update list" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save list" }));

    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ listId: "list-123", name: "Lemon spaghetti" }),
    );
  });

  it("adds, edits, checks, removes, and restores an item", async () => {
    const user = userEvent.setup();
    render(
      <GroceryListEditor
        initialItems={["Spinach", "Lemons", "Orzo", "Beans", "Parmesan"].map((name) => ({
          id: name,
          name,
          quantity: "1",
          unit: "",
          category: "Other",
          checked: false,
        }))}
      />,
    );

    expect(screen.getByText("5")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Add an ingredient"), "  Avocados  ");
    await user.click(screen.getByRole("button", { name: "Add item" }));

    const avocado = screen.getByDisplayValue("Avocados");
    expect(avocado).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Mark Avocados complete" }));
    expect(screen.getByText("5")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove Avocados" }));
    const status = screen
      .getAllByRole("status")
      .find((element) => element.textContent?.includes("removed"))!;
    expect(within(status).getByText(/Avocados/)).toBeInTheDocument();
    await user.click(within(status).getByRole("button", { name: "Undo" }));
    expect(screen.getByDisplayValue("Avocados")).toBeInTheDocument();
  });
  describe("unsaved changes", () => {
    const milk = { id: "item-1", name: "Milk", quantity: "2", unit: "cups", category: "Dairy", checked: false };
    const phone = (matches: boolean) => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: matches && query === "(max-width: 767px)",
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })) as unknown as typeof window.matchMedia;
    };
    const original = window.matchMedia;
    afterEach(() => {
      window.matchMedia = original;
    });

    it("shows a bold danger notice with an icon in the summary panel", async () => {
      const user = userEvent.setup();
      render(<GroceryListEditor listId="list-1" initialItems={[milk]} />);
      await user.type(screen.getByLabelText("Quantity for Milk"), "5");
      const notice = screen.getByRole("status");
      expect(notice).toHaveTextContent("You have unsaved changes.");
      expect(notice).toHaveClass("grocery-unsaved");
      expect(notice.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    });

    it("pins a bar with the notice and Update list above the phone navigation while there are changes", async () => {
      const user = userEvent.setup();
      phone(true);
      mocks.save.mockResolvedValue("list-1");
      const { container } = render(<GroceryListEditor listId="list-1" initialItems={[milk]} />);
      expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull();
      expect(screen.getByRole("button", { name: "Update list" })).toBeDisabled();

      await user.type(screen.getByLabelText("Quantity for Milk"), "5");
      const bar = screen.getByRole("region", { name: "Unsaved changes" });
      expect(bar).toHaveTextContent("You have unsaved changes.");
      expect(container.firstElementChild).toHaveClass("has-unsaved-bar");
      expect(screen.getAllByRole("button", { name: "Update list" })).toHaveLength(2);

      await user.click(within(bar).getByRole("button", { name: "Update list" }));
      expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ listId: "list-1" }));
      expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull();
      expect(container.firstElementChild).not.toHaveClass("has-unsaved-bar");
    });

    it("keeps the bar off wider screens", async () => {
      const user = userEvent.setup();
      phone(false);
      render(<GroceryListEditor listId="list-1" initialItems={[milk]} />);
      await user.type(screen.getByLabelText("Quantity for Milk"), "5");
      expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull();
      expect(screen.getAllByRole("button", { name: "Update list" })).toHaveLength(1);
    });
  });
});
