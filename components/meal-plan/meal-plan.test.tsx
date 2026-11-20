import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddMealDialog } from "./add-meal-dialog";
import { GroceryReviewDialog } from "./grocery-review-dialog";
import { WeekGrid } from "./week-grid";
import { weekDays, type MealPlanEntry } from "@/lib/meal-plan";

const mocks = vi.hoisted(() => ({
  recipes: undefined as unknown,
  mutation: vi.fn(),
  push: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: (_query: unknown, args: unknown) => (args === "skip" ? undefined : mocks.recipes),
  useMutation: () => mocks.mutation,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

function entry(overrides: Record<string, unknown>) {
  return {
    _id: "entry-1",
    date: "2026-11-16",
    slot: "dinner",
    title: "Chili",
    isLeftovers: false,
    groceryItems: [],
    recipe: null,
    ...overrides,
  } as unknown as MealPlanEntry;
}

const chili = { id: "recipe-1", title: "Chili", servings: 4, isSaved: true };

beforeEach(() => {
  mocks.recipes = [{ _id: "recipe-1", title: "Chili" }, { _id: "recipe-2", title: "Apple Oats" }];
  mocks.mutation.mockReset().mockResolvedValue("list-1");
  mocks.push.mockReset();
});

describe("WeekGrid", () => {
  const entries = [
    entry({ _id: "a", recipe: chili }),
    entry({ _id: "b", date: "2026-11-18", recipe: { ...chili, isSaved: false }, isLeftovers: true }),
    entry({ _id: "c", date: "2026-11-17", slot: "lunch", title: "Eating out" }),
    entry({ _id: "d", date: "2026-11-19", slot: "breakfast", title: "Toast", groceryItems: ["bread", "jelly"] }),
  ];

  it("links recipe meals to their recipe and leaves other meals as text", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<WeekGrid days={weekDays("2026-11-15")} today="2026-11-17" entries={entries} onAdd={onAdd} />);

    const monday = within(screen.getByRole("region", { name: "Monday, Nov 16" }));
    expect(monday.getByRole("link", { name: "Chili" })).toHaveAttribute("href", "/app/recipe-book/recipe-1?mealPlanWeek=2026-11-15");
    expect(monday.getByText("4 servings")).toBeInTheDocument();

    const wednesday = within(screen.getByRole("region", { name: "Wednesday, Nov 18" }));
    expect(wednesday.getByRole("link", { name: "Chili" })).toHaveAttribute("href", "/app/recipes/recipe-1?mealPlanWeek=2026-11-15");
    expect(wednesday.getByText("Leftovers")).toBeInTheDocument();
    expect(wednesday.queryByText("4 servings")).toBeNull();

    const tuesday = screen.getByRole("region", { name: "Tuesday, Nov 17" });
    expect(tuesday).toHaveAttribute("aria-current", "date");
    expect(within(tuesday).getByText("Eating out")).toBeInTheDocument();
    expect(within(tuesday).queryByRole("link")).toBeNull();
    expect(within(tuesday).queryByRole("button", { name: /Leftovers/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Add dinner for Tuesday, Nov 17" }));
    expect(onAdd).toHaveBeenCalledWith("2026-11-17", "dinner");
  });

  it("toggles leftovers, removes meals and reports failures", async () => {
    const user = userEvent.setup();
    render(<WeekGrid days={weekDays("2026-11-15")} today="2026-11-17" entries={entries} onAdd={vi.fn()} />);
    const monday = within(screen.getByRole("region", { name: "Monday, Nov 16" }));

    await user.click(monday.getByRole("button", { name: "Leftovers: Chili" }));
    expect(mocks.mutation).toHaveBeenCalledWith({ entryId: "a", isLeftovers: true });
    await user.click(monday.getByRole("button", { name: "More servings of Chili" }));
    expect(mocks.mutation).toHaveBeenCalledWith({ entryId: "a", servings: 5 });
    await user.click(monday.getByRole("button", { name: "Fewer servings of Chili" }));
    expect(mocks.mutation).toHaveBeenCalledWith({ entryId: "a", servings: 3 });
    expect(screen.queryByRole("button", { name: /servings of Eating out/ })).toBeNull();
    await user.click(monday.getByRole("button", { name: "Remove Chili" }));
    expect(mocks.mutation).toHaveBeenCalledWith({ entryId: "a" });

    mocks.mutation.mockRejectedValueOnce(new Error("offline"));
    await user.click(screen.getByRole("button", { name: "Remove Eating out" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't update this meal");
  });

  it("shows and edits the items to buy for a meal without a recipe", async () => {
    const user = userEvent.setup();
    render(<WeekGrid days={weekDays("2026-11-15")} today="2026-11-17" entries={entries} onAdd={vi.fn()} />);
    const thursday = within(screen.getByRole("region", { name: "Thursday, Nov 19" }));

    expect(thursday.getByText("To buy: bread, jelly")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Items to buy for Chili" })).toBeNull();

    await user.click(thursday.getByRole("button", { name: "Items to buy for Toast" }));
    const input = thursday.getByRole("textbox", { name: "Need to buy for Toast" });
    expect(input).toHaveValue("bread, jelly");
    await user.type(input, ", butter,");
    await user.click(thursday.getByRole("button", { name: "Save items" }));
    expect(mocks.mutation).toHaveBeenCalledWith({ entryId: "d", groceryItems: ["bread", "jelly", "butter"] });
    expect(thursday.queryByRole("textbox")).toBeNull();
  });
});

describe("AddMealDialog", () => {
  const target = { date: "2026-11-17", slot: "dinner" as const };

  it("adds a quick pick", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AddMealDialog target={target} onClose={onClose} />);

    expect(screen.getByRole("dialog", { name: "Add dinner" })).toHaveTextContent("Tuesday, Nov 17");
    await user.click(screen.getByRole("button", { name: "Leftovers" }));
    expect(mocks.mutation).toHaveBeenCalledWith({ ...target, title: "Leftovers" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("adds custom text", async () => {
    const user = userEvent.setup();
    render(<AddMealDialog target={target} onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Something else" }), "Pizza night{Enter}");
    expect(mocks.mutation).toHaveBeenCalledWith({ ...target, title: "Pizza night", groceryItems: [] });
  });

  it("adds custom text with items to buy", async () => {
    const user = userEvent.setup();
    render(<AddMealDialog target={target} onClose={vi.fn()} />);

    await user.type(screen.getByRole("textbox", { name: "Something else" }), "Toast with jelly");
    await user.type(screen.getByRole("textbox", { name: "Need to buy" }), "bread, jelly");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(mocks.mutation).toHaveBeenCalledWith({ ...target, title: "Toast with jelly", groceryItems: ["bread", "jelly"] });
  });

  it("adds a recipe from the Recipe Book, optionally as leftovers", async () => {
    const user = userEvent.setup();
    render(<AddMealDialog target={target} onClose={vi.fn()} />);

    await user.type(screen.getByRole("textbox", { name: "Search your Recipe Book" }), "zzz");
    expect(screen.getByText("No recipes match that search.")).toBeInTheDocument();
    await user.clear(screen.getByRole("textbox", { name: "Search your Recipe Book" }));
    await user.type(screen.getByRole("textbox", { name: "Search your Recipe Book" }), "chi");
    expect(screen.queryByRole("button", { name: "Apple Oats" })).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: "These are leftovers" }));
    await user.click(screen.getByRole("button", { name: "Chili" }));
    expect(mocks.mutation).toHaveBeenCalledWith({ ...target, recipeId: "recipe-1", isLeftovers: true });
  });

  it("stays open with an error when adding fails", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mocks.mutation.mockRejectedValueOnce(new Error("offline"));
    render(<AddMealDialog target={target} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Eating out" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't add this meal");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("explains loading, an empty Recipe Book, and stays closed without a target", () => {
    mocks.recipes = undefined;
    const { rerender } = render(<AddMealDialog target={target} onClose={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading your recipes");

    mocks.recipes = [];
    rerender(<AddMealDialog target={target} onClose={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Add a recipe" })).toHaveAttribute("href", "/app/recipe-book");

    rerender(<AddMealDialog target={null} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("GroceryReviewDialog", () => {
  const entries = [
    entry({ _id: "late", date: "2026-11-18", recipe: { ...chili, title: "Soup", servings: undefined } }),
    entry({ _id: "early", recipe: chili, servings: 6 }),
    entry({ _id: "left", date: "2026-11-17", recipe: chili, isLeftovers: true }),
    entry({ _id: "text", title: "Eating out" }),
    entry({ _id: "toast", date: "2026-11-19", slot: "breakfast", title: "Toast", groceryItems: ["bread", "jelly"] }),
  ];

  it("lists what will be cooked, adjusts servings, and creates the list", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<GroceryReviewDialog open onOpenChange={onOpenChange} weekStart="2026-11-15" entries={entries} />);

    const rows = within(screen.getByRole("list", { name: "Recipes to cook" })).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Chili");
    expect(rows[0]).toHaveTextContent("6 servings");
    expect(rows[1]).toHaveTextContent("Soup");
    expect(rows[1]).toHaveTextContent("1 batch");
    expect(screen.getByText("Chili (Tue dinner)")).toBeInTheDocument();
    expect(screen.queryByText(/Eating out/)).toBeNull();
    expect(screen.getByText("bread, jelly (Toast, Thu breakfast)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "More servings of Chili, Mon dinner" }));
    expect(mocks.mutation).toHaveBeenCalledWith({ entryId: "early", servings: 7 });
    await user.click(screen.getByRole("button", { name: "Fewer servings of Chili, Mon dinner" }));
    expect(mocks.mutation).toHaveBeenCalledWith({ entryId: "early", servings: 5 });

    await user.click(screen.getByRole("button", { name: "Create grocery list" }));
    expect(mocks.mutation).toHaveBeenCalledWith({
      startDate: "2026-11-15",
      endDate: "2026-11-21",
      name: "Meal plan: Nov 15 – Nov 21",
    });
    expect(mocks.push).toHaveBeenCalledWith("/app/grocery-lists/list-1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("reports failures and cancels", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<GroceryReviewDialog open onOpenChange={onOpenChange} weekStart="2026-11-15" entries={entries} />);

    mocks.mutation.mockRejectedValueOnce(new Error("offline"));
    await user.click(screen.getByRole("button", { name: "More servings of Chili, Mon dinner" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't change the servings");

    mocks.mutation.mockRejectedValueOnce(new Error("offline"));
    await user.click(screen.getByRole("button", { name: "Create grocery list" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't create the grocery list");
    expect(mocks.push).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
