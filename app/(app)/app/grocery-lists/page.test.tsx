import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GroceryListsPage from "./page";

vi.mock("@/convex/_generated/api", () => ({ api: { groceryLists: { listMine: "listMine", itemProgress: "itemProgress", summary: "summary" } } }));

vi.mock("convex/react", () => ({
  useQuery: (query: string) => {
    if (query === "itemProgress") return { total: 7, checked: 7 };
    if (query === "summary") return { isComplete: true };
    return [
        {
          _id: "list-123",
          name: "Weekend trip",
          status: "active",
          createdAt: 1,
          updatedAt: 2,
        },
      ];
  },
  useMutation: () => vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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

    expect(screen.getByRole("link", { name: "Open Weekend trip" })).toHaveAttribute(
      "href",
      "/app/grocery-lists/list-123",
    );
    expect(screen.getByText(/0 of 7 left/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More options for Weekend trip" })).toBeInTheDocument();
    expect(screen.getByText("List Completed")).toBeInTheDocument();
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
