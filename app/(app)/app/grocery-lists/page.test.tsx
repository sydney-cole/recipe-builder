import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GroceryListsPage from "./page";

vi.mock("convex/react", () => ({
  useQuery: () => [
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
  });
});
