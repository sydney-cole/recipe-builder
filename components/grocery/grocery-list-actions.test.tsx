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
