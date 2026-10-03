import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GroceryListActions } from "./grocery-list-actions";

const mocks = vi.hoisted(() => ({
  combineLists: vi.fn(),
  removeList: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: () => [
    { _id: "list-1", name: "Dinner" },
    { _id: "list-2", name: "Weekend" },
  ],
  useMutation: (reference: string) =>
    reference === "combineLists" ? mocks.combineLists : mocks.removeList,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    groceryLists: {
      listMine: "listMine",
      combineLists: "combineLists",
      removeList: "removeList",
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

describe("GroceryListActions", () => {
  beforeEach(() => {
    mocks.combineLists.mockReset();
    mocks.removeList.mockReset();
    mocks.push.mockReset();
    mocks.replace.mockReset();
  });

  it("creates a combined list and opens it", async () => {
    const user = userEvent.setup();
    mocks.combineLists.mockResolvedValueOnce("combined-list");
    render(<GroceryListActions listId="list-1" />);

    await user.click(screen.getByRole("button", { name: "More list options" }));
    await user.click(screen.getByRole("menuitem", { name: "Combine lists" }));
    expect(
      screen.queryByRole("option", { name: "Choose a list" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Combine with")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Create combined list" }),
    ).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Combine with"), "list-2");
    const listName = screen.getByLabelText("New list name");
    expect(listName).toHaveValue("Dinner + Weekend");
    await user.clear(listName);
    await user.type(listName, "Weekly shop");
    await user.click(
      screen.getByRole("button", { name: "Create combined list" }),
    );

    expect(mocks.combineLists).toHaveBeenCalledWith(
      expect.objectContaining({
        listId: "list-1",
        otherListId: "list-2",
        name: "Weekly shop",
      }),
    );
    expect(mocks.push).toHaveBeenCalledWith(
      "/app/grocery-lists/combined-list",
    );
  });

  it("supports menu focus, arrow navigation, typeahead, and Escape", async () => {
    const user = userEvent.setup();
    render(<GroceryListActions listId="list-1" listName="Dinner" />);
    const trigger = screen.getByRole("button", { name: "More options for Dinner" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const combine = screen.getByRole("menuitem", { name: "Combine lists" });
    const remove = screen.getByRole("menuitem", { name: "Delete list" });
    expect(combine).toHaveFocus();
    expect(screen.getByRole("menu", { name: "More options for Dinner" })).toHaveAttribute("id", trigger.getAttribute("aria-controls"));
    await user.keyboard("{ArrowDown}");
    expect(remove).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(combine).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(remove).toHaveFocus();
    await user.keyboard("{Home}");
    expect(combine).toHaveFocus();
    await user.keyboard("{End}");
    expect(remove).toHaveFocus();
    await user.keyboard("c");
    expect(combine).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Delete list" })).toHaveFocus();
  });

  it("dismisses on Tab, Shift+Tab, and outside clicks without trapping focus", async () => {
    const user = userEvent.setup();
    render(<><button>Before</button><GroceryListActions listId="list-1" /><button>After</button></>);
    const trigger = screen.getByRole("button", { name: "More list options" });
    await user.click(trigger);
    await user.tab();
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await user.click(trigger);
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Before" })).toHaveFocus();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "After" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("returns focus to the options button after cancelling a dialog", async () => {
    const user = userEvent.setup();
    render(<GroceryListActions listId="list-1" />);
    const trigger = screen.getByRole("button", { name: "More list options" });
    await user.click(trigger);
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(trigger).toHaveFocus();
  });

  it("confirms deletion and returns to the grocery-list overview", async () => {
    const user = userEvent.setup();
    mocks.removeList.mockResolvedValueOnce(null);
    render(<GroceryListActions listId="list-1" />);

    await user.click(screen.getByRole("button", { name: "More list options" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete list" }));
    await user.click(screen.getByRole("button", { name: "Delete list" }));

    expect(mocks.removeList).toHaveBeenCalledWith({ listId: "list-1" });
    expect(mocks.replace).toHaveBeenCalledWith("/app/grocery-lists");
  });
});
