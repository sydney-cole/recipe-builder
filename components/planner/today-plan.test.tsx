import { render, screen, within } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TodayPlan } from "./today-plan";

type Ref = Parameters<typeof getFunctionName>[0];

const mocks = vi.hoisted(() => ({
  today: undefined as unknown,
  args: [] as unknown[],
}));

vi.mock("convex/react", () => ({
  useQuery: (ref: Ref, args: unknown) => {
    if (getFunctionName(ref) !== "planner:today") return undefined;
    mocks.args.push(args);
    return mocks.today;
  },
}));

vi.mock("@/components/recipes/current-recipe-panel", () => ({
  CurrentRecipePanel: () => <p>Current recipe fallback</p>,
}));

const unplanned = (meal: string) => ({ meal, slot: null });

describe("TodayPlan", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 11:30 pm local on Nov 18: the browser's date, whatever the server's is.
    vi.setSystemTime(new Date(2026, 10, 18, 23, 30));
    mocks.args = [];
    mocks.today = undefined;
  });
  afterEach(() => vi.useRealTimers());

  it("asks for the browser's local date and shows a loading status", () => {
    render(<TodayPlan />);
    expect(mocks.args.at(-1)).toEqual({ date: "2026-11-18" });
    expect(screen.getByRole("status")).toHaveTextContent("Loading today’s plan…");
  });

  it("shows each planned meal in order with its type", () => {
    mocks.today = {
      meals: [
        { meal: "breakfast", slot: { type: "left", name: "Chili", source: { date: "2026-11-17", meal: "dinner", recipeId: "recipe-1" } } },
        { meal: "lunch", slot: { type: "out", name: "Thai Palace" } },
        { meal: "dinner", slot: { type: "cook", name: "Lemon chicken", recipeId: "recipe-2" } },
      ],
    };
    render(<TodayPlan />);
    const items = within(screen.getByRole("list", { name: "Today’s meals" })).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "BreakfastLeftoversChili, from Tue dinner",
      "LunchEat outThai Palace",
      "DinnerCookLemon chicken",
    ]);
    expect(within(items[2]).getByRole("link", { name: "Lemon chicken" })).toHaveAttribute("href", "/app/recipe-book/recipe-2");
    expect(within(items[0]).getByRole("link", { name: "Chili" })).toHaveAttribute("href", "/app/recipe-book/recipe-1");
    expect(screen.getByRole("link", { name: "Open this week’s plan" })).toHaveAttribute("href", "/app/planner?week=2026-11-18");
    expect(screen.queryByText("Current recipe fallback")).toBeNull();
  });

  it("says when a meal has no recipe, is skipped, is unplanned or eats other leftovers", () => {
    mocks.today = {
      meals: [
        { meal: "breakfast", slot: { type: "cook", name: "Pancakes" } },
        { meal: "lunch", slot: { type: "skip", name: "" } },
        unplanned("dinner"),
      ],
    };
    const { rerender } = render(<TodayPlan />);
    const items = () => within(screen.getByRole("list", { name: "Today’s meals" })).getAllByRole("listitem");
    expect(items().map((item) => item.textContent)).toEqual([
      "BreakfastCookPancakes (no recipe attached)",
      "LunchSkipSkipped",
      "DinnerNothing planned",
    ]);
    expect(screen.queryByRole("link", { name: "Pancakes" })).toBeNull();

    mocks.today = {
      meals: [
        { meal: "lunch", slot: { type: "left", name: "Pizza" } },
        { meal: "dinner", slot: { type: "cook", name: "", recipeRemoved: true } },
      ],
    };
    rerender(<TodayPlan />);
    expect(items().map((item) => item.textContent)).toEqual([
      "LunchLeftoversPizza",
      "DinnerCookRecipe removed from your Recipe Book",
    ]);
  });

  it("falls back to the current recipe and a link to plan the day when nothing is planned", () => {
    mocks.today = { meals: [unplanned("lunch"), unplanned("dinner")] };
    const { rerender } = render(<TodayPlan />);
    expect(screen.getByText("Nothing is planned for today.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Plan today" })).toHaveAttribute("href", "/app/planner?week=2026-11-18");
    expect(screen.getByText("Current recipe fallback")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Today’s meals" })).toBeNull();

    // A user with no planner yet.
    mocks.today = { meals: [] };
    rerender(<TodayPlan />);
    expect(screen.getByRole("link", { name: "Plan today" })).toBeInTheDocument();
    expect(screen.getByText("Current recipe fallback")).toBeInTheDocument();
  });
});
