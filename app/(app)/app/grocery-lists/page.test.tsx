import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GroceryListsPage from "./page";

vi.mock("@/convex/_generated/api", () => ({ api: { groceryLists: { listMine: "listMine", itemProgress: "itemProgress" } } }));

vi.mock("convex/react", () => ({
  useQuery: (query: string) => query === "itemProgress" ? { total: 7, checked: 2 } : [
    {
      _id: "list-123",
      name: "Weekend trip",
      status: "active",
      createdAt: 1,
      updatedAt: 2,
    },
  ],
}));

describe("GroceryListsPage", () => {
  it("uses the new-list route for both creation entry points", () => {
    render(<GroceryListsPage />);

    expect(screen.getByRole("link", { name: "New list" })).toHaveAttribute(
      "href",
      "/app/grocery-lists/new",
    );
    expect(
      screen.getByRole("link", { name: "Start another grocery list" }),
    ).toHaveAttribute("href", "/app/grocery-lists/new");
  });

  it("links saved Convex lists back to their editors", () => {
    render(<GroceryListsPage />);

    expect(screen.getByRole("link", { name: /Weekend trip/ })).toHaveAttribute(
      "href",
      "/app/grocery-lists/list-123",
    );
    expect(screen.getByText(/5 of 7 left/)).toBeInTheDocument();
  });

  it("uses equal-height cards and truncates list titles", () => {
    render(<GroceryListsPage />);

    const title = screen.getByRole("heading", { name: "Weekend trip" });
    expect(title).toHaveClass("truncate");
    expect(title).toHaveAttribute("title", "Weekend trip");
    expect(title.closest(".card")).toHaveClass("h-64");

    const createCard = screen
      .getByRole("link", { name: "Start another grocery list" })
      .querySelector(".card");
    expect(createCard).toHaveClass("h-64");
  });
});
