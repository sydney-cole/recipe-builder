import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { DayCard } from "./day-card";
import type { SlotView } from "./types";

vi.mock("convex/react", () => ({ useMutation: () => vi.fn().mockResolvedValue(null) }));

const plannerId = "planner-1" as Id<"planners">;
const recipeId = "recipe-1" as Id<"recipes">;

function renderDay(slots: SlotView[], { date = "2026-11-18", today = false } = {}) {
  return render(
    <ul>
      <DayCard plannerId={plannerId} date={date} today={today} weekStart="2026-11-16" slots={slots} requestFocus={vi.fn()} />
    </ul>,
  );
}

const lunchOf = () => screen.getByRole("region", { name: "Wednesday lunch" });
const dinnerOf = () => screen.getByRole("region", { name: "Wednesday dinner" });

describe("DayCard", () => {
  it("labels the day and marks today", () => {
    renderDay([], { today: true });
    const day = screen.getByRole("listitem");
    expect(day).toHaveAttribute("aria-current", "date");
    expect(within(day).getByRole("heading", { name: /Wed\s*Nov 18\s*Today/ })).toBeInTheDocument();
  });

  it("shows breakfast, lunch and dinner in that order, each with the same four types", () => {
    renderDay([]);
    expect(screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"))).toEqual([
      "Wednesday breakfast",
      "Wednesday lunch",
      "Wednesday dinner",
    ]);
    const breakfast = screen.getByRole("region", { name: "Wednesday breakfast" });
    expect(within(breakfast).getByText("Breakfast")).toBeInTheDocument();
    expect(within(breakfast).getByRole("combobox", { name: "Wednesday breakfast" })).toHaveAttribute("placeholder", "Plan breakfast");
    expect(within(within(breakfast).getByRole("group")).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Cook",
      "Leftovers",
      "Eat out",
      "Skip",
    ]);
  });

  it("shows only the meals to plan", () => {
    render(
      <ul>
        <DayCard plannerId={plannerId} date="2026-11-18" today={false} weekStart="2026-11-16" slots={[]} requestFocus={vi.fn()} meals={["dinner"]} />
      </ul>,
    );
    expect(screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"))).toEqual(["Wednesday dinner"]);
  });

  it("shows unplanned slots with a type group and placeholders", () => {
    renderDay([]);
    expect(within(lunchOf()).getByRole("combobox", { name: "Wednesday lunch" })).toHaveAttribute("placeholder", "Plan lunch");
    expect(within(dinnerOf()).getByRole("combobox", { name: "Wednesday dinner" })).toHaveAttribute("placeholder", "Plan dinner");
    const types = within(lunchOf()).getByRole("group", { name: "Wednesday lunch type" });
    expect(within(types).getAllByRole("button").map((button) => [button.textContent, button.getAttribute("aria-pressed")])).toEqual([
      ["Cook", "false"],
      ["Leftovers", "false"],
      ["Eat out", "false"],
      ["Skip", "false"],
    ]);
  });

  it("shows a cook slot's recipe link and ingredient count", () => {
    renderDay([
      { date: "2026-11-18", meal: "lunch", type: "cook", name: "Chili", recipe: { recipeId, title: "Chili", ingredientCount: 1, available: true } },
      { date: "2026-11-18", meal: "dinner", type: "cook", name: "Stew", recipe: { recipeId, title: "Stew", ingredientCount: 3, available: true } },
    ]);
    expect(within(lunchOf()).getByRole("combobox")).toHaveValue("Chili");
    expect(within(lunchOf()).getByRole("combobox")).toHaveAttribute("placeholder", "What are you cooking?");
    expect(within(lunchOf()).getByRole("link", { name: "Open the Chili recipe" })).toHaveAttribute("href", "/app/recipe-book/recipe-1");
    expect(within(lunchOf()).getByText("1 ingredient")).toBeInTheDocument();
    expect(within(dinnerOf()).getByText("3 ingredients")).toBeInTheDocument();
    expect(within(lunchOf()).getByRole("button", { name: "Cook" })).toHaveAttribute("aria-pressed", "true");
  });

  it("says 30+ ingredients when the count was capped", () => {
    renderDay([
      { date: "2026-11-18", meal: "lunch", type: "cook", name: "Feast", recipe: { recipeId, title: "Feast", ingredientCount: 30, moreIngredients: true, available: true } },
    ]);
    expect(within(lunchOf()).getByText("30+ ingredients")).toBeInTheDocument();
    expect(within(lunchOf()).getByRole("button", { name: "Cook" })).toHaveAttribute("aria-pressed", "true");
  });

  it("warns about a recipe with no ingredients and one that is gone", () => {
    renderDay([
      { date: "2026-11-18", meal: "lunch", type: "cook", name: "Chili", recipe: { recipeId, title: "Chili", ingredientCount: 0, available: true } },
      { date: "2026-11-18", meal: "dinner", type: "cook", name: "", recipe: { recipeId, title: "Stew", ingredientCount: 0, available: false } },
    ]);
    expect(within(lunchOf()).getByText("No ingredients yet")).toBeInTheDocument();
    expect(within(dinnerOf()).getByText("Stew was removed from your Recipe Book")).toBeInTheDocument();
    expect(within(dinnerOf()).getByRole("combobox")).toHaveValue("");
    expect(within(dinnerOf()).queryByRole("link")).toBeNull();
  });

  it("shows eat out and skip slots", () => {
    renderDay([
      { date: "2026-11-18", meal: "lunch", type: "out", name: "Thai" },
      { date: "2026-11-18", meal: "dinner", type: "skip", name: "" },
    ]);
    expect(within(lunchOf()).getByRole("combobox")).toHaveAttribute("placeholder", "Where or what?");
    expect(within(lunchOf()).getByRole("combobox")).toHaveValue("Thai");
    expect(within(dinnerOf()).getByText("Skipping dinner")).toBeInTheDocument();
    expect(within(dinnerOf()).queryByRole("combobox")).toBeNull();
  });

  it("lists leftover sources from the previous week and selects the stored one", () => {
    renderDay(
      [
        { date: "2026-11-15", meal: "dinner", type: "cook", name: "Roast" },
        { date: "2026-11-16", meal: "lunch", type: "left", name: "", from: { date: "2026-11-15", meal: "dinner" } },
      ],
      { date: "2026-11-16" },
    );
    const select = screen.getByRole("combobox", { name: "Monday lunch is leftovers of" });
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual(["Roast (Sun dinner)", "Other leftovers"]);
    expect(select).toHaveValue("2026-11-15|dinner");
    expect(screen.queryByRole("combobox", { name: "Monday lunch leftovers" })).toBeNull();
  });

  it("selects Other leftovers and shows its input when the stored source is gone", () => {
    renderDay([
      { date: "2026-11-17", meal: "dinner", type: "skip", name: "" },
      { date: "2026-11-18", meal: "lunch", type: "left", name: "Pizza", from: { date: "2026-11-17", meal: "dinner" } },
    ]);
    expect(screen.getByRole("combobox", { name: "Wednesday lunch is leftovers of" })).toHaveValue("other");
    const other = screen.getByRole("combobox", { name: "Wednesday lunch leftovers" });
    expect(other).toHaveValue("Pizza");
    expect(other).toHaveAttribute("placeholder", "What are the leftovers?");
  });
});
