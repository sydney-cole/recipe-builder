import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GroceryListsPage from "./page";

const state = vi.hoisted(() => ({ query: undefined as unknown, mutate: vi.fn(), push: vi.fn() }));
vi.mock("convex/react", () => ({ useQuery: () => state.query, useMutation: () => state.mutate }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));

describe("GroceryListsPage", () => {
  beforeEach(() => { state.query = undefined; state.mutate.mockReset().mockResolvedValue("list-new"); state.push.mockReset(); });

  it("renders loading, honest empty, and persisted populated states", () => {
    const { rerender } = render(<GroceryListsPage />);
    expect(screen.getByLabelText("Loading grocery lists")).toBeInTheDocument();
    state.query = [];
    rerender(<GroceryListsPage />);
    expect(screen.getByRole("heading", { name: "No grocery lists yet" })).toBeInTheDocument();
    state.query = [{ _id: "list-1", name: "Weekend", status: "active", itemCount: 4, checkedCount: 1, updatedAt: 1 }];
    rerender(<GroceryListsPage />);
    expect(screen.getByDisplayValue("Weekend")).toBeInTheDocument();
    expect(screen.getByText("4 items · 1 checked")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open/ })).toHaveAttribute("href", "/app/grocery-lists/list-1");
  });

  it("creates and opens a named list", async () => {
    const user = userEvent.setup();
    state.query = [];
    render(<GroceryListsPage />);
    await user.click(screen.getByRole("button", { name: "New list" }));
    await user.type(screen.getByPlaceholderText("List name"), "Party");
    await user.click(screen.getByRole("button", { name: "Create list" }));
    expect(state.mutate).toHaveBeenCalledWith({ name: "Party" });
    expect(state.push).toHaveBeenCalledWith("/app/grocery-lists/list-new");
  });
});
