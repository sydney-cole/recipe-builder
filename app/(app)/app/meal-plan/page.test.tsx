import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MealPlanPage from "./page";

const mocks = vi.hoisted(() => ({
  entries: undefined as unknown,
  ranges: [] as unknown[],
  listId: null as string | null,
  search: "",
}));

vi.mock("convex/react", () => ({
  useQuery: (_query: unknown, args: unknown) => {
    if (args === "skip" || args === undefined) return undefined;
    if ("endDate" in (args as object)) {
      mocks.ranges.push(args);
      return mocks.entries;
    }
    return "startDate" in (args as object) ? mocks.listId : [];
  },
  useMutation: () => vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

describe("MealPlanPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 20, 12));
    mocks.entries = [];
    mocks.ranges = [];
    mocks.listId = null;
    mocks.search = "";
    window.history.replaceState(null, "", "/app/meal-plan");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the current week and moves between weeks", async () => {
    const user = userEvent.setup();
    render(<MealPlanPage />);

    expect(screen.getByRole("status")).toHaveTextContent("Nov 15 – Nov 21");
    expect(screen.getByRole("region", { name: "Friday, Nov 20" })).toHaveAttribute("aria-current", "date");
    expect(mocks.ranges.at(-1)).toEqual({ startDate: "2026-11-15", endDate: "2026-11-21" });
    expect(screen.getByRole("button", { name: "This week" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next week" }));
    expect(screen.getByRole("status")).toHaveTextContent("Nov 22 – Nov 28");
    expect(mocks.ranges.at(-1)).toEqual({ startDate: "2026-11-22", endDate: "2026-11-28" });
    expect(window.location.search).toBe("?week=2026-11-22");

    await user.click(screen.getByRole("button", { name: "This week" }));
    expect(window.location.pathname + window.location.search).toBe("/app/meal-plan");
    await user.click(screen.getByRole("button", { name: "Previous week" }));
    expect(screen.getByRole("status")).toHaveTextContent("Nov 8 – Nov 14");
    expect(window.location.search).toBe("?week=2026-11-08");
  });

  it("opens on the week named in the link, falling back to this week", async () => {
    const user = userEvent.setup();
    mocks.search = "week=2026-12-02";
    const { unmount } = render(<MealPlanPage />);
    expect(screen.getByRole("status")).toHaveTextContent("Nov 29 – Dec 5");
    await user.click(screen.getByRole("button", { name: "This week" }));
    expect(screen.getByRole("status")).toHaveTextContent("Nov 15 – Nov 21");
    unmount();

    mocks.search = "week=tomorrow";
    render(<MealPlanPage />);
    expect(screen.getByRole("status")).toHaveTextContent("Nov 15 – Nov 21");
  });

  it("shows a loading state until the week's meals arrive", () => {
    mocks.entries = undefined;
    render(<MealPlanPage />);
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.getByRole("button", { name: "Create grocery list" })).toBeDisabled();
  });

  it("only offers a grocery list when a recipe will be cooked", async () => {
    const user = userEvent.setup();
    const recipe = { id: "recipe-1", title: "Chili", servings: 4, isSaved: true };
    mocks.entries = [
      { _id: "a", date: "2026-11-16", slot: "dinner", title: "Chili", isLeftovers: true, groceryItems: [], recipe },
      { _id: "b", date: "2026-11-17", slot: "dinner", title: "Eating out", isLeftovers: false, groceryItems: [], recipe: null },
    ];
    const { rerender } = render(<MealPlanPage />);
    expect(screen.getByRole("button", { name: "Create grocery list" })).toBeDisabled();

    mocks.entries = [{ _id: "d", date: "2026-11-19", slot: "breakfast", title: "Toast", isLeftovers: false, groceryItems: ["bread"], recipe: null }];
    rerender(<MealPlanPage />);
    expect(screen.getByRole("button", { name: "Create grocery list" })).toBeEnabled();

    mocks.entries = [{ _id: "c", date: "2026-11-18", slot: "dinner", title: "Chili", isLeftovers: false, groceryItems: [], recipe }];
    rerender(<MealPlanPage />);
    await user.click(screen.getByRole("button", { name: "Create grocery list" }));
    expect(screen.getByRole("dialog", { name: "Grocery list for Nov 15 – Nov 21" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Add lunch for Monday, Nov 16" }));
    expect(screen.getByRole("dialog", { name: "Add lunch" })).toBeInTheDocument();
  });

  it("opens the list already made for the week, or rebuilds it from the plan", async () => {
    const user = userEvent.setup();
    mocks.listId = "list-1";
    mocks.entries = [{ _id: "d", date: "2026-11-19", slot: "breakfast", title: "Toast", isLeftovers: false, groceryItems: ["bread"], recipe: null }];
    render(<MealPlanPage />);

    expect(screen.queryByRole("button", { name: "Create grocery list" })).toBeNull();
    expect(screen.getByRole("link", { name: "Open grocery list" })).toHaveAttribute("href", "/app/grocery-lists/list-1");
    await user.click(screen.getByRole("button", { name: "Rebuild from plan" }));
    expect(screen.getByRole("button", { name: "Replace grocery list" })).toBeInTheDocument();
  });
});
